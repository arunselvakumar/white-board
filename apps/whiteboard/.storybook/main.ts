import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";

const configDir = path.dirname(fileURLToPath(import.meta.url));

function getAbsolutePath(value: string): string {
  return path.dirname(
    fileURLToPath(import.meta.resolve(`${value}/package.json`)),
  );
}

const config: StorybookConfig = {
  stories: [
    "../components/**/*.stories.@(ts|tsx)",
    "../app/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    getAbsolutePath("@storybook/addon-vitest"),
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
  ],
  framework: getAbsolutePath("@storybook/nextjs-vite"),
  staticDirs: ["../public"],
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(viteConfig, {
      resolve: {
        alias: {
          "@clerk/nextjs": path.resolve(configDir, "mocks/clerk.tsx"),
        },
      },
    });
  },
};

export default config;
