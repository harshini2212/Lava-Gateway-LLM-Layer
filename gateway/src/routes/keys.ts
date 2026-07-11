import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config";
import type { Store } from "../store";
import { issueKey, publicView } from "../keys";
import { requireAdmin } from "../http";

const CreateKeySchema = z.object({
  name: z.string().min(1),
  budgetUsd: z.number().nonnegative(),
  models: z.array(z.string()).nullish(),
});

/** Admin surface for minting and listing spend keys. */
export function keysRouter(store: Store, cfg: Config): Router {
  const router = Router();
  const admin = requireAdmin(cfg);

  // POST /v1/keys — mint a spend key. The secret is returned exactly once.
  router.post("/v1/keys", admin, (req, res) => {
    const parsed = CreateKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "bad request" },
      });
      return;
    }
    const { key, secret } = issueKey(store, {
      name: parsed.data.name,
      budgetUsd: parsed.data.budgetUsd,
      models: parsed.data.models ?? null,
    });
    res.status(201).json({ ...publicView(key), secret });
  });

  // GET /v1/keys — list keys (no secrets).
  router.get("/v1/keys", admin, (_req, res) => {
    res.json({ keys: store.listKeys().map(publicView) });
  });

  return router;
}
