// Shared domain types for the gateway.

export type Provider = "anthropic" | "openai" | "simulated";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  /** Optional explicit provider override; otherwise inferred from the model name. */
  provider?: Provider;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResult {
  text: string;
  usage: TokenUsage;
  provider: Provider;
  model: string;
  /** True when served by the deterministic offline backend (no provider key set). */
  simulated: boolean;
}

/**
 * A scoped, budget-limited API key — the unit the gateway meters and bills against.
 * The plaintext secret is never stored; only its SHA-256 hash.
 */
export interface SpendKey {
  id: string;
  secretHash: string;
  name: string;
  budgetUsd: number;
  spentUsd: number;
  /** Allow-list of models; `null` means any model is permitted. */
  models: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  active: boolean;
}

/** One metered request. Every call through the gateway appends exactly one of these. */
export interface UsageRecord {
  id: string;
  keyId: string;
  model: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: number;
  simulated: boolean;
  ts: string;
}
