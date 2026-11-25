import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueryClient,
  calledPath,
  chooseFromMenu,
  fakeApi,
  sentTo,
} from "@/app/app/_components/masters/masters-story-support";
import type { DepartmentItem } from "@/src/queries/departments";

import { DepartmentsList, type DepartmentActions } from "./departments-list";

const BASE = "/api/construction/organization/departments";
const AT = "2026-11-25T10:00:00.000Z";

function department(
  id: string,
  name: string,
  isSystem = false,
): DepartmentItem {
  return { id, name, isSystem, createdAt: AT, updatedAt: AT };
}

const STORY_DEPARTMENTS = [
  department("0197a000-0000-7000-8000-000000000001", "Human Resources", true),
  department("0197a000-0000-7000-8000-000000000002", "Marketing", true),
  department("0197a000-0000-7000-8000-000000000003", "Accounts"),
  department("0197a000-0000-7000-8000-000000000004", "Purchase"),
];

let api: ReturnType<typeof fakeApi>;

/** An in-memory departments API: names unique ignoring case. */
function serveDepartments(initial = STORY_DEPARTMENTS) {
  return () => {
    let items = [...initial];
    let next = 100;
    const taken = (name: string, except?: string) =>
      items.some(
        (item) =>
          item.id !== except && item.name.toLowerCase() === name.toLowerCase(),
      );
    const nameTaken = () =>
      Response.json(
        {
          code: "DEPARTMENT_NAME_TAKEN",
          message: "A Department with this name already exists.",
        },
        { status: 409 },
      );
    api = fakeApi(({ url, method, body }) => {
      const sent = (body ?? {}) as { name?: string };
      const name = (sent.name ?? "").trim();
      if (url === BASE && method === "GET") return Response.json({ items });
      if (url === BASE && method === "POST") {
        if (taken(name)) return nameTaken();
        next += 1;
        const made = department(
          `0197a000-0000-7000-8000-000000000${String(next)}`,
          name,
        );
        items = [...items, made];
        return Response.json(made, { status: 201 });
      }
      const match = /\/([^/]+)\/(update|delete)$/.exec(url);
      const item = items.find((row) => row.id === match?.[1]);
      if (item == null) return undefined;
      if (match?.[2] === "delete") {
        items = items.filter((row) => row.id !== item.id);
        return new Response(null, { status: 204 });
      }
      if (taken(name, item.id)) return nameTaken();
      const renamed = { ...item, name };
      items = items.map((row) => (row.id === item.id ? renamed : row));
      return Response.json(renamed);
    });
    return api.restore;
  };
}

const ALL: DepartmentActions = { create: true, update: true, delete: true };

const meta = {
  title: "Departments/Manage Departments",
  component: DepartmentsList,
  args: { actions: ALL },
  render: (args) => (
    <StoryQueryClient>
      <DepartmentsList {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof DepartmentsList>;

export default meta;
type Story = StoryObj<typeof meta>;

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("p")?.textContent === name);
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

function rowNames(list: HTMLElement): (string | null | undefined)[] {
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.querySelector("p")?.textContent);
}

/**
 * The Company's departments by name; Human Resources and Marketing are
 * System, with no actions (ADR CM-0049 §3).
 */
export const WithDepartments: Story = {
  beforeEach: serveDepartments(),
  play: async ({ canvas, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Departments" });
    await expect(rowNames(list)).toEqual([
      "Accounts",
      "Human Resources",
      "Marketing",
      "Purchase",
    ]);
    for (const name of ["Human Resources", "Marketing"]) {
      const row = within(rowNamed(list, name));
      await expect(row.getByText("System")).toBeVisible();
      await expect(
        row.queryByRole("button", { name: `Actions for ${name}` }),
      ).toBeNull();
    }
    await expect(
      within(rowNamed(list, "Accounts")).queryByText("System"),
    ).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Actions for Accounts" }),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Search Departments"), "ing");
    await expect(rowNames(list)).toEqual(["Marketing"]);
    await userEvent.clear(canvas.getByLabelText("Search Departments"));
    await userEvent.type(canvas.getByLabelText("Search Departments"), "zz");
    await expect(
      await canvas.findByText("No Department matches “zz”."),
    ).toBeVisible();
  },
};

/** Add Department: a dialog with the name, refused when taken. */
export const AddDepartment: Story = {
  beforeEach: serveDepartments(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    // The loading skeleton has an Add Department button too.
    await canvas.findByRole("list", { name: "Departments" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Department" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("heading", { name: "Add Department" }),
      ).toBeVisible(),
    );
    const name = dialog.getByLabelText("Department name");

    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the Department name"),
    ).toBeVisible();

    await userEvent.type(name, "marketing");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("A Department with this name already exists."),
    ).toBeVisible();

    await userEvent.clear(name);
    await userEvent.type(name, "Stores");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      api.spy.mock.calls.some(
        ([, init]) =>
          init?.method === "POST" && init.body === '{"name":"Stores"}',
      ),
    ).toBe(true);
    const list = await canvas.findByRole("list", { name: "Departments" });
    await waitFor(() => expect(rowNames(list)).toContain("Stores"));
  },
};

/** A Company-made department is renamed with the `updatedAt` it loaded. */
export const RenameDepartment: Story = {
  beforeEach: serveDepartments(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Departments" });
    await chooseFromMenu(canvasElement, userEvent, "Purchase", "Rename");
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("heading", { name: "Rename Purchase" }),
      ).toBeVisible(),
    );
    const name = dialog.getByLabelText("Department name");
    await expect(name).toHaveValue("Purchase");
    await userEvent.clear(name);
    await userEvent.type(name, "Procurement");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      sentTo(api.spy, `${STORY_DEPARTMENTS[3]?.id ?? ""}/update`),
    ).toEqual({ name: "Procurement", expectedUpdatedAt: AT });
    const list = canvas.getByRole("list", { name: "Departments" });
    await waitFor(() => expect(rowNames(list)).toContain("Procurement"));
  },
};

/** Delete asks first; the name leaves the list. */
export const DeleteAsksFirst: Story = {
  beforeEach: serveDepartments(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Departments" });
    await chooseFromMenu(canvasElement, userEvent, "Accounts", "Delete");
    const dialog = await body.findByRole("alertdialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { name: "Delete Accounts?" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(canvas.queryByText("Accounts")).not.toBeInTheDocument(),
    );
    await expect(calledPath(api.spy, "/delete")).toBe(true);
  },
};

/** With Read only: no Add, and no row actions (ADR CM-0049 §5). */
export const ReadOnly: Story = {
  args: { actions: { create: false, update: false, delete: false } },
  beforeEach: serveDepartments(),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "Departments" });
    await expect(rowNames(list)).toHaveLength(4);
    await expect(
      canvas.queryByRole("button", { name: "Add Department" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for/ }),
    ).toBeNull();
  },
};

/** Update without Delete: Rename only. */
export const RenameOnly: Story = {
  args: { actions: { create: true, update: true, delete: false } },
  beforeEach: serveDepartments(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Departments" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Accounts" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Rename" }),
    ).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  },
};
