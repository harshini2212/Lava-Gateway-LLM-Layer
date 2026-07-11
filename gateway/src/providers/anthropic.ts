import type { CompletionRequest, ProviderResult } from "../types";
import { GatewayError } from "../errors";

interface AnthropicResponse {
  model?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Forward to Anthropic's Messages API and normalise the response + token usage. */
export async function anthropicComplete(
  req: CompletionRequest,
  apiKey: string,
): Promise<ProviderResult> {
  const system = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.max_tokens ?? 1024,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!res.ok) {
    throw new GatewayError(res.status, "provider_error", (await res.text()).slice(0, 500));
  }

  const data = (await res.json()) as AnthropicResponse;
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return {
    text,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
    provider: "anthropic",
    model: data.model ?? req.model,
    simulated: false,
  };
}
