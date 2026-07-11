import type { CompletionRequest, ProviderResult } from "../types";
import { GatewayError } from "../errors";

interface OpenAIResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Forward to any OpenAI-compatible /chat/completions endpoint (OpenAI, Together, etc.). */
export async function openaiComplete(
  req: CompletionRequest,
  apiKey: string,
  baseUrl = "https://api.openai.com/v1",
): Promise<ProviderResult> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    }),
  });

  if (!res.ok) {
    throw new GatewayError(res.status, "provider_error", (await res.text()).slice(0, 500));
  }

  const data = (await res.json()) as OpenAIResponse;
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
    provider: "openai",
    model: data.model ?? req.model,
    simulated: false,
  };
}
