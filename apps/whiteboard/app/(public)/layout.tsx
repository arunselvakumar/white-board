import type { ReactNode } from "react";

import { PublicShell } from "@/components/auth/public-shell";

export default function PublicLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <PublicShell>{children}</PublicShell>;
}
