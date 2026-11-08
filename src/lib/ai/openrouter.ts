import { config } from "@/lib/config";
import { ProviderError } from "./errors";

// OpenRouter chat completions with an image and a JSON-schema response.
// Server-only: the key never leaves the server.

type ImageInput = { bytes: Uint8Array; mime: string };

export type ModelRun = {
  /** The model that actually answered (a fallback may have been used). */
  model: string;
  /** Real charge reported by OpenRouter, in USD, summed over retries. */
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  attempts: number;
};

export async function chatJson(args: {
  prompt: string;
  image: ImageInput;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<{ content: string; run: ModelRun }> {
  const dataUrl = `data:${args.image.mime};base64,${Buffer.from(args.image.bytes).toString("base64")}`;

  let res: Response;
  try {
    res = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
        "Content-Type": "application/json",
        // Attribution headers OpenRouter shows in its dashboard.
        "HTTP-Referer": config.appUrl,
        "X-Title": "FLICKS Lite",
      },
      body: JSON.stringify({
        // Primary model first, then fallbacks OpenRouter tries if it is unavailable.
        models: [config.openrouter.model, ...config.openrouter.fallbackModels],
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: args.prompt },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: args.schemaName, strict: false, schema: args.schema },
        },
        temperature: 0.2,
        max_tokens: 4000,
        // Only route to providers that honour the JSON schema and do not keep
        // prompts for training: these are user photos.
        provider: { require_parameters: true, data_collection: "deny" },
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    throw new ProviderError(`OpenRouter request failed: ${String(err)}`, true);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const status = body?.error?.code ?? res.status;
    // 4xx other than rate limits (bad key, no credits, bad request) will not fix themselves.
    const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
    throw new ProviderError(`OpenRouter ${status}: ${body?.error?.message ?? res.statusText}`, retryable);
  }

  const content: unknown = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ProviderError("OpenRouter returned an empty response", true);
  }
  return {
    content: stripFences(content),
    run: {
      model: String(body.model ?? config.openrouter.model),
      costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : null,
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
      attempts: 1,
    },
  };
}

// Some providers wrap JSON in ```json fences even in JSON mode.
function stripFences(s: string) {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : s;
}
