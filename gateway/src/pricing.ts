import type { TokenUsage } from "./types";
import { round6 } from "./util";

/**
 * Price book in USD per 1,000,000 tokens: { input, output }.
 * Claude prices mirror `comptroller/ai/claude_client.py` so the gateway and the
 * Brexify app agree to the dollar. OpenAI-compatible rows are illustrative.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

/** Cost of a single request from its token usage. Unknown models price at $0. */
export function costUsd(model: string, usage: TokenUsage): number {
  const p = PRICING[model] ?? { input: 0, output: 0 };
  return round6((usage.inputTokens / 1e6) * p.input + (usage.outputTokens / 1e6) * p.output);
}

export const knownModels = (): string[] => Object.keys(PRICING);
