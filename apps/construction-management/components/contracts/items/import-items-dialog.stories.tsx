import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { ImportItemsDialog } from "./import-items-dialog";

const API = "/api/construction/contracts/items";

let api: ReturnType<typeof mockApi>;

function serve(respond: () => Response) {
  return () => {
    api = mockApi((call) =>
      call.method === "POST" && call.path === `${API}/import`
        ? respond()
        : undefined,
    );
    return api.restore;
  };
}

const sheet = () =>
  new File(["PK\u0003\u0004 not really a workbook"], "items.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const meta = {
  title: "Masters/Item Library/Import dialog",
  component: ImportItemsDialog,
  args: { open: true, onClose: fn() },
  render: (args) => (
    <StoryQueries>
      <ImportItemsDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ImportItemsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A sheet with problems: nothing is saved and every problem is listed by row and column. */
export const WithErrors: Story = {
  beforeEach: serve(() =>
    Response.json(
      {
        code: "IMPORT_HAS_ERRORS",
        message:
          "The sheet has 3 problems. Fix them and upload it again; nothing was saved.",
        details: {
          errors: [
            { row: 3, column: "Code", message: "Enter the Item's code." },
            {
              row: 3,
              column: "UoM",
              message:
                "No Measurement Unit is named “furlong”. Add it in Master records → Measurement Units, or use one of yours.",
            },
            { row: 4, column: "Code", message: "This code is also on row 2." },
          ],
        },
      },
      { status: 400 },
    ),
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import Items" }),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample" }),
    ).toHaveAttribute("href", `${API}/sample`);
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await expect(
      await dialog.findByText(/The sheet has 3 problems/),
    ).toBeVisible();
    const table = dialog.getByRole("table", { name: "Problems in the sheet" });
    const rows = within(table).getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(3);
    await expect(rows[1]).toHaveTextContent(/3UoMNo Measurement Unit/);
    await expect(rows[2]).toHaveTextContent("4CodeThis code is also on row 2.");
    // Nothing was saved: the footer still says Close, not Done.
    await expect(dialog.queryByRole("button", { name: "Done" })).toBeNull();
  },
};

/** A clean sheet: how many Items were added and updated. */
export const Imported: Story = {
  beforeEach: serve(() =>
    Response.json({ created: 12, updated: 3, unchanged: 1 }),
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import Items" }),
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await expect(
      await dialog.findByText("12 added, 3 updated, 1 unchanged."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  },
};
