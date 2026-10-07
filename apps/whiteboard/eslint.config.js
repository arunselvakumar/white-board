import storybook from "eslint-plugin-storybook";

import { nextJsConfig } from "@repo/eslint-config/next-js";

// Bounded contexts under `src/` (ADR-0009, ADR-0030). A context refers to
// another context by ID only, so it never imports another context's folder.
// Layer folders are flat, so `../../` from a context file leaves the context.
const BOUNDED_CONTEXTS = ["training-institute"];

// The auth vendor stays behind @repo/auth (ADR-0034).
const AUTH_VENDOR_PATTERNS = [
  {
    regex: "^better-auth(?:/|$)",
    message: "Import auth from @repo/auth (server, react, roles, testing).",
  },
  {
    regex: "^@clerk/",
    message: "Clerk was replaced by @repo/auth (ADR-0034).",
  },
];

const contextBoundaries = BOUNDED_CONTEXTS.map((context) => ({
  files: [`src/${context}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...AUTH_VENDOR_PATTERNS,
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
  {
    rules: {
      "no-restricted-imports": ["error", { patterns: AUTH_VENDOR_PATTERNS }],
    },
  },
  ...contextBoundaries,
  ...storybook.configs["flat/recommended"],
  {
    ignores: ["storybook-static/**"],
  },
];
