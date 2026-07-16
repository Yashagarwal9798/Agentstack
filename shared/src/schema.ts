import { z } from "zod";

// ---------------------------------------------------------------------------
// Capability Card (prd.md §10) — the canonical record for every discovered
// capability. The pipeline validates before publishing; the CLI validates
// after downloading.
// ---------------------------------------------------------------------------

export const CapabilityType = z.enum(["mcp", "skill", "cli", "plugin"]);
export type CapabilityType = z.infer<typeof CapabilityType>;

export const CapabilityStatus = z.enum(["active", "deprecated", "removed"]);
export type CapabilityStatus = z.infer<typeof CapabilityStatus>;

export const TrustTier = z.enum(["official", "curated", "community", "unverified"]);
export type TrustTier = z.infer<typeof TrustTier>;

export const LocalCloud = z.enum(["local", "cloud", "hybrid"]);
export type LocalCloud = z.infer<typeof LocalCloud>;

export const SourceKind = z.enum(["registry", "repo", "rss", "starter"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const CapabilitySource = z.object({
  url: z.string().url(),
  kind: SourceKind,
});
export type CapabilitySource = z.infer<typeof CapabilitySource>;

export const Installation = z.object({
  /** Shell command a human runs themselves (never executed by agentstack). */
  command: z.string().optional(),
  /** Fragment merged into the agent's MCP config (e.g. .mcp.json servers entry). */
  mcpConfig: z.record(z.unknown()).optional(),
  /** Env vars / secrets the capability needs (names only, never values). */
  requiredSecrets: z.array(z.string()).default([]),
});
export type Installation = z.infer<typeof Installation>;

/** Canonical id: `${type}:${namespace}/${name}`, e.g. "mcp:microsoft/playwright-mcp". */
export const CapabilityId = z
  .string()
  .regex(/^(mcp|skill|cli|plugin):[a-z0-9-]+\/[a-z0-9-]+$/i, "expected `type:namespace/name`");

export const CapabilityCard = z.object({
  id: CapabilityId,
  name: z.string().min(1),
  type: CapabilityType,
  summary: z.string().min(1),
  useWhen: z.array(z.string()).min(1),
  doNotUseWhen: z.array(z.string()).default([]),
  categories: z.array(z.string()).min(1),
  agents: z.array(z.string()).min(1),
  languages: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  installation: Installation,
  localCloud: LocalCloud,
  version: z.string().min(1),
  status: CapabilityStatus,
  trust: TrustTier,
  sources: z.array(CapabilitySource).min(1),
  firstSeen: z.string(),
  lastChecked: z.string(),
  /** sha256 of the card content; filled by the pipeline, absent on starter cards. */
  contentHash: z.string().optional(),
});
export type CapabilityCard = z.infer<typeof CapabilityCard>;

// ---------------------------------------------------------------------------
// Catalog distribution (architecture.md §2.1 step 7, §2.3)
// ---------------------------------------------------------------------------

export const CatalogRelease = z.object({
  version: z.string(), // e.g. "2026.07.17.1"
  deltaPath: z.string(), // repo-relative, e.g. "catalog/deltas/2026.07.17.1.json"
  sha256: z.string(),
  createdAt: z.string(),
});
export type CatalogRelease = z.infer<typeof CatalogRelease>;

export const Manifest = z.object({
  latestVersion: z.string(),
  releases: z.array(CatalogRelease),
});
export type Manifest = z.infer<typeof Manifest>;

/** Deltas carry full cards for added/updated (so the CLI upserts without a
 *  second fetch) and bare ids for deprecated. */
export const Delta = z.object({
  version: z.string(),
  createdAt: z.string(),
  added: z.array(CapabilityCard),
  updated: z.array(CapabilityCard),
  deprecated: z.array(CapabilityId),
});
export type Delta = z.infer<typeof Delta>;

export const Catalog = z.object({
  version: z.string(),
  updatedAt: z.string(),
  capabilities: z.array(CapabilityCard),
});
export type Catalog = z.infer<typeof Catalog>;

// ---------------------------------------------------------------------------
// Project profile (architecture.md §2.5)
// ---------------------------------------------------------------------------

export const ConstraintType = z.enum(["privacy", "platform", "budget", "other"]);
export type ConstraintType = z.infer<typeof ConstraintType>;

export const ProjectConstraint = z.object({
  type: ConstraintType,
  text: z.string().min(1),
});
export type ProjectConstraint = z.infer<typeof ProjectConstraint>;

export const ProjectStage = z.enum(["idea", "early", "active", "maintenance"]);
export type ProjectStage = z.infer<typeof ProjectStage>;

export const InstalledCapability = z.object({
  id: z.string(), // best-effort match; scan may find things outside the catalog
  installedAs: z.enum(["skill", "mcp-config"]),
  detectedFrom: z.string(), // e.g. ".mcp.json", ".claude/skills/foo"
});
export type InstalledCapability = z.infer<typeof InstalledCapability>;

export const ProjectProfile = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  goal: z.string().min(1),
  stack: z.array(z.string()).default([]),
  constraints: z.array(ProjectConstraint).default([]),
  stage: ProjectStage,
  alreadyInstalled: z.array(InstalledCapability).default([]),
  targetAgent: z.string().default("claude-code"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectProfile = z.infer<typeof ProjectProfile>;

// ---------------------------------------------------------------------------
// Recommendation (architecture.md §2.6) — the contract between `recommend`
// and `apply`.
// ---------------------------------------------------------------------------

export const RejectionStage = z.enum(["gate", "score", "llm"]);
export type RejectionStage = z.infer<typeof RejectionStage>;

export const RecommendedItem = z.object({
  id: CapabilityId,
  score: z.number().min(0).max(100),
  explanation: z.string(), // human "why this, for this project"
  memoryInfluence: z.string().optional(), // set when Path 1/2 changed this item's fate
});
export type RecommendedItem = z.infer<typeof RecommendedItem>;

export const RejectedItem = z.object({
  id: CapabilityId,
  stage: RejectionStage,
  reason: z.string(),
});
export type RejectedItem = z.infer<typeof RejectedItem>;

export const Recommendation = z.object({
  projectSlug: z.string(),
  catalogRelease: z.string(),
  createdAt: z.string(),
  recommended: z.array(RecommendedItem),
  rejected: z.array(RejectedItem),
});
export type Recommendation = z.infer<typeof Recommendation>;

// ---------------------------------------------------------------------------
// Stack lock (prd.md §10) — written by `apply`.
// ---------------------------------------------------------------------------

export const LockedCapability = z.object({
  id: CapabilityId,
  version: z.string(),
  installedAs: z.enum(["skill", "mcp-config"]),
  approvedAt: z.string(),
  source: z.string(),
});
export type LockedCapability = z.infer<typeof LockedCapability>;

export const StackLock = z.object({
  catalogRelease: z.string(),
  capabilities: z.array(LockedCapability),
});
export type StackLock = z.infer<typeof StackLock>;

// ---------------------------------------------------------------------------
// Feedback (architecture.md §2.8) — Path 1 input, keyed by capability id.
// ---------------------------------------------------------------------------

export const FeedbackVerdict = z.enum(["useful", "not_useful"]);
export type FeedbackVerdict = z.infer<typeof FeedbackVerdict>;

export const FeedbackRecord = z.object({
  capabilityId: CapabilityId,
  projectSlug: z.string(),
  verdict: FeedbackVerdict,
  note: z.string().optional(),
  date: z.string(),
});
export type FeedbackRecord = z.infer<typeof FeedbackRecord>;
