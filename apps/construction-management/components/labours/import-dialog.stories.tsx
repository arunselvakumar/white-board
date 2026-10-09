import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import { ImportDialog } from "./import-dialog";
import { PREVIEW_VALID, PREVIEW_WITH_ERRORS } from "./labour-fixtures";

const IMPORT = "/api/construction/labour/labours/import";

let api: ReturnType<typeof mockFetch>;

/** Answers the first upload (the dry run) and then the import. */
function serve(responses: (() => Response)[]) {
  return () => {
    let call = 0;
    api = mockFetch([
      {
        method: "POST",
        path: IMPORT,
        respond: () => {
          const respond = responses[Math.min(call, responses.length - 1)];
          call += 1;
          return respond?.() ?? Response.json({}, { status: 500 });
        },
      },
    ]);
    return api.restore;
  };
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function uploadedUrls(): string[] {
  return api.spy.mock.calls.map(([input]) => urlOf(input));
}

const sheet = () =>
  new File(["PK\u0003\u0004 not really a workbook"], "labours.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const meta = {
  title: "Masters/Labours/Import dialog",
  component: ImportDialog,
  args: { open: true, onOpenChange: fn() },
  render: (args) => (
    <StoryQueryClient>
      <ImportDialog {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof ImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreviewWithErrors: Story = {
  beforeEach: serve([() => Response.json(PREVIEW_WITH_ERRORS)]),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import Labours" }),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample sheet" }),
    ).toHaveAttribute(
      "href",
      "/api/construction/labour/labours/import-template",
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());

    const table = await dialog.findByRole("table", { name: "Import preview" });
    const rows = within(table).getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(2);
    const [ready, broken] = rows;
    if (ready == null || broken == null) throw new Error("Rows missing");
    await expect(within(ready).getByText("Ready")).toBeVisible();
    await expect(
      within(broken).getByText('No Project is called "Nowhere".'),
    ).toBeVisible();
    await expect(dialog.getByText("1 ready · 1 with errors")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Import 1 Labour" }),
    ).toBeDisabled();
    await expect(uploadedUrls()).toEqual([`${IMPORT}?dryRun=true`]);
  },
};

export const ImportsWhenEveryRowIsValid: Story = {
  beforeEach: serve([
    () => Response.json(PREVIEW_VALID),
    () => Response.json({ ...PREVIEW_VALID, imported: 2 }, { status: 201 }),
  ]),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import Labours" }),
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    const importButton = await dialog.findByRole("button", {
      name: "Import 2 Labours",
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    await userEvent.click(importButton);
    await expect(await dialog.findByText("Imported 2 Labours.")).toBeVisible();
    await expect(uploadedUrls()).toEqual([
      `${IMPORT}?dryRun=true`,
      `${IMPORT}?dryRun=false`,
    ]);
    await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  },
};

export const RefusesOtherFiles: Story = {
  beforeEach: serve([() => Response.json(PREVIEW_VALID)]),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Import Labours" }),
    );
    await userEvent.upload(
      dialog.getByLabelText("Choose Excel file"),
      // An Excel type, but not the .xlsx sheet.
      new File(["a,b"], "labours.csv", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    await expect(
      await dialog.findByText("Choose the Excel (.xlsx) sample sheet."),
    ).toBeInTheDocument();
    await expect(uploadedUrls()).toEqual([]);
  },
};
