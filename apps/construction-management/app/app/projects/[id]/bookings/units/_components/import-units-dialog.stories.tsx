import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import { ImportUnitsDialog } from "./import-units-dialog";
import {
  mockUnitsApi,
  SALES_PROJECT_ID,
  UNITS_API,
  type UnitsApiOptions,
} from "./units-fixtures";

let api: ReturnType<typeof mockUnitsApi>;
function unitsApi(options: UnitsApiOptions = {}) {
  return () => {
    api = mockUnitsApi(options);
    return api.restore;
  };
}

const XLSX_FILE = () =>
  new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "units.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const meta = {
  title: "Sales/Units/Import dialog",
  component: ImportUnitsDialog,
  args: { projectId: SALES_PROJECT_ID, open: true, onClose: fn() },
  beforeEach: unitsApi(),
  render: (args) => (
    <StoryQueries>
      <ImportUnitsDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ImportUnitsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The sample link and a successful upload. */
export const Imported: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample" }),
    ).toHaveAttribute(
      "href",
      `${UNITS_API}/import-sample?projectId=${SALES_PROJECT_ID}`,
    );
    await userEvent.upload(
      dialog.getByLabelText("Choose Excel file"),
      XLSX_FILE(),
    );
    await expect(await dialog.findByText("8 units updated.")).toBeVisible();
    await expect(
      api.calls.mock.calls.some(
        ([call]) =>
          call.method === "POST" &&
          call.path.startsWith(`${UNITS_API}/import?`),
      ),
    ).toBe(true);
  },
};

/** Problems are listed by row and column; nothing was saved. */
export const RowErrors: Story = {
  beforeEach: unitsApi({
    importErrors: [
      {
        row: 3,
        field: "Wing*",
        message: "No Wing of this Project is named “Tower Z”.",
      },
      { row: 6, field: "Carpet area", message: "An area must be more than 0." },
    ],
  }),
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.upload(
      dialog.getByLabelText("Choose Excel file"),
      XLSX_FILE(),
    );
    const problems = within(
      await dialog.findByRole("list", { name: "Problems in the sheet" }),
    );
    await expect(problems.getAllByRole("listitem")).toHaveLength(2);
    await expect(problems.getByText("Row 3")).toBeVisible();
    await expect(dialog.getByText(/nothing was saved/)).toBeVisible();
  },
};
