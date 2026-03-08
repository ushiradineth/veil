import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "benchmarks/results/**",
      "node_modules/**",
      ".veil/**",
      ".agents/**",
      "test/fixtures/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        Bun: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      curly: "error",
      eqeqeq: ["error", "always"],
      "import/newline-after-import": ["error", { count: 1 }],
      "import/no-duplicates": "error",
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          "newlines-between": "always",
        },
      ],
      "no-var": "error",
      "object-shorthand": ["error", "always"],
      "prefer-const": "error",
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false, fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "import/newline-after-import": ["error", { count: 1 }],
      "import/no-duplicates": "error",
      "import/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          "newlines-between": "always",
        },
      ],
    },
  },
  eslintConfigPrettier,
);
