import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CreateWorkspaceForm } from "@/components/onboarding/create-workspace-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const meta = {
  title: "Onboarding/CreateWorkspaceForm",
  component: CreateWorkspaceForm,
  decorators: [withAuthFormFrame],
  args: {
    redirectUrl: "/",
  },
} satisfies Meta<typeof CreateWorkspaceForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Create your workspace" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Workspace name")).toBeVisible();
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(canvas.getByText("Workspace name is required")).toBeVisible();
  },
};

export const SubmitsName: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Riverside School",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(clerkMocks.createOrganization).toHaveBeenCalledWith({
      name: "Riverside School",
    });
    await expect(clerkMocks.setActive).toHaveBeenCalledWith({
      organization: "org_new",
    });
  },
};

export const CreateFailure: Story = {
  beforeEach() {
    clerkMocks.createOrganization.mockImplementation(() => {
      throw new Error("That workspace name is taken.");
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Riverside School",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "That workspace name is taken.",
    );
  },
};

export const Loading: Story = {
  beforeEach() {
    clerkMocks.organizationListLoaded = false;
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
  },
};
