import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import { timeInIndia, todayInIndia } from "@/src/preschool/domain/dates";
import type {
  PreschoolAttendanceDay,
  PreschoolAttendanceMark,
  PreschoolAttendanceRosterChild,
  PreschoolCheckOutInput,
  PreschoolClassroomAttendanceMonth,
} from "@/src/queries/preschool/attendance";
import type { PreschoolClassroom } from "@/src/queries/preschool/classrooms";

import { AttendanceScreen } from "./attendance-screen";
import {
  expectFitsPhone,
  withPhoneFrame,
} from "@/app/(app)/preschool/_components/phone-frame";

const id = (n: number) =>
  `be0e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;
const NURSERY_A = id(1);
const CLASSROOM = {
  id: NURSERY_A,
  name: "Nursery A",
  programmeName: "Nursery (Pre-KG)",
  centreId: CENTRE_IDS.annaNagar,
};

function child(
  n: number,
  name: string,
  overrides: Partial<PreschoolAttendanceRosterChild> = {},
): PreschoolAttendanceRosterChild {
  return {
    childId: id(n),
    name,
    photoUrl: null,
    hasAllergies: false,
    father: { name: "Arjun Kumar", phone: "9840012345" },
    mother: { name: "Divya Kumar", phone: "9840012346" },
    authorisedPickups: [],
    mark: null,
    ...overrides,
  };
}

const ROSTER = [
  child(10, "Aadhya Kumar", {
    hasAllergies: true,
    authorisedPickups: [
      {
        id: id(40),
        name: "Lakshmi",
        relationship: "Grandmother",
        photoUrl: null,
      },
    ],
  }),
  child(11, "Ishaan Rao"),
  child(12, "Meera Iyer"),
];

const classroomList = (items: PreschoolClassroom[]) => ({
  "GET /classrooms": () => ({
    json: { academicYear: { id: id(90), name: "2026–27" }, items },
  }),
});

const CLASSROOM_ROW: PreschoolClassroom = {
  id: NURSERY_A,
  centreId: CENTRE_IDS.annaNagar,
  academicYearId: id(90),
  programmeId: id(91),
  programmeName: "Nursery (Pre-KG)",
  name: "Nursery A",
  capacity: 20,
  childCount: 3,
  seatsLeft: 17,
  isArchived: false,
  teachers: [],
};

const calls: PreschoolApiCall[] = [];

/** A register that keeps marks between requests, as the API does. */
function api({
  editable = true,
  classrooms = [CLASSROOM_ROW],
}: { editable?: boolean; classrooms?: PreschoolClassroom[] } = {}) {
  calls.length = 0;
  const marks = new Map<string, PreschoolAttendanceMark | null>();
  const day = (date: string): PreschoolAttendanceDay => {
    const children = ROSTER.map((entry) => ({
      ...entry,
      mark: marks.get(entry.childId) ?? null,
    }));
    const count = (status: string) =>
      children.filter((entry) => entry.mark?.status === status).length;
    return {
      classroom: CLASSROOM,
      date,
      editable,
      counts: {
        rosterSize: children.length,
        present: count("present"),
        absent: count("absent"),
        leave: count("leave"),
        notMarked: children.filter((entry) => entry.mark == null).length,
        checkedOut: children.filter((entry) => entry.mark?.checkOutTime != null)
          .length,
      },
      children,
    };
  };
  const childDay = (childId: string, date: string) => ({
    childId,
    date,
    mark: marks.get(childId) ?? null,
  });
  return mockPreschoolApi({
    me: preschoolMe({
      role: "teacher",
      centres: preschoolMe().centres.slice(0, 1),
      classroomIds: [NURSERY_A],
    }),
    calls,
    routes: {
      ...classroomList(classrooms),
      "GET /attendance": (_body, url) => ({
        json: day(url.searchParams.get("date") ?? todayInIndia(new Date())),
      }),
      "POST /attendance/mark": (body) => {
        const input = body as {
          date: string;
          marks: { childId: string; status: "present" | "absent" | "leave" }[];
        };
        for (const entry of input.marks)
          marks.set(entry.childId, {
            status: entry.status,
            checkInTime:
              entry.status === "present" ? timeInIndia(new Date()) : null,
            droppedBy: null,
            checkOutTime: null,
            collectedBy: null,
            note: null,
          });
        return { json: day(input.date) };
      },
      "POST /attendance/check-out": (body) => {
        const input = body as PreschoolCheckOutInput & { date: string };
        if (input.collectedByKind === "other" && input.note == null)
          return {
            status: 400,
            json: {
              code: "COLLECTED_BY_NOTE_REQUIRED",
              message: "Note needed.",
            },
          };
        const existing = marks.get(input.childId);
        if (existing == null)
          return { status: 409, json: { code: "NOT_PRESENT", message: "" } };
        const roster = ROSTER.find((entry) => entry.childId === input.childId);
        const pickup = roster?.authorisedPickups.find(
          (entry) => entry.id === input.pickupId,
        );
        marks.set(input.childId, {
          ...existing,
          checkOutTime: input.time ?? timeInIndia(new Date()),
          collectedBy: {
            kind: input.collectedByKind,
            name:
              pickup?.name ??
              input.collectedByName ??
              (input.collectedByKind === "father"
                ? "Arjun Kumar"
                : "Divya Kumar"),
            pickupId: pickup?.id ?? null,
          },
          note: input.note ?? null,
        });
        return { json: childDay(input.childId, input.date) };
      },
      "POST /attendance/undo-check-out": (body) => {
        const input = body as { childId: string; date: string };
        const existing = marks.get(input.childId);
        if (existing != null)
          marks.set(input.childId, {
            ...existing,
            checkOutTime: null,
            collectedBy: null,
            note: null,
          });
        return { json: childDay(input.childId, input.date) };
      },
      "GET /attendance/month": (_body, url) => {
        const month = url.searchParams.get("month") ?? "2026-11";
        const days = Array.from(
          { length: 30 },
          (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
        );
        const register: PreschoolClassroomAttendanceMonth = {
          classroom: CLASSROOM,
          month,
          days,
          workingDays: 18,
          children: ROSTER.map((entry, row) => ({
            childId: entry.childId,
            name: entry.name,
            days: days.map((_, index) =>
              index % 7 >= 5
                ? null
                : (index + row) % 9 === 0
                  ? "absent"
                  : (index + row) % 13 === 0
                    ? "leave"
                    : "present",
            ),
            totals: { present: 16 - row, absent: 1 + row, leave: 1 },
          })),
        };
        return { json: register };
      },
    },
  });
}

const meta = {
  title: "Preschool/Attendance",
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: "/preschool/attendance",
        query: { classroomId: NURSERY_A },
      },
    },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
  render: () => <AttendanceScreen />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The day's flow: mark everyone present, one absent, a Grandmother on the
 * pickup list collects one Child, and someone not on the list needs a note.
 */
export const TakeAttendance: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const counts = within(await canvas.findByLabelText("Attendance counts"));
    await expect(counts.getByText("Not marked").nextSibling).toHaveTextContent(
      "3",
    );
    await expect(
      canvas.getByRole("img", { name: "Has allergies" }),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Mark everyone present" }),
    );
    await waitFor(() =>
      expect(counts.getByText("Present").nextSibling).toHaveTextContent("3"),
    );
    await expect(
      canvas.queryByRole("button", { name: "Mark everyone present" }),
    ).not.toBeInTheDocument();

    const ishaan = within(
      canvas.getByRole("radiogroup", { name: "Attendance for Ishaan Rao" }),
    );
    await userEvent.click(ishaan.getByRole("radio", { name: "Absent" }));
    await expect(ishaan.getByRole("radio", { name: "Absent" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await waitFor(() =>
      expect(counts.getByText("Absent").nextSibling).toHaveTextContent("1"),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Check out Aadhya Kumar" }),
    );
    let panel = within(
      await body.findByRole("dialog", {
        name: "Who is collecting Aadhya Kumar?",
      }),
    );
    await userEvent.click(
      panel.getByRole("radio", { name: /Lakshmi Grandmother/ }),
    );
    await userEvent.click(
      panel.getByRole("button", { name: "Check out Aadhya" }),
    );
    await expect(
      await canvas.findByText(
        /Collected \d{1,2}:\d\d [ap]m by Lakshmi \(Grandmother\)/,
      ),
    ).toBeVisible();
    await expect(
      calls.find((call) => call.route === "POST /attendance/check-out")?.body,
    ).toMatchObject({
      childId: id(10),
      collectedByKind: "authorised_pickup",
      pickupId: id(40),
    });

    await userEvent.click(
      canvas.getByRole("button", { name: "Check out Meera Iyer" }),
    );
    panel = within(
      await body.findByRole("dialog", {
        name: "Who is collecting Meera Iyer?",
      }),
    );
    await userEvent.click(panel.getByRole("radio", { name: /Someone else/ }));
    await expect(
      panel.getByText(
        "This person is not on Meera's pickup list. Record who they are and who confirmed it.",
      ),
    ).toBeVisible();
    await userEvent.click(
      panel.getByRole("button", { name: "Check out Meera" }),
    );
    await expect(await panel.findByText("Enter their name.")).toBeVisible();
    await expect(
      panel.getByText("Write who they are and who confirmed it."),
    ).toBeVisible();
    await userEvent.type(panel.getByLabelText("Their name"), "Ravi");
    await userEvent.type(
      panel.getByLabelText("Note"),
      "Uncle; mother confirmed on the phone",
    );
    await userEvent.click(
      panel.getByRole("button", { name: "Check out Meera" }),
    );
    await expect(
      await canvas.findByText(
        /Collected \d{1,2}:\d\d [ap]m by Ravi \(not on the list\)/,
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(counts.getByText("Checked out").nextSibling).toHaveTextContent(
        "2",
      ),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Undo check-out of Meera Iyer" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Check out Meera Iyer" }),
    ).toBeVisible();
  },
};

/** A change the server refuses is undone and said in a toast. */
export const RefusedChangeRollsBack: Story = {
  beforeEach: () => {
    const cleanup = api();
    const original = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const href =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (href.includes("/api/preschool/attendance/mark"))
        return Promise.resolve(
          Response.json(
            {
              code: "DATE_LOCKED",
              message: "Teachers can change only today and yesterday.",
            },
            { status: 403 },
          ),
        );
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
      cleanup();
    };
  },
  play: async ({ canvas, userEvent }) => {
    const ishaan = within(
      await canvas.findByRole("radiogroup", {
        name: "Attendance for Ishaan Rao",
      }),
    );
    await userEvent.click(ishaan.getByRole("radio", { name: "Leave" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Not saved: Teachers can change only today and yesterday.",
    );
    await expect(ishaan.getByRole("radio", { name: "Leave" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  },
};

export const ReadOnlyDay: Story = {
  beforeEach: () => api({ editable: false }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Read only")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Mark everyone present" }),
    ).not.toBeInTheDocument();
    await expect(
      within(
        canvas.getByRole("radiogroup", { name: "Attendance for Ishaan Rao" }),
      ).getByRole("radio", { name: "Present" }),
    ).toBeDisabled();
  },
};

export const MonthlyRegister: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("tab", { name: "Month" }));
    const grid = await canvas.findByRole("region", { name: "Register grid" });
    await expect(
      within(grid).getByRole("rowheader", { name: "Aadhya Kumar" }),
    ).toBeVisible();
    await expect(within(grid).getAllByText("P").length).toBeGreaterThan(10);
    await expect(canvas.getByText(/18 working days/)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Next month" }),
    ).toBeDisabled();
    const shown = canvas.getByRole("heading", { level: 2 }).textContent;
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous month" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("heading", { level: 2 }).textContent).not.toBe(
        shown,
      ),
    );
  },
};

/** At 375 px the register fits the screen: no sideways page scroll. */
export const Phone: Story = {
  beforeEach: () => api(),
  decorators: [withPhoneFrame],
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Mark everyone present" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Check out Ishaan Rao" }),
    ).toBeVisible();
    await expectFitsPhone(canvasElement);
    // On a phone, Check out opens a bottom sheet.
    await userEvent.click(
      canvas.getByRole("button", { name: "Check out Ishaan Rao" }),
    );
    const sheet = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Who is collecting Ishaan Rao?" },
    );
    await expect(sheet).toHaveAttribute("data-side", "bottom");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Cancel" }),
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Month" }));
    await canvas.findByRole("region", { name: "Register grid" });
    await expectFitsPhone(canvasElement);
  },
};

export const NoClassrooms: Story = {
  beforeEach: () => api({ classrooms: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Classrooms to mark"),
    ).toBeVisible();
  },
};
