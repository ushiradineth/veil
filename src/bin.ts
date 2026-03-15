import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "./cli";

async function main(argv: string[] = process.argv): Promise<void> {
  await runCli(argv);
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
};

const isMain = isMainModule(import.meta.url);

if (isMain) {
  void runMain();
}
