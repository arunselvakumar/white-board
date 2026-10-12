import { connection } from "next/server";
import type { ReactNode } from "react";

import { pickAuthPhoto } from "@/components/auth/auth-photos";
import { PublicShell } from "@/components/auth/public-shell";

export default async function PublicLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // A different photo per visit, so never prerender one.
  await connection();
  return <PublicShell photo={pickAuthPhoto()}>{children}</PublicShell>;
}
