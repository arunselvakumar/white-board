import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import "@clerk/ui/themes/shadcn.css";
import "@repo/ui/globals.css";
import { QueryProvider } from "@/components/query-provider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
    >
      <body>
        <ClerkProvider
          appearance={{ theme: shadcn }}
          signInUrl="/login"
          signUpUrl="/signup"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <ThemeProvider>
            <TooltipProvider>
              <QueryProvider>{children}</QueryProvider>
            </TooltipProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
