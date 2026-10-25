import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/components/theme-provider";

import "./marketing.css";

// Urbanist is self-hosted (the upstream variable font, OFL). Google Fonts sometimes
// answers with extensionless /l/font?kit= URLs for Urbanist, and next build then
// fails (vercel/next.js#99114).
const fontSans = localFont({
  src: "./fonts/Urbanist-wght.woff2",
  weight: "300 600",
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Whiteboard — the register, on a screen",
  description:
    "Whiteboard runs a Training Institute without a paper register: Students, Courses, Batches, fees, and receipts in one Workspace.",
  icons: { icon: "/whiteboard-logo.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f6f7fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
    >
      <body className="bg-background text-foreground">
        <ThemeProvider
          defaultTheme="light"
          enableSystem={false}
          storageKey="whiteboard-marketing-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
