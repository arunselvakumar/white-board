import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import { applyClassroomItems } from "@/src/preschool/domain/daily-report";
import { todayInIndia } from "@/src/preschool/domain/dates";
import type { PreschoolClassroom } from "@/src/queries/preschool/classrooms";
import type {
  ApplyPreschoolDailyReportInput,
  PreschoolClassroomDailyReports,
  PreschoolDailyReport,
  SavePreschoolDailyReportInput,
} from "@/src/queries/preschool/daily-reports";

import { DailyReportsScreen } from "./daily-reports-screen";
import {
  expectFitsPhone,
  withPhoneFrame,
} from "@/app/(app)/preschool/_components/phone-frame";

const id = (n: number) =>
  `cf0e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;
const NURSERY_A = id(1);

const CLASSROOM: PreschoolClassroom = {
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

const ROSTER = [
  { childId: id(10), name: "Aadhya Kumar", attendance: "present" as const },
  { childId: id(11), name: "Ishaan Rao", attendance: "absent" as const },
  { childId: id(12), name: "Meera Iyer", attendance: "present" as const },
];

const calls: PreschoolApiCall[] = [];

function api({ editable = true }: { editable?: boolean } = {}) {
  calls.length = 0;
  const reports = new Map<string, PreschoolDailyReport>();
  let stamp = 0;
  const store = (
    childId: string,
    date: string,
    content: Omit<
      PreschoolDailyReport,
      | "id"
      | "childId"
      | "classroomId"
      | "date"
      | "status"
      | "publishedAt"
      | "updatedAt"
    >,
  ) => {
    const existing = reports.get(childId);
    stamp += 1;
    const report: PreschoolDailyReport = {
      ...content,
      id: existing?.id ?? id(50 + reports.size),
      childId,
      classroomId: NURSERY_A,
      date,
      status: existing?.status ?? "draft",
      publishedAt: existing?.publishedAt ?? null,
      updatedAt: `2026-11-25T06:00:${String(stamp).padStart(2, "0")}.000Z`,
    };
    reports.set(childId, report);
    return report;
  };
  const day = (date: string): PreschoolClassroomDailyReports => {
    const children = ROSTER.map((entry) => ({
      ...entry,
      photoUrl: null,
      report: reports.get(entry.childId) ?? null,
    }));
    return {
      classroom: {
        id: NURSERY_A,
        name: "Nursery A",
        programmeName: "Nursery (Pre-KG)",
        centreId: CENTRE_IDS.annaNagar,
      },
      date,
      editable,
      counts: {
        drafts: children.filter((each) => each.report?.status === "draft")
          .length,
        published: children.filter(
          (each) => each.report?.status === "published",
        ).length,
        none: children.filter((each) => each.report == null).length,
      },
      children,
    };
  };
  return mockPreschoolApi({
    me: preschoolMe({
      role: "teacher",
      centres: preschoolMe().centres.slice(0, 1),
      classroomIds: [NURSERY_A],
    }),
    calls,
    routes: {
      "GET /classrooms": () => ({
        json: {
          academicYear: { id: id(90), name: "2026–27" },
          items: [CLASSROOM],
        },
      }),
      "GET /daily-reports": (_body, url) => ({
        json: day(url.searchParams.get("date") ?? todayInIndia(new Date())),
      }),
      "POST /daily-reports/apply-to-classroom": (body) => {
        const input = body as ApplyPreschoolDailyReportInput & { date: string };
        for (const entry of ROSTER.filter(
          (each) => each.attendance === "present",
        )) {
          const existing = reports.get(entry.childId);
          store(
            entry.childId,
            input.date,
            applyClassroomItems(
              existing ?? {
                meals: [],
                napFrom: null,
                napTo: null,
                toilet: [],
                mood: null,
                activities: [],
                note: null,
                photos: [],
              },
              input,
            ),
          );
        }
        return { json: day(input.date) };
      },
      "POST /daily-reports/save": (body) => {
        const input = body as SavePreschoolDailyReportInput & { date: string };
        const { childId, date, ...content } = input;
        return {
          json: store(childId, date, {
            meals: (content.meals ?? []).map((meal) => ({
              meal: meal.meal,
              menu: meal.menu ?? null,
              ate: meal.ate,
            })),
            napFrom: content.napFrom ?? null,
            napTo: content.napTo ?? null,
            toilet: [...(content.toilet ?? [])],
            mood: content.mood ?? null,
            activities: [...(content.activities ?? [])],
            note: content.note ?? null,
            photos: [...(content.photos ?? [])],
          }),
        };
      },
      "POST /daily-reports/publish": () => {
        let published = 0;
        for (const [childId, report] of reports)
          if (report.status === "draft") {
            reports.set(childId, {
              ...report,
              status: "published",
              publishedAt: "2026-11-25T10:10:00.000Z",
            });
            published += 1;
          }
        return { json: { published } };
      },
    },
  });
}

const meta = {
  title: "Preschool/Daily Reports",
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: "/preschool/daily-reports",
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
  render: () => <DailyReportsScreen />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Apply the menu and an activity to the class, change one Child's report, publish. */
export const WriteAndPublish: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const counts = within(await canvas.findByLabelText("Daily Report counts"));
    await expect(counts.getByText("Not started").nextSibling).toHaveTextContent(
      "3",
    );
    await expect(
      within(canvas.getByRole("list", { name: "Daily Reports" })).getByText(
        "Absent",
      ),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Lunch"), "Curd rice, beans");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Story time" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Apply to everyone present (2)" }),
    );
    await expect(await canvas.findByText(/Added to the reports/)).toBeVisible();
    await expect(
      calls.find(
        (call) => call.route === "POST /daily-reports/apply-to-classroom",
      )?.body,
    ).toMatchObject({
      classroomId: NURSERY_A,
      meals: [{ meal: "lunch", menu: "Curd rice, beans" }],
      activities: ["Story time"],
    });
    await waitFor(() =>
      expect(counts.getByText("Draft").nextSibling).toHaveTextContent("2"),
    );

    await userEvent.click(canvas.getByRole("button", { name: /Aadhya Kumar/ }));
    const editor = within(
      canvas.getByRole("form", { name: "Daily Report for Aadhya Kumar" }),
    );
    await expect(editor.getByText(/Curd rice, beans/)).toBeVisible();
    await userEvent.click(
      within(
        editor.getByRole("radiogroup", { name: "Lunch: how much Aadhya ate" }),
      ).getByRole("radio", { name: "Some" }),
    );
    await userEvent.click(editor.getByRole("radio", { name: "Happy" }));
    await userEvent.click(editor.getByRole("button", { name: "Diaper – wet" }));
    await expect(
      editor.getByRole("list", { name: "Toilet entries" }),
    ).toHaveTextContent("Diaper – wet");
    await expect(editor.getByText("Unsaved changes")).toBeVisible();
    await userEvent.click(editor.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.route === "POST /daily-reports/save")?.body,
      ).toMatchObject({
        childId: id(10),
        meals: [{ meal: "lunch", menu: "Curd rice, beans", ate: "some" }],
        mood: "happy",
        activities: ["Story time"],
        toilet: [{ kind: "diaper_wet" }],
      }),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Publish 2 reports to Parents" }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await expect(confirm.getByText(/Parents are emailed/)).toBeVisible();
    await userEvent.click(confirm.getByRole("button", { name: "Publish" }));
    await expect(
      await canvas.findByText("2 reports sent to Parents."),
    ).toBeVisible();
    await waitFor(() =>
      expect(counts.getByText("Published").nextSibling).toHaveTextContent("2"),
    );
    await expect(canvas.getAllByText("Sent 3:40 pm")).toHaveLength(2);
    await expect(
      canvas.queryByRole("button", { name: /Publish \d+ report/ }),
    ).not.toBeInTheDocument();
  },
};

export const NapNeedsBothTimes: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /Meera Iyer/ }),
    );
    const editor = within(
      canvas.getByRole("form", { name: "Daily Report for Meera Iyer" }),
    );
    await userEvent.click(editor.getByRole("switch", { name: "No nap" }));
    await userEvent.type(editor.getByLabelText("From"), "13:00");
    await userEvent.click(editor.getByRole("button", { name: "Save draft" }));
    await expect(
      await editor.findByText(
        "Enter when the nap started and ended, or switch on No nap.",
      ),
    ).toBeVisible();
  },
};

export const ReadOnlyDay: Story = {
  beforeEach: () => api({ editable: false }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Read only")).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "For the whole Classroom" }),
    ).not.toBeInTheDocument();
  },
};

/** At 375 px the page does not scroll sideways, with an editor open. */
export const Phone: Story = {
  beforeEach: () => api(),
  decorators: [withPhoneFrame],
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /Aadhya Kumar/ }),
    );
    await canvas.findByRole("form", { name: "Daily Report for Aadhya Kumar" });
    await expectFitsPhone(canvasElement);
  },
};
