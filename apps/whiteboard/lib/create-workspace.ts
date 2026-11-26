"use server";

import { WorkspaceAccessError, getAuth, workspaces } from "@repo/auth/server";
import { z } from "zod";

import { AVAILABLE_INSTITUTION_TYPE_VALUES } from "@/lib/institution-type";
import { createSetUpPreschool } from "@/src/preschool/infrastructure/prisma-setup-store";

const CreateWorkspaceInput = z.object({
  name: z.string().trim().min(1).max(100),
  institutionType: z.enum(AVAILABLE_INSTITUTION_TYPE_VALUES),
  /** Preschool only: 1–12, the month its Academic Year starts. Defaults to April. */
  academicYearStartMonth: z.number().int().min(1).max(12).optional(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInput>;

const PRESCHOOL_SETUP_FAILED =
  "Your workspace was created, but setting up the Preschool did not finish. Reload the page to open it and finish setting up.";

export type CreateWorkspaceResult =
  { ok: true; id: string } | { ok: false; message: string };

/**
 * Workspace Creation. The signed-in User becomes the Workspace Owner. A
 * Preschool is then set up (ADR-0055); when that fails the Workspace still
 * exists, and the Preschool shell runs the setup again when it is opened.
 */
export async function createWorkspace(
  raw: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const { userId } = await getAuth();
  if (userId == null) {
    return { ok: false, message: "Authentication required." };
  }

  const parsed = CreateWorkspaceInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the workspace name and institution type.",
    };
  }

  try {
    const workspace = await workspaces.create({
      name: parsed.data.name,
      institutionType: parsed.data.institutionType,
      ownerUserId: userId,
    });
    if (parsed.data.institutionType === "preschool") {
      try {
        await createSetUpPreschool().execute({
          workspaceId: workspace.id,
          name: parsed.data.name,
          academicYearStartMonth: parsed.data.academicYearStartMonth,
        });
      } catch (error) {
        console.error("Preschool setup failed", error);
        return { ok: false, message: PRESCHOOL_SETUP_FAILED };
      }
    }
    return { ok: true, id: workspace.id };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return { ok: false, message: error.message };
    }
    console.error("Workspace Creation failed", error);
    return {
      ok: false,
      message: "Could not create your workspace. Please try again.",
    };
  }
}
