import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AttendanceEmptyState } from "./attendance-screens";
import { AttendanceForm } from "./attendance-form";
import { BackdatedAttendanceForm } from "./backdated-attendance-form";
import type { AttendanceRegister } from "@/src/queries/attendance";

const meta = {
  title: "Pages/Attendance",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const register: AttendanceRegister = {
  id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10",
  batchId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
  date: "2026-09-25",
  timezone: "Asia/Kolkata",
  createdAt: "2026-09-25T08:00:00.000Z",
  updatedAt: "2026-09-25T08:00:00.000Z",
  summary: {
    total: 1,
    unmarked: 1,
    present: 0,
    absent: 0,
    informedAbsent: 0,
    late: 0,
    excused: 0,
    attended: 0,
    complete: false,
  },
  marks: [
    {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
      enrollmentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      studentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      studentName: "Asha",
      status: "unmarked",
      note: null,
      markedByUserId: null,
      markedAt: null,
      notice: null,
    },
  ],
};
const save = fn(() => Promise.resolve());

export const MarkAttendance: Story = {
  render: () => (
    <div className="w-full min-w-96 p-6">
      <div className="max-w-4xl">
        <AttendanceForm register={register} onSave={save} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Asha")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark all Present" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Attendance" }),
    );
    await expect(save).toHaveBeenCalledWith([
      {
        enrollmentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        status: "present",
        note: null,
      },
    ]);
  },
};

const ASHA = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const RAVI = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21";
const noticeRegister: AttendanceRegister = {
  ...register,
  summary: { ...register.summary, total: 2, unmarked: 2 },
  marks: [
    ...register.marks,
    {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a26",
      enrollmentId: RAVI,
      studentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      studentName: "Ravi",
      status: "unmarked",
      note: null,
      markedByUserId: null,
      markedAt: null,
      notice: {
        noticeId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a27",
        reason: "sick",
        note: "Fever since last night",
        givenAt: "2026-09-24T15:30:00.000Z",
        givenBy: { role: "parent", name: "Lakshmi" },
      },
    },
  ],
};
const saveWithNotice = fn(() => Promise.resolve());

export const MarkWithAbsenceNotice: Story = {
  render: () => (
    <div className="w-full min-w-96 p-6">
      <div className="max-w-4xl">
        <AttendanceForm register={noticeRegister} onSave={saveWithNotice} />
      </div>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const ravi = canvas.getByLabelText("Attendance for Ravi");

    await step("Ravi is flagged and pre-selected Informed absent", async () => {
      await expect(canvas.getByText("Notice given")).toBeVisible();
      await expect(
        canvas.getByText("Sick · by Parent (Lakshmi)"),
      ).toBeVisible();
      await expect(canvas.getByText("“Fever since last night”")).toBeVisible();
      await expect(ravi).toHaveTextContent("Informed absent");
      await expect(ravi).toHaveAccessibleDescription(/Notice given/);
      await expect(
        canvas.getByLabelText("Attendance for Asha"),
      ).toHaveTextContent("Unmarked");
    });

    await step("Mark all Present leaves Ravi Informed absent", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Mark all Present" }),
      );
      await expect(ravi).toHaveTextContent("Informed absent");
      await userEvent.click(
        canvas.getByRole("button", { name: "Save Attendance" }),
      );
      await expect(saveWithNotice).toHaveBeenLastCalledWith([
        { enrollmentId: ASHA, status: "present", note: null },
        { enrollmentId: RAVI, status: "informed_absent", note: null },
      ]);
    });

    await step("The Teacher can change Ravi to Present", async () => {
      await userEvent.click(ravi);
      await userEvent.click(
        await within(canvasElement.ownerDocument.body).findByRole("option", {
          name: "Present",
        }),
      );
      await expect(ravi).toHaveTextContent("Present");
      await userEvent.click(
        canvas.getByRole("button", { name: "Save Attendance" }),
      );
      await expect(saveWithNotice).toHaveBeenLastCalledWith([
        { enrollmentId: ASHA, status: "present", note: null },
        { enrollmentId: RAVI, status: "present", note: null },
      ]);
    });
  },
};

const saveUntouched = fn(() => Promise.resolve());

export const SaveNoticeDefaultUntouched: Story = {
  render: () => (
    <div className="w-full min-w-96 p-6">
      <div className="max-w-4xl">
        <AttendanceForm register={noticeRegister} onSave={saveUntouched} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Attendance" }),
    );
    // The pre-selected Informed absent is saved without touching the form.
    await expect(saveUntouched).toHaveBeenCalledWith([
      { enrollmentId: ASHA, status: "unmarked", note: null },
      { enrollmentId: RAVI, status: "informed_absent", note: null },
    ]);
  },
};

export const Empty: Story = {
  render: () => <AttendanceEmptyState />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/No Attendance Register yet/),
    ).toBeVisible();
  },
};

const openEarlierDate = fn(() => Promise.resolve());

export const OpenEarlierDate: Story = {
  render: () => (
    <div className="w-full min-w-96 p-6">
      <BackdatedAttendanceForm onOpen={openEarlierDate} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open earlier Register" }),
    );
    await expect(canvas.getByRole("alert")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Earlier date"), "2026-09-24");
    await userEvent.click(
      canvas.getByRole("button", { name: "Open earlier Register" }),
    );
    await expect(openEarlierDate).toHaveBeenCalledWith("2026-09-24");
  },
};
