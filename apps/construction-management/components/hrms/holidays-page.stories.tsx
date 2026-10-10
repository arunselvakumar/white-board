import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import type {
  HrmsHoliday,
  HrmsHolidayImportPreview,
} from "@/src/queries/hrms-holidays";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { HolidaysPage } from "./holidays-page";

const HOLIDAYS = "/api/construction/hrms/holidays";
const AT = "2026-10-10T06:00:00.000Z";

function holiday(
  overrides: Partial<HrmsHoliday> & Pick<HrmsHoliday, "name" | "date">,
): HrmsHoliday {
  return {
    id: `0199d0a0-0000-7000-8000-${overrides.date.replaceAll("-", "").padStart(12, "0")}`,
    type: "national",
    isOptional: false,
    description: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

const YEAR_2026: HrmsHoliday[] = [
  holiday({ name: "Republic Day", date: "2026-01-26" }),
  holiday({ name: "Pongal", date: "2026-01-15", type: "festival" }),
  holiday({
    name: "Foundation Day",
    date: "2026-07-01",
    type: "company",
    isOptional: true,
    description: "Office closes at noon",
  }),
].sort((a, b) => a.date.localeCompare(b.date));

const PREVIEW_WITH_ERRORS: HrmsHolidayImportPreview = {
  rows: [
    {
      row: 2,
      ok: true,
      errors: [],
      values: {
        name: "Ugadi",
        date: "2026-03-19",
        type: "festival",
        isOptional: false,
        description: null,
      },
    },
    {
      row: 3,
      ok: false,
      errors: [
        {
          field: "date",
          code: "HOLIDAY_DATE_TAKEN",
          message: "2026-01-26 is already a holiday (Republic Day).",
        },
      ],
      values: {
        name: "Republic Day",
        date: "2026-01-26",
        type: "national",
        isOptional: false,
        description: null,
      },
    },
  ],
  valid: 1,
  invalid: 1,
  imported: 0,
};

const PREVIEW_READY: HrmsHolidayImportPreview = {
  rows: PREVIEW_WITH_ERRORS.rows.slice(0, 1),
  valid: 1,
  invalid: 0,
  imported: 0,
};

let calls: ApiCall[] = [];
let createResponse: (body: unknown) => Response = (body) =>
  Response.json({ ...holiday(body as HrmsHoliday) }, { status: 201 });
let importResponses: (() => Response)[] = [];

function posted(path: string): unknown[] {
  return calls
    .filter((call) => call.method === "POST" && call.path.startsWith(path))
    .map((call) => call.body);
}

function serve(items: Record<number, HrmsHoliday[]>) {
  return () => {
    calls = [];
    let uploads = 0;
    const api = mockApi((call) => {
      calls.push(call);
      const year = /\?year=(\d{4})$/.exec(call.path)?.[1];
      if (call.method === "GET" && year != null)
        return Response.json({
          year: Number(year),
          items: items[Number(year)] ?? [],
        });
      if (call.method === "POST" && call.path === HOLIDAYS)
        return createResponse(call.body);
      if (call.path.startsWith(`${HOLIDAYS}/import`)) {
        const respond =
          importResponses[Math.min(uploads, importResponses.length - 1)];
        uploads += 1;
        return respond?.();
      }
      if (call.path.endsWith("/delete"))
        return new Response(null, { status: 204 });
      return undefined;
    });
    return () => {
      api.restore();
      createResponse = (body) =>
        Response.json({ ...holiday(body as HrmsHoliday) }, { status: 201 });
      importResponses = [];
    };
  };
}

const sheet = () =>
  new File(["PK\u0003\u0004 not really a workbook"], "holidays.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

const meta = {
  title: "HRMS/Holidays",
  component: HolidaysPage,
  args: { initialYear: 2026 },
  render: (args) => (
    <StoryQueries>
      <HolidaysPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof HolidaysPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoHolidaysThisYear: Story = {
  beforeEach: serve({}),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No holidays in 2026")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Import from Excel" }),
    ).toBeVisible();
  },
};

export const ListsTheYear: Story = {
  beforeEach: serve({ 2026: YEAR_2026 }),
  play: async ({ canvas, userEvent }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Holidays in 2026" }),
    );
    const names = list
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p.font-medium")?.textContent);
    await expect(names).toEqual(["Pongal", "Republic Day", "Foundation Day"]);
    await expect(list.getByText("Optional")).toBeVisible();
    await expect(list.getByText("Office closes at noon")).toBeVisible();
    await expect(canvas.getByText("2 holidays")).toBeVisible(); // January
    await expect(canvas.getByText("2026 at a glance")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Next year" }));
    await expect(await canvas.findByText("No holidays in 2027")).toBeVisible();
  },
};

export const AddsAHoliday: Story = {
  beforeEach: serve({}),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Holiday" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Holiday" }),
    );
    await userEvent.type(dialog.getByLabelText("Holiday name"), "Diwali");
    const date = dialog.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-11-08");
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Holiday type" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Festival" }),
    );
    await userEvent.click(
      dialog.getByRole("switch", { name: "Optional holiday" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save holiday" }));
    await waitFor(() =>
      expect(posted(HOLIDAYS)).toEqual([
        {
          name: "Diwali",
          date: "2026-11-08",
          type: "festival",
          isOptional: true,
          description: null,
        },
      ]),
    );
  },
};

export const NeedsATypeAndAName: Story = {
  beforeEach: serve({}),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Holiday" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save holiday" }));
    await expect(
      await dialog.findByText("Enter the holiday name"),
    ).toBeVisible();
    await expect(dialog.getByText("Choose the holiday type")).toBeVisible();
    await expect(posted(HOLIDAYS)).toHaveLength(0);
  },
};

export const ShowsABackDatedRefusal: Story = {
  beforeEach: serve({}),
  play: async ({ canvas, canvasElement, userEvent }) => {
    createResponse = () =>
      Response.json(
        {
          code: "BACKDATED_CREATE_BLOCKED",
          message:
            "Holiday entries older than 3 days cannot be created. The earliest date allowed is 2026-10-07.",
        },
        { status: 403 },
      );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Holiday" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Holiday name"), "Old day");
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Holiday type" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Company" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save holiday" }));
    await expect(
      await dialog.findByText(/earliest date allowed is 2026-10-07/),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Date")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const ImportPreviewWithErrors: Story = {
  beforeEach: () => {
    importResponses = [() => Response.json(PREVIEW_WITH_ERRORS)];
    return serve({ 2026: YEAR_2026 })();
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Import" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Import Holidays" }),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample sheet" }),
    ).toHaveAttribute("href", `${HOLIDAYS}/sample?year=2026`);
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    await expect(
      await dialog.findByText("1 ready · 1 with errors"),
    ).toBeVisible();
    await expect(
      dialog.getByText("2026-01-26 is already a holiday (Republic Day)."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Import 1 holiday" }),
    ).toBeDisabled();
  },
};

export const ImportsWhenEveryRowIsReady: Story = {
  beforeEach: () => {
    importResponses = [
      () => Response.json(PREVIEW_READY),
      () => Response.json({ ...PREVIEW_READY, imported: 1 }, { status: 201 }),
    ];
    return serve({ 2026: YEAR_2026 })();
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Import" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), sheet());
    const importButton = await dialog.findByRole("button", {
      name: "Import 1 holiday",
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    await userEvent.click(importButton);
    await expect(await dialog.findByText("Imported 1 holiday.")).toBeVisible();
    await expect(
      calls
        .filter((call) => call.path.startsWith(`${HOLIDAYS}/import`))
        .map((call) => call.path),
    ).toEqual([
      `${HOLIDAYS}/import?dryRun=true`,
      `${HOLIDAYS}/import?dryRun=false`,
    ]);
  },
};

export const RefusesAFileThatIsNotExcel: Story = {
  beforeEach: serve({}),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Import" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    // The picker offers .xlsx only; a dropped or renamed file can still be anything.
    await fireEvent.change(dialog.getByLabelText("Choose Excel file"), {
      target: {
        files: [new File(["a,b"], "holidays.csv", { type: "text/csv" })],
      },
    });
    await expect(
      await dialog.findByText("Choose the Excel (.xlsx) sample sheet."),
    ).toBeVisible();
    await expect(posted(`${HOLIDAYS}/import`)).toHaveLength(0);
  },
};

export const DeletesAHoliday: Story = {
  beforeEach: serve({ 2026: YEAR_2026 }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Pongal" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(
      await body.findByRole("alertdialog", { name: "Delete Pongal?" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path.endsWith("/delete")),
      ).toHaveLength(1),
    );
  },
};
