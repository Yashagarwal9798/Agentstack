import type { z } from "zod";

export interface LlmSettings {
  baseURL: string;
  model: string;
  apiKey?: string;
}

interface ChatResponse {
  choices: Array<{ message: { content: string } }>;
}

export async function chat(prompt: string, settings: LlmSettings, system?: string): Promise<string> {
  if (!settings.apiKey) {
    throw new Error("No LLM API key configured (AGENTSTACK_LLM_API_KEY / GEMINI_API_KEY).");
  }
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  // Free tiers throw transient 429/5xx under load — retry with backoff and
  // honor Retry-After on rate limits. Thrown fetches (network reset, abort
  // timeout — our most-observed failure mode) are retryable too.
  const MAX_ATTEMPTS = 6;
  let lastError = "";
  let backoff = 5000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let waitMs = backoff;
    try {
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
      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = Math.min(retryAfter * 1000 + 1000, 90_000);
    } catch (err) {
      if (err instanceof Error && err.message === "LLM response had no message content") throw err;
      lastError = `network: ${String(err).slice(0, 200)}`;
    }
    backoff = Math.min(backoff * 2, 60_000);
    if (attempt < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, waitMs)); // no dead sleep after the final attempt
  }
  throw new Error(`LLM request failed after retries: ${lastError}`);
}

/** All plausible JSON payloads in a response: every fenced block, then the
 *  fence-stripped text, then the raw text. Models often quote the OLD broken
 *  JSON in one fence and the corrected version in another. */
function jsonCandidates(text: string): string[] {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]!.trim());
  return [...fences, text.replace(/```(?:json)?/g, "").trim(), text.trim()];
}

function parseFirstJson(text: string): unknown {
  let lastErr: unknown;
  for (const candidate of jsonCandidates(text)) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("no JSON candidates found");
}

/**
 * JSON-mode completion validated against a zod schema; retries ONCE with the
 * validation errors as repair context (architecture.md repair pattern).
 */
export async function chatJson<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  settings: LlmSettings,
  system?: string,
): Promise<z.infer<S>> {
  const fullSystem = [
    system,
    "Respond ONLY with a single valid JSON value matching the requested structure. No prose, no markdown fences.",
  ]
    .filter(Boolean)
    .join("\n");

  let raw = await chat(prompt, settings, fullSystem);
  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed: unknown;
    try {
      parsed = parseFirstJson(raw);
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
        fullSystem,
      );
      continue;
    }
    raw = await chat(
      `Your previous response was not parseable JSON:\n${raw}\n\nOriginal request:\n${prompt}\n\nReturn valid JSON only.`,
      settings,
      fullSystem,
    );
  }
  throw new Error("unreachable");
}
