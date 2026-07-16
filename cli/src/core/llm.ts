import type { z } from "zod";
import { resolveLlm, type LlmSettings } from "./stateStore.js";

interface ChatResponse {
  choices: Array<{ message: { content: string } }>;
}

async function chat(prompt: string, settings: LlmSettings, system?: string): Promise<string> {
  if (!settings.apiKey) {
    throw new Error(
      "No LLM API key configured. Set AGENTSTACK_LLM_API_KEY (or GEMINI_API_KEY), or run `agentstack init`.",
    );
  }
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  // Gemini returns transient 503s under load (seen in phase 2 smoke) — retry
  // rate/availability errors with backoff before giving up.
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5000 * 2 ** (attempt - 1)));
    const res = await fetch(`${settings.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: settings.model, messages }),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      const data = (await res.json()) as ChatResponse;
      const content = data.choices[0]?.message.content;
      if (typeof content !== "string") throw new Error("LLM response had no message content");
      return content;
    }
    const body = await res.text().catch(() => "");
    lastError = `HTTP ${res.status} ${body.slice(0, 300)}`;
    if (res.status !== 429 && res.status < 500) break; // non-retryable
  }
  throw new Error(`LLM request failed after retries: ${lastError}`);
}

/** Strip markdown fences some models wrap around JSON. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

/** Plain text completion. */
export async function complete(prompt: string, opts?: { system?: string; settings?: LlmSettings }): Promise<string> {
  return chat(prompt, opts?.settings ?? resolveLlm(), opts?.system);
}

/**
 * JSON-mode completion validated against a zod schema.
 * On invalid output, retries ONCE with the validation errors as repair context
 * (architecture.md: same repair pattern as the pipeline extractor).
 */
export async function completeJson<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts?: { system?: string; settings?: LlmSettings },
): Promise<z.infer<S>> {
  const settings = opts?.settings ?? resolveLlm();
  const system = [
    opts?.system,
    "Respond ONLY with a single valid JSON value matching the requested structure. No prose, no markdown fences.",
  ]
    .filter(Boolean)
    .join("\n");

  let raw = await chat(prompt, settings, system);
  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (err) {
      parsed = undefined;
      if (attempt === 1) throw new Error(`LLM returned unparseable JSON: ${String(err)}`);
    }
    if (parsed !== undefined) {
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      if (attempt === 1) {
        throw new Error(`LLM JSON failed schema after repair retry: ${result.error.message.slice(0, 500)}`);
      }
      raw = await chat(
        `Your previous JSON response was invalid:\n${raw}\n\nValidation errors:\n${result.error.message.slice(0, 1000)}\n\nOriginal request:\n${prompt}\n\nReturn corrected JSON only.`,
        settings,
        system,
      );
      continue;
    }
    raw = await chat(
      `Your previous response was not parseable JSON:\n${raw}\n\nOriginal request:\n${prompt}\n\nReturn valid JSON only.`,
      settings,
      system,
    );
  }
  throw new Error("unreachable");
}
