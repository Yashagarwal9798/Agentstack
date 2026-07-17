// Assemble the publishable `agentstack-radar` package in npm-package/:
// a single-file esbuild bundle (all deps inlined — instant npx cold start),
// the starter content, and a standalone package.json.
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "npm-package");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "dist"), { recursive: true });

await build({
  entryPoints: [join(root, "cli", "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: join(out, "dist", "cli.js"),
  // CJS deps (commander etc.) require() node builtins — provide require in ESM.
  // (No shebang here: esbuild hoists the entry file's own hashbang to the top.)
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  logLevel: "info",
});

cpSync(join(root, "starter"), join(out, "starter"), { recursive: true });
cpSync(join(root, "README.md"), join(out, "README.md"));

const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: "agentstack-radar",
      version: rootPkg.version,
      description:
        "A living catalog for AI coding agents with cross-project memory — recommends, explains, and safely installs MCP servers and Agent Skills. Powered by Supermemory Local.",
      license: "MIT",
      type: "module",
      bin: { agentstack: "dist/cli.js", "agentstack-radar": "dist/cli.js" },
      files: ["dist", "starter", "README.md"],
      engines: { node: ">=22" },
      repository: { type: "git", url: "git+https://github.com/Yashagarwal9798/Agentstack.git" },
      homepage: "https://github.com/Yashagarwal9798/Agentstack#readme",
      keywords: ["mcp", "agent-skills", "claude-code", "supermemory", "ai-agents", "cli", "developer-tools"],
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log("npm-package/ ready — publish with: cd npm-package && npm publish");
