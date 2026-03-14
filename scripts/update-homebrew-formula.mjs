/**
 * Update the Homebrew formula in the tap repository for a new veil release.
 *
 * Required environment variables:
 *   HOMEBREW_TAP_GITHUB_TOKEN  - PAT with repo write access to the tap repository
 *   TAG                        - Release tag, e.g. v0.2.0
 *   VERSION                    - Release version without prefix, e.g. 0.2.0
 *
 * Optional environment variables:
 *   HOMEBREW_TAP_REPO          - owner/repo of the tap (default: ushiradineth/homebrew)
 *   HOMEBREW_FORMULA_PATH      - path to formula file in tap repo (default: Formula/veil.rb)
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

const TAP_REPO = process.env.HOMEBREW_TAP_REPO ?? "ushiradineth/homebrew";
const FORMULA_PATH = process.env.HOMEBREW_FORMULA_PATH ?? "Formula/veil.rb";
const TOKEN = process.env.HOMEBREW_TAP_GITHUB_TOKEN;
const TAG = process.env.TAG;
const VERSION = process.env.VERSION;

if (!TOKEN) {
  console.error("HOMEBREW_TAP_GITHUB_TOKEN is required");
  process.exit(1);
}
if (!TAG || !VERSION) {
  console.error("TAG and VERSION are required");
  process.exit(1);
}

const TARBALL_URL = `https://registry.npmjs.org/@ushiradineth/veil/-/veil-${VERSION}.tgz`;
const GITHUB_API = "https://api.github.com";

async function fetchJson(url, options = {}) {
  const res = await globalThis.fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} for ${url}: ${body}`);
  }
  return res.json();
}

async function computeSha256(url) {
  const res = await globalThis.fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch tarball ${url}: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return createHash("sha256").update(Buffer.from(buf)).digest("hex");
}

function buildFormula(version, tarballUrl, sha256) {
  return `# This file is managed by veil release automation. DO NOT EDIT.
class Veil < Formula
  desc "Fast CLI and skill for local code retrieval and agent context workflows"
  homepage "https://github.com/ushiradineth/veil"
  url "${tarballUrl}"
  sha256 "${sha256}"
  version "${version}"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", "-g", "--prefix", prefix, "."
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/veil 2>&1", 1)
  end
end
`;
}

async function run() {
  console.log(`Updating Homebrew formula for ${TAG} in ${TAP_REPO}/${FORMULA_PATH}`);

  console.log(`Computing sha256 for ${TARBALL_URL}`);
  const sha256 = await computeSha256(TARBALL_URL);
  console.log(`sha256: ${sha256}`);

  const formula = buildFormula(VERSION, TARBALL_URL, sha256);

  // Get current file SHA for update
  let fileSha = null;
  try {
    const existing = await fetchJson(`${GITHUB_API}/repos/${TAP_REPO}/contents/${FORMULA_PATH}`);
    fileSha = existing.sha;
    console.log(`Existing formula SHA: ${fileSha}`);
  } catch {
    console.log("Formula file not found in tap, will create it");
  }

  const body = {
    message: `chore: update veil formula to ${TAG}`,
    content: Buffer.from(formula).toString("base64"),
    committer: {
      name: "github-actions[bot]",
      email: "41898282+github-actions[bot]@users.noreply.github.com",
    },
  };
  if (fileSha) {
    body.sha = fileSha;
  }

  await fetchJson(`${GITHUB_API}/repos/${TAP_REPO}/contents/${FORMULA_PATH}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  console.log(`Homebrew formula updated to ${TAG} in ${TAP_REPO}`);
}

run().catch((err) => {
  console.error("Homebrew formula update failed:", err.message);
  process.exit(1);
});
