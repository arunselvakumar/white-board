"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";

import { INSTITUTION_TYPE_VALUES } from "@/lib/institution-type";

const CreateWorkspaceInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    institutionType: z.enum(INSTITUTION_TYPE_VALUES),
    institutionTypeOther: z.string().trim().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.institutionType === "other" &&
      (data.institutionTypeOther == null ||
        data.institutionTypeOther.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["institutionTypeOther"],
        message: "Describe the institution type",
      });
    }
  });

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInput>;

export type CreateWorkspaceResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

function userFacingMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray(error.errors)
  ) {
    const first = error.errors[0] as
      { longMessage?: string; message?: string } | undefined;
    const text = first?.longMessage ?? first?.message;
    if (typeof text === "string" && text.length > 0) {
      return text;
    }
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Could not create your workspace. Please try again.";
}

export async function createWorkspace(
  raw: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const { userId } = await auth();
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
    const clerk = await clerkClient();
    const organization = await clerk.organizations.createOrganization({
      name: parsed.data.name,
      createdBy: userId,
      publicMetadata: {
        institutionType: parsed.data.institutionType,
        ...(parsed.data.institutionType === "other" &&
        parsed.data.institutionTypeOther != null &&
        parsed.data.institutionTypeOther.length > 0
          ? { institutionTypeOther: parsed.data.institutionTypeOther }
          : {}),
      },
    });
    return { ok: true, id: organization.id };
  } catch (error) {
    return { ok: false, message: userFacingMessage(error) };
  }
}
