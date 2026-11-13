import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { mockApi, StoryQueries } from "@/.storybook/mocks/api";
import type { ProspectCompanyImportResult } from "@/src/queries/marketing-companies";

import { ImportCompaniesDialog } from "./import-dialog";

const IMPORT = "/api/construction/marketing/companies/import";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ALL_ADDED: ProspectCompanyImportResult = {
  created: 2,
  duplicates: 0,
  invalid: 0,
  companies: [
    {
      row: 2,
      id: "0198f0a0-0000-7000-8000-000000000001",
      name: "Kaveri Steel",
    },
    {
      row: 3,
      id: "0198f0a0-0000-7000-8000-000000000002",
      name: "Pandian Mills",
    },
  ],
  problems: [],
};

const SOME_NOT_ADDED: ProspectCompanyImportResult = {
  created: 1,
  duplicates: 2,
  invalid: 2,
  companies: [
    {
      row: 2,
      id: "0198f0a0-0000-7000-8000-000000000001",
      name: "Kaveri Steel",
    },
  ],
  problems: [
    {
      row: 3,
      name: "Sri Balaji Builders",
      reason: "duplicate",
      field: null,
      message: "A Prospect Company with this name already exists.",
    },
    {
      row: 4,
      name: "KAVERI steel",
      reason: "duplicate",
      field: null,
      message: "Row 2 has the same name.",
    },
    {
      row: 5,
      name: "Pandian Mills",
      reason: "invalid",
      field: "phone",
      message:
        "Enter a phone number: digits, with spaces or dashes if you like.",
    },
    {
      row: 6,
      name: null,
      reason: "invalid",
      field: "name",
      message: "Enter the company's name.",
    },
  ],
};

let api: ReturnType<typeof mockApi>;

function serve(result: ProspectCompanyImportResult) {
  return () => {
    api = mockApi((call) =>
      call.method === "POST" && call.path === IMPORT
        ? Response.json(result)
        : undefined,
    );
    return api.restore;
  };
}

const sheet = () =>
  new File(["PK\u0003\u0004 not really a workbook"], "companies.xlsx", {
    type: XLSX,
  });

const meta = {
  title: "Marketing/Prospect Companies/Import dialog",
  component: ImportCompaniesDialog,
  args: { open: true, onOpenChange: fn() },
  beforeEach: serve(ALL_ADDED),
  render: (args) => (
    <StoryQueries>
      <ImportCompaniesDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ImportCompaniesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openDialog(canvasElement: HTMLElement) {
  const body = within(canvasElement.ownerDocument.body);
  return within(
    await body.findByRole("dialog", { name: "Import Prospect Companies" }),
  );
}

export const AddsEveryRow: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await openDialog(canvasElement);
    await expect(
      dialog.getByRole("link", { name: "Download template" }),
    ).toHaveAttribute(
      "href",
      "/api/construction/marketing/companies/import-template",
    );
    const importButton = dialog.getByRole("button", { name: "Import" });
    await expect(importButton).toBeDisabled();

    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await expect(dialog.getByText("companies.xlsx")).toBeVisible();
    await userEvent.click(importButton);

    await expect(
      await dialog.findByText("Added 2 Prospect Companies."),
    ).toBeVisible();
    await expect(dialog.queryByRole("table")).toBeNull();
    await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
    await expect(
      api.calls.mock.calls.map(([call]) => `${call.method} ${call.path}`),
    ).toEqual([`POST ${IMPORT}`]);
  },
};

export const ReportsDuplicatesAndErrors: Story = {
  beforeEach: serve(SOME_NOT_ADDED),
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await openDialog(canvasElement);
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await userEvent.click(dialog.getByRole("button", { name: "Import" }));

    await expect(
      await dialog.findByText(
        "Added 1 Prospect Company. 2 duplicates and 2 rows with errors not added.",
      ),
    ).toBeVisible();
    const table = dialog.getByRole("table", { name: "Rows not imported" });
    const rows = within(table).getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(4);
    const [live, repeated, phone, unnamed] = rows;
    if (live == null || repeated == null || phone == null || unnamed == null)
      throw new Error("Rows missing");
    await expect(live).toHaveTextContent("Sri Balaji Builders");
    await expect(live).toHaveTextContent("Duplicate");
    await expect(repeated).toHaveTextContent("Row 2 has the same name.");
    await expect(phone).toHaveTextContent("Error");
    await expect(phone).toHaveTextContent("Enter a phone number");
    await expect(unnamed).toHaveTextContent("Enter the company's name.");
  },
};

export const RefusesOtherFiles: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await openDialog(canvasElement);
    const picker = dialog.getByLabelText("Choose Excel file");
    // An Excel type, but not the .xlsx sheet.
    await userEvent.upload(
      picker,
      new File(["Name,City"], "companies.csv", { type: XLSX }),
    );
    await expect(
      await dialog.findByText("Choose the Excel (.xlsx) template."),
    ).toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();

    await userEvent.upload(
      picker,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.xlsx", {
        type: XLSX,
      }),
    );
    await expect(
      await dialog.findByText("The file must be at most 5 MB."),
    ).toBeInTheDocument();
    await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
    await expect(api.calls).not.toHaveBeenCalled();
  },
};

/** The reported rows at phone width: the dialog fits without scrolling sideways. */
export const PhoneWidth: Story = {
  beforeEach: serve(SOME_NOT_ADDED),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await openDialog(canvasElement);
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await userEvent.click(dialog.getByRole("button", { name: "Import" }));
    const table = await dialog.findByRole("table", {
      name: "Rows not imported",
    });
    await expect(table).toBeVisible();
    const element =
      canvasElement.ownerDocument.body.querySelector('[role="dialog"]');
    if (element == null) throw new Error("No dialog");
    await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
  },
};
