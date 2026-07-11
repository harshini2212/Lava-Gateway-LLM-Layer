import type { SpendKey, UsageRecord } from "./types";

/**
 * Persistence boundary. The gateway only ever touches this interface, so swapping
 * the in-memory store for Postgres/Redis later is a one-file change.
 */
export interface Store {
  createKey(key: SpendKey): void;
  getKeyById(id: string): SpendKey | undefined;
  findKeyBySecretHash(hash: string): SpendKey | undefined;
  listKeys(): SpendKey[];
  updateKey(key: SpendKey): void;
  addUsage(record: UsageRecord): void;
  listUsage(filter?: { keyId?: string }): UsageRecord[];
}

export class MemoryStore implements Store {
  private keys = new Map<string, SpendKey>();
  private usage: UsageRecord[] = [];

  createKey(key: SpendKey): void {
    this.keys.set(key.id, key);
  }

  getKeyById(id: string): SpendKey | undefined {
    return this.keys.get(id);
  }

  findKeyBySecretHash(hash: string): SpendKey | undefined {
    for (const key of this.keys.values()) {
      if (key.secretHash === hash) return key;
    }
    return undefined;
  }

  listKeys(): SpendKey[] {
    return [...this.keys.values()];
  }

  updateKey(key: SpendKey): void {
    this.keys.set(key.id, key);
  }

  addUsage(record: UsageRecord): void {
    this.usage.push(record);
  }

  listUsage(filter?: { keyId?: string }): UsageRecord[] {
    if (filter?.keyId) return this.usage.filter((u) => u.keyId === filter.keyId);
    return [...this.usage];
  }
}
