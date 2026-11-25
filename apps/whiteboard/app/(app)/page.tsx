import { getAuth, workspaces } from "@repo/auth/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";

import { OwnerDashboardScreen } from "@/app/(app)/_components/dashboard/owner-dashboard-screen";
import { verifiedEmailsOf } from "@/app/api/_lib/require-workspace-session";
import { preschoolHomeFor } from "@/lib/workspace-access";
import { PrismaAccessReader } from "@/src/preschool/infrastructure/prisma-access-reader";

export async function generateMetadata(): Promise<Metadata> {
  const { role } = await getAuth();
  return {
    title:
      role === "student"
        ? "Student Home"
        : role === "parent"
          ? "Parent Home"
          : role === "teacher"
            ? "My Batches"
            : "Owner Dashboard",
  };
}

/**
 * A Preschool's In-app Home is the Home of the User's Preschool role
 * (ADR-0055). A `teacher` member is a Centre Head or a Teacher by their Staff
 * record; anyone the Preschool does not know goes to `/preschool`, which
 * says why there is nothing to show.
 */
async function preschoolHome(
  state: Awaited<ReturnType<typeof getAuth>>,
): Promise<string> {
  if (!state.isAuthenticated || state.workspaceId == null || state.role == null)
    return "/preschool";
  if (state.role === "owner") return preschoolHomeFor("owner");
  if (state.role === "parent") return preschoolHomeFor("parent");
  const access = await new PrismaAccessReader().resolve({
    workspaceId: state.workspaceId,
    userId: state.userId,
    userName: state.user.name,
    memberRole: state.role,
    verifiedEmails: verifiedEmailsOf(state.user),
  });
  return access.kind === "actor"
    ? preschoolHomeFor(access.actor.role)
    : "/preschool";
}

export default async function HomePage() {
  const state = await getAuth();
  const { workspaceId, role } = state;
  if (workspaceId == null) return null;
  if ((await workspaces.institutionType(workspaceId)) === "preschool")
    redirect(await preschoolHome(state));
  if (role === "student") redirect("/student");
  if (role === "parent") redirect("/parent");
  if (role === "teacher") redirect("/teacher");
  if (role !== "owner") notFound();
  return <OwnerDashboardScreen />;
}
