import type { Config } from "../config";
import type { CompletionRequest, Provider, ProviderResult } from "../types";
import { GatewayError } from "../errors";
import { anthropicComplete } from "./anthropic";
import { openaiComplete } from "./openai";
import { simulatedComplete } from "./simulated";

/** Route a model to a provider: explicit override wins, else infer from the model name. */
export function resolveProvider(model: string, explicit?: Provider): Provider {
  if (explicit) return explicit;
  if (model.startsWith("claude")) return "anthropic";
  if (/^(gpt|o1|o3|o4)/.test(model)) return "openai";
  return "simulated";
}

/**
 * Dispatch a completion to its provider. If the resolved provider has no key
 * configured, fall back to the deterministic simulated backend so the gateway
 * always meters something rather than failing.
 */
export async function complete(req: CompletionRequest, cfg: Config): Promise<ProviderResult> {
  const provider = resolveProvider(req.model, req.provider);
  try {
    if (provider === "anthropic" && cfg.anthropicApiKey) {
      return await anthropicComplete(req, cfg.anthropicApiKey);
    }
    if (provider === "openai" && cfg.openaiApiKey) {
      return await openaiComplete(req, cfg.openaiApiKey);
    }
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    throw new GatewayError(502, "provider_unavailable", (err as Error).message);
  }
  return simulatedComplete(req);
}
