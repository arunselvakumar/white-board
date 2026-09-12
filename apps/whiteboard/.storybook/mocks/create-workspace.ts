import { fn } from "storybook/test";

import type { InstitutionType } from "@/lib/institution-type";

type CreateWorkspaceInput = {
  name: string;
  institutionType: InstitutionType;
  institutionTypeOther?: string;
};

export const createWorkspace = fn((input: CreateWorkspaceInput) =>
  Promise.resolve({
    id: "org_new",
    name: input.name,
  }),
).mockName("createWorkspace");

export function resetCreateWorkspaceMock(): void {
  createWorkspace.mockReset();
  createWorkspace.mockName("createWorkspace");
  createWorkspace.mockImplementation((input: CreateWorkspaceInput) =>
    Promise.resolve({
      id: "org_new",
      name: input.name,
    }),
  );
}
