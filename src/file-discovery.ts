import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import ignore from "ignore";

import { relativeStateRoot } from "./state-root";

function runGit(workspace: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", workspace, ...args], {
    encoding: "utf-8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function shouldSkip(rel: string, stateRootRel: string | null): boolean {
  if (!rel) return true;
  if (rel.startsWith(".git/")) return true;
  if (rel.startsWith("node_modules/")) return true;
  if (stateRootRel && (rel === stateRootRel || rel.startsWith(`${stateRootRel}/`))) return true;
  return false;
}

async function listFilesFallbackWithGitignore(
  workspace: string,
  stateRoot?: string,
): Promise<string[]> {
  const out: string[] = [];
  const stateRootRel = relativeStateRoot(workspace, stateRoot);
  const ig = ignore();
  ig.add([".git", "node_modules"]);
  if (stateRootRel) ig.add([stateRootRel]);

  try {
    const rootIgnore = await readFile(join(workspace, ".gitignore"), "utf-8");
    ig.add(rootIgnore);
  } catch {
    // ignore missing .gitignore
  }

  async function walk(absDir: string): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = join(absDir, entry.name);
      const rel = relative(workspace, absPath).replace(/\\/g, "/");
      if (!rel) continue;
      if (shouldSkip(rel, stateRootRel)) continue;
      if (entry.isDirectory()) {
        if (ig.ignores(`${rel}/`)) continue;
        await walk(absPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (ig.ignores(rel)) continue;
      out.push(rel);
    }
  }

  await walk(workspace);
  return uniqueSorted(out);
}

export async function listIndexableFiles(workspace: string, stateRoot?: string): Promise<string[]> {
  const stateRootRel = relativeStateRoot(workspace, stateRoot);
  const trackedAndUntracked = runGit(workspace, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  if (trackedAndUntracked !== null) {
    const values = trackedAndUntracked
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !shouldSkip(line, stateRootRel));
    return uniqueSorted(values);
  }
  return listFilesFallbackWithGitignore(workspace, stateRoot);
}
