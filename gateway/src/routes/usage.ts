import { Router } from "express";
import type { Config } from "../config";
import type { Store } from "../store";
import { invoice, summarize } from "../metering";

/** Read-only metering surface: rollups and invoices over recorded usage. */
export function usageRouter(store: Store, cfg: Config): Router {
  const router = Router();

  // GET /v1/usage[?key=key_...] — totals + per-model breakdown + recent records.
  router.get("/v1/usage", (req, res) => {
    const keyId = typeof req.query.key === "string" ? req.query.key : undefined;
    const records = store.listUsage(keyId ? { keyId } : undefined);
    res.json({ ...summarize(records), records: records.slice(-100) });
  });

  // GET /v1/usage/invoice?key=key_... — usage priced into an invoice with the gateway fee.
  router.get("/v1/usage/invoice", (req, res) => {
    const keyId = typeof req.query.key === "string" ? req.query.key : undefined;
    const records = store.listUsage(keyId ? { keyId } : undefined);
    res.json(invoice(records, cfg.gatewayFeeBps));
  });

  return router;
}
