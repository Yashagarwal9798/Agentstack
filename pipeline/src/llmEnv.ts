import type { LlmSettings } from "@agentstack/shared";

/** Missing GitHub Actions secrets arrive as EMPTY STRINGS, not undefined —
 *  treat blank as unset so defaults still apply and key errors stay loud. */
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : undefined;
}

/** Pipeline resolves its LLM purely from env (GitHub Actions secrets / .env.local). */
export function pipelineLlm(): LlmSettings {
  return {
    baseURL: env("AGENTSTACK_LLM_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai",
    model: env("AGENTSTACK_LLM_MODEL") ?? "gemini-flash-latest",
    apiKey: env("AGENTSTACK_LLM_API_KEY") ?? env("GEMINI_API_KEY"),
  };
}
