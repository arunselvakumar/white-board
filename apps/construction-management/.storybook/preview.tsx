import type { Preview } from "@storybook/nextjs-vite";
import { Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SatoshiStylesheet } from "@repo/ui/components/satoshi-stylesheet";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { TooltipProvider } from "@repo/ui/components/tooltip";
import { sb } from "storybook/test";

import "@repo/ui/globals.css";
import { QueryProvider } from "../components/query-provider";
import { getQueryClient } from "../src/queries/query-client";
import { resetAuthMocks } from "./mocks/auth";

// Spies that keep the real code; a story may stand in its own (the Project
// form's held-files story picks files without the real attachments UI).
sb.mock("../components/projects/documents/document-attachments.tsx", {
  spy: true,
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
});

function PreviewShell({
  children,
  theme,
}: {
  children: ReactNode;
  theme: string;
}) {
  return (
    <ThemeProvider
      forcedTheme={theme}
      defaultTheme="light"
      enableSystem={false}
      storageKey="construction-theme-storybook"
    >
      <TooltipProvider>
        <QueryProvider>
          <div
            className={`typeface-satoshi ${fontMono.variable} bg-background text-foreground font-sans antialiased`}
          >
            <SatoshiStylesheet />
            {children}
          </div>
        </QueryProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Color theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
    a11y: {
      test: "error",
      config: {
        rules: [
          {
            // Base UI's focus-guard spans are aria-hidden and focusable by
            // design (they trap focus in menus and dialogs); axe cannot
            // exclude them by selector, so this one rule is off.
            id: "aria-hidden-focus",
            enabled: false,
          },
          {
            // Contrast is a property of the shared palette (root ADR-0002):
            // muted, destructive and primary text sit just under 4.5:1 in
            // places. Fix it in @repo/ui for both apps, then turn this on.
            id: "color-contrast",
            enabled: false,
          },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => (
      <PreviewShell theme={String(context.globals["theme"] ?? "light")}>
        <Story />
      </PreviewShell>
    ),
  ],
  beforeEach() {
    resetAuthMocks();
    // One browser query client serves every story; start each one empty.
    getQueryClient().clear();
  },
};

export default preview;
