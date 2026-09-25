import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SelectWorkspaceForm } from "@/components/onboarding/select-workspace-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const workspaces = [
  { organization: { id: "org_riverside", name: "Riverside School" } },
  { organization: { id: "org_harbor", name: "Harbor Academy" } },
  { organization: { id: "org_north", name: "North Campus" } },
];

const meta = {
  title: "Onboarding/SelectWorkspaceForm",
  component: SelectWorkspaceForm,
  decorators: [withAuthFormFrame],
  args: {
    redirectUrl: "/",
  },
  beforeEach() {
    clerkMocks.memberships = workspaces;
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
  },
};

export const SelectsWorkspace: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    );
    await expect(clerkMocks.setActive).toHaveBeenCalledWith({
      organization: "org_harbor",
    });
  },
};

export const SelectFailure: Story = {
  beforeEach() {
    clerkMocks.memberships = workspaces;
    clerkMocks.setActive.mockImplementation(() => {
      throw new Error("switch failed");
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Harbor Academy/ }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not switch to that workspace. Please try again.",
    );
  },
};

export const AutoActivateFailure: Story = {
  beforeEach() {
    clerkMocks.memberships = [
      { organization: { id: "org_riverside", name: "Riverside School" } },
    ];
    clerkMocks.setActive.mockImplementation(() => {
      throw new Error("activation failed");
    });
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

export const Loading: Story = {
  beforeEach() {
    clerkMocks.membershipsLoading = true;
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
  },
};

export const MoreWorkspacesAvailable: Story = {
  beforeEach() {
    clerkMocks.memberships = workspaces;
    clerkMocks.membershipHasNextPage = true;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Show more Workspaces" }));
    await expect(clerkMocks.fetchNextMemberships).toHaveBeenCalled();
  },
};
