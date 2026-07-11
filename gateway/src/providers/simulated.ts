import type { CompletionRequest, ProviderResult } from "../types";

/** Rough token estimate (~4 chars/token) for the offline backend. */
const estimateTokens = (s: string): number => Math.max(1, Math.ceil(s.length / 4));

/**
 * Deterministic offline backend. When no provider key is configured the gateway
 * still meters real token counts, latency, and cost against this — mirroring
 * Brexify's "runs fully offline" philosophy so demos never need a key.
 */
export async function simulatedComplete(req: CompletionRequest): Promise<ProviderResult> {
  const prompt = req.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const last = req.messages[req.messages.length - 1]?.content ?? "";
  const text =
    `[simulated ${req.model}] received ${req.messages.length} message(s). ` +
    `Final prompt: "${last.slice(0, 160)}". ` +
    `No provider key set, so the gateway metered this deterministic reply.`;
  return {
    text,
    usage: { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(text) },
    provider: "simulated",
    model: req.model,
    simulated: true,
  };
}
