import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { CreateWorkspaceForm } from "@/components/onboarding/create-workspace-form";
import { withAuthFormFrame } from "../../.storybook/decorators";
import { clerkMocks } from "../../.storybook/mocks/clerk";
import { createWorkspace } from "../../.storybook/mocks/create-workspace";

const meta = {
  title: "Onboarding/CreateWorkspaceForm",
  component: CreateWorkspaceForm,
  decorators: [withAuthFormFrame],
  args: {
    redirectUrl: "/",
    createWorkspace,
  },
} satisfies Meta<typeof CreateWorkspaceForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Create your workspace" }),
    ).toBeVisible();
    const nameInput = canvas.getByLabelText("Workspace name");
    const trigger = canvas.getByLabelText("What kind of institution is this?");
    await expect(nameInput).toBeVisible();
    await expect(trigger).toBeVisible();
    await expect(nameInput.getBoundingClientRect().height).toBe(
      trigger.getBoundingClientRect().height,
    );
    await expect(trigger).toHaveTextContent("Training Institute");
    await expect(trigger).not.toHaveTextContent("training_institute");
    await expect(
      canvas.queryByLabelText("Describe the institution type"),
    ).not.toBeInTheDocument();
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(canvas.getByText("Workspace name is required")).toBeVisible();
    await expect(
      canvas.queryByText("Select an institution type"),
    ).not.toBeInTheDocument();
  },
};

export const SubmitsName: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Apex Training Institute",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(createWorkspace).toHaveBeenCalledWith({
      name: "Apex Training Institute",
      institutionType: "training_institute",
    });
    await expect(clerkMocks.setActive).toHaveBeenCalledWith({
      organization: "org_new",
    });
  },
};

export const ComingSoonTypesAreDisabled: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByLabelText("What kind of institution is this?");
    await expect(trigger).toHaveTextContent("Training Institute");
    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);
    const school = await body.findByRole("option", { name: /School/ });
    await expect(school).toHaveAttribute("aria-disabled", "true");
    await expect(school).toHaveTextContent("Coming soon");
    const college = body.getByRole("option", { name: /College/ });
    await expect(college).toHaveAttribute("aria-disabled", "true");
    await expect(college).toHaveTextContent("Coming soon");
    const trainingInstitute = body.getByRole("option", {
      name: "Training Institute",
    });
    await expect(trainingInstitute).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(trigger).toHaveTextContent("Training Institute");
  },
};

export const CreateFailure: Story = {
  beforeEach() {
    createWorkspace.mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        message: "That workspace name is taken.",
      }),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Apex Training Institute",
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
