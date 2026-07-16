import type { z } from "zod";
import { chat, chatJson } from "@agentstack/shared";
import { resolveLlm, type LlmSettings } from "./stateStore.js";

/** Plain text completion using the configured provider (env > config). */
export async function complete(prompt: string, opts?: { system?: string; settings?: LlmSettings }): Promise<string> {
  return chat(prompt, opts?.settings ?? resolveLlm(), opts?.system);
}

/** JSON completion validated against a zod schema, with one repair retry. */
export async function completeJson<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts?: { system?: string; settings?: LlmSettings },
): Promise<z.infer<S>> {
  return chatJson(prompt, schema, opts?.settings ?? resolveLlm(), opts?.system);
}
