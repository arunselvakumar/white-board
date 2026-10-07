import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import { SelectWorkspaceForm } from "@/components/onboarding/select-workspace-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import {
  authFailure,
  authMocks,
  storyUser,
  type WorkspaceSummary,
} from "../../.storybook/mocks/auth";

function workspace(
  id: string,
  name: string,
  role: WorkspaceSummary["role"] = "owner",
): WorkspaceSummary {
  return { id, name, role, institutionType: "training_institute" };
}

const riverside = workspace("org_riverside", "Riverside School");
const workspaces = [
  riverside,
  workspace("org_harbor", "Harbor Academy", "teacher"),
  workspace("org_north", "North Campus", "parent"),
];

const meta = {
  title: "Onboarding/SelectWorkspaceForm",
  component: SelectWorkspaceForm,
  decorators: [withAuthFormFrame],
  args: {
    redirectUrl: "/",
  },
  beforeEach() {
    authMocks.userId = storyUser.id;
    authMocks.user = storyUser;
    authMocks.workspaces = workspaces;
  },
} satisfies Meta<typeof SelectWorkspaceForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Select a workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Riverside School/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: /North Campus/ }),
    ).toBeVisible();
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const SelectsWorkspace: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    );
    await expect(authMocks.setActive).toHaveBeenCalledWith("org_harbor", "/");
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /Riverside School/ }),
      ).toBeDisabled(),
    );
  },
};

export const SelectsWorkspaceWithRedirect: Story = {
  args: { redirectUrl: "/students?tab=active" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /North Campus/ }));
    await expect(authMocks.setActive).toHaveBeenCalledWith(
      "org_north",
      "/students?tab=active",
    );
  },
};

export const SelectFailure: Story = {
  beforeEach() {
    authMocks.setActive.mockImplementation(() => authFailure("FORBIDDEN", 403));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not switch to that workspace. Please try again.",
    );
    await expect(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    ).toBeEnabled();
  },
};

export const AutoActivatesSoleWorkspace: Story = {
  beforeEach() {
    authMocks.workspaces = [riverside];
  },
  args: { redirectUrl: "/fees" },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Select a workspace" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(authMocks.setActive).toHaveBeenCalledWith(
        "org_riverside",
        "/fees",
      ),
    );
    await expect(authMocks.setActive).toHaveBeenCalledTimes(1);
  },
};

export const AutoActivateFailure: Story = {
  beforeEach() {
    authMocks.workspaces = [riverside];
    authMocks.setActive.mockImplementation(() => authFailure("FORBIDDEN", 403));
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not switch to that workspace. Please try again.",
    );
    await expect(
      canvas.getByRole("button", { name: /Riverside School/ }),
    ).toBeVisible();
  },
};

export const SoleWorkspaceAlreadyActive: Story = {
  beforeEach() {
    authMocks.workspaces = [riverside];
    authMocks.workspaceId = riverside.id;
    authMocks.role = riverside.role;
  },
  args: { redirectUrl: "/batches" },
  play: async () => {
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith("/batches"),
    );
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const NoWorkspaces: Story = {
  beforeEach() {
    authMocks.workspaces = [];
  },
  args: { redirectUrl: "/batches" },
  play: async () => {
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith(
        "/create-workspace?redirect_url=%2Fbatches",
      ),
    );
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};
