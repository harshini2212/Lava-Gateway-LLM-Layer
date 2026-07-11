import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config";
import type { Store } from "../store";
import { GatewayError } from "../errors";
import { authenticate } from "../keys";
import { complete, resolveProvider } from "../providers/index";
import { recordUsage } from "../metering";
import { bearer } from "../http";
import { round6 } from "../util";

const CompletionSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  max_tokens: z.number().int().positive().max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
  provider: z.enum(["anthropic", "openai", "simulated"]).optional(),
});

/**
 * POST /v1/messages — the metered forward endpoint.
 * Authenticates a spend key, enforces its model allow-list and budget, forwards
 * to the resolved provider, meters the result, and returns usage on both the
 * body and `x-lava-*` response headers.
 */
export function messagesRouter(store: Store, cfg: Config): Router {
  const router = Router();

  router.post("/v1/messages", async (req, res, next) => {
    const parsed = CompletionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "bad request" },
      });
      return;
    }
    const request = parsed.data;

    const key = authenticate(store, bearer(req));
    if (!key || !key.active) {
      res.status(401).json({ error: { code: "unauthorized", message: "invalid or missing API key" } });
      return;
    }
    if (key.models && !key.models.includes(request.model)) {
      res.status(403).json({
        error: { code: "model_not_allowed", message: `key not permitted to use ${request.model}` },
      });
      return;
    }
    if (key.spentUsd >= key.budgetUsd) {
      res.status(402).json({
        error: { code: "budget_exceeded", message: `spend key has reached its $${key.budgetUsd} budget` },
        spentUsd: key.spentUsd,
        budgetUsd: key.budgetUsd,
      });
      return;
    }

    const started = performance.now();
    try {
      const result = await complete(request, cfg);
      const latencyMs = Math.round(performance.now() - started);
      const record = recordUsage(store, {
        key,
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        latencyMs,
        status: 200,
        simulated: result.simulated,
      });

      res.set({
        "x-lava-request-id": record.id,
        "x-lava-provider": result.provider,
        "x-lava-model": result.model,
        "x-lava-input-tokens": String(result.usage.inputTokens),
        "x-lava-output-tokens": String(result.usage.outputTokens),
        "x-lava-cost-usd": String(record.costUsd),
        "x-lava-latency-ms": String(latencyMs),
        "x-lava-balance-remaining": String(round6(Math.max(0, key.budgetUsd - key.spentUsd))),
        "x-lava-simulated": String(result.simulated),
      });
      res.json({
        id: record.id,
        model: result.model,
        provider: result.provider,
        simulated: result.simulated,
        content: result.text,
        usage: {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cost_usd: record.costUsd,
          latency_ms: latencyMs,
        },
      });
    } catch (err) {
      // Meter the failure too, then surface the provider's status/code.
      if (err instanceof GatewayError) {
        recordUsage(store, {
          key,
          model: request.model,
          provider: resolveProvider(request.model, request.provider),
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: Math.round(performance.now() - started),
          status: err.status,
          simulated: false,
        });
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  return router;
}
