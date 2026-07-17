// Shared terminal theme (CLAUDE.md hard requirement: no plain output).
// One palette, one set of symbols, consistent across every command.
import pc from "picocolors";

export const theme = {
  brand: (s: string) => pc.magenta(pc.bold(s)),
  accent: (s: string) => pc.cyan(s),
  ok: (s: string) => pc.green(s),
  warn: (s: string) => pc.yellow(s),
  err: (s: string) => pc.red(s),
  dim: (s: string) => pc.dim(s),
  bold: (s: string) => pc.bold(s),
  id: (s: string) => pc.cyan(s),
  score: (n: number) => (n >= 80 ? pc.green(String(n)) : n >= 60 ? pc.yellow(String(n)) : pc.red(String(n))),
};

export const sym = {
  ok: pc.green("✔"),
  err: pc.red("✖"),
  warn: pc.yellow("⚠"),
  dot: pc.magenta("●"),
  arrow: pc.dim("→"),
  plus: pc.green("+"),
  tilde: pc.yellow("~"),
  minus: pc.red("−"),
};

export function trustBadge(trust: string): string {
  switch (trust) {
    case "official": return pc.bgGreen(pc.black(" official "));
    case "curated": return pc.bgCyan(pc.black(" curated "));
    case "community": return pc.bgYellow(pc.black(" community "));
    default: return pc.bgRed(pc.black(" unverified "));
  }
}

export function statusBadge(status: string): string {
  switch (status) {
    case "active": return pc.green("active");
    case "deprecated": return pc.yellow("deprecated");
    default: return pc.red(status);
  }
}

export function localCloudBadge(lc: string): string {
  switch (lc) {
    case "local": return pc.green("⌂ local");
    case "cloud": return pc.yellow("☁ cloud");
    default: return pc.cyan("⇄ hybrid");
  }
}

/** The AgentStack banner shown by `init` (and only init — don't spam). */
export function banner(): string {
  return [
    pc.magenta(pc.bold("     _                    _   ____  _             _    ")),
    pc.magenta(pc.bold("    / \\   __ _  ___ _ __ | |_/ ___|| |_ __ _  ___| | __")),
    pc.magenta(pc.bold("   / _ \\ / _` |/ _ \\ '_ \\| __\\___ \\| __/ _` |/ __| |/ /")),
    pc.magenta(pc.bold("  / ___ \\ (_| |  __/ | | | |_ ___) | || (_| | (__|   < ")),
    pc.magenta(pc.bold(" /_/   \\_\\__, |\\___|_| |_|\\__|____/ \\__\\__,_|\\___|_|\\_\\")),
    pc.magenta(pc.bold("         |___/                                   radar ")),
    pc.dim("  a living catalog for AI coding agents · powered by Supermemory Local"),
  ].join("\n");
}

/** Aligned key-value block. */
export function kv(pairs: Array<[string, string]>, indent = 2): string {
  const width = Math.max(...pairs.map(([k]) => k.length));
  return pairs
    .map(([k, v]) => `${" ".repeat(indent)}${pc.dim(k.padEnd(width))}  ${v}`)
    .join("\n");
}

/** Minimal boxed summary (single-width, rounded corners). */
export function box(title: string, lines: string[]): string {
  const strip = (s: string) => s.replace(/\[[0-9;]*m/g, "");
  const width = Math.max(strip(title).length, ...lines.map((l) => strip(l).length)) + 2;
  const top = `${pc.dim("╭─")} ${pc.bold(title)} ${pc.dim("─".repeat(Math.max(0, width - strip(title).length - 2)) + "╮")}`;
  const body = lines.map((l) => `${pc.dim("│")} ${l}${" ".repeat(Math.max(0, width - strip(l).length))}${pc.dim("│")}`);
  const bottom = pc.dim(`╰${"─".repeat(width + 1)}╯`);
  return [top, ...body, bottom].join("\n");
}

/** Simple two-column table with dim headers. */
export function table(headers: [string, string], rows: Array<[string, string]>): string {
  const strip = (s: string) => s.replace(/\[[0-9;]*m/g, "");
  const w = Math.max(strip(headers[0]).length, ...rows.map(([a]) => strip(a).length));
  const head = `  ${pc.dim(headers[0].padEnd(w))}  ${pc.dim(headers[1])}`;
  const body = rows.map(([a, b]) => `  ${a}${" ".repeat(Math.max(0, w - strip(a).length))}  ${b}`);
  return [head, ...body].join("\n");
}
