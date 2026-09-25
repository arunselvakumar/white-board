import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requireTeacherSession } from "@/app/api/_lib/require-teacher-session";
import { createTeacherHandlers } from "@/src/training/infrastructure/create-teacher-handlers";

const handlers = createTeacherHandlers();

export async function POST(): Promise<Response> {
  try {
    const session = await requireTeacherSession();
    if (isResponse(session)) return session;
    const clerk = await clerkClient();
    let offset = 0;
    let pageSize = 100;
    let membershipTeacherId: unknown;
    while (pageSize === 100) {
      const memberships = await clerk.users.getOrganizationMembershipList({ userId: session.userId, limit: 100, offset });
      const membership = memberships.data.find((item) => item.organization.id === session.orgId && item.role === "org:teacher");
      if (membership != null) {
        membershipTeacherId = membership.publicMetadata["teacherId"];
        break;
      }
      pageSize = memberships.data.length;
      offset += pageSize;
    }
    const teacherId = z.uuid().safeParse(membershipTeacherId);
    if (!teacherId.success) return jsonError(403, "TEACHER_LINK_REQUIRED", "This Teacher invitation is not linked to a Teacher profile.");
    const teacher = await handlers.activate({ id: teacherId.data, workspaceId: session.orgId, clerkUserId: session.userId });
    return Response.json({ teacherId: teacher.id });
  } catch (error) { return mapError(error); }
}
