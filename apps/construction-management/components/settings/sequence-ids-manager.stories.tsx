import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { SequenceRuleItem } from "@/src/queries/settings";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { SequenceIdsManager } from "./sequence-ids-manager";

const BASE = "/api/construction/organization/settings/sequence-rules";

function rule(overrides: Partial<SequenceRuleItem>): SequenceRuleItem {
  return {
    id: "0199c0de-0000-7000-8000-0000000000a1",
    module: "purchase_request",
    scope: "workspace",
    projectId: null,
    isDefault: true,
    prefix: "PR",
    projectToken: "",
    startNumber: 1,
    padding: 5,
    separator: "/",
    fiscalYearToken: true,
    issued: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

let rules: SequenceRuleItem[] = [];
let projects: { id: string; name: string; status: string }[] = [];
const SHANTI = {
  id: "0199c0de-0000-7000-8000-0000000000c1",
  name: "Shanti Heights",
  status: "ongoing",
};
let calls: ApiCall[] = [];
let deleteResponse: () => Response = () => new Response(null, { status: 204 });

function writes(): ApiCall[] {
  return calls.filter((call) => call.method === "POST");
}

const meta = {
  title: "Settings/SequenceIdsManager",
  component: SequenceIdsManager,
  args: { today: "2026-10-08" },
  beforeEach() {
    rules = [];
    projects = [];
    calls = [];
    const api = mockApi((call) => {
      calls.push(call);
      if (
        call.method === "GET" &&
        call.path === "/api/construction/projects/projects/options"
      )
        return Response.json({ items: projects });
      if (call.method === "GET" && call.path === BASE)
        return Response.json({ items: rules, total: rules.length });
      if (call.method === "POST" && call.path === BASE) {
        const sent = call.body as Partial<SequenceRuleItem>;
        const created = rule({
          ...sent,
          id: "0199c0de-0000-7000-8000-0000000000b2",
          isDefault: sent.projectId == null,
          scope: sent.projectId == null ? "workspace" : "project",
        });
        rules = [...rules, created];
        return Response.json(created, { status: 201 });
      }
      if (call.path.endsWith("/update")) {
        const body = call.body as Partial<SequenceRuleItem>;
        rules = rules.map((item) =>
          call.path.includes(item.id)
            ? { ...item, ...body, updatedAt: "2026-10-08T10:00:00.000Z" }
            : item,
        );
        return Response.json(rules[0]);
      }
      if (call.path.endsWith("/delete")) return deleteResponse();
      return undefined;
    });
    return () => {
      api.restore();
      deleteResponse = () => new Response(null, { status: 204 });
    };
  },
  render: (args) => (
    <StoryQueries>
      <SequenceIdsManager {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof SequenceIdsManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyModuleAddsADefaultRule: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("No rule for Purchase Request (PR)"),
    ).toBeVisible();
    await expect(canvas.getByText("PR/26-27/00001")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Add rule" }));
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByLabelText("Project")).toHaveTextContent(
      "All projects (default)",
    );
    await expect(dialog.getByLabelText("Preview")).toHaveTextContent(
      "PR/26-27/00001",
    );
    await userEvent.type(dialog.getByLabelText("Project token"), "HO");
    const start = dialog.getByLabelText("Start number");
    await userEvent.clear(start);
    await userEvent.type(start, "42");
    await expect(dialog.getByLabelText("Preview")).toHaveTextContent(
      "PR/26-27/HO/00042",
    );
    // Without the fiscal year the number never restarts.
    await userEvent.click(
      dialog.getByRole("switch", { name: /Add the fiscal year/ }),
    );
    await expect(dialog.getByLabelText("Preview")).toHaveTextContent(
      "PR/HO/00042",
    );
    await userEvent.click(
      dialog.getByRole("switch", { name: /Add the fiscal year/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save rule" }));

    await expect(await canvas.findByText("PR/26-27/HO/00042")).toBeVisible();
    await expect(writes()[0]?.body).toEqual({
      module: "purchase_request",
      projectId: null,
      prefix: "PR",
      projectToken: "HO",
      startNumber: 42,
      padding: 5,
      separator: "/",
      fiscalYearToken: true,
    });
    // One default per module, and no Projects to give their own rule.
    await expect(
      canvas.getByRole("button", { name: "Add rule" }),
    ).toBeDisabled();
  },
};

export const EditsARuleWithLivePreview: Story = {
  beforeEach() {
    rules = [rule({ module: "goods_receipt", prefix: "GRN", issued: true })];
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByLabelText("Module"));
    await userEvent.click(
      await body.findByRole("option", { name: "Goods Receipt Note (GRN)" }),
    );
    await expect(await canvas.findByText("GRN/26-27/00001")).toBeVisible();
    await expect(canvas.getByText("In use")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Delete" })).toBeDisabled();

    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByLabelText("Separator"));
    await userEvent.click(
      await body.findByRole("option", { name: "- (hyphen)" }),
    );
    const digits = dialog.getByLabelText("Digits");
    await userEvent.clear(digits);
    await userEvent.type(digits, "3");
    await expect(dialog.getByLabelText("Preview")).toHaveTextContent(
      "GRN-26-27-001",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await expect(writes()[0]?.body).toMatchObject({
      separator: "-",
      padding: 3,
      expectedUpdatedAt: "2026-10-01T10:00:00.000Z",
    });
  },
};

export const RejectsAnInvalidPrefix: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add rule" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const prefix = dialog.getByLabelText("Prefix");
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "PR 26");
    await userEvent.click(dialog.getByRole("button", { name: "Save rule" }));
    await expect(
      await dialog.findByText(/Use up to 20 letters, digits/),
    ).toBeVisible();
    await expect(writes()).toHaveLength(0);
  },
};

export const DeletesAnUnusedRule: Story = {
  beforeEach() {
    rules = [rule({})];
    deleteResponse = () => {
      rules = [];
      return new Response(null, { status: 204 });
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(
      await canvas.findByText("No rule for Purchase Request (PR)"),
    ).toBeVisible();
    await expect(writes()[0]?.path).toBe(
      `${BASE}/0199c0de-0000-7000-8000-0000000000a1/delete`,
    );
  },
};

export const AddsARuleForOneProject: Story = {
  beforeEach() {
    rules = [rule({})];
    projects = [SHANTI];
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("All projects (default)"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add rule" }));
    const dialog = within(await body.findByRole("dialog"));
    // The default exists, so the new rule is for a Project.
    await expect(dialog.getByLabelText("Project")).toHaveTextContent(
      "Shanti Heights",
    );
    await userEvent.type(dialog.getByLabelText("Project token"), "SH");
    await userEvent.click(dialog.getByRole("button", { name: "Save rule" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await expect(writes()[0]?.body).toMatchObject({
      module: "purchase_request",
      projectId: SHANTI.id,
      projectToken: "SH",
    });
    // The rule shows the Project's name; every Project now has a rule.
    await expect(await canvas.findByText("Shanti Heights")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add rule" }),
    ).toBeDisabled();
  },
};
