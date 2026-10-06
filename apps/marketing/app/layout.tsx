import type { Metadata, Viewport } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@repo/ui/components/theme-provider";

import "./marketing.css";

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
