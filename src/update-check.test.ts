import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "bun:test";

import { __internalServer } from "./server";
import { TOOL_DESCRIPTIONS } from "./tool-contract";
import {
  __internalVersion,
  buildUpdateCheck,
  evaluateSkillUpdate,
  VEIL_SKILL_VERSION,
} from "./version";

function toolText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const record = payload as { content?: unknown };
  if (!Array.isArray(record.content)) return "";
  for (const item of record.content) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const text = (item as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

async function withMcpClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const hasNix = spawnSync("nix", ["--version"], { encoding: "utf-8" }).status === 0;
  const client = new Client({ name: "veil-update-test", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: hasNix ? "nix" : "bun",
    args: hasNix
      ? ["run", "nixpkgs#bun", "--", "run", "src/bin.ts", "mcp", "server"]
      : ["run", "src/bin.ts", "mcp", "server"],
    cwd: join(import.meta.dir, ".."),
    stderr: "pipe",
  });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await transport.close();
  }
}

afterEach(() => {
  __internalVersion.resetUpdateCache();
  __internalVersion.setFetchImplForTests();
  __internalVersion.setSkillVersionForTests();
});

describe("Update check contracts", () => {
  test("tool description remains intent-first", () => {
    expect(TOOL_DESCRIPTIONS.veil_update_check.startsWith("Use when you need")).toBe(true);
  });

  test("semver compare returns stable ordering", () => {
    expect(__internalVersion.compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(__internalVersion.compareSemver("1.0.0", "1.0.1")).toBe(-1);
    expect(__internalVersion.compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(__internalVersion.compareSemver("invalid", "1.0.0")).toBeNull();
  });

  test("skill version parser reads frontmatter version", () => {
    const raw = "---\nname: veil\nversion: 2.4.1\ndescription: test\n---\n";
    expect(__internalVersion.parseSkillVersionFromFrontmatter(raw)).toBe("2.4.1");
  });

  test("update check uses cache when refreshed data exists", async () => {
    let calls = 0;
    __internalVersion.setFetchImplForTests(async () => {
      calls += 1;
      return new Response(JSON.stringify({ version: "9.9.9" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const first = await buildUpdateCheck({ force_refresh: true });
    expect(first.mcp.latest).toBe("9.9.9");
    expect(first.mcp.source).toBe("network");

    __internalVersion.setFetchImplForTests(async () => {
      throw new Error("offline");
    });

    const second = await buildUpdateCheck();
    expect(second.mcp.source).toBe("cache");
    expect(second.mcp.latest).toBe("9.9.9");
    expect(calls).toBe(1);
  });

  test("network-disabled check does not poison network cache", async () => {
    await buildUpdateCheck({ allow_network: false });

    let calls = 0;
    __internalVersion.setFetchImplForTests(async () => {
      calls += 1;
      return new Response(JSON.stringify({ version: "9.9.8" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await buildUpdateCheck();
    expect(result.mcp.source).toBe("network");
    expect(result.mcp.latest).toBe("9.9.8");
    expect(calls).toBe(1);
  });

  test("skill comparison reports unknown without reported version", () => {
    const result = evaluateSkillUpdate(undefined);
    expect(result.outdated).toBeNull();
    expect(result.reason).toBe("reported-version-missing");
  });

  test("skill comparison flags older reported version as outdated", () => {
    const expected = VEIL_SKILL_VERSION ?? "2.2.0";
    __internalVersion.setSkillVersionForTests(expected);
    const result = evaluateSkillUpdate("0.0.1");
    expect(result.outdated).toBe(true);
    expect(result.reason).toBeNull();
  });
});

describe("Update check MCP integration", () => {
  test("tool surface includes veil_update_check", () => {
    const names = new Set(__internalServer.toolNames);
    expect(names.has("veil_update_check")).toBe(true);
  });

  test("status tool includes updates block", async () => {
    const statusTool = __internalServer.toolDefinitions.find(
      (entry) => entry.name === "veil_status",
    );
    expect(statusTool).toBeDefined();
    const result = (await statusTool?.handler({ workspace: "." })) as {
      updates?: { mcp?: unknown; skill?: unknown };
    };
    expect(result.updates?.mcp).toBeDefined();
    expect(result.updates?.skill).toBeDefined();
  });

  test("status tool propagates reported skill version", async () => {
    const expected = VEIL_SKILL_VERSION ?? "2.2.2";
    __internalVersion.setSkillVersionForTests(expected);
    const statusTool = __internalServer.toolDefinitions.find(
      (entry) => entry.name === "veil_status",
    );
    expect(statusTool).toBeDefined();
    const result = (await statusTool?.handler({
      workspace: ".",
      reported_skill_version: "0.0.1",
    })) as {
      updates?: {
        skill?: { reported?: string | null; outdated?: boolean | null; reason?: string | null };
      };
    };
    expect(result.updates?.skill?.reported).toBe("0.0.1");
    expect(result.updates?.skill?.outdated).toBe(true);
    expect(result.updates?.skill?.reason).toBeNull();
  });

  test("discover tool includes updates block and reported skill drift", async () => {
    const expected = VEIL_SKILL_VERSION ?? "2.2.2";
    __internalVersion.setSkillVersionForTests(expected);
    const workspace = join(import.meta.dir, "..");
    const discoverTool = __internalServer.toolDefinitions.find(
      (entry) => entry.name === "veil_discover",
    );
    expect(discoverTool).toBeDefined();
    const result = (await discoverTool?.handler({
      workspace,
      query: "server",
      reported_skill_version: "0.0.1",
    })) as {
      updates?: {
        mcp?: unknown;
        skill?: { reported?: string | null; outdated?: boolean | null; reason?: string | null };
      };
    };
    expect(result.updates?.mcp).toBeDefined();
    expect(result.updates?.skill?.reported).toBe("0.0.1");
    expect(result.updates?.skill?.outdated).toBe(true);
    expect(result.updates?.skill?.reason).toBeNull();
  });

  test("update-check tool returns structured payload", async () => {
    const updateTool = __internalServer.toolDefinitions.find(
      (entry) => entry.name === "veil_update_check",
    );
    expect(updateTool).toBeDefined();
    const result = (await updateTool?.handler({
      force_refresh: true,
      timeout_ms: 1,
      reported_skill_version: "0.0.1",
    })) as {
      mcp?: { source?: string };
      skill?: { outdated?: boolean | null };
    };
    expect(result.mcp?.source).toBeDefined();
    expect(result.skill?.outdated).toBe(true);
  });

  test("mcp tools/list and tools/call expose update-check", async () => {
    await withMcpClient(async (client) => {
      const list = await client.listTools();
      const names = new Set(list.tools.map((tool) => tool.name));
      expect(names.has("veil_update_check")).toBe(true);

      const result = await client.callTool({
        name: "veil_update_check",
        arguments: {
          force_refresh: true,
          timeout_ms: 1,
          reported_skill_version: "0.0.1",
        },
      });
      expect(result.isError).toBe(false);
      const text = toolText(result);
      expect(text.includes("mcp:")).toBe(true);
      expect(text.includes("skill:")).toBe(true);
    });
  });
});
