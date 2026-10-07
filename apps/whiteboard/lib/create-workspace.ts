"use server";

import { WorkspaceAccessError, getAuth, workspaces } from "@repo/auth/server";
import { z } from "zod";

import { AVAILABLE_INSTITUTION_TYPE_VALUES } from "@/lib/institution-type";

const CreateWorkspaceInput = z.object({
  name: z.string().trim().min(1).max(100),
  institutionType: z.enum(AVAILABLE_INSTITUTION_TYPE_VALUES),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInput>;

export type CreateWorkspaceResult =
  { ok: true; id: string } | { ok: false; message: string };

/** Workspace Creation. The signed-in User becomes the Workspace Owner. */
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
