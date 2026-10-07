import { getAuthSnapshot } from "@repo/auth/server";
import { AuthProvider } from "@repo/auth/react";
import type { Metadata } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import "@repo/ui/globals.css";
import { QueryProvider } from "@/components/query-provider";
import { ThemePreferenceSync } from "@/components/theme-preference-sync";

const fontSans = Urbanist({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Whiteboard",
    template: "%s · Whiteboard",
  },
  description: "The Whiteboard application",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const snapshot = await getAuthSnapshot();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
    >
      <body>
        <AuthProvider snapshot={snapshot}>
          <ThemeProvider
            defaultTheme="light"
            enableSystem={false}
            storageKey="whiteboard-theme-dom"
          >
            <ThemePreferenceSync />
            <TooltipProvider>
              <QueryProvider>{children}</QueryProvider>
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
