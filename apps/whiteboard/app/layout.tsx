import { getAuthSnapshot } from "@repo/auth/server";
import { AuthProvider } from "@repo/auth/react";
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SatoshiStylesheet } from "@repo/ui/components/satoshi-stylesheet";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import "@repo/ui/globals.css";
import { QueryProvider } from "@/components/query-provider";
import { ThemePreferenceSync } from "@/components/theme-preference-sync";

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
      className={`typeface-satoshi ${fontMono.variable} font-sans antialiased`}
    >
      <body>
        <SatoshiStylesheet />
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
