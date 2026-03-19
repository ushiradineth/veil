import { mkdir, readFile } from "node:fs/promises";

import { build } from "esbuild";

try {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  if (!pkg.version || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    throw new Error(`Invalid package version: ${pkg.version || "missing"}`);
  }

  await mkdir("dist", { recursive: true });

  await build({
    entryPoints: ["src/bin.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: "dist/bin.js",
    sourcemap: false,
    minify: false,
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; import { fileURLToPath as __fileURLToPath } from "node:url"; import { dirname as __pathDirname } from "node:path"; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);',
    },
  });

  console.log(`Build completed successfully for version ${pkg.version}`);
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}
