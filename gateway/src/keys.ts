import { createHash, randomBytes } from "node:crypto";
import type { SpendKey } from "./types";
import type { Store } from "./store";
import { nowIso } from "./util";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Public projection of a spend key — never leaks the secret hash. */
export function publicView(key: SpendKey) {
  return {
    id: key.id,
    name: key.name,
    budgetUsd: key.budgetUsd,
    spentUsd: key.spentUsd,
    remainingUsd: Math.max(0, Math.round((key.budgetUsd - key.spentUsd) * 1e6) / 1e6),
    models: key.models,
    active: key.active,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  };
}

/** Mint a new spend key with a random secret. The secret is returned once, then only its hash is kept. */
export function issueKey(
  store: Store,
  opts: { name: string; budgetUsd: number; models?: string[] | null },
): { key: SpendKey; secret: string } {
  const secret = `lava_sk_${randomBytes(24).toString("hex")}`;
  const key: SpendKey = {
    id: `key_${randomBytes(8).toString("hex")}`,
    secretHash: sha256(secret),
    name: opts.name,
    budgetUsd: opts.budgetUsd,
    spentUsd: 0,
    models: opts.models ?? null,
    createdAt: nowIso(),
    lastUsedAt: null,
    active: true,
  };
  store.createKey(key);
  return { key, secret };
}

/** Seed a key with a caller-chosen secret (deterministic id) — used for the demo key on boot. */
export function seedKey(
  store: Store,
  opts: { secret: string; name: string; budgetUsd: number; models?: string[] | null },
): SpendKey {
  const key: SpendKey = {
    id: `key_${sha256(opts.secret).slice(0, 16)}`,
    secretHash: sha256(opts.secret),
    name: opts.name,
    budgetUsd: opts.budgetUsd,
    spentUsd: 0,
    models: opts.models ?? null,
    createdAt: nowIso(),
    lastUsedAt: null,
    active: true,
  };
  store.createKey(key);
  return key;
}

/** Resolve a bearer secret to its spend key, or undefined if unknown. */
export function authenticate(store: Store, secret: string | undefined): SpendKey | undefined {
  if (!secret) return undefined;
  return store.findKeyBySecretHash(sha256(secret));
}
