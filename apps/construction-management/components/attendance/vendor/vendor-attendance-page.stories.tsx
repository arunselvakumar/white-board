import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { formatPaise } from "@/components/money/money-input";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  ANIL_NO_CARD,
  DATE,
  grid,
  HELPER,
  MASON,
  MONTH,
  NIGHT,
  OVERTIME,
  PROJECT_ID,
  RAMESH,
  RAMESH_ROW,
  RAMESH_TODAY,
  RAMESH_YESTERDAY,
  SHIFT_1,
  YESTERDAY,
} from "./vendor-attendance-fixtures";
import { VendorAttendancePage } from "./vendor-attendance-page";

const API = "/api/construction/labour/attendance/vendors";

function dayPath(date: string): string {
  return `${API}/day?projectId=${PROJECT_ID}&date=${date}`;
}

let api: ReturnType<typeof mockApi>;

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Attendance/Vendor",
  component: VendorAttendancePage,
  args: { projectId: PROJECT_ID, initialDate: DATE },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-5xl p-4">
        <VendorAttendancePage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof VendorAttendancePage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Enter counts, see the pay preview, save; the body carries only filled lines. */
export const DayGrid: Story = {
  beforeEach: () => {
    let saved = false;
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === dayPath(DATE))
        return Response.json(
          grid(DATE, [
            { ...RAMESH_ROW, attendance: saved ? RAMESH_TODAY : null },
            ANIL_NO_CARD,
          ]),
        );
      if (call.method === "GET" && call.path === dayPath(YESTERDAY))
        return Response.json(grid(YESTERDAY, [RAMESH_ROW, ANIL_NO_CARD]));
      if (call.method === "POST" && call.path === `${API}/record`) {
        saved = true;
        return Response.json(RAMESH_TODAY, { status: 201 });
      }
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const card = within(
      await canvas.findByRole("form", { name: "Ramesh Gang attendance" }),
    );
    // The vendor without a rate card links to Masters instead.
    await expect(
      canvas.getByRole("link", { name: "Add rate card" }),
    ).toHaveAttribute("href", `/app/masters/vendors/${ANIL_NO_CARD.vendorId}`);
    // Nothing recorded yesterday, so there is nothing to copy.
    await expect(
      canvas.queryByRole("button", { name: "Copy yesterday" }),
    ).toBeNull();

    await userEvent.type(
      card.getByLabelText("Ramesh Gang Shift 1 Mason full day"),
      "3",
    );
    await userEvent.type(
      card.getByLabelText("Ramesh Gang Shift 1 Mason half day"),
      "1",
    );
    await userEvent.type(
      card.getByLabelText("Ramesh Gang Shift 1 Helper full day"),
      "2",
    );
    await userEvent.type(
      card.getByLabelText("Ramesh Gang Shift 1 Helper OT hours"),
      "1.5",
    );
    await expect(
      card.getByLabelText("Ramesh Gang Shift 1 Mason pay"),
    ).toHaveTextContent(formatPaise(315_000));
    await expect(
      card.getByLabelText("Ramesh Gang Shift 1 Helper pay"),
    ).toHaveTextContent(formatPaise(120_600));
    await expect(
      card.getByLabelText("Ramesh Gang day total"),
    ).toHaveTextContent(formatPaise(435_600));

    await userEvent.click(card.getByRole("button", { name: "Save" }));
    await expect(await card.findByText("Saved.")).toBeVisible();
    await expect(posted()).toHaveLength(1);
    await expect(posted()[0]?.body).toEqual({
      projectId: PROJECT_ID,
      vendorId: RAMESH,
      date: DATE,
      lines: [
        {
          shiftId: SHIFT_1,
          labourCategoryId: MASON,
          fullDayCount: 3,
          halfDayCount: 1,
        },
        {
          shiftId: SHIFT_1,
          labourCategoryId: HELPER,
          fullDayCount: 2,
          halfDayCount: 0,
          overtimeHours: "1.5",
        },
      ],
    });
    // The refetched day is recorded; Clear day appears.
    await expect(
      await card.findByRole("button", { name: "Clear day" }),
    ).toBeVisible();
  },
};

/** Copy yesterday fills the inputs from the previous day; Save sends them. */
export const CopyYesterday: Story = {
  beforeEach: () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === dayPath(DATE))
        return Response.json(grid(DATE, [RAMESH_ROW]));
      if (call.method === "GET" && call.path === dayPath(YESTERDAY))
        return Response.json(
          grid(YESTERDAY, [{ ...RAMESH_ROW, attendance: RAMESH_YESTERDAY }]),
        );
      if (call.method === "POST" && call.path === `${API}/record`)
        return Response.json(RAMESH_TODAY, { status: 201 });
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Copy yesterday" }),
    );
    await expect(
      canvas.getByLabelText("Ramesh Gang Shift 1 Mason full day"),
    ).toHaveValue("2");
    await expect(
      canvas.getByLabelText("Ramesh Gang Night Mason full day"),
    ).toHaveValue("1");
    await expect(
      canvas.getByLabelText("Ramesh Gang day total"),
    ).toHaveTextContent(formatPaise(280_000));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toMatchObject({
      lines: [
        { shiftId: SHIFT_1, labourCategoryId: MASON, fullDayCount: 2 },
        { shiftId: NIGHT, labourCategoryId: MASON, fullDayCount: 1 },
      ],
    });
  },
};

/** A server error about one line shows under that line's inputs. */
export const ServerErrorOnLine: Story = {
  beforeEach: () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path.startsWith(`${API}/day?`))
        return Response.json(grid(DATE, [RAMESH_ROW]));
      if (call.method === "POST")
        return Response.json(
          {
            code: "OVERTIME_HOURS_INVALID",
            message: "Overtime hours are zero or more, in steps of 0.01.",
            details: {
              lineIndex: 0,
              shiftId: NIGHT,
              labourCategoryId: MASON,
            },
          },
          { status: 400 },
        );
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const card = within(
      await canvas.findByRole("form", { name: "Ramesh Gang attendance" }),
    );
    // Empty save is refused on the screen.
    await userEvent.click(card.getByRole("button", { name: "Save" }));
    await expect(
      await card.findByText("Enter the headcount for at least one category."),
    ).toBeVisible();
    await expect(posted()).toHaveLength(0);

    await userEvent.type(
      card.getByLabelText("Ramesh Gang Night Mason OT hours"),
      "2",
    );
    await userEvent.click(card.getByRole("button", { name: "Save" }));
    await expect(
      await card.findByText(
        "Overtime hours are zero or more, in steps of 0.01.",
      ),
    ).toBeVisible();
    await expect(
      card.getByLabelText("Ramesh Gang Night Mason OT hours"),
    ).toHaveAttribute("aria-invalid", "true");
  },
};

/** No vendors on the Project: point to Masters → Vendors. */
export const EmptyProject: Story = {
  beforeEach: () => {
    api = mockApi((call) =>
      call.method === "GET" && call.path.startsWith(`${API}/day?`)
        ? Response.json(grid(DATE, []))
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No vendors on this Project"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Vendors" }),
    ).toHaveAttribute("href", "/app/masters/vendors");
  },
};

/** Month view: vendor × day matrix with totals per vendor and category. */
export const MonthView: Story = {
  args: { initialView: "month" },
  beforeEach: () => {
    api = mockApi((call) =>
      call.method === "GET" &&
      call.path === `${API}/month?projectId=${PROJECT_ID}&month=2026-10`
        ? Response.json(MONTH)
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    const table = within(
      await canvas.findByRole("table", { name: "Vendor attendance by day" }),
    );
    await expect(
      table.getByRole("rowheader", { name: "Ramesh Gang" }),
    ).toBeVisible();
    await expect(table.getAllByRole("columnheader")).toHaveLength(1 + 31 + 4);
    await expect(table.getAllByText("5 + 1½ · 1.5h").length).toBeGreaterThan(0);
    await expect(
      table.getAllByText(formatPaise(715_600)).length,
    ).toBeGreaterThan(0);
    const categories = within(
      canvas.getByRole("table", {
        name: "Vendor attendance by Labour Category",
      }),
    );
    await expect(categories.getByText("Helper")).toBeVisible();
    await expect(categories.getByText(formatPaise(595_000))).toBeVisible();
  },
};

/** Overtime view: lines with overtime and the totals. */
export const OvertimeView: Story = {
  args: { initialView: "overtime" },
  beforeEach: () => {
    api = mockApi((call) =>
      call.method === "GET" && call.path.startsWith(`${API}/overtime?`)
        ? Response.json(OVERTIME)
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    const table = within(
      await canvas.findByRole("table", { name: "Vendor overtime" }),
    );
    await expect(table.getByText("Helper")).toBeVisible();
    await expect(table.getAllByText(formatPaise(10_500))).toHaveLength(2);
  },
};
