import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { BillingAddressItem } from "@/src/queries/billing-addresses";
import { gstStateName } from "@/src/shared-kernel/gst-states";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { BillingAddressesManager } from "./billing-addresses-manager";

const BASE = "/api/construction/organization/settings/billing-addresses";
const HEAD_ID = "0199c0de-0000-7000-8000-0000000000a1";
const BRANCH_ID = "0199c0de-0000-7000-8000-0000000000a2";
const NEW_ID = "0199c0de-0000-7000-8000-0000000000b1";

function address(overrides: Partial<BillingAddressItem>): BillingAddressItem {
  return {
    id: HEAD_ID,
    name: "Head office",
    address: "12, Anna Salai\nChennai 600002",
    stateCode: "33",
    stateName: "Tamil Nadu",
    gstin: "33AAPFA0939F1ZM",
    isDefault: true,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

const HEAD = address({});
const BRANCH = address({
  id: BRANCH_ID,
  name: "Bengaluru branch",
  address: "4th Cross, Indiranagar, Bengaluru 560038",
  stateCode: "29",
  stateName: "Karnataka",
  gstin: null,
  isDefault: false,
});

let addresses: BillingAddressItem[] = [];
let calls: ApiCall[] = [];
let createResponse: ((body: unknown) => Response) | null = null;

function writes(): ApiCall[] {
  return calls.filter((call) => call.method === "POST");
}

function sorted(items: BillingAddressItem[]): BillingAddressItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
  );
}

const meta = {
  title: "Settings/BillingAddressesManager",
  component: BillingAddressesManager,
  beforeEach() {
    addresses = [];
    calls = [];
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path === BASE)
        return Response.json({
          items: sorted(addresses),
          total: addresses.length,
        });
      if (call.method === "POST" && call.path === BASE) {
        if (createResponse != null) return createResponse(call.body);
        const sent = call.body as Partial<BillingAddressItem>;
        const created = address({
          ...sent,
          id: NEW_ID,
          stateName: gstStateName(sent.stateCode ?? "") ?? "",
          isDefault: addresses.length === 0,
        });
        addresses = [...addresses, created];
        return Response.json(created, { status: 201 });
      }
      const id = call.path.split("/").at(-2) ?? "";
      if (call.path.endsWith("/update")) {
        const sent = call.body as Partial<BillingAddressItem>;
        addresses = addresses.map((item) =>
          item.id === id
            ? {
                ...item,
                ...sent,
                stateName: gstStateName(sent.stateCode ?? "") ?? "",
                updatedAt: "2026-10-08T10:00:00.000Z",
              }
            : item,
        );
        return Response.json(addresses.find((item) => item.id === id));
      }
      if (call.path.endsWith("/make-default")) {
        addresses = addresses.map((item) => ({
          ...item,
          isDefault: item.id === id,
        }));
        return Response.json(addresses.find((item) => item.id === id));
      }
      if (call.path.endsWith("/delete")) {
        const wasDefault = addresses.find((item) => item.id === id)?.isDefault;
        addresses = addresses.filter((item) => item.id !== id);
        const [oldest] = addresses;
        if (wasDefault === true && oldest != null) oldest.isDefault = true;
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    return () => {
      api.restore();
      createResponse = null;
    };
  },
  render: () => (
    <StoryQueries>
      <BillingAddressesManager />
    </StoryQueries>
  ),
} satisfies Meta<typeof BillingAddressesManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyState: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("No billing addresses yet"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add billing address" }),
    );
    await expect(
      await body.findByRole("dialog", { name: "Add billing address" }),
    ).toBeVisible();
  },
};

export const ListsTheDefaultFirst: Story = {
  beforeEach() {
    addresses = [BRANCH, HEAD];
  },
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "Billing addresses" });
    const [head, branch, ...rest] = within(list).getAllByRole("listitem");
    if (head == null || branch == null) throw new Error("Two rows expected");
    await expect(rest).toHaveLength(0);
    await expect(head).toHaveAccessibleName("Head office");
    await expect(within(head).getByText("Default")).toBeVisible();
    await expect(within(head).getByText("33AAPFA0939F1ZM")).toBeVisible();
    await expect(
      within(branch).getByText(/Karnataka \(29\) · No GSTIN/),
    ).toBeVisible();
    await expect(within(branch).queryByText("Default")).toBeNull();
  },
};

export const AddsAnAddressWithStateFromGstin: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add billing address" }),
    );
    const dialog = within(await body.findByRole("dialog"));

    // Empty form: every required field says what it needs.
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }));
    await expect(
      await dialog.findByText("Enter a name for this billing address"),
    ).toBeVisible();
    await expect(dialog.getByText("Enter the address")).toBeVisible();
    await expect(dialog.getByText("Choose the GST state")).toBeVisible();

    await userEvent.type(dialog.getByLabelText("Name"), "Head office");
    await userEvent.type(
      dialog.getByLabelText("Address"),
      "12, Anna Salai, Chennai 600002",
    );
    await userEvent.type(
      dialog.getByLabelText("GSTIN (optional)"),
      "33aapfa0939f1zm",
    );
    // The GSTIN's first two digits pick the state.
    await expect(dialog.getByLabelText("GST state")).toHaveTextContent(
      "Tamil Nadu (33)",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    await expect(writes()[0]?.body).toEqual({
      name: "Head office",
      address: "12, Anna Salai, Chennai 600002",
      stateCode: "33",
      gstin: "33AAPFA0939F1ZM",
    });
    const list = await canvas.findByRole("list", { name: "Billing addresses" });
    await expect(within(list).getByText("Default")).toBeVisible();
  },
};

export const RefusesAGstinOfAnotherState: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add billing address" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Name"), "Pune site");
    await userEvent.type(dialog.getByLabelText("Address"), "Baner, Pune");
    await userEvent.type(
      dialog.getByLabelText("GSTIN (optional)"),
      "33AAPFA0939F1ZM",
    );
    await userEvent.click(dialog.getByLabelText("GST state"));
    await userEvent.click(
      await body.findByRole("option", { name: "Maharashtra (27)" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }));
    await expect(
      await dialog.findByText("A GSTIN of Maharashtra starts with 27"),
    ).toBeVisible();
    await expect(writes()).toHaveLength(0);
  },
};

export const EditsAnAddress: Story = {
  beforeEach() {
    addresses = [HEAD, BRANCH];
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Actions for Bengaluru branch",
      }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit billing address" }),
    );
    await expect(dialog.getByLabelText("Name")).toHaveValue("Bengaluru branch");
    await expect(dialog.getByLabelText("GST state")).toHaveTextContent(
      "Karnataka (29)",
    );
    const name = dialog.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Bengaluru office");
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await expect(writes()[0]?.path).toBe(`${BASE}/${BRANCH_ID}/update`);
    await expect(writes()[0]?.body).toEqual({
      name: "Bengaluru office",
      address: BRANCH.address,
      stateCode: "29",
      gstin: null,
      expectedUpdatedAt: BRANCH.updatedAt,
    });
    await expect(await canvas.findByText("Bengaluru office")).toBeVisible();
  },
};

export const MakesAnotherAddressTheDefault: Story = {
  beforeEach() {
    addresses = [HEAD, BRANCH];
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Head office" }),
    );
    // The default has no "Make default".
    await expect(
      await body.findByRole("menuitem", { name: "Edit" }),
    ).toBeVisible();
    await expect(
      body.queryByRole("menuitem", { name: "Make default" }),
    ).toBeNull();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Bengaluru branch" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Make default" }),
    );
    await waitFor(() =>
      expect(writes()[0]?.path).toBe(`${BASE}/${BRANCH_ID}/make-default`),
    );
    await waitFor(async () => {
      const rows = within(
        canvas.getByRole("list", { name: "Billing addresses" }),
      ).getAllByRole("listitem");
      await expect(rows[0]).toHaveAccessibleName("Bengaluru branch");
    });
  },
};

export const DeletesAfterConfirming: Story = {
  beforeEach() {
    addresses = [HEAD, BRANCH];
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Head office" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await expect(
      confirm.getByText(/The oldest remaining address becomes the default/),
    ).toBeVisible();
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(writes()[0]?.path).toBe(`${BASE}/${HEAD_ID}/delete`),
    );
    await waitFor(() => expect(canvas.queryByText("Head office")).toBeNull());
    await expect(canvas.getByText("Default")).toBeVisible();
  },
};

export const ShowsANameInUseUnderTheName: Story = {
  beforeEach() {
    addresses = [HEAD];
    createResponse = () =>
      Response.json(
        {
          code: "BILLING_ADDRESS_NAME_IN_USE",
          message: "Another billing address already has this name.",
        },
        { status: 409 },
      );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add billing address" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Name"), "head office");
    await userEvent.type(dialog.getByLabelText("Address"), "Anna Nagar");
    await userEvent.click(dialog.getByLabelText("GST state"));
    await userEvent.click(
      await body.findByRole("option", { name: "Tamil Nadu (33)" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save address" }));
    await expect(
      await dialog.findByText("Another billing address already has this name."),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};
