import type { Preview } from "@storybook/nextjs-vite";
import { Geist_Mono, Urbanist } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import "@repo/ui/globals.css";
import { QueryProvider } from "../components/query-provider";
import { ThemePreferenceSync } from "../components/theme-preference-sync";
import { resetClerkMocks } from "./mocks/clerk";
import { resetCreateWorkspaceMock } from "./mocks/create-workspace";

const fontSans = Urbanist({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

function PreviewShell({
  children,
  theme,
  dynamicTheme,
}: {
  children: ReactNode;
  theme: string;
  dynamicTheme: boolean;
}) {
  return (
    <ThemeProvider
      forcedTheme={dynamicTheme ? undefined : theme}
      defaultTheme="light"
      enableSystem={false}
      storageKey="whiteboard-theme-dom"
    >
      {dynamicTheme && <ThemePreferenceSync />}
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
      test: "todo",
    },
  },
  decorators: [
    (Story, context) => (
      <PreviewShell
        theme={String(context.globals["theme"] ?? "light")}
        dynamicTheme={context.parameters["dynamicTheme"] === true}
      >
        <Story />
      </PreviewShell>
    ),
  ],
  beforeEach() {
    resetClerkMocks();
    resetCreateWorkspaceMock();
  },
};

export default preview;
