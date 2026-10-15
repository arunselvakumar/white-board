import type { ReactNode } from "react";

/** The Payments module of a Project (M2 wages, M7 finance). Its tabs are in the sidebar (ADR CM-0020). */
export default function PaymentsLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">{children}</div>
  );
}
