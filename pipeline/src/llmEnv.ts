import type { LlmSettings } from "@agentstack/shared";

/** Pipeline resolves its LLM purely from env (GitHub Actions secrets / .env.local). */
export function pipelineLlm(): LlmSettings {
  return {
    baseURL: process.env.AGENTSTACK_LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
    model: process.env.AGENTSTACK_LLM_MODEL ?? "gemini-flash-latest",
    apiKey: process.env.AGENTSTACK_LLM_API_KEY ?? process.env.GEMINI_API_KEY,
  };
}
