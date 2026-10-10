import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { HrmsAttendanceApprovals } from "@/src/queries/hrms-attendance";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { APPROVALS } from "./attendance-fixtures";
import { AttendanceApprovalsPage } from "./attendance-approvals-page";

const BASE = "/api/construction/hrms/attendance/approvals";

let calls: ApiCall[] = [];

function serve(
  body: HrmsAttendanceApprovals,
  decide: (call: ApiCall) => Response = (call) =>
    Response.json({ ...APPROVALS.items[0]?.entry, id: call.path }),
) {
  return () => {
    calls = [];
    let current = body;
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path === BASE)
        return Response.json(current);
      if (call.method === "POST") {
        const answer = decide(call);
        if (answer.ok)
          current = {
            ...current,
            items: current.items.filter(
              (item) => !call.path.includes(item.entry.id),
            ),
          };
        return answer;
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Attendance/Approvals",
  component: AttendanceApprovalsPage,
  render: () => (
    <StoryQueries>
      <AttendanceApprovalsPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof AttendanceApprovalsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const [manual, missed, outside] = APPROVALS.items;

export const ApprovesAndRejects: Story = {
  beforeEach: serve(APPROVALS),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(
      await canvas.findByRole("list", {
        name: "Attendance waiting for approval",
      }),
    );
    await expect(list.getAllByRole("listitem")).toHaveLength(3);
    await expect(list.getByText("Back-dated")).toBeVisible();
    await expect(list.getByText("Missed checkout")).toBeVisible();
    await expect(list.getByText("Outside fence")).toBeVisible();
    await expect(list.getByText("“Phone died at the site”")).toBeVisible();

    await userEvent.click(
      list.getByRole("button", {
        name: `Approve Prabhu Saravanan, ${manual?.entry.date ?? ""}`,
      }),
    );
    await waitFor(() =>
      expect(
        calls
          .filter((call) => call.method === "POST")
          .map((call) => [call.path, call.body]),
      ).toEqual([
        [
          `${BASE}/${manual?.entry.id ?? ""}/approve`,
          { expectedUpdatedAt: manual?.entry.updatedAt },
        ],
      ]),
    );
    await expect(await canvas.findByText("2 waiting")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", {
        name: `Reject Meena Rajan, ${missed?.entry.date ?? ""}`,
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Reject attendance" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByText("Give a reason (at least 3 characters)"),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "No proof of the visit",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(calls.filter((call) => call.method === "POST").at(-1)).toEqual({
        method: "POST",
        path: `${BASE}/${missed?.entry.id ?? ""}/reject`,
        body: {
          expectedUpdatedAt: missed?.entry.updatedAt,
          reason: "No proof of the visit",
        },
      }),
    );
    await expect(await canvas.findByText("1 waiting")).toBeVisible();
    await expect(outside).toBeDefined();
  },
};

export const SomeoneDecidedFirst: Story = {
  beforeEach: serve(APPROVALS, () =>
    Response.json(
      {
        code: "ATTENDANCE_NOT_PENDING",
        message: "This attendance is already approved.",
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: `Approve Prabhu Saravanan, ${manual?.entry.date ?? ""}`,
      }),
    );
    await expect(
      await canvas.findByText("This attendance is already approved."),
    ).toBeVisible();
  },
};

export const NothingToApprove: Story = {
  beforeEach: serve({ ...APPROVALS, items: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nothing to approve")).toBeVisible();
  },
};

export const NotAnApprover: Story = {
  beforeEach() {
    const api = mockApi(() =>
      Response.json(
        { code: "PERMISSION_DENIED", message: "No access." },
        { status: 403 },
      ),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("You do not have access"),
    ).toBeVisible();
  },
};
