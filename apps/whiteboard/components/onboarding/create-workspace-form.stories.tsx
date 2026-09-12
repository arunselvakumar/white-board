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
    await expect(canvas.getByLabelText("Workspace name")).toBeVisible();
    await expect(
      canvas.getByLabelText("What kind of institution is this?"),
    ).toBeVisible();
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
    await expect(canvas.getByText("Select an institution type")).toBeVisible();
  },
};

export const SubmitsName: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Riverside School",
    );
    await userEvent.click(
      canvas.getByLabelText("What kind of institution is this?"),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "School",
      }),
    );
    await expect(
      canvas.getByLabelText("What kind of institution is this?"),
    ).toHaveTextContent("School");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(createWorkspace).toHaveBeenCalledWith({
      name: "Riverside School",
      institutionType: "school",
    });
    await expect(clerkMocks.setActive).toHaveBeenCalledWith({
      organization: "org_new",
    });
  },
};

export const ShowsInstitutionTypeLabel: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByLabelText("What kind of institution is this?"),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Training Institute",
      }),
    );
    const trigger = canvas.getByLabelText("What kind of institution is this?");
    await expect(trigger).toHaveTextContent("Training Institute");
    await expect(trigger).not.toHaveTextContent("training_institute");
  },
};

export const OtherRequiresDescription: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Northside Learning",
    );
    await userEvent.click(
      canvas.getByLabelText("What kind of institution is this?"),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Other",
      }),
    );
    const trigger = canvas.getByLabelText("What kind of institution is this?");
    await expect(trigger).toHaveTextContent("Other");
    await expect(trigger).not.toHaveTextContent("other");
    await expect(
      canvas.getByLabelText("Describe the institution type"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(
      canvas.getByText("Describe the institution type", {
        selector: "p",
      }),
    ).toBeVisible();
    await expect(createWorkspace).not.toHaveBeenCalled();
  },
};

export const SubmitsOther: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Northside Learning",
    );
    await userEvent.click(
      canvas.getByLabelText("What kind of institution is this?"),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Other",
      }),
    );
    await userEvent.type(
      canvas.getByLabelText("Describe the institution type"),
      "Language school",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(createWorkspace).toHaveBeenCalledWith({
      name: "Northside Learning",
      institutionType: "other",
      institutionTypeOther: "Language school",
    });
    await expect(clerkMocks.setActive).toHaveBeenCalledWith({
      organization: "org_new",
    });
  },
};

export const CreateFailure: Story = {
  beforeEach() {
    createWorkspace.mockImplementation(() => {
      throw new Error("That workspace name is taken.");
    });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Riverside School",
    );
    await userEvent.click(
      canvas.getByLabelText("What kind of institution is this?"),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "School",
      }),
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
