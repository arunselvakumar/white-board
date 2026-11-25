import type { ReactNode } from "react";

import { ActiveCentreProvider } from "./_components/active-centre-provider";

/**
 * Every Preschool screen (ADR-0055): who the User is in this Preschool, the
 * active Centre, and the role check for the path.
 */
export default function PreschoolLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <ActiveCentreProvider>{children}</ActiveCentreProvider>;
}
