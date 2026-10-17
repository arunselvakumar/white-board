import type { ReactNode } from "react";

/** The Bookings module of a Project (M10). Its tabs are in the sidebar (ADR CM-0020). */
export default function BookingsLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      {children}
    </div>
  );
}
