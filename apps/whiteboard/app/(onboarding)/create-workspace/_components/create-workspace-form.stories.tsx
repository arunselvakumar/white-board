import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { CreateWorkspaceForm } from "@/app/(onboarding)/create-workspace/_components/create-workspace-form";
import { withAuthFormFrame } from "@/.storybook/decorators";
import {
  authFailure,
  authMocks,
  signInAs,
  storyUser,
} from "@/.storybook/mocks/auth";
import { createWorkspace } from "@/.storybook/mocks/create-workspace";

const meta = {
  title: "Onboarding/CreateWorkspaceForm",
  component: CreateWorkspaceForm,
  decorators: [withAuthFormFrame],
  args: {
    redirectUrl: "/",
    createWorkspace,
  },
  beforeEach() {
    authMocks.userId = storyUser.id;
    authMocks.user = storyUser;
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
    const types = canvas.getByRole("radiogroup", {
      name: "What kind of institution is this?",
    });
    const trainingInstitute = canvas.getByRole("radio", {
      name: "Training Institute",
    });
    await expect(nameInput).toBeVisible();
    await expect(types).toBeVisible();
    await expect(trainingInstitute).toHaveAttribute("aria-checked", "true");
    await expect(types).toHaveTextContent("Training Institute");
    await expect(types).not.toHaveTextContent("training_institute");
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
    await expect(authMocks.setActive).toHaveBeenCalledWith("org_new", "/");
  },
};

/** Training Institute is not asked for an Academic Year. */
export const NoAcademicYearForTrainingInstitute: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByLabelText("Academic Year starts in"),
    ).not.toBeInTheDocument();
  },
};

export const SubmitsPreschool: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Workspace name"),
      "Little Steps Preschool",
    );
    await userEvent.click(canvas.getByText("Preschool"));
    await expect(
      canvas.getByRole("radio", { name: "Preschool" }),
    ).toHaveAttribute("aria-checked", "true");
    const month = canvas.getByLabelText("Academic Year starts in");
    await expect(month).toHaveTextContent("April");
    await userEvent.click(month);
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "June",
      }),
    );
    await waitFor(() => expect(month).toHaveTextContent("June"));
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(createWorkspace).toHaveBeenCalledWith({
      name: "Little Steps Preschool",
      institutionType: "preschool",
      academicYearStartMonth: 6,
    });
    await waitFor(() =>
      expect(authMocks.setActive).toHaveBeenCalledWith("org_new", "/"),
    );
  },
};

/** The Workspace exists but its Preschool setup failed: the form says so. */
export const PreschoolSetupFails: Story = {
  beforeEach() {
    createWorkspace.mockImplementation(() =>
      Promise.resolve({
        ok: false as const,
        message:
          "Your workspace was created, but setting up the Preschool did not finish. Reload the page to open it and finish setting up.",
      }),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Workspace name"), "Tiny Toes");
    await userEvent.click(canvas.getByText("Preschool"));
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "setting up the Preschool did not finish",
    );
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const SubmitsWithRedirect: Story = {
  args: { redirectUrl: "/courses" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Workspace name"), "Apex");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await waitFor(() =>
      expect(authMocks.setActive).toHaveBeenCalledWith("org_new", "/courses"),
    );
  },
};

export const ActivationFailure: Story = {
  beforeEach() {
    authMocks.setActive.mockImplementation(() => authFailure("FORBIDDEN", 403));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Workspace name"), "Apex");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Your workspace was created. Reload the page to open it.",
    );
  },
};

export const ComingSoonTypesAreDisabled: Story = {
  play: async ({ canvas, userEvent }) => {
    const school = canvas.getByRole("radio", { name: /School/ });
    await expect(school).toHaveAttribute("aria-disabled", "true");
    await expect(canvas.getByText("School").parentElement).toHaveTextContent(
      "Coming soon",
    );
    const college = canvas.getByRole("radio", { name: /College/ });
    await expect(college).toHaveAttribute("aria-disabled", "true");
    const trainingInstitute = canvas.getByRole("radio", {
      name: "Training Institute",
    });
    await expect(trainingInstitute).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click(canvas.getByText("School"));
    await expect(trainingInstitute).toHaveAttribute("aria-checked", "true");
    await expect(school).toHaveAttribute("aria-checked", "false");
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

export const CreateError: Story = {
  beforeEach() {
    createWorkspace.mockImplementation(() =>
      Promise.reject(new Error("network down")),
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Workspace name"), "Apex");
    await userEvent.click(
      canvas.getByRole("button", { name: "Create workspace" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not create your workspace. Please try again.",
    );
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const AlreadyMember: Story = {
  args: { redirectUrl: "/students" },
  beforeEach() {
    signInAs("owner");
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Create your workspace" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith("/students"),
    );
  },
};
