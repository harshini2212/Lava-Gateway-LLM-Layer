import type { Store } from "./store";
import type { Provider, SpendKey, TokenUsage, UsageRecord } from "./types";
import { costUsd } from "./pricing";
import { nowIso, reqId, round6 } from "./util";

/**
 * Record one metered request and charge its spend key. This is the heart of the
 * gateway: every call — success or provider error — produces exactly one
 * immutable UsageRecord, and the key's running spend moves in lockstep.
 */
export function recordUsage(
  store: Store,
  args: {
    key: SpendKey;
    model: string;
    provider: Provider;
    usage: TokenUsage;
    latencyMs: number;
    status: number;
    simulated: boolean;
  },
): UsageRecord {
  const record: UsageRecord = {
    id: reqId(),
    keyId: args.key.id,
    model: args.model,
    provider: args.provider,
    inputTokens: args.usage.inputTokens,
    outputTokens: args.usage.outputTokens,
    costUsd: costUsd(args.model, args.usage),
    latencyMs: args.latencyMs,
    status: args.status,
    simulated: args.simulated,
    ts: nowIso(),
  };
  store.addUsage(record);

  args.key.spentUsd = round6(args.key.spentUsd + record.costUsd);
  args.key.lastUsedAt = record.ts;
  store.updateKey(args.key);

  return record;
}

/** Aggregate usage records into totals + a per-model breakdown. */
export function summarize(records: UsageRecord[]) {
  const byModel: Record<
    string,
    { requests: number; inputTokens: number; outputTokens: number; costUsd: number }
  > = {};
  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let latency = 0;

  for (const r of records) {
    requests += 1;
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    cost += r.costUsd;
    latency += r.latencyMs;
    const m = (byModel[r.model] ??= {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
    m.requests += 1;
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    m.costUsd = round6(m.costUsd + r.costUsd);
  }

  return {
    totals: {
      requests,
      inputTokens,
      outputTokens,
      costUsd: round6(cost),
      avgLatencyMs: requests ? Math.round(latency / requests) : 0,
    },
    byModel,
  };
}

/** Turn usage into an invoice: per-model line items + the gateway's fee. */
export function invoice(records: UsageRecord[], feeBps: number) {
  const { totals, byModel } = summarize(records);
  const lineItems = Object.entries(byModel).map(([model, m]) => ({ model, ...m }));
  const subtotalUsd = totals.costUsd;
  const gatewayFeeUsd = round6((subtotalUsd * feeBps) / 10_000);
  return {
    lineItems,
    subtotalUsd,
    feeBps,
    gatewayFeeUsd,
    totalUsd: round6(subtotalUsd + gatewayFeeUsd),
  };
}
