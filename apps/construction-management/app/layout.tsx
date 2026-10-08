import { getCompanyAuthSnapshot } from "@repo/auth/construction/server";
import { CompanyAuthProvider } from "@repo/auth/construction/react";
import type { Metadata } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { TooltipProvider } from "@repo/ui/components/tooltip";

import "./globals.css";
import { QueryProvider } from "@/components/query-provider";

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

export const metadata: Metadata = {
  title: {
    default: "Construction Management",
    template: "%s · Construction Management",
  },
  description: "Projects, site work, materials, labour and money for builders",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const snapshot = await getCompanyAuthSnapshot();
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
    >
      <body className="bg-background text-foreground">
        <CompanyAuthProvider snapshot={snapshot}>
          <ThemeProvider
            defaultTheme="light"
            enableSystem={false}
            storageKey="construction-theme"
          >
            <TooltipProvider>
              <QueryProvider>{children}</QueryProvider>
            </TooltipProvider>
          </ThemeProvider>
        </CompanyAuthProvider>
      </body>
    </html>
  );
}
