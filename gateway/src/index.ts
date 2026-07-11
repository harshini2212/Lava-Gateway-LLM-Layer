import "dotenv/config";
import { createServer } from "./server";
import { seedKey } from "./keys";

const { app, store, cfg } = createServer();

if (cfg.seedDemoKey) {
  seedKey(store, { secret: "lava_sk_demo_key", name: "demo", budgetUsd: 5 });
}

app.listen(cfg.port, () => {
  const live = cfg.anthropicApiKey || cfg.openaiApiKey;
  console.log(`⚡ lava-gateway listening on http://localhost:${cfg.port}`);
  console.log(`   provider: ${live ? "live (forwarding real traffic)" : "simulated (no key set — metering offline)"}`);
  if (cfg.seedDemoKey) {
    console.log(`   demo spend key: lava_sk_demo_key  (budget $5)`);
    console.log(`   try: curl -s localhost:${cfg.port}/v1/messages -H "authorization: Bearer lava_sk_demo_key" \\`);
    console.log(`          -H "content-type: application/json" \\`);
    console.log(`          -d '{"model":"claude-haiku-4-5","messages":[{"role":"user","content":"hello"}]}'`);
  }
});
