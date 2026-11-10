import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import {
  authFailure,
  authMocks,
  signInAs,
  storyUser,
  type WorkspaceSummary,
} from "../../.storybook/mocks/auth";

const riverside: WorkspaceSummary = {
  id: "org_riverside",
  name: "Riverside School",
  role: "owner",
  institutionType: "training_institute",
};

const harbor: WorkspaceSummary = {
  id: "org_harbor",
  name: "Harbor Academy",
  role: "teacher",
  institutionType: "training_institute",
};

/** Signed in, no Active Workspace yet, member of `workspaces`. */
function signedInWithout(workspaces: WorkspaceSummary[]): void {
  authMocks.userId = storyUser.id;
  authMocks.user = storyUser;
  authMocks.workspaces = workspaces;
}

const meta = {
  title: "Workspace/WorkspaceGate",
  component: WorkspaceGate,
  args: {
    children: <p>In-app home</p>,
  },
} satisfies Meta<typeof WorkspaceGate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithActiveWorkspace: Story = {
  beforeEach() {
    signInAs("owner", { name: "Riverside School" });
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("In-app home")).toBeVisible();
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const NoWorkspaces: Story = {
  parameters: { nextjs: { navigation: { pathname: "/students" } } },
  beforeEach() {
    signedInWithout([]);
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByText("In-app home")).not.toBeInTheDocument();
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith(
        "/create-workspace?redirect_url=%2Fstudents",
      ),
    );
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const OneWorkspace: Story = {
  beforeEach() {
    signedInWithout([riverside]);
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByText("In-app home")).not.toBeInTheDocument();
    await expect(
      canvasElement.querySelector(".animate-spin"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(authMocks.setActive).toHaveBeenCalledWith("org_riverside", "/"),
    );
    await expect(authMocks.setActive).toHaveBeenCalledTimes(1);
  },
};

export const ManyWorkspaces: Story = {
  beforeEach() {
    signedInWithout([riverside, harbor]);
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("In-app home")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith("/select-workspace"),
    );
    await expect(authMocks.setActive).not.toHaveBeenCalled();
  },
};

export const ActivationFailure: Story = {
  beforeEach() {
    signedInWithout([riverside]);
    authMocks.setActive.mockImplementation(() => authFailure("FORBIDDEN", 403));
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not switch to that workspace. Please try again.",
    );
    await expect(canvas.queryByText("In-app home")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(authMocks.setActive).toHaveBeenCalledTimes(2));
    await expect(authMocks.setActive).toHaveBeenLastCalledWith(
      "org_riverside",
      "/",
    );
    await expect(await canvas.findByRole("alert")).toBeVisible();
  },
};

export const RoleCannotOpenScreen: Story = {
  parameters: { nextjs: { navigation: { pathname: "/students/new" } } },
  beforeEach() {
    signInAs("student", { name: "Riverside School" });
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("In-app home")).not.toBeInTheDocument();
    await waitFor(() => expect(getRouter().replace).toHaveBeenCalledWith("/"));
  },
};

export const RoleCanOpenScreen: Story = {
  parameters: { nextjs: { navigation: { pathname: "/student/homework" } } },
  beforeEach() {
    signInAs("student", { name: "Riverside School" });
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("In-app home")).toBeVisible();
    await expect(getRouter().replace).not.toHaveBeenCalled();
  },
};
