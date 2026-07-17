// The ONLY place Claude Code-specific paths/formats live (architecture §1.4).
// Cursor/Codex support = new file implementing AgentAdapter.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CapabilityCard } from "@agentstack/shared";

export interface DetectedInstall {
  /** Raw name as found (skill dir name or mcp server key) — profiler resolves to catalog ids. */
  name: string;
  installedAs: "skill" | "mcp-config";
  detectedFrom: string;
}

export interface AgentAdapter {
  name: string;
  skillsDir(projectRoot: string): string;
  instructionFile(projectRoot: string): string;
  mcpConfigPath(projectRoot: string): string;
  /** Card → the fragment that goes under mcpServers.<key> in .mcp.json. */
  renderMcpEntry(card: CapabilityCard): { key: string; entry: Record<string, unknown> } | null;
  detectInstalled(projectRoot: string): DetectedInstall[];
}

export const claudeCode: AgentAdapter = {
  name: "claude-code",

  skillsDir: (root) => join(root, ".claude", "skills"),
  instructionFile: (root) => join(root, "CLAUDE.md"),
  mcpConfigPath: (root) => join(root, ".mcp.json"),

  renderMcpEntry(card) {
    const cfg = card.installation.mcpConfig;
    if (!cfg) return null;
    const key = card.id.split("/").pop() ?? card.id;
    return { key, entry: cfg as Record<string, unknown> };
  },

  detectInstalled(root) {
    const found: DetectedInstall[] = [];

    const skillsDir = this.skillsDir(root);
    if (existsSync(skillsDir)) {
      for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
        if (dir.isDirectory() && existsSync(join(skillsDir, dir.name, "SKILL.md"))) {
          found.push({ name: dir.name, installedAs: "skill", detectedFrom: `.claude/skills/${dir.name}` });
        }
      }
    }

    const mcpPath = this.mcpConfigPath(root);
    if (existsSync(mcpPath)) {
      try {
        const cfg = JSON.parse(readFileSync(mcpPath, "utf8").replace(/^﻿/, "")) as {
          mcpServers?: Record<string, unknown>;
        };
        for (const key of Object.keys(cfg.mcpServers ?? {})) {
          found.push({ name: key, installedAs: "mcp-config", detectedFrom: ".mcp.json" });
        }
      } catch {
        // unreadable .mcp.json — treat as none rather than failing the scan
      }
    }

    return found;
  },
};
