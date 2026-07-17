// Idea mode + light auto-scan → structured ProjectProfile (architecture §2.5).
// Deep source-code analysis is explicitly out of scope for v1.
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import { ProjectProfile, type Catalog, type InstalledCapability } from "@agentstack/shared";
import { completeJson } from "./llm.js";
import { claudeCode } from "../adapters/claudeCode.js";

export interface ScanResult {
  declaredStack: string[];
  readmeHead: string;
  alreadyInstalled: InstalledCapability[];
}

/** Read manifests/README/existing agent config — never walks source code. */
export function lightScan(root: string, catalog: Catalog): ScanResult {
  const declaredStack: string[] = [];

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8").replace(/^﻿/, "")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      declaredStack.push("node", ...Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 25));
    } catch { /* unreadable manifest — skip */ }
  }
  const reqPath = join(root, "requirements.txt");
  if (existsSync(reqPath)) {
    declaredStack.push(
      "python",
      ...readFileSync(reqPath, "utf8").split("\n").map((l) => l.split(/[=<>[\s]/)[0]!.trim()).filter(Boolean).slice(0, 25),
    );
  }

  let readmeHead = "";
  const readmePath = join(root, "README.md");
  if (existsSync(readmePath)) {
    readmeHead = readFileSync(readmePath, "utf8").split("\n").slice(0, 100).join("\n").slice(0, 4000);
  }

  // Existing installs: resolve raw names to catalog ids where possible so
  // `recommend` can hard-filter them (never re-recommend what's installed).
  const alreadyInstalled: InstalledCapability[] = claudeCode.detectInstalled(root).map((d) => {
    const match = catalog.capabilities.find(
      (c) => c.id.endsWith(`/${d.name}`) || c.id === d.name || (c.installation.mcpConfig && (claudeCode.renderMcpEntry(c)?.key === d.name)),
    );
    return { id: match?.id ?? d.name, installedAs: d.installedAs, detectedFrom: d.detectedFrom };
  });

  return { declaredStack: [...new Set(declaredStack)], readmeHead, alreadyInstalled };
}

const LlmProfile = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  goal: z.string().min(1),
  stack: z.array(z.string()),
  constraints: z.array(z.object({ type: z.enum(["privacy", "platform", "budget", "other"]), text: z.string() })),
});

export interface ProfileAnswers {
  goal: string;
  stack: string;
  constraints: string;
  stage: "idea" | "early" | "active" | "maintenance";
}

export async function buildProfile(
  root: string,
  answers: ProfileAnswers,
  scan: ScanResult,
): Promise<ProjectProfile> {
  const structured = await completeJson(
    `Structure this software project description into a profile.

User's description of the project goal:
${answers.goal}

User's stated stack preferences: ${answers.stack || "(none stated)"}
User's stated hard constraints: ${answers.constraints || "(none stated)"}

Evidence from repository scan (may be empty for new projects):
- declared dependencies: ${scan.declaredStack.join(", ") || "(none)"}
- README start: ${scan.readmeHead.slice(0, 1500) || "(no README)"}

Return: slug (short kebab-case name derived from the goal, e.g. "pdf-chat-electron"), goal (one clean sentence), stack (merged technology list from statements + evidence, lowercase), constraints (each with type: privacy/platform/budget/other — infer privacy constraints from phrases like "local only", "no cloud", "sensitive data").
Directory name for slug inspiration: "${basename(root)}".`,
    LlmProfile,
  );

  const now = new Date().toISOString();
  return ProjectProfile.parse({
    ...structured,
    stage: answers.stage,
    alreadyInstalled: scan.alreadyInstalled,
    targetAgent: "claude-code",
    createdAt: now,
    updatedAt: now,
  });
}

/** Narrative twin for Supermemory (`project_<slug>` container). */
export function profileNarrative(profile: ProjectProfile): string {
  const parts = [
    `Project "${profile.slug}": ${profile.goal}`,
    profile.stack.length ? `Technology stack: ${profile.stack.join(", ")}.` : "",
    profile.constraints.length
      ? `Hard constraints: ${profile.constraints.map((c) => `${c.text} (${c.type})`).join("; ")}.`
      : "",
    `Development stage: ${profile.stage}.`,
    profile.alreadyInstalled.length
      ? `Already installed capabilities: ${profile.alreadyInstalled.map((i) => i.id).join(", ")}.`
      : "",
  ];
  return parts.filter(Boolean).join("\n");
}
