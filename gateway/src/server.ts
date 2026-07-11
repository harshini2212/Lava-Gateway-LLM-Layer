import express, { type ErrorRequestHandler, type Express } from "express";
import { type Config, loadConfig } from "./config";
import { MemoryStore, type Store } from "./store";
import { healthRouter } from "./routes/health";
import { messagesRouter } from "./routes/messages";
import { usageRouter } from "./routes/usage";
import { keysRouter } from "./routes/keys";

/**
 * Build the Express app. Config and store are injectable so tests run fully
 * isolated (no env, no network) and production can swap the store later.
 */
export function createServer(opts?: { config?: Config; store?: Store }): {
  app: Express;
  store: Store;
  cfg: Config;
} {
  const cfg = opts?.config ?? loadConfig();
  const store = opts?.store ?? new MemoryStore();

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter());
  app.use(keysRouter(store, cfg));
  app.use(messagesRouter(store, cfg));
  app.use(usageRouter(store, cfg));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    // Malformed JSON body → 400; everything else → 500.
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: { code: "invalid_json", message: "request body is not valid JSON" } });
      return;
    }
    res.status(500).json({ error: { code: "internal_error", message: (err as Error).message } });
  };
  app.use(onError);

  return { app, store, cfg };
}
