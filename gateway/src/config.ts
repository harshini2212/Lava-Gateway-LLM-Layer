export interface Config {
  port: number;
  adminKey: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  /** Gateway's take on metered usage, in basis points (500 = 5%). */
  gatewayFeeBps: number;
  /** Seed a fixed demo spend key on boot (non-production only). */
  seedDemoKey: boolean;
  isProd: boolean;
}

export function loadConfig(): Config {
  const isProd = process.env.NODE_ENV === "production";
  return {
    port: Number(process.env.PORT ?? 8787),
    adminKey: process.env.LAVA_ADMIN_KEY ?? "admin_dev_key",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    gatewayFeeBps: Number(process.env.GATEWAY_FEE_BPS ?? 500),
    seedDemoKey: !isProd && (process.env.SEED_DEMO_KEY ?? "true") !== "false",
    isProd,
  };
}
