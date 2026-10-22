import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  checkedSheet,
  contractorSheet,
  PCC,
  PROJECT,
  SHEET,
  sheetOf,
  submittedSheet,
} from "./measurement-fixtures";
import { MeasurementSheetPage } from "./measurement-sheet";
import {
  MEASUREMENTS_API,
  PHONE_375,
  posted,
  serveMeasurements,
} from "./measurement-stories-api";

const meta = {
  title: "Contracts/Measurements/Sheet",
  component: MeasurementSheetPage,
  args: { projectId: PROJECT, id: SHEET, today: "2026-10-22" },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${PROJECT}/measurements/${SHEET}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <MeasurementSheetPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MeasurementSheetPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const draft = serveMeasurements({ sheet: sheetOf() });

/**
 * A draft computes each row as you type (nos × the filled dimensions, a
 * blank nos 1, a negative nos a deduction); rows are added, duplicated
 * and removed, and the save sends them in order.
 */
export const DraftComputesAsYouType: Story = {
  beforeEach: draft.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = await canvas.findByRole("form", { name: "Measurement sheet" });
    const rows = within(form);
    await expect(rows.getByLabelText("Row 1 quantity")).toHaveTextContent(
      "3.78 cum",
    );
    await expect(rows.getByLabelText("Row 3 quantity")).toHaveTextContent(
      "−0.1667 cum",
    );
    await expect(rows.getAllByText("Deduction")).toHaveLength(1);

    const nos = rows.getByLabelText("Row 1 nos");
    await userEvent.clear(nos);
    await userEvent.type(nos, "3");
    await expect(rows.getByLabelText("Row 1 quantity")).toHaveTextContent(
      "5.67 cum",
    );
    // A blank dimension is left out: 3 × 3.5 × 0.45.
    await userEvent.clear(rows.getByLabelText("Row 1 breadth"));
    await expect(rows.getByLabelText("Row 1 quantity")).toHaveTextContent(
      "4.725 cum",
    );

    await userEvent.click(
      rows.getByRole("button", { name: "Duplicate row 1" }),
    );
    await expect(rows.getByLabelText("Row 2 quantity")).toHaveTextContent(
      "4.725 cum",
    );
    await userEvent.click(rows.getByRole("button", { name: "Remove row 2" }));
    await userEvent.click(rows.getByRole("button", { name: "Add row" }));
    await userEvent.click(rows.getByLabelText("Row 5 item"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: /2\.1 · PCC/,
      }),
    );
    await userEvent.type(rows.getByLabelText("Row 5 length"), "2");
    await userEvent.type(rows.getByLabelText("Row 5 breadth"), "1.5");
    await expect(rows.getByLabelText("Row 5 quantity")).toHaveTextContent(
      "3 cum",
    );
    await expect(canvas.getByText(/this sheet 7\.25 =/)).toBeVisible();

    await userEvent.click(rows.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(
        posted(draft.holder.current, `${MEASUREMENTS_API}/${SHEET}/update`),
      ).toMatchObject({
        expectedUpdatedAt: "2026-10-20T06:00:00.000Z",
        rows: [
          { nos: "3", length: "3.5", breadth: null, depth: "0.45" },
          { length: "12.5", depth: "0.15" },
          { nos: "-1" },
          { boqItemId: PCC, direct: true, quantity: "4.25" },
          { boqItemId: PCC, length: "2", breadth: "1.5" },
        ],
      }),
    );
  },
};

const deviation = serveMeasurements({
  sheet: sheetOf(),
  checked: { [PCC]: "9.0000" },
});

/**
 * Client-side rows that push a BOQ item over its current quantity are a
 * deviation; past the Company's limit the item links to the BOQ's
 * Deviations tab.
 */
export const DeviationMarks: Story = {
  beforeEach: deviation.beforeEach,
  play: async ({ canvas }) => {
    const form = await canvas.findByRole("form", { name: "Measurement sheet" });
    await waitFor(() =>
      expect(within(form).getAllByText("Deviation")).toHaveLength(1),
    );
    const panel = within(
      canvas.getByRole("list", { name: "Measured to date" }),
    );
    await expect(panel.getByText("Deviation +32.5%")).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Past the limit · Deviations" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT}/boq?tab=deviations`);
    await expect(panel.getByText("Within")).toBeVisible();
  },
};

const checking = serveMeasurements({ sheet: submittedSheet() });

/** Check records the joint measurement: the other party's name, role and the date. */
export const CheckDialog: Story = {
  beforeEach: checking.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Check" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Check sheet" }));
    await expect(
      dialog.getByText("Enter the other party's name."),
    ).toBeVisible();
    await expect(dialog.getByText("Enter their role.")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Their name"), "R. Kumar");
    await userEvent.type(
      dialog.getByLabelText("Their role"),
      "Client's engineer",
    );
    const date = dialog.getByLabelText("Joint measurement date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-23");
    await userEvent.click(dialog.getByRole("button", { name: "Check sheet" }));
    await expect(
      dialog.getByText("The joint measurement date cannot be in the future."),
    ).toBeVisible();
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-21");
    await userEvent.click(dialog.getByRole("button", { name: "Check sheet" }));
    await waitFor(() =>
      expect(
        posted(checking.holder.current, `${MEASUREMENTS_API}/${SHEET}/check`),
      ).toEqual({
        partyName: "R. Kumar",
        partyRole: "Client's engineer",
        jointOn: "2026-10-21",
        expectedUpdatedAt: "2026-10-20T06:00:00.000Z",
      }),
    );
    await expect(
      canvas.getByRole("button", { name: "Return to draft" }),
    ).toBeVisible();
  },
};

const checked = serveMeasurements({ sheet: checkedSheet() });

/** A checked sheet is read-only: its joint measurement, rows and Reopen (with a reason). */
export const CheckedReadOnly: Story = {
  beforeEach: checked.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("R. Kumar (Client's engineer)"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("form", { name: "Measurement sheet" }),
    ).toBeNull();
    await expect(canvas.queryByLabelText("Row 1 nos")).toBeNull();
    const rows = within(canvas.getByRole("list", { name: "Rows" }));
    await expect(rows.getByText("2 × 3.5 × 1.2 × 0.45")).toBeVisible();
    await expect(rows.getByText("Deviation")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reopen" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "Wrong footing size");
    await userEvent.click(dialog.getByRole("button", { name: "Reopen" }));
    await waitFor(() =>
      expect(
        posted(checked.holder.current, `${MEASUREMENTS_API}/${SHEET}/reopen`),
      ).toEqual({
        reason: "Wrong footing size",
        expectedUpdatedAt: "2026-10-20T06:00:00.000Z",
      }),
    );
  },
};

const billed = serveMeasurements({
  sheet: checkedSheet({
    billed: true,
    allowed: {
      edit: false,
      delete: false,
      submit: false,
      check: false,
      return: false,
      reopen: false,
      photos: false,
    },
  }),
  canUpload: false,
});

/** A bill took its rows: no Reopen, Delete or photos; a note says why. */
export const BilledReadOnly: Story = {
  beforeEach: billed.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/A bill has taken rows of this sheet/),
    ).toBeVisible();
    for (const name of ["Reopen", "Delete", "Check", "Add photos"])
      await expect(canvas.queryByRole("button", { name })).toBeNull();
    await expect(await canvas.findByText("No photos yet.")).toBeVisible();
  },
};

const contractor = serveMeasurements({ sheet: contractorSheet() });

/** A contractor-side line measured past its Work Order quantity is warned: a bill refuses it. */
export const ContractorOverQuantity: Story = {
  beforeEach: contractor.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Contractor side · WO/26-27/00001 · Velan Constructions",
      ),
    ).toBeVisible();
    await expect(canvas.getByText("Over the Work Order")).toBeVisible();
    await expect(
      canvas.getByText(/WORK_ORDER_QUANTITY_EXCEEDED/),
    ).toBeVisible();
    const rows = within(canvas.getByRole("list", { name: "Rows" }));
    await expect(rows.getAllByText("Over WO")).toHaveLength(1);
    await expect(canvas.getByText("Over the Work Order +5%")).toBeVisible();
  },
};

const phone = serveMeasurements({ sheet: sheetOf() });

/** At 375 px each row is a card with nos, L, B and D/H in a 2×2 grid; nothing scrolls sideways. */
export const PhoneRows: Story = {
  ...PHONE_375,
  beforeEach: phone.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Measurement sheet" }),
    );
    const box = (label: string) =>
      form.getByLabelText(label).getBoundingClientRect();
    const [nos, length, breadth, depth] = [
      box("Row 1 nos"),
      box("Row 1 length"),
      box("Row 1 breadth"),
      box("Row 1 depth or height"),
    ];
    await expect(Math.round(nos.top)).toBe(Math.round(length.top));
    await expect(Math.round(breadth.top)).toBe(Math.round(depth.top));
    await expect(breadth.top).toBeGreaterThan(nos.top);
    await expect(Math.round(nos.left)).toBe(Math.round(breadth.left));
    await expect(
      form.getAllByText("D / H", { selector: "label" })[0],
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Row 2 nos"), "2");
    await expect(form.getByLabelText("Row 2 quantity")).toHaveTextContent(
      "3.75 cum",
    );
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

const SAVED_AT = "2026-10-20T07:00:00.000Z";

const saveFirst = serveMeasurements({
  sheet: sheetOf(),
  write: (call) =>
    call.path.endsWith("/update")
      ? Response.json(sheetOf({ updatedAt: SAVED_AT }))
      : call.path.endsWith("/submit")
        ? Response.json(submittedSheet())
        : undefined,
});

/**
 * With unsaved rows, Submit saves them first and then submits the sheet
 * as saved (its new `updatedAt`), so stale rows are never submitted.
 */
export const SubmitSavesFirst: Story = {
  beforeEach: saveFirst.beforeEach,
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Measurement sheet" }),
    );
    await expect(
      form.getByRole("button", { name: "Submit for checking" }),
    ).toBeVisible();
    // Only the form offers Submit while the draft is editable.
    await expect(
      canvas.getAllByRole("button", { name: /submit for checking/i }),
    ).toHaveLength(1);
    const nos = form.getByLabelText("Row 1 nos");
    await userEvent.clear(nos);
    await userEvent.type(nos, "5");
    await userEvent.click(
      form.getByRole("button", { name: "Save and submit for checking" }),
    );
    await waitFor(() =>
      expect(
        posted(saveFirst.holder.current, `${MEASUREMENTS_API}/${SHEET}/submit`),
      ).toEqual({ expectedUpdatedAt: SAVED_AT }),
    );
    const posts = (saveFirst.holder.current?.calls.mock.calls ?? [])
      .map(([call]) => call)
      .filter((call) => call.method === "POST")
      .map((call) => call.path);
    await expect(posts).toEqual([
      `${MEASUREMENTS_API}/${SHEET}/update`,
      `${MEASUREMENTS_API}/${SHEET}/submit`,
    ]);
    await expect(
      posted(saveFirst.holder.current, `${MEASUREMENTS_API}/${SHEET}/update`),
    ).toMatchObject({
      expectedUpdatedAt: "2026-10-20T06:00:00.000Z",
      rows: [{ nos: "5" }, {}, {}, {}],
    });
  },
};

const saveFails = serveMeasurements({
  sheet: sheetOf(),
  write: (call) =>
    call.path.endsWith("/update")
      ? Response.json(
          {
            code: "MEASUREMENT_CHANGED",
            message:
              "Someone changed this measurement sheet after you opened it. Reload to see the latest.",
          },
          { status: 409 },
        )
      : undefined,
});

/** When that save fails, nothing is submitted and the reason is shown. */
export const SubmitStopsWhenSaveFails: Story = {
  beforeEach: saveFails.beforeEach,
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Measurement sheet" }),
    );
    await userEvent.type(form.getByLabelText("Row 2 nos"), "2");
    await userEvent.click(
      form.getByRole("button", { name: "Save and submit for checking" }),
    );
    await expect(
      await form.findByText(/Someone changed this measurement sheet/),
    ).toBeVisible();
    await expect(
      posted(saveFails.holder.current, `${MEASUREMENTS_API}/${SHEET}/submit`),
    ).toBeUndefined();
  },
};
