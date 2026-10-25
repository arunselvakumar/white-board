import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import type { Role } from "@/src/queries/roles";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { ALL_ROLE_ACTIONS } from "./role-actions";
import {
  ACCOUNTANT_ROLE,
  ROLES,
  ROLES_URL,
  STORE_HELPER_ROLE,
} from "./role-fixtures";
import { RolesList } from "./roles-list";

let api: ReturnType<typeof mockApi> | null = null;

/**
 * An in-memory Roles API over `initial`. `inUseLater` names a Role that
 * gains a staff member after the list loaded, so its delete answers ROLE_IN_USE.
 */
function serve(initial: Role[], inUseLater?: string) {
  return () => {
    let items = [...initial];
    api = mockApi(({ method, path }) => {
      if (method === "GET" && path === ROLES_URL)
        return Response.json({ items });
      const [, id, action] =
        /^\/api\/construction\/organization\/roles\/([^/]+)\/(\w+)$/.exec(
          path,
        ) ?? [];
      const source = items.find((item) => item.id === id);
      if (method !== "POST" || source == null) return undefined;
      if (action === "duplicate") {
        const copy: Role = {
          ...source,
          id: "0199c3a0-0000-7000-8000-0000000003ff",
          name: `${source.name} (copy)`,
          isSeed: false,
          userCount: 0,
        };
        items = [...items, copy];
        return Response.json(copy, { status: 201 });
      }
      if (action === "delete") {
        if (source.id === inUseLater) {
          items = items.map((item) =>
            item.id === id ? { ...item, userCount: 1 } : item,
          );
          return Response.json(
            {
              code: "ROLE_IN_USE",
              message: "Staff are on this Role.",
              details: { userCount: 1 },
            },
            { status: 409 },
          );
        }
        items = items.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Staff & Roles/Role Management/List",
  component: RolesList,
  args: { actions: ALL_ROLE_ACTIONS },
  render: (args) => (
    <StoryQueries>
      <RolesList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof RolesList>;

export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

async function rowOf(canvas: Canvas, name: string) {
  const list = await canvas.findByRole("list", { name: "Roles" });
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByRole("link", { name }) != null);
  if (row == null) throw new Error(`No row for ${name}`);
  return within(row);
}

export const WithRoles: Story = {
  beforeEach: serve(ROLES),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const list = await canvas.findByRole("list", { name: "Roles" });
    const names = within(list)
      .getAllByRole("link")
      .map((link) => link.textContent);
    await expect(names).toEqual([
      "Accountant",
      "Admin",
      "HRMS Staff",
      "Site Engineer",
      "Store helper",
    ]);
    const engineer = await rowOf(canvas, "Site Engineer");
    await expect(engineer.getByText("Default")).toBeVisible();
    await expect(engineer.getAllByText("3 Staff")[0]).toBeInTheDocument();
    await expect(engineer.getByText(/Runs the site day to day/)).toBeVisible();
    const helper = await rowOf(canvas, "Store helper");
    await expect(helper.queryByText("Default")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Add Role" }),
    ).toHaveAttribute("href", "/app/roles/new");

    // Edit opens the Role's page.
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Site Engineer" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    await expect(getRouter().push).toHaveBeenCalledWith(
      "/app/roles/0199c3a0-0000-7000-8000-000000000301",
    );
  },
};

/** A Role with staff on it cannot be deleted; the menu says why. */
export const DeleteBlockedWhileInUse: Story = {
  beforeEach: serve(ROLES),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Site Engineer" }),
    );
    const remove = await body.findByRole("menuitem", { name: /^Delete/ });
    await expect(remove).toHaveAttribute("aria-disabled", "true");
    await expect(
      within(remove).getByText(
        "3 Staff on it. Move them to another Role first.",
      ),
    ).toBeVisible();
  },
};

export const DuplicateAndDelete: Story = {
  beforeEach: serve(ROLES),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Store helper" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Duplicate" }),
    );
    await expect(
      await canvas.findByRole("link", { name: "Store helper (copy)" }),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Store helper" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: /^Delete/ }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(
        confirm.getByText(/no longer be offered on Add Staff/),
      ).toBeVisible(),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        canvas.queryByRole("link", { name: "Store helper" }),
      ).not.toBeInTheDocument(),
    );
    await expect(api?.calls).toHaveBeenCalledWith({
      method: "POST",
      path: `${ROLES_URL}/${STORE_HELPER_ROLE.id}/delete`,
      body: {},
    });
  },
};

/** Someone was put on the Role after the list loaded: 409 ROLE_IN_USE. */
export const DeleteRefusedInUse: Story = {
  beforeEach: serve(ROLES, ACCOUNTANT_ROLE.id),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Accountant" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: /^Delete/ }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await waitFor(() =>
      expect(confirm.getByRole("button", { name: "Delete" })).toBeVisible(),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(
      await confirm.findByText(
        "1 Staff member on this Role now. Move them to another Role first.",
      ),
    ).toBeVisible();
    await expect(
      confirm.getByRole("button", { name: "Delete" }),
    ).toBeDisabled();
    // The list refreshed: the count is the new one.
    await userEvent.click(confirm.getByRole("button", { name: "Cancel" }));
    const accountant = await rowOf(canvas, "Accountant");
    await waitFor(() =>
      expect(accountant.getAllByText("1 Staff member")[0]).toBeInTheDocument(),
    );
  },
};

/** Read only: no Add Role, no Duplicate or Delete; Edit becomes View. */
export const ReadOnlyViewer: Story = {
  args: {
    actions: { read: true, create: false, update: false, delete: false },
  },
  beforeEach: serve(ROLES),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Roles" });
    await expect(
      canvas.queryByRole("link", { name: "Add Role" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Admin" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "View" }),
    ).toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: "Duplicate" }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: /^Delete/ }),
    ).not.toBeInTheDocument();
  },
};

export const Search: Story = {
  beforeEach: serve(ROLES),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Roles" });
    await userEvent.type(canvas.getByLabelText("Search Roles"), "salary");
    // Description matches count too.
    await expect(
      canvas.getByRole("link", { name: "HRMS Staff" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Admin" }),
    ).not.toBeInTheDocument();
    await userEvent.clear(canvas.getByLabelText("Search Roles"));
    await userEvent.type(canvas.getByLabelText("Search Roles"), "zzz");
    await expect(canvas.getByText("No Role matches “zzz”.")).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Roles yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Role" }).at(-1),
    ).toHaveAttribute("href", "/app/roles/new");
  },
};

/** At phone width the count moves under the name; nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: serve(ROLES),
  render: (args) => (
    <StoryQueries>
      <div data-testid="phone" style={{ width: 375 }}>
        <RolesList {...args} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Roles" });
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(375);
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  beforeEach: serve(ROLES),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("list", { name: "Roles" }),
    ).toBeVisible();
  },
};
