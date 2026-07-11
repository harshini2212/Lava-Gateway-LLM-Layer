import { randomBytes } from "node:crypto";

/** Round to 6 dp — enough for sub-cent per-request costs without float drift. */
export const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export const nowIso = (): string => new Date().toISOString();

export const reqId = (): string => `req_${randomBytes(10).toString("hex")}`;
