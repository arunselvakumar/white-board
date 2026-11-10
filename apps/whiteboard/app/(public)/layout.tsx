import type { ReactNode } from "react";

import { PublicShell } from "@/app/(public)/_components/public-shell";

export default function PublicLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <PublicShell>{children}</PublicShell>;
}
