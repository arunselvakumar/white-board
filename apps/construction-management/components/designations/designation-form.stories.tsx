import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import {
  EditDesignationScreen,
  NewDesignationScreen,
} from "./designation-form";
import {
  fakeApi,
  sentTo,
  SITE_ENGINEER,
  StoryQueryClient,
} from "./designation-story-support";

const BASE = "/api/construction/organization/designations";

let api: ReturnType<typeof fakeApi>;

const meta = {
  title: "Masters/Designations/Form",
  component: NewDesignationScreen,
  render: () => (
    <StoryQueryClient>
      <NewDesignationScreen />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof NewDesignationScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddValidatesAndSaves: Story = {
  beforeEach: () => {
    api = fakeApi(({ url, method, body }) =>
      method === "POST" && url === BASE
        ? Response.json(
            {
              ...SITE_ENGINEER,
              ...(body as object),
              id: "0199a1b2-0000-7000-8000-0000000000aa",
              isSeed: false,
            },
            { status: 201 },
          )
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Add Designation" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the Designation name"),
    ).toBeVisible();
    await expect(api.spy).not.toHaveBeenCalled();

    await userEvent.type(
      canvas.getByLabelText("Designation name"),
      "Billing Engineer",
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "View — Project" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Add — Purchase Request" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        "/app/masters/designations",
      ),
    );
    await expect(sentTo(api.spy, BASE)).toEqual({
      name: "Billing Engineer",
      template: {
        "projects.project": ["read"],
        "procurement.purchase_requests": ["create"],
      },
    });
  },
};

export const AddShowsNameInUse: Story = {
  beforeEach: () => {
    api = fakeApi(({ method }) =>
      method === "POST"
        ? Response.json(
            {
              code: "DESIGNATION_NAME_IN_USE",
              message: "A Designation with this name already exists.",
            },
            { status: 409 },
          )
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Designation name"), "Admin");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("A Designation with this name already exists."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Designation name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(sentTo(api.spy, BASE)).toEqual({
      name: "Admin",
      template: null,
    });
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const EditSaves: Story = {
  render: () => (
    <StoryQueryClient>
      <EditDesignationScreen id={SITE_ENGINEER.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    api = fakeApi(({ url, method, body }) => {
      if (method === "GET" && url === `${BASE}/${SITE_ENGINEER.id}`)
        return Response.json(SITE_ENGINEER);
      if (method === "POST" && url === `${BASE}/${SITE_ENGINEER.id}/update`)
        return Response.json({ ...SITE_ENGINEER, ...(body as object) });
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    // The full Permission Matrix renders here; slow CI runners need longer
    // than the default 1 s.
    await expect(
      await canvas.findByRole(
        "heading",
        { name: "Edit Site Engineer" },
        { timeout: 5000 },
      ),
    ).toBeVisible();
    const name = canvas.getByLabelText("Designation name");
    await expect(name).toHaveValue("Site Engineer");
    const attendance = canvas.getByRole("checkbox", {
      name: "Add — Attendance",
    });
    await expect(attendance).toBeChecked();
    await expect(canvas.getByText("6 permissions granted")).toBeVisible();

    await userEvent.click(attendance);
    await userEvent.clear(name);
    await userEvent.type(name, "Senior Site Engineer");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        "/app/masters/designations",
      ),
    );
    await expect(sentTo(api.spy, `${SITE_ENGINEER.id}/update`)).toEqual({
      name: "Senior Site Engineer",
      template: {
        "labour.attendance": ["read", "update"],
        "site_work.daily_worksheet": ["create", "read", "update"],
      },
    });
    await expect(canvas.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/app/masters/designations",
    );
  },
};
