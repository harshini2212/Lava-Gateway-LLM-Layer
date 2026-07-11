import { Router } from "express";
import { knownModels } from "../pricing";
import { nowIso } from "../util";

/** Liveness probe + a small self-describing index at the root. */
export function healthRouter(): Router {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "lava-gateway", ts: nowIso() });
  });

  router.get("/", (_req, res) => {
    res.json({
      service: "lava-gateway",
      description: "LLM gateway with per-request metering, budgets, and usage-based billing.",
      models: knownModels(),
      endpoints: {
        "POST /v1/messages": "metered LLM forward (Bearer spend key)",
        "POST /anthropic/v1/messages": "transparent Anthropic proxy (x-lava-key) — meters native SDK traffic",
        "GET /v1/usage": "usage rollup (?key= to filter)",
        "GET /v1/usage/invoice": "usage priced into an invoice",
        "POST /v1/keys": "mint a spend key (x-admin-key)",
        "GET /v1/keys": "list spend keys (x-admin-key)",
        "GET /healthz": "liveness",
      },
    });
  });

  return router;
}
