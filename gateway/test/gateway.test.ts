import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createServer } from "../src/server";
import { MemoryStore } from "../src/store";
import type { Config } from "../src/config";
import { costUsd } from "../src/pricing";

// Fixed config: no provider keys → every call is metered against the simulated
// backend, so tests are deterministic and never touch the network.
const testConfig: Config = {
  port: 0,
  adminKey: "test_admin",
  anthropicApiKey: undefined,
  openaiApiKey: undefined,
  gatewayFeeBps: 500,
  seedDemoKey: false,
  isProd: false,
};

let app: Express;

beforeEach(() => {
  app = createServer({ config: testConfig, store: new MemoryStore() }).app;
});

async function mintKey(budgetUsd = 1, models: string[] | null = null): Promise<string> {
  const res = await request(app)
    .post("/v1/keys")
    .set("x-admin-key", "test_admin")
    .send({ name: "test", budgetUsd, models });
  expect(res.status).toBe(201);
  return res.body.secret as string;
}

const send = (secret: string, model = "claude-haiku-4-5") =>
  request(app)
    .post("/v1/messages")
    .set("authorization", `Bearer ${secret}`)
    .send({ model, provider: "simulated", messages: [{ role: "user", content: "ping the gateway" }] });

describe("health", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("auth", () => {
  it("rejects a forward with no key", async () => {
    const res = await request(app)
      .post("/v1/messages")
      .send({ model: "claude-haiku-4-5", messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
  });

  it("requires an admin key to mint spend keys", async () => {
    const res = await request(app).post("/v1/keys").send({ name: "x", budgetUsd: 1 });
    expect(res.status).toBe(401);
  });
});

describe("metering", () => {
  it("meters tokens, latency, and cost on a forwarded request", async () => {
    const secret = await mintKey();
    const res = await send(secret);

    expect(res.status).toBe(200);
    expect(res.body.simulated).toBe(true);
    expect(res.body.usage.input_tokens).toBeGreaterThan(0);
    expect(res.body.usage.output_tokens).toBeGreaterThan(0);

    // Cost on the body matches the price book exactly...
    const expected = costUsd("claude-haiku-4-5", {
      inputTokens: res.body.usage.input_tokens,
      outputTokens: res.body.usage.output_tokens,
    });
    expect(res.body.usage.cost_usd).toBe(expected);
    // ...and is echoed on the metering headers.
    expect(res.headers["x-lava-cost-usd"]).toBe(String(expected));
    expect(Number(res.headers["x-lava-latency-ms"])).toBeGreaterThanOrEqual(0);
  });

  it("rolls individual requests into a usage summary", async () => {
    const secret = await mintKey();
    await send(secret);
    await send(secret);

    const res = await request(app).get("/v1/usage");
    expect(res.status).toBe(200);
    expect(res.body.totals.requests).toBe(2);
    expect(res.body.totals.costUsd).toBeGreaterThan(0);
    expect(res.body.byModel["claude-haiku-4-5"].requests).toBe(2);
  });

  it("prices usage into an invoice with the gateway fee", async () => {
    const secret = await mintKey();
    await send(secret);

    const res = await request(app).get("/v1/usage/invoice");
    expect(res.status).toBe(200);
    expect(res.body.feeBps).toBe(500);
    expect(res.body.gatewayFeeUsd).toBeCloseTo(res.body.subtotalUsd * 0.05, 6); // 500 bps = 5%
    expect(res.body.totalUsd).toBeCloseTo(res.body.subtotalUsd + res.body.gatewayFeeUsd, 6);
  });
});

describe("spend controls", () => {
  it("enforces the per-key budget (402 once spent)", async () => {
    const secret = await mintKey(1e-9); // budget so small one call exhausts it
    const first = await send(secret);
    expect(first.status).toBe(200); // first call allowed (spent started at 0)

    const second = await send(secret);
    expect(second.status).toBe(402);
    expect(second.body.error.code).toBe("budget_exceeded");
  });

  it("enforces the model allow-list (403)", async () => {
    const secret = await mintKey(1, ["claude-haiku-4-5"]);
    const res = await send(secret, "gpt-4o");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("model_not_allowed");
  });

  it("tracks running spend on the key", async () => {
    const secret = await mintKey();
    await send(secret);

    const list = await request(app).get("/v1/keys").set("x-admin-key", "test_admin");
    expect(list.status).toBe(200);
    expect(list.body.keys[0].spentUsd).toBeGreaterThan(0);
    expect(list.body.keys[0]).not.toHaveProperty("secretHash");
  });
});
