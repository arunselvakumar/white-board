import type { Preview } from "@storybook/nextjs-vite";
import { Geist_Mono, Urbanist } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import "@repo/ui/globals.css";
import { QueryProvider } from "../components/query-provider";
import { resetAuthMocks } from "./mocks/auth";

const fontSans = Urbanist({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-sans",
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
            className={`${fontSans.variable} ${fontMono.variable} bg-background text-foreground font-sans antialiased`}
          >
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
  },
};

export default preview;
