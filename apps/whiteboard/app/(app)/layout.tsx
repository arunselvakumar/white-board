import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { AuthHeader } from "@/components/auth-header";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await auth.protect();

  return (
    <div className="flex min-h-svh flex-col">
      <AuthHeader />
      {children}
    </div>
  );
}
