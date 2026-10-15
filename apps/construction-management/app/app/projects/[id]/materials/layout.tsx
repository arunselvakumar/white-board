import type { ReactNode } from "react";

/** The Materials module of a Project (M5). Its tabs are in the sidebar (ADR CM-0020). */
export default function MaterialsLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">{children}</div>
  );
}
