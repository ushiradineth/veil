import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startHttpServer, startServer } from "./server";

async function main(argv: string[] = process.argv): Promise<void> {
  if (shouldStartHttp(argv)) {
    await startHttpServer();
    return;
  }
  await startServer();
}

function shouldStartHttp(argv: string[]): boolean {
  if (process.env.VEIL_HTTP === "1") return true;
  return argv.includes("--http");
}

async function runMain(runner: () => Promise<void> = () => main()): Promise<void> {
  try {
    await runner();
  } catch (error: unknown) {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}

function isMainModule(metaUrl: string): boolean {
  const meta = import.meta as unknown as Record<string, unknown>;
  if (typeof meta.main === "boolean") {
    return meta.main;
  }

  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }

  return resolve(argv1) === resolve(fileURLToPath(metaUrl));
}

export const __internalBin = {
  main,
  runMain,
  isMainModule,
  shouldStartHttp,
};

const isMain = isMainModule(import.meta.url);

if (isMain) {
  void runMain();
}
