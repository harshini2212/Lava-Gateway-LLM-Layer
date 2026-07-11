import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { Config } from "../config";
import type { Store } from "../store";
import { authenticate, ensurePassthroughKey } from "../keys";
import { recordUsage } from "../metering";
import { GatewayError } from "../errors";

interface AnthropicBody {
  model?: string;
  system?: unknown;
  messages?: Array<{ role: string; content: unknown }>;
  [k: string]: unknown;
}

/** Synthesize a native Anthropic-shaped response for offline metering. */
function simulateAnthropic(body: AnthropicBody, model: string) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prompt =
    messages
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join("\n") + (body.system ? String(body.system) : "");
  const inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const text =
    `[simulated ${model}] gateway proxy — no provider key configured on the gateway, ` +
    `so this deterministic reply was returned and metered.`;
  const outputTokens = Math.max(1, Math.ceil(text.length / 4));
  const payload = {
    id: `msg_${randomBytes(12).toString("hex")}`,
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
  return { payload, inputTokens, outputTokens };
}

/**
 * Transparent Anthropic passthrough.
 *
 * The Brexify Python app points the Anthropic SDK's `base_url` at `${GATEWAY}/anthropic`
 * and authenticates with a Lava **spend key** (header `x-lava-key`). The SDK then POSTs
 * its native request body here — which we forward verbatim (preserving tools, vision, and
 * thinking) and meter. The gateway, not the app, holds the provider credentials.
 */
export function proxyRouter(store: Store, cfg: Config): Router {
  const router = Router();

  router.post("/anthropic/v1/messages", async (req, res, next) => {
    const body = (req.body ?? {}) as AnthropicBody;
    const model = typeof body.model === "string" ? body.model : "unknown";

    // Attribution: an explicit spend key (enforced), else a synthetic passthrough key.
    const spendKey = authenticate(store, req.header("x-lava-key") ?? undefined);
    const key = spendKey ?? ensurePassthroughKey(store);

    if (spendKey) {
      if (key.models && !key.models.includes(model)) {
        res.status(403).json({
          type: "error",
          error: { type: "permission_error", message: `key not permitted to use ${model}` },
        });
        return;
      }
      if (key.spentUsd >= key.budgetUsd) {
        res.status(402).json({
          type: "error",
          error: { type: "billing_error", message: "spend key budget exhausted" },
        });
        return;
      }
    }

    const started = performance.now();
    try {
      let payload: unknown;
      let inputTokens = 0;
      let outputTokens = 0;
      let simulated = false;

      if (cfg.anthropicApiKey) {
        // Gateway holds the provider key and forwards the native body verbatim.
        const upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": cfg.anthropicApiKey,
            "anthropic-version": req.header("anthropic-version") ?? "2023-06-01",
          },
          body: JSON.stringify(body),
        });
        payload = await upstream.json();
        if (!upstream.ok) {
          recordUsage(store, {
            key,
            model,
            provider: "anthropic",
            usage: { inputTokens: 0, outputTokens: 0 },
            latencyMs: Math.round(performance.now() - started),
            status: upstream.status,
            simulated: false,
          });
          res.status(upstream.status).json(payload);
          return;
        }
        const usage = (payload as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
        inputTokens = usage?.input_tokens ?? 0;
        outputTokens = usage?.output_tokens ?? 0;
      } else {
        simulated = true;
        ({ payload, inputTokens, outputTokens } = simulateAnthropic(body, model));
      }

      const latencyMs = Math.round(performance.now() - started);
      const record = recordUsage(store, {
        key,
        model,
        provider: simulated ? "simulated" : "anthropic",
        usage: { inputTokens, outputTokens },
        latencyMs,
        status: 200,
        simulated,
      });

      res.set({
        "x-lava-request-id": record.id,
        "x-lava-cost-usd": String(record.costUsd),
        "x-lava-input-tokens": String(inputTokens),
        "x-lava-output-tokens": String(outputTokens),
        "x-lava-latency-ms": String(latencyMs),
        "x-lava-simulated": String(simulated),
      });
      res.status(200).json(payload);
    } catch (err) {
      if (err instanceof GatewayError) {
        res.status(err.status).json({ type: "error", error: { type: "api_error", message: err.message } });
        return;
      }
      next(err);
    }
  });

  return router;
}
