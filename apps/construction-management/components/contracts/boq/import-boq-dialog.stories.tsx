import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { PROJECT } from "./boq-fixtures";
import { BOQ_API } from "./boq-stories-api";
import { ImportBoqDialog } from "./import-boq-dialog";

function serve(respond: () => Response) {
  return () =>
    mockApi((call) =>
      call.method === "POST" &&
      call.path === `${BOQ_API}/import?projectId=${PROJECT}`
        ? respond()
        : undefined,
    ).restore;
}

const sheet = () =>
  new File(["PK\u0003\u0004 not really a workbook"], "boq.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const meta = {
  title: "Contracts/BOQ/Import dialog",
  component: ImportBoqDialog,
  args: { projectId: PROJECT, open: true, onClose: fn() },
  render: (args) => (
    <StoryQueries>
      <ImportBoqDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ImportBoqDialog>;

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
            {
              row: 3,
              column: "Section",
              message: "Enter the section's title.",
            },
            {
              row: 4,
              column: "Quantity",
              message:
                "A checked measurement names this item, so its quantity changes only through a Variation.",
            },
            {
              row: 5,
              column: "Item no",
              message: "This item number is also on row 2.",
            },
          ],
        },
      },
      { status: 400 },
    ),
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import BOQ" }),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample" }),
    ).toHaveAttribute("href", `${BOQ_API}/sample?projectId=${PROJECT}`);
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await expect(
      await dialog.findByText(/The sheet has 3 problems/),
    ).toBeVisible();
    const table = dialog.getByRole("table", { name: "Problems in the sheet" });
    const rows = within(table).getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(3);
    await expect(rows[1]).toHaveTextContent(/4QuantityA checked measurement/);
    await expect(dialog.queryByRole("button", { name: "Done" })).toBeNull();
  },
};

/** A clean sheet: how many sections and items were added and updated. */
export const Imported: Story = {
  beforeEach: serve(() =>
    Response.json({
      sectionsCreated: 2,
      created: 14,
      updated: 3,
      unchanged: 1,
    }),
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import BOQ" }),
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await expect(
      await dialog.findByText(
        "2 sections added, 14 items added, 3 updated, 1 unchanged.",
      ),
    ).toBeVisible();
  },
};
