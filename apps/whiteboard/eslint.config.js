import storybook from "eslint-plugin-storybook";

import { nextJsConfig } from "@repo/eslint-config/next-js";

// Bounded contexts under `src/` (ADR-0009, ADR-0030). A context refers to
// another context by ID only, so it never imports another context's folder.
// Layer folders are flat, so `../../` from a context file leaves the context.
const BOUNDED_CONTEXTS = ["training-institute"];

const contextBoundaries = BOUNDED_CONTEXTS.map((context) => ({
  files: [`src/${context}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: `^@/src/(?!${context}/)`,
            message: `The ${context} context may import only its own folder. Refer to other contexts by ID.`,
          },
          {
            regex: "^\\.\\./\\.\\./",
            message: `The ${context} context may import only its own folder. Refer to other contexts by ID.`,
          },
        ],
      },
    ],
  },
}));

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs", "*.cjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...contextBoundaries,
  ...storybook.configs["flat/recommended"],
  {
    ignores: ["storybook-static/**"],
  },
];
