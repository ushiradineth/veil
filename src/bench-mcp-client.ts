import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type McpCallResult = {
  status: "ok" | "unsupported" | "error";
  text: string;
  reason?: string;
};

type StdioParams = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

function resolvedEnv(overrides?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      env[key] = value;
    }
  }
  return env;
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as {
    content?: { type?: string; text?: string }[];
    structuredContent?: unknown;
    toolResult?: unknown;
  };
  if (Array.isArray(value.content)) {
    const parts = value.content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text ?? "");
    if (parts.length > 0) {
      return parts.join("\n").trim();
    }
  }
  if (value.structuredContent !== undefined) {
    try {
      return JSON.stringify(value.structuredContent);
    } catch {
      return "";
    }
  }
  if (value.toolResult !== undefined) {
    try {
      return JSON.stringify(value.toolResult);
    } catch {
      return "";
    }
  }
  return "";
}

export async function callMcpToolOverStdio(
  server: StdioParams,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<McpCallResult> {
  const client = new Client({ name: "veil-bench", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    env: resolvedEnv(server.env),
    stderr: "pipe",
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const runPromise = (async (): Promise<McpCallResult> => {
      await client.connect(transport);
      const result = await client.callTool({ name: toolName, arguments: args });
      const text = extractText(result);
      if (result.isError === true) {
        return {
          status: "error",
          text,
          reason: "tool " + toolName + " returned MCP error",
        };
      }
      return {
        status: "ok",
        text,
      };
    })().catch((error: unknown) => ({
      status: "error" as const,
      text: "",
      reason: error instanceof Error ? error.message : String(error),
    }));

    const timeoutPromise = new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => {
        resolve({ kind: "timeout" });
      }, timeoutMs);
    });

    const race = await Promise.race([
      runPromise.then((result) => ({ kind: "run" as const, result })),
      timeoutPromise,
    ]);

    if (race.kind === "timeout") {
      return {
        status: "unsupported",
        text: "",
        reason: "ETIMEDOUT after " + String(timeoutMs) + "ms",
      };
    }

    return race.result;
  } catch (error) {
    return {
      status: "error",
      text: "",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    try {
      await client.close();
    } catch {
      // ignore shutdown races
    }
    try {
      await transport.close();
    } catch {
      // ignore shutdown races
    }
  }
}
