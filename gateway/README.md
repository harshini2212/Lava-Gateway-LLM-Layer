# Lava Gateway — metered LLM gateway

**A TypeScript/Node service that sits in front of every LLM call, meters it per request, enforces per-key budgets, and rolls usage into billing.**

This is the monetization/infrastructure layer for [Brexify](../README.md): the Python app's Claude calls route through here, and every request is metered (tokens · latency · cost), attributed to a **spend key**, and priced into an invoice — the same shape as a production LLM billing platform.

It runs with **zero configuration and no API key**: with no provider key set, the gateway meters a deterministic *simulated* backend, so the whole thing is demoable and testable offline. Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) and it forwards real traffic and meters real provider-reported usage.

```bash
cd gateway
npm install
npm start        # → http://localhost:8787  (seeds demo key: lava_sk_demo_key)
npm test         # 9 tests, fully offline
```

---

## What it does

| Capability | How |
|---|---|
| **One endpoint, many providers** | `POST /v1/messages` routes by model name — `claude-*` → Anthropic, `gpt-*` → OpenAI-compatible, else simulated. Explicit `provider` override supported. |
| **Per-request metering** | Every call records input/output tokens, latency, provider, cost, and status as one immutable `UsageRecord`. |
| **Cost engine** | Price book in USD per 1M tokens, mirroring Brexify's `claude_client.py` so both agree to the dollar. |
| **Spend keys** | Scoped, budget-limited API keys. The secret is shown once; only its SHA-256 hash is stored. |
| **Budget enforcement** | A key over budget is rejected with **`402 Payment Required`** *before* the provider is called. |
| **Model allow-lists** | A key may be restricted to specific models → **`403`** otherwise. |
| **Usage & billing** | `GET /v1/usage` rolls up totals + per-model breakdown; `GET /v1/usage/invoice` prices usage and adds the gateway fee (basis points). |

Metering also rides on the response headers of every forwarded call:

```
x-lava-request-id: req_f32f4cdd1ec2c9ec3a55
x-lava-provider: anthropic
x-lava-model: claude-sonnet-4-6
x-lava-input-tokens: 11
x-lava-output-tokens: 44
x-lava-cost-usd: 0.000693
x-lava-latency-ms: 1
x-lava-balance-remaining: 1.999307
```

---

## API

```
GET  /                     self-describing index
GET  /healthz              liveness
POST /v1/keys              mint a spend key            (x-admin-key)
GET  /v1/keys              list spend keys             (x-admin-key)
POST /v1/messages          metered LLM forward         (Bearer <spend key>)
GET  /v1/usage[?key=]      usage rollup
GET  /v1/usage/invoice     usage priced into an invoice
```

### Mint a spend key

```bash
curl -s -X POST localhost:8787/v1/keys \
  -H "x-admin-key: admin_dev_key" -H "content-type: application/json" \
  -d '{"name":"brexify-prod","budgetUsd":2,"models":["claude-haiku-4-5","claude-sonnet-4-6"]}'
```

### Forward a metered request

```bash
curl -s -X POST localhost:8787/v1/messages \
  -H "authorization: Bearer lava_sk_demo_key" -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","messages":[{"role":"user","content":"Summarize Q3 card spend."}]}'
```

```json
{
  "id": "req_f32f4cdd1ec2c9ec3a55",
  "model": "claude-sonnet-4-6",
  "provider": "simulated",
  "simulated": true,
  "content": "…",
  "usage": { "input_tokens": 11, "output_tokens": 44, "cost_usd": 0.000693, "latency_ms": 1 }
}
```

### Read the invoice

```bash
curl -s localhost:8787/v1/usage/invoice
```

```json
{
  "lineItems": [
    { "model": "claude-sonnet-4-6", "requests": 1, "inputTokens": 11, "outputTokens": 44, "costUsd": 0.000693 },
    { "model": "claude-haiku-4-5",  "requests": 1, "inputTokens": 3,  "outputTokens": 36, "costUsd": 0.000183 }
  ],
  "subtotalUsd": 0.000876, "feeBps": 500, "gatewayFeeUsd": 0.000044, "totalUsd": 0.00092
}
```

---

## Design

```
src/
  types.ts        domain types (SpendKey, UsageRecord, ProviderResult)
  pricing.ts      price book + cost(model, usage)  ← mirrors comptroller/ai/claude_client.py
  keys.ts         mint / seed / authenticate spend keys (hashed secrets)
  store.ts        Store interface + in-memory impl (swap for Postgres later)
  metering.ts     recordUsage() · summarize() · invoice()   ← the metering core
  providers/      anthropic · openai · simulated + model→provider router
  routes/         messages (forward+meter) · usage · keys · health
  http.ts         bearer + admin auth
  server.ts       createServer({config, store}) — injectable for tests
  index.ts        entrypoint (dotenv, seed demo key, listen)
test/             supertest + vitest — auth, metering, budgets, allow-lists, invoice
```

Config and store are injected into `createServer`, so the test suite runs with a
fixed keyless config against a fresh in-memory store — deterministic, no network.

## Configuration

Copy `.env.example` → `.env` (git-ignored). Everything is optional; unset provider
keys simply route to the simulated backend.

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | listen port |
| `LAVA_ADMIN_KEY` | `admin_dev_key` | required to mint spend keys |
| `ANTHROPIC_API_KEY` | — | forward `claude-*` to Anthropic |
| `OPENAI_API_KEY` | — | forward `gpt-*` to any OpenAI-compatible endpoint |
| `GATEWAY_FEE_BPS` | `500` | gateway's take on usage (500 = 5%), drives the invoice |
| `SEED_DEMO_KEY` | `true` | seed `lava_sk_demo_key` ($5) on boot in non-production |

---

## Roadmap

- **Transparent proxy mode** — accept native Anthropic/OpenAI request bodies verbatim so Brexify points at the gateway via `ANTHROPIC_BASE_URL` with zero code change.
- **Durable store** — swap `MemoryStore` for Postgres behind the same `Store` interface.
- **Streaming** — meter SSE token deltas as they arrive.
- **Payouts** — settle the merchant share of `totalUsd` per period.
