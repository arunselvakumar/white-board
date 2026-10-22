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
  "contracts",
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

// Loading states mimic the page they stand in for (root ADR-0047): a bare
// Skeleton bar is drawn only in an area's `*-skeletons.tsx` file, so a new
// generic box has to become a named skeleton there.
const skeletonGuard = {
  files: ["app/**/*.tsx", "components/**/*.tsx"],
  ignores: [
    "**/*-skeleton.tsx",
    "**/*-skeletons.tsx",
    "**/*.stories.tsx",
    "**/*.test.tsx",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: AUTH_VENDOR_PATTERNS,
        paths: [
          {
            name: "@repo/ui/components/skeleton",
            message:
              "Draw skeleton bars in this area's *-skeletons.tsx, shaped like the loaded page, or use @repo/ui/components/skeleton-kit (ADR-0047).",
          },
        ],
      },
    ],
  },
};

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

// Under `next dev --webpack` a Prisma error can come from another copy of
// the generated client, so `instanceof` is false and a conflict became a 500
// (#98). Match Prisma errors by name and code with the shared helper.
const prismaErrorGuard = {
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "BinaryExpression[operator='instanceof'][right.object.name='Prisma'][right.property.name=/^PrismaClient.*Error$/]",
        message:
          "Use isPrismaError / isUniqueViolation from @/src/shared-kernel/prisma-errors; instanceof fails across copies of the Prisma client (#98).",
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
  skeletonGuard,
  prismaErrorGuard,
  ...storybook.configs["flat/recommended"],
  {
    // public/ holds static files served as-is (sw.js is plain browser JS).
    ignores: ["storybook-static/**", ".next-verify/**", "public/**"],
  },
];
