import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import { ImportInquiriesDialog } from "./import-inquiries-dialog";
import {
  INQUIRIES_API,
  INQUIRY_PROJECT_ID,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";

let api: ReturnType<typeof mockInquiryApi>;

function uploads(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "POST" &&
        call.path.startsWith(`${INQUIRIES_API}/import`),
    );
}

function serve(options: InquiryApiOptions = {}) {
  return () => {
    api = mockInquiryApi(options);
    return api.restore;
  };
}

function sheet(name = "Leads.xlsx") {
  return new File(["PK"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const meta = {
  title: "Sales/Inquiries/Import dialog",
  component: ImportInquiriesDialog,
  args: { projectId: INQUIRY_PROJECT_ID, open: true, onClose: fn() },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <ImportInquiriesDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ImportInquiriesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The sample link, Import duplicates too, then the count imported. */
export const Imported: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import inquiries" }),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample" }),
    ).toHaveAttribute(
      "href",
      `${INQUIRIES_API}/import-sample?projectId=${INQUIRY_PROJECT_ID}`,
    );
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Import duplicates too/ }),
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await expect(
      await dialog.findByText("12 inquiries imported."),
    ).toBeVisible();
    await waitFor(() =>
      expect(uploads()[0]?.path).toContain("allowDuplicates=true"),
    );
  },
};

/** Row problems are listed by row and column; a wrong file type never uploads. */
export const RowErrors: Story = {
  beforeEach: serve({
    importErrors: [
      { row: 3, field: "Mobile", message: "Row 2 has the same mobile." },
      {
        row: 5,
        field: "Lead Source",
        message: "No Lead Source of this Project is named “Newspaper”.",
      },
    ],
  }),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import inquiries" }),
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    const problems = within(
      await dialog.findByRole("list", { name: "Problems in the sheet" }),
    );
    await expect(problems.getAllByRole("listitem")).toHaveLength(2);
    await expect(problems.getByText("Row 5")).toBeVisible();
    await expect(problems.getByText(/named “Newspaper”/)).toBeVisible();
    // A file that is not .xlsx never goes up.
    await fireEvent.change(dialog.getByLabelText("Choose Excel file"), {
      target: { files: [sheet("leads.csv")] },
    });
    await expect(
      await dialog.findByText("Choose the Excel (.xlsx) sample sheet."),
    ).toBeVisible();
    await expect(uploads()).toHaveLength(1);
  },
};
