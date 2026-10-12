import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { chooseFromMenu } from "@/components/masters/masters-story-support";
import { PaymentCategoriesList } from "./payment-categories-list";
import {
  financeAccessHandler,
  paymentCategoriesHandler,
} from "./payment-category-fixtures";

let api: ReturnType<typeof mockApi>;

function serve(
  options: Parameters<typeof paymentCategoriesHandler>[0] = {},
  access = financeAccessHandler(),
) {
  return () => {
    const categories = paymentCategoriesHandler(options);
    api = mockApi((call) => access(call) ?? categories(call));
    return api.restore;
  };
}

function posted(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(path));
}

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.textContent.startsWith(name));
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

const meta = {
  title: "Finance/Payment Categories/List",
  component: PaymentCategoriesList,
  parameters: { layout: "fullscreen" },
  render: () => (
    <StoryQueries>
      <PaymentCategoriesList />
    </StoryQueries>
  ),
} satisfies Meta<typeof PaymentCategoriesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Defaults, a disabled seed, and categories in use. */
export const WithCategories: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", {
      name: "Payment Categories",
    });
    await expect(
      within(rowNamed(list, "Fuel")).getByText("Default"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Marketing and Advertising")).getByText("Disabled"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Cement testing")).getByText("In use"),
    ).toBeVisible();

    await userEvent.type(
      canvas.getByLabelText("Search Payment Categories"),
      "fu",
    );
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(canvas.getByLabelText("Search Payment Categories"));

    // A Default category is renamed and disabled, never deleted.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Fuel" }),
    );
    const disable = await body.findByRole("menuitem", { name: "Disable" });
    await waitFor(() => expect(disable).toBeVisible());
    await expect(body.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.click(disable);
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await waitFor(() =>
      expect(
        within(rowNamed(list, "Fuel")).getByText("Disabled"),
      ).toBeVisible(),
    );
    await expect(posted("/disable")).toHaveLength(1);
  },
};

/** Rename a Default category; a taken name shows under the field. */
export const Rename: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", {
      name: "Payment Categories",
    });
    await chooseFromMenu(canvasElement, userEvent, "Fuel", "Rename");
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename Fuel" }),
    );
    const name = dialog.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "conveyance");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(
        "A Payment Category with this name already exists.",
      ),
    ).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "Fuel & diesel");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Rename Fuel" })).toBeNull(),
    );
    await expect(await within(list).findByText("Fuel & diesel")).toBeVisible();
    await expect(posted("/update").at(-1)?.body).toMatchObject({
      name: "Fuel & diesel",
      expectedUpdatedAt: "2026-10-08T06:30:00.000Z",
    });
  },
};

/** Add a category: empty is refused on the spot. */
export const Add: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Payment Categories" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Payment Category" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Payment Category" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await dialog.findByText("Enter the category's name"),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Name"), "Security");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(await canvas.findByText("Security")).toBeVisible();
  },
};

/** An unused category is deleted after asking; one in use offers no Delete. */
export const Delete: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", {
      name: "Payment Categories",
    });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Cement testing" }),
    );
    await body.findByRole("menuitem", { name: "Disable" });
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());

    await chooseFromMenu(canvasElement, userEvent, "Drinking water", "Delete");
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Drinking water?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(within(list).queryByText("Drinking water")).toBeNull(),
    );
  },
};

/** The server refuses a delete (someone used it meanwhile): the reason shows. */
export const DeleteRefused: Story = {
  beforeEach: serve({
    initial: [
      {
        id: "0199a1b2-0000-7000-8000-000000000799",
        name: "Drinking water",
        isSeed: false,
        disabled: false,
        inUse: false,
        createdAt: "2026-10-08T06:30:00.000Z",
        updatedAt: "2026-10-08T06:30:00.000Z",
      },
    ],
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Payment Categories" });
    api.restore();
    const access = financeAccessHandler();
    api = mockApi(
      (call) =>
        access(call) ??
        (call.method === "POST" && call.path.endsWith("/delete")
          ? Response.json(
              {
                code: "PAYMENT_CATEGORY_IN_USE",
                message:
                  "Payments, vouchers or expenses use this Payment Category, so it cannot be deleted. Disable it instead.",
              },
              { status: 409 },
            )
          : paymentCategoriesHandler()(call)),
    );
    await chooseFromMenu(canvasElement, userEvent, "Drinking water", "Delete");
    const confirm = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog", {
        name: "Delete Drinking water?",
      }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(
      await confirm.findByText(
        "Payments, vouchers or expenses use this Payment Category, so it cannot be deleted. Disable it instead.",
      ),
    ).toBeVisible();
  },
};

/** Read only: no Add and no row actions. */
export const ReadOnly: Story = {
  beforeEach: serve(
    {},
    financeAccessHandler({ "masters.payment_categories": ["read"] }),
  ),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Payment Categories" });
    await expect(
      canvas.queryByRole("button", { name: "Add Payment Category" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for/ }),
    ).toBeNull();
  },
};

/** A Company without categories: the empty state offers Add. */
export const Empty: Story = {
  beforeEach: serve({ initial: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Payment Categories yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Payment Category" }),
    ).toHaveLength(2);
  },
};

/** Mobile: rows wrap without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: serve(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Payment Categories" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
