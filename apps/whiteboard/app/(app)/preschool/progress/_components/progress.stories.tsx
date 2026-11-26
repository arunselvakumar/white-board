import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ProgressReportScreen } from "@/app/(app)/preschool/progress/reports/[id]/_components/progress-report-screen";
import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import {
  CURRENT_YEAR_ID,
  NURSERY_A_ID,
  NURSERY_ID,
} from "@/app/(app)/preschool/_components/preschool-story-fixtures";
import type { PreschoolDevelopmentDomain } from "@/src/queries/preschool/observations";
import type {
  PreschoolProgressRating,
  PreschoolProgressReport,
} from "@/src/queries/preschool/progress-reports";

import { ProgressScreen } from "./progress-screen";

const NOW = "2026-11-25T05:00:00.000Z";
const ASHA = "9a0e8400-e29b-41d4-a716-446655440011";
const BALA = "9a0e8400-e29b-41d4-a716-446655440012";
const REPORT_ID = "ab0e8400-e29b-41d4-a716-446655440001";

const DOMAINS: PreschoolDevelopmentDomain[] = [
  "Physical development",
  "Socio-emotional and ethical development",
  "Cognitive development",
  "Language and literacy development",
  "Aesthetic and cultural development",
  "Positive learning habits",
].map((name, index) => ({
  id: `ac0e8400-e29b-41d4-a716-44665544000${String(index)}`,
  name,
  description: null,
  sortOrder: index,
  archived: false,
}));

const CLASSROOMS = {
  academicYear: { id: CURRENT_YEAR_ID, name: "2026–27" },
  items: [
    {
      id: NURSERY_A_ID,
      centreId: CENTRE_IDS.annaNagar,
      academicYearId: CURRENT_YEAR_ID,
      programmeId: NURSERY_ID,
      programmeName: "Nursery (Pre-KG)",
      name: "Nursery A",
      capacity: 20,
      childCount: 2,
      seatsLeft: 18,
      isArchived: false,
      teachers: [],
    },
  ],
};

const CLASSROOM_DETAIL = {
  ...CLASSROOMS.items[0],
  roster: [
    {
      childId: ASHA,
      firstName: "Asha",
      lastName: "R",
      admissionNumber: "LSAN-0001",
      dateOfBirth: "2023-03-10",
      photoUrl: null,
      fatherPhone: null,
      motherPhone: "9000011111",
    },
    {
      childId: BALA,
      firstName: "Bala",
      lastName: null,
      admissionNumber: "LSAN-0002",
      dateOfBirth: "2023-01-20",
      photoUrl: null,
      fatherPhone: "9000022222",
      motherPhone: null,
    },
  ],
};

const TERM = {
  term: "term_2" as const,
  label: "Term 2",
  startsOn: "2026-08-01",
  endsOn: "2026-11-30",
};

function report(
  ratings: {
    domainId: string;
    rating: PreschoolProgressRating;
    remark: string | null;
  }[],
  overrides: Partial<PreschoolProgressReport> = {},
): PreschoolProgressReport {
  const rated = new Map(ratings.map((rating) => [rating.domainId, rating]));
  return {
    id: REPORT_ID,
    status: "draft",
    term: TERM,
    academicYear: { id: CURRENT_YEAR_ID, name: "2026–27" },
    centre: { id: CENTRE_IDS.annaNagar, name: "Little Steps Anna Nagar" },
    child: {
      id: ASHA,
      name: "Asha R",
      admissionNumber: "LSAN-0001",
      dateOfBirth: "2023-03-10",
      classroomName: "Nursery A",
      programmeName: "Nursery (Pre-KG)",
    },
    attendance: { present: 62, marked: 68 },
    ratings: DOMAINS.map((domain) => ({
      domainId: domain.id,
      domainName: domain.name,
      description: domain.description,
      rating: rated.get(domain.id)?.rating ?? null,
      remark: rated.get(domain.id)?.remark ?? null,
    })),
    teacherRemarks: null,
    publishedAt: null,
    updatedAt: NOW,
    observations: [],
    ...overrides,
  };
}

const calls: PreschoolApiCall[] = [];

const commonRoutes = {
  "GET /classrooms": () => ({ json: CLASSROOMS }),
  [`GET /classrooms/${NURSERY_A_ID}`]: () => ({ json: CLASSROOM_DETAIL }),
  "GET /observations/domains": () => ({ json: { items: DOMAINS } }),
};

const meta = {
  title: "Preschool/Progress",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/progress" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The author or a manager corrects an Observation in place. */
export const EditObservation: Story = {
  beforeEach() {
    calls.length = 0;
    let observation = {
      id: "ad0e8400-e29b-41d4-a716-446655440002",
      childId: BALA,
      childName: "Bala",
      domainId: DOMAINS[2]?.id ?? "",
      domainName: DOMAINS[2]?.name ?? "",
      observedOn: "2026-11-24",
      note: "Counted to ten.",
      createdByUserId: "user_owner",
      createdByName: "Arun",
      createdAt: NOW,
      canEdit: true,
    };
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        ...commonRoutes,
        "GET /observations": () => ({
          json: { items: [observation], nextCursor: null, total: 1 },
        }),
        [`POST /observations/${observation.id}/details`]: (body) => {
          const input = body as {
            note: string;
            domainId: string;
            observedOn: string;
          };
          observation = {
            ...observation,
            ...input,
            domainName:
              DOMAINS.find((domain) => domain.id === input.domainId)?.name ??
              "",
          };
          return { json: observation };
        },
      },
    });
  },
  render: () => <ProgressScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Edit the Observation on Bala",
      }),
    );
    const form = within(
      canvas.getByRole("form", { name: "Edit the Observation on Bala" }),
    );
    await expect(form.getByLabelText("Note")).toHaveValue("Counted to ten.");
    await userEvent.clear(form.getByLabelText("Note"));
    await userEvent.type(form.getByLabelText("Note"), "Counted to twenty.");
    await userEvent.click(form.getByLabelText("Development Domain"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: DOMAINS[0]?.name ?? "",
      }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText("Counted to twenty.", { selector: "p" }),
    ).toBeVisible();
    await expect(
      calls.find((call) => call.route.endsWith("/details"))?.body,
    ).toEqual({
      note: "Counted to twenty.",
      domainId: DOMAINS[0]?.id,
      observedOn: "2026-11-24",
    });
  },
};

export const QuickAddObservation: Story = {
  beforeEach() {
    calls.length = 0;
    let saved = false;
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        ...commonRoutes,
        "GET /observations": () => ({
          json: {
            items: saved
              ? [
                  {
                    id: "ad0e8400-e29b-41d4-a716-446655440001",
                    childId: BALA,
                    childName: "Bala",
                    domainId: DOMAINS[2]?.id,
                    domainName: "Cognitive development",
                    observedOn: "2026-11-25",
                    note: "Sorted the beads by colour.",
                    createdByUserId: "user_owner",
                    createdByName: "Arun",
                    createdAt: NOW,
                    canEdit: true,
                  },
                ]
              : [],
            nextCursor: null,
            total: saved ? 1 : 0,
          },
        }),
        "POST /observations": () => {
          saved = true;
          return { status: 201, json: {} };
        },
      },
    });
  },
  render: () => <ProgressScreen />,
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Observation" }),
    );
    await expect(await canvas.findByText("No Observations yet")).toBeVisible();
    await userEvent.click(
      form.getByRole("button", { name: "Save Observation" }),
    );
    await expect(form.getByText("Choose a Child")).toBeVisible();
    await expect(form.getByText("Choose a Development Domain")).toBeVisible();

    await userEvent.click(form.getByRole("button", { name: /Bala/ }));
    await expect(form.getByRole("button", { name: /Bala/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(
      form.getByRole("button", { name: "Cognitive development" }),
    );
    await userEvent.type(
      form.getByLabelText("What you observed"),
      "Sorted the beads by colour.",
    );
    await userEvent.click(
      form.getByRole("button", { name: "Save Observation" }),
    );
    await expect(await form.findByText("Saved for Bala.")).toBeVisible();
    await expect(form.getByLabelText("What you observed")).toHaveValue("");
    await expect(
      calls.find((call) => call.route === "POST /observations")?.body,
    ).toMatchObject({
      childId: BALA,
      domainId: DOMAINS[2]?.id,
      note: "Sorted the beads by colour.",
    });
    await expect(
      await canvas.findByText("Sorted the beads by colour.", { selector: "p" }),
    ).toBeVisible();
  },
};

export const ReportEditorPublish: Story = {
  beforeEach() {
    calls.length = 0;
    let ratings: Parameters<typeof report>[0] = [];
    let status: "draft" | "published" = "draft";
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        ...commonRoutes,
        "GET /observations": () => ({
          json: {
            items: [
              {
                id: "ad0e8400-e29b-41d4-a716-446655440002",
                childId: ASHA,
                childName: "Asha R",
                domainId: DOMAINS[0]?.id,
                domainName: "Physical development",
                observedOn: "2026-10-12",
                note: "Hopped on one foot.",
                createdByUserId: "user_owner",
                createdByName: "Arun",
                createdAt: NOW,
                canEdit: true,
              },
            ],
            nextCursor: null,
            total: 1,
          },
        }),
        "GET /progress-reports": () => ({
          json: {
            classroom: {
              id: NURSERY_A_ID,
              name: "Nursery A",
              programmeName: "Nursery (Pre-KG)",
              centreId: CENTRE_IDS.annaNagar,
            },
            academicYear: { id: CURRENT_YEAR_ID, name: "2026–27" },
            term: TERM,
            counts: { none: 2, draft: 0, published: 0 },
            children: [
              {
                childId: ASHA,
                name: "Asha R",
                photoUrl: null,
                reportId: null,
                status: "none",
                updatedAt: null,
              },
              {
                childId: BALA,
                name: "Bala",
                photoUrl: null,
                reportId: null,
                status: "none",
                updatedAt: null,
              },
            ],
          },
        }),
        "POST /progress-reports/save": (body) => {
          ratings = (body as { ratings: typeof ratings }).ratings;
          return { json: report(ratings, { status }) };
        },
        [`POST /progress-reports/${REPORT_ID}/publish`]: () => {
          if (ratings.length < DOMAINS.length)
            return {
              status: 409,
              json: {
                code: "PROGRESS_REPORT_INCOMPLETE",
                message: `Rate every Development Domain before publishing (${String(DOMAINS.length - ratings.length)} left).`,
                details: {
                  missingDomainIds: DOMAINS.slice(ratings.length).map(
                    (domain) => domain.id,
                  ),
                },
              },
            };
          status = "published";
          return {
            json: report(ratings, { status, publishedAt: NOW }),
          };
        },
      },
    });
  },
  render: () => <ProgressScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Progress Reports" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Open Asha R's report" }),
    );
    const domains = within(
      await canvas.findByRole("list", { name: "Development Domains" }),
    );
    const rate = async (domain: string, rating: string) => {
      const row = within(domains.getByRole("listitem", { name: domain }));
      await userEvent.click(row.getByRole("button", { name: rating }));
    };
    await rate("Physical development", "Proficient");
    await rate("Socio-emotional and ethical development", "Progressing");
    await expect(domains.getByText("1 Observation this term")).toBeVisible();

    const publish = async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Publish" }));
      const dialog = within(await body.findByRole("alertdialog"));
      await expect(dialog.getByText(/The Parents are emailed/)).toBeVisible();
      await userEvent.click(dialog.getByRole("button", { name: "Publish" }));
    };
    await publish();
    await expect(
      await canvas.findByText(
        "Rate every Development Domain before publishing (4 left).",
      ),
    ).toBeVisible();
    await expect(domains.getAllByText("Choose a rating.")).toHaveLength(4);

    for (const domain of DOMAINS.slice(2)) await rate(domain.name, "Beginning");
    await publish();
    await waitFor(() =>
      expect(canvas.getByText("Published", { selector: "span" })).toBeVisible(),
    );
    await expect(
      canvas.getByRole("link", { name: "Print view" }),
    ).toHaveAttribute("href", `/preschool/progress/reports/${REPORT_ID}`);
    const lastSave = calls
      .filter((call) => call.route === "POST /progress-reports/save")
      .at(-1)?.body as { ratings: unknown[]; childId: string };
    await expect(lastSave.childId).toBe(ASHA);
    await expect(lastSave.ratings).toHaveLength(6);
  },
};

export const PrintableReport: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: `/preschool/progress/reports/${REPORT_ID}` },
    },
  },
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        [`GET /progress-reports/${REPORT_ID}`]: () => ({
          json: report(
            DOMAINS.map((domain, index) => ({
              domainId: domain.id,
              rating:
                (["beginning", "progressing", "proficient"] as const)[
                  index % 3
                ] ?? "beginning",
              remark: index === 0 ? "Runs, hops and climbs with ease." : null,
            })),
            {
              status: "published",
              publishedAt: NOW,
              teacherRemarks: "A cheerful term.\nAsha made many friends.",
            },
          ),
        }),
      },
    });
  },
  render: () => <ProgressReportScreen reportId={REPORT_ID} />,
  play: async ({ canvas }) => {
    const article = within(
      await canvas.findByRole("article", {
        name: "Progress Report for Asha R",
      }),
    );
    await expect(
      article.getByRole("heading", {
        name: "Progress Report — Term 2, 2026–27",
      }),
    ).toBeVisible();
    await expect(article.getByText("62 of 68 days")).toBeVisible();
    await expect(
      article.getByRole("img", { name: "Physical development: Beginning" }),
    ).toBeVisible();
    await expect(
      article.getByRole("img", {
        name: "Cognitive development: Proficient",
      }),
    ).toBeVisible();
    await expect(article.getByText("Class Teacher")).toBeVisible();
    await expect(article.getByText("Centre Head")).toBeVisible();
    await expect(
      article.getByText(/Shows this confidently on their own/),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Print" })).toBeVisible();
  },
};
