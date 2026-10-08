import storybook from "eslint-plugin-storybook";

import { nextJsConfig } from "@repo/eslint-config/next-js";

// Bounded contexts under `src/` (root ADR-0009, ADR CM-0001). A context
// refers to another context by ID only, so it never imports another
// context's folder; every context may use `src/shared-kernel`. Layer folders
// are flat, so `../../` from a context file leaves the context.
const BOUNDED_CONTEXTS = [
  "organization",
  "masters",
  "projects",
  "site-work",
  "tracking",
  "procurement",
  "finance",
  "labour",
  "sales",
  "hrms",
  "reporting",
  "messaging",
];

// The auth vendor stays behind @repo/auth (root ADR-0034).
const AUTH_VENDOR_PATTERNS = [
  {
    regex: "^better-auth(?:/|$)",
    message: "Import auth from @repo/auth/construction/*.",
  },
  {
    regex: "^@repo/auth/(?!construction/)",
    message:
      "Construction Management uses @repo/auth/construction/* (ADR CM-0002).",
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
            regex: `^@/src/(?!${context}/|shared-kernel/)`,
            message: `The ${context} context may import only its own folder and the shared kernel. Refer to other contexts by ID.`,
          },
          {
            regex: "^\\.\\./\\.\\./",
            message: `The ${context} context may import only its own folder and the shared kernel. Refer to other contexts by ID.`,
          },
        ],
      },
    ],
  },
}));

const sharedKernelBoundary = {
  files: ["src/shared-kernel/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...AUTH_VENDOR_PATTERNS,
          {
            regex: "^@/src/(?!shared-kernel/)",
            message: "The shared kernel imports no bounded context.",
          },
          {
            regex: "^\\.\\./\\.\\./",
            message: "The shared kernel imports no bounded context.",
          },
        ],
      },
    ],
  },
};

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
  sharedKernelBoundary,
  ...storybook.configs["flat/recommended"],
  {
    ignores: ["storybook-static/**", ".next-verify/**"],
  },
];
