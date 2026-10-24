import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import type { Role } from "@/src/queries/roles";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import {
  ROLES_URL,
  SITE_ENGINEER_ROLE,
  STORE_HELPER_ROLE,
} from "./role-fixtures";
import { EditRoleScreen, NewRoleScreen } from "./role-form";

const ONE = `${ROLES_URL}/${SITE_ENGINEER_ROLE.id}`;
const NEWER = "2026-10-24T09:15:00.000Z";

let api: ReturnType<typeof mockApi> | null = null;

function bodyOf(path: string): unknown {
  return api?.calls.mock.calls.find(
    ([call]) => call.method === "POST" && call.path === path,
  )?.[0].body;
}

const meta = {
  title: "Users & Roles/Role Management/Form",
  component: EditRoleScreen,
  args: { id: SITE_ENGINEER_ROLE.id, canUpdate: true },
  render: (args) => (
    <StoryQueries>
      <EditRoleScreen {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof EditRoleScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddRole: Story = {
  beforeEach() {
    api = mockApi(({ method, path, body }) => {
      if (method === "POST" && path === ROLES_URL) {
        const input = body as Pick<Role, "name">;
        if (input.name === "Store helper")
          return Response.json(
            {
              code: "ROLE_NAME_TAKEN",
              message: "Another Role has this name.",
            },
            { status: 409 },
          );
        return Response.json(
          { ...STORE_HELPER_ROLE, ...input },
          { status: 201 },
        );
      }
      return undefined;
    });
    return api.restore;
  },
  render: () => (
    <StoryQueries>
      <NewRoleScreen />
    </StoryQueries>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Role" }),
    );
    await expect(await canvas.findByText("Enter the Role name")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Role name"), "Store helper");
    await userEvent.type(
      canvas.getByLabelText("Description"),
      "Receives material at the site store.",
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Add — Purchase Request" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Role" }));
    await expect(
      await canvas.findByText("Another Role has this name."),
    ).toBeVisible();

    await userEvent.clear(canvas.getByLabelText("Role name"));
    await userEvent.type(canvas.getByLabelText("Role name"), "Store keeper 2");
    await userEvent.click(canvas.getByRole("button", { name: "Add Role" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/roles"),
    );
    await expect(
      api?.calls.mock.calls
        .filter(([call]) => call.method === "POST")
        .at(-1)?.[0].body,
    ).toEqual({
      name: "Store keeper 2",
      description: "Receives material at the site store.",
      permissions: { "procurement.purchase_requests": ["create"] },
    });
  },
};

export const EditRole: Story = {
  beforeEach() {
    api = mockApi(({ method, path, body }) => {
      if (method === "GET" && path === ONE)
        return Response.json(SITE_ENGINEER_ROLE);
      if (method === "POST" && path === `${ONE}/update`)
        return Response.json({ ...SITE_ENGINEER_ROLE, ...(body as object) });
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Site Engineer" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Changes apply to the 3 Users on this Role."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Role name")).toHaveValue(
      "Site Engineer",
    );
    await expect(
      canvas.getByRole("checkbox", { name: "Add — Attendance" }),
    ).toBeChecked();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Delete — Attendance" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/roles"),
    );
    await expect(bodyOf(`${ONE}/update`)).toEqual({
      name: "Site Engineer",
      description: SITE_ENGINEER_ROLE.description,
      permissions: {
        "labour.attendance": ["create", "read", "update", "delete"],
        "procurement.purchase_requests": ["create", "read"],
      },
      updatedAt: SITE_ENGINEER_ROLE.updatedAt,
    });
  },
};

/** Someone saved in between: 409 STALE_ROLE, then Reload loads theirs. */
export const StaleVersion: Story = {
  beforeEach() {
    let current = SITE_ENGINEER_ROLE;
    api = mockApi(({ method, path, body }) => {
      if (method === "GET" && path === ONE) return Response.json(current);
      if (method === "POST" && path === `${ONE}/update`) {
        const input = body as { updatedAt: string; name: string };
        if (input.updatedAt !== NEWER) {
          // The other admin's save lands first.
          current = {
            ...SITE_ENGINEER_ROLE,
            name: "Site Engineer (civil)",
            updatedAt: NEWER,
          };
          return Response.json(
            {
              code: "STALE_ROLE",
              message: "This Role was changed by someone else.",
            },
            { status: 409 },
          );
        }
        return Response.json({ ...current, ...input });
      }
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Description"),
      " Also QC.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Someone else changed this Role"),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Role name")).toHaveValue(
        "Site Engineer (civil)",
      ),
    );
    await expect(
      canvas.queryByText("Someone else changed this Role"),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/roles"),
    );
  },
};

/** A Role with more than the editor holds: 403 CANNOT_GRANT, said plainly. */
export const CannotGrant: Story = {
  beforeEach() {
    api = mockApi(({ method, path }) => {
      if (method === "GET" && path === ONE)
        return Response.json(SITE_ENGINEER_ROLE);
      if (method === "POST" && path === `${ONE}/update`)
        return Response.json(
          {
            code: "CANNOT_GRANT",
            message:
              "You can only give permissions you have yourself: Delete — Attendance.",
          },
          { status: 403 },
        );
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Delete — Attendance" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(/You can only give permissions you have/),
    ).toBeVisible();
  },
};

/** Without Update the Role is shown, not edited. */
export const ReadOnly: Story = {
  args: { canUpdate: false },
  beforeEach() {
    api = mockApi(({ method, path }) =>
      method === "GET" && path === ONE
        ? Response.json(SITE_ENGINEER_ROLE)
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Site Engineer" }),
    ).toBeVisible();
    await expect(canvas.getByText("3 Users on this Role.")).toBeVisible();
    await expect(canvas.getByLabelText("Role name")).toHaveAttribute(
      "readonly",
    );
    await expect(
      canvas.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();
  },
};
