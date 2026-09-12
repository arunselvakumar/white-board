import { fn } from "storybook/test";

import type {
  CreateWorkspaceFn,
  CreateWorkspaceResult,
} from "@/components/onboarding/create-workspace-form";
import type { InstitutionType } from "@/lib/institution-type";

type CreateWorkspaceInput = {
  name: string;
  institutionType: InstitutionType;
  institutionTypeOther?: string;
};

const succeed = (_input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> =>
  Promise.resolve({ ok: true, id: "org_new" });

export const createWorkspace = fn<CreateWorkspaceFn>(succeed).mockName(
  "createWorkspace",
);

export function resetCreateWorkspaceMock(): void {
  createWorkspace.mockReset();
  createWorkspace.mockName("createWorkspace");
  createWorkspace.mockImplementation(succeed);
}
