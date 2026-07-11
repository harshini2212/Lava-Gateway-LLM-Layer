import type { Request, RequestHandler } from "express";
import type { Config } from "./config";

/** Extract the caller's spend-key secret from `Authorization: Bearer` or `x-lava-key`. */
export function bearer(req: Request): string | undefined {
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.header("x-lava-key") ?? undefined;
}

/** Gate admin-only routes (minting spend keys) behind the configured admin key. */
export function requireAdmin(cfg: Config): RequestHandler {
  return (req, res, next) => {
    if (req.header("x-admin-key") !== cfg.adminKey) {
      res.status(401).json({ error: { code: "unauthorized", message: "admin key required" } });
      return;
    }
    next();
  };
}
