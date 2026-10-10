import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { SalaryStructureModel } from "@/src/queries/hrms-salary-setup";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { OFFICE, SITE_STAFF, STRUCTURES_PATH } from "./salary-setup-fixtures";
import { SalaryStructuresList } from "./salary-structures-list";

let structures: SalaryStructureModel[] = [];
let deleteResponse: () => Response = () => new Response(null, { status: 204 });
let lastCalls: ApiCall[] = [];

const meta = {
  title: "HRMS/SalaryStructuresList",
  component: SalaryStructuresList,
  beforeEach() {
    lastCalls = [];
    structures = [SITE_STAFF, OFFICE];
    const api = mockApi((call) => {
      lastCalls.push(call);
      if (call.path === STRUCTURES_PATH)
        return Response.json({ items: structures });
      if (call.path.endsWith("/delete")) {
        const response = deleteResponse();
        if (response.ok)
          structures = structures.filter(
            (item) => !call.path.includes(item.id),
          );
        return response;
      }
      return undefined;
    });
    return () => {
      api.restore();
      deleteResponse = () => new Response(null, { status: 204 });
    };
  },
  render: () => (
    <StoryQueries>
      <SalaryStructuresList />
    </StoryQueries>
  ),
} satisfies Meta<typeof SalaryStructuresList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  beforeEach() {
    structures = [];
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No salary structures yet"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add salary structure" }),
    ).toHaveAttribute(
      "href",
      "/app/workspace/hrms/configuration/salary-structures/new",
    );
  },
};

export const ListsStructures: Story = {
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Salary structures" }),
    );
    await expect(list.getByRole("link", { name: "Site staff" })).toBeVisible();
    await expect(
      list.getByText(
        "Basic 50% · Conveyance ₹1,600.00 · Special Allowance (balance)",
      ),
    ).toBeVisible();
    await expect(list.getByText("2 members")).toBeVisible();
    await expect(list.getByText("Inactive")).toBeVisible();
    await expect(list.getByText("No members yet")).toBeVisible();
  },
};

export const RefusesDeletingAStructureInUse: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    deleteResponse = () =>
      Response.json(
        {
          code: "SALARY_STRUCTURE_IN_USE",
          message:
            "Site staff is the salary structure of 2 members. Move them to another structure first.",
          details: { members: 2 },
        },
        { status: 409 },
      );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Site staff" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Move them to another structure first",
    );
    await expect(
      lastCalls.find((call) => call.path.endsWith("/delete"))?.body,
    ).toEqual({ expectedUpdatedAt: SITE_STAFF.updatedAt });
  },
};

export const DeletesAFreeStructure: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Office" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "Office" })).toBeNull(),
    );
  },
};
