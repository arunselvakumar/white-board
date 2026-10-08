import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { NewProjectScreen } from "./project-form";
import { ProjectEditScreen } from "./project-overview";
import { SHANTI } from "./project-fixtures";

const BASE = "/api/construction/projects/projects";

let calls: ApiCall[] = [];

function posts(): ApiCall[] {
  return calls.filter((call) => call.method === "POST");
}

function api(handler: (call: ApiCall) => Response | undefined) {
  calls = [];
  const mocked = mockApi((call) => {
    calls.push(call);
    return handler(call);
  });
  return mocked.restore;
}

const meta = {
  title: "Projects/ProjectForm",
  component: NewProjectScreen,
  render: () => (
    <StoryQueries>
      <NewProjectScreen />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewProjectScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewValidatesAndSaves: Story = {
  beforeEach: () =>
    api((call) =>
      call.method === "POST" && call.path === BASE
        ? Response.json(
            { ...SHANTI, ...(call.body as object) },
            { status: 201 },
          )
        : undefined,
    ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("heading", { name: "New Project" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText("Enter the Project name"),
    ).toBeVisible();
    await expect(posts()).toHaveLength(0);

    await userEvent.type(
      canvas.getByLabelText("Project name"),
      "Shanti Heights",
    );
    await userEvent.type(canvas.getByLabelText("Start date"), "2026-10-08");
    await userEvent.type(
      canvas.getByLabelText("Expected completion"),
      "2026-10-01",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText("The end date cannot be before the start date"),
    ).toBeVisible();
    await expect(posts()).toHaveLength(0);

    await userEvent.clear(canvas.getByLabelText("Expected completion"));
    await userEvent.type(
      canvas.getByLabelText("Expected completion"),
      "2027-03-31",
    );
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(
      await body.findByRole("option", { name: "Not started" }),
    );
    await userEvent.type(
      canvas.getByLabelText("Project address"),
      "Baner, Pune",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${SHANTI.id}`,
      ),
    );
    await expect(posts()[0]?.body).toEqual({
      name: "Shanti Heights",
      status: "not_started",
      address: "Baner, Pune",
      startDate: "2026-10-08",
      endDate: "2027-03-31",
    });
  },
};

export const NewShowsNameInUse: Story = {
  beforeEach: () =>
    api((call) =>
      call.method === "POST"
        ? Response.json(
            {
              code: "PROJECT_NAME_IN_USE",
              message: "A Project with this name already exists.",
            },
            { status: 409 },
          )
        : undefined,
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Project name"),
      "Shanti Heights",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText("A Project with this name already exists."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Project name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(posts()[0]?.body).toEqual({
      name: "Shanti Heights",
      status: "ongoing",
      address: null,
      startDate: null,
      endDate: null,
    });
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const NewShowsPlanLimit: Story = {
  beforeEach: () =>
    api((call) =>
      call.method === "POST"
        ? Response.json(
            {
              code: "PLAN_LIMIT_EXCEEDED",
              message:
                "Your plan allows 10 Projects. Buy an add-on to add more.",
              details: { grant: "project", limit: 10, used: 10 },
            },
            { status: 402 },
          )
        : undefined,
    ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Project name"), "Project 11");
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText(
        "Your plan allows 10 Projects. Buy an add-on to add more.",
      ),
    ).toBeVisible();
  },
};

export const EditSaves: Story = {
  render: () => (
    <StoryQueries>
      <ProjectEditScreen id={SHANTI.id} />
    </StoryQueries>
  ),
  beforeEach: () =>
    api((call) => {
      if (call.method === "GET" && call.path === `${BASE}/${SHANTI.id}`)
        return Response.json(SHANTI);
      if (call.method === "POST" && call.path === `${BASE}/${SHANTI.id}/update`)
        return Response.json({
          ...SHANTI,
          ...(call.body as object),
          updatedAt: "2026-10-08T07:00:00.000Z",
        });
      return undefined;
    }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const name = await canvas.findByLabelText("Project name");
    await expect(name).toHaveValue("Shanti Heights");
    await expect(canvas.getByLabelText("Start date")).toHaveValue("2026-04-01");
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(await body.findByRole("option", { name: "On hold" }));
    await userEvent.clear(canvas.getByLabelText("Project address"));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${SHANTI.id}`,
      ),
    );
    await expect(posts()[0]?.body).toEqual({
      name: "Shanti Heights",
      status: "on_hold",
      address: null,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      expectedUpdatedAt: SHANTI.updatedAt,
    });
  },
};

export const EditShowsSomeoneElsesChange: Story = {
  render: EditSaves.render,
  beforeEach: () =>
    api((call) => {
      if (call.method === "GET") return Response.json(SHANTI);
      return Response.json(
        {
          code: "PROJECT_CHANGED",
          message:
            "Someone else changed this Project after you opened it. Reload to see their changes.",
        },
        { status: 409 },
      );
    }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText("Project name");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(/Someone else changed this Project/),
    ).toBeVisible();
  },
};

export const DeleteRefusedWhileInUse: Story = {
  render: EditSaves.render,
  beforeEach: () =>
    api((call) => {
      if (call.method === "GET") return Response.json(SHANTI);
      if (call.path.endsWith("/delete"))
        return Response.json(
          {
            code: "PROJECT_IN_USE",
            message:
              "Labours, vendors, attendance or payments are recorded on this Project, so it cannot be deleted. Mark it Completed instead.",
          },
          { status: 409 },
        );
      return undefined;
    }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete Project" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(
      await canvas.findByText(/so it cannot be deleted/),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};
