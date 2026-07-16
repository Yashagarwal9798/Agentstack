import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Catalog, FeedbackRecord, LlmSettings } from "@agentstack/shared";

export const AGENTSTACK_DIR = join(homedir(), ".agentstack");

export type { LlmSettings };

export interface Config {
  llm: LlmSettings;
  supermemoryApiKey?: string;
  catalogManifestUrl?: string;
  targetAgent: string;
  lastSync?: { version: string; date: string };
}

// Gemini's OpenAI-compatible endpoint is the working default on this machine
// (phase 0: `gemini-2.5-flash` is closed to new users — use the -latest alias).
export const DEFAULT_LLM: LlmSettings = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
  model: "gemini-flash-latest",
};

export const paths = {
  config: join(AGENTSTACK_DIR, "config.json"),
  catalog: join(AGENTSTACK_DIR, "catalog.json"),
  releases: join(AGENTSTACK_DIR, "releases.json"),
  projects: join(AGENTSTACK_DIR, "projects.json"),
  feedback: join(AGENTSTACK_DIR, "feedback.json"),
  install: (slug: string) => join(AGENTSTACK_DIR, "installs", `${slug}.json`),
};

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Write via temp file + rename so a crash mid-write never corrupts state. */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

export function loadConfig(): Config {
  return readJson<Config>(paths.config, {
    llm: { ...DEFAULT_LLM },
    targetAgent: "claude-code",
  });
}

export function saveConfig(config: Config): void {
  writeJson(paths.config, config);
}

/** Env vars beat config.json (architecture.md §3 precedence). */
export function resolveSupermemoryKey(config = loadConfig()): string | undefined {
  return process.env.SUPERMEMORY_API_KEY ?? config.supermemoryApiKey;
}

export function resolveLlm(config = loadConfig()): LlmSettings {
  return {
    baseURL: process.env.AGENTSTACK_LLM_BASE_URL ?? config.llm.baseURL,
    model: process.env.AGENTSTACK_LLM_MODEL ?? config.llm.model,
    apiKey:
      process.env.AGENTSTACK_LLM_API_KEY ??
      config.llm.apiKey ??
      process.env.GEMINI_API_KEY,
  };
}

export function loadLocalCatalog(): Catalog {
  return readJson<Catalog>(paths.catalog, {
    version: "none",
    updatedAt: "",
    capabilities: [],
  });
}

export function saveLocalCatalog(catalog: Catalog): void {
  writeJson(paths.catalog, catalog);
}

export function loadFeedback(): FeedbackRecord[] {
  return readJson<FeedbackRecord[]>(paths.feedback, []);
}

export function appendFeedback(record: FeedbackRecord): void {
  const all = loadFeedback();
  all.push(record);
  writeJson(paths.feedback, all);
}
