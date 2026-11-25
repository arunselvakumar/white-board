import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { ChildScreen } from "@/app/(app)/preschool/children/[id]/_components/child-screen";
import { AdmissionScreen } from "@/app/(app)/preschool/children/new/_components/admission-screen";
import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import {
  CHILD_FORM_OPTIONS,
  CURRENT_YEAR_ID,
  NURSERY_A_ID,
  NURSERY_B_ID,
  NURSERY_ID,
} from "@/app/(app)/preschool/_components/preschool-story-fixtures";
import type {
  PreschoolChild,
  PreschoolChildPage,
  PreschoolChildProfile,
} from "@/src/queries/preschool/children";

import { ChildrenScreen } from "./children-screen";

const NOW = "2026-11-25T05:00:00.000Z";
const CHILD_ID = "9a0e8400-e29b-41d4-a716-446655440001";

function listItem(overrides: Partial<PreschoolChild> = {}): PreschoolChild {
  return {
    id: CHILD_ID,
    centreId: CENTRE_IDS.annaNagar,
    admissionNumber: "LSAN-0007",
    firstName: "Aarav",
    lastName: "Kumar",
    name: "Aarav Kumar",
    photoUrl: null,
    dateOfBirth: "2023-03-10",
    ageText: "3 y 8 m",
    gender: "boy",
    programmeId: NURSERY_ID,
    programmeName: "Nursery (Pre-KG)",
    classroomId: NURSERY_A_ID,
    classroomName: "Nursery A",
    fatherName: "Ravi Kumar",
    fatherPhone: "9840012345",
    motherName: "Meera",
    motherPhone: null,
    status: "active",
    ...overrides,
  };
}

function page(items: PreschoolChild[]): PreschoolChildPage {
  return { items, nextCursor: null, total: items.length };
}

const admission = {
  id: "9b0e8400-e29b-41d4-a716-446655440001",
  academicYearId: CURRENT_YEAR_ID,
  academicYearName: "2026–27",
  programmeId: NURSERY_ID,
  programmeName: "Nursery (Pre-KG)",
  classroomId: NURSERY_A_ID,
  classroomName: "Nursery A",
  admittedOn: "2026-06-01",
  status: "active" as const,
  endedOn: null,
  endReason: null,
};

function profile(
  overrides: Partial<PreschoolChildProfile> = {},
): PreschoolChildProfile {
  return {
    id: CHILD_ID,
    centreId: CENTRE_IDS.annaNagar,
    admissionNumber: "LSAN-0007",
    firstName: "Aarav",
    lastName: "Kumar",
    name: "Aarav Kumar",
    dateOfBirth: "2023-03-10",
    ageText: "3 y 8 m",
    gender: "boy",
    bloodGroup: "O+",
    photoUrl: null,
    motherTongue: "Tamil",
    address: {
      line: "12 Gandhi Street",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600040",
    },
    father: {
      name: "Ravi Kumar",
      phone: "9840012345",
      email: "ravi@example.com",
      occupation: "Engineer",
    },
    mother: { name: "Meera", phone: null, email: null, occupation: null },
    emergencyContact: {
      name: "Grandma",
      phone: "9000011111",
      relationship: "Grandmother",
    },
    health: {
      allergies: "Peanuts",
      medicalConditions: null,
      doctorName: null,
      doctorPhone: null,
      immunisationUpToDate: true,
    },
    documents: {
      hasBirthCertificate: true,
      hasAadhaar: false,
      hasImmunisationCard: true,
      hasPhotos: true,
      hasAddressProof: false,
    },
    status: "active",
    withdrawnOn: null,
    withdrawReason: null,
    currentAdmission: admission,
    admissions: [admission],
    authorisedPickups: [
      {
        id: "9c0e8400-e29b-41d4-a716-446655440001",
        name: "Grandpa",
        relationship: "Grandfather",
        phone: "9000022222",
        photoUrl: null,
      },
    ],
    siblings: [
      {
        id: "9a0e8400-e29b-41d4-a716-446655440002",
        name: "Anika Kumar",
        classroomName: "UKG A",
        status: "active",
      },
    ],
    enquiryId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const calls: PreschoolApiCall[] = [];

const meta = {
  title: "Preschool/Children",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/children" } },
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

const CLASSROOM_LIST = {
  academicYear: { id: CURRENT_YEAR_ID, name: "2026–27" },
  items: [],
};

export const EmptyList: Story = {
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /children": () => ({ json: page([]) }),
        "GET /classrooms": () => ({ json: CLASSROOM_LIST }),
      },
    });
  },
  render: () => <ChildrenScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Children yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Admit a Child" })[0],
    ).toHaveAttribute("href", "/preschool/children/new");
  },
};

export const List: Story = {
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /children": () => ({
          json: page([
            listItem(),
            listItem({
              id: "9a0e8400-e29b-41d4-a716-446655440003",
              admissionNumber: "LSAN-0008",
              firstName: "Diya",
              lastName: null,
              name: "Diya",
              fatherPhone: null,
              motherName: "Priya",
              motherPhone: "9000033333",
              classroomName: "Nursery B",
            }),
          ]),
        }),
        "GET /classrooms": () => ({ json: CLASSROOM_LIST }),
      },
    });
  },
  render: () => <ChildrenScreen />,
  play: async ({ canvas }) => {
    // Cards below `md`, a table above: whichever is shown has the links.
    const [aarav] = await canvas.findAllByRole("link", { name: "Aarav Kumar" });
    await expect(aarav).toHaveAttribute(
      "href",
      `/preschool/children/${CHILD_ID}`,
    );
    await expect(
      canvas.getAllByText("LSAN-0007 · 3 y 8 m").length,
    ).toBeGreaterThan(0);
    const [whatsApp] = canvas.getAllByRole("link", { name: "WhatsApp Priya" });
    await expect(whatsApp).toHaveAttribute(
      "href",
      "https://wa.me/919000033333",
    );
    await expect(canvas.getByText("1–2 of 2")).toBeVisible();
  },
};

/** A Teacher sees no Admit button. */
export const TeacherList: Story = {
  beforeEach() {
    return mockPreschoolApi({
      me: preschoolMe({
        role: "teacher",
        centres: preschoolMe().centres.slice(0, 1),
        hasSeveralCentres: false,
        classroomIds: [NURSERY_A_ID],
      }),
      memberRole: "teacher",
      routes: {
        "GET /children": () => ({ json: page([listItem()]) }),
        "GET /classrooms": () => ({ json: CLASSROOM_LIST }),
      },
    });
  },
  render: () => <ChildrenScreen />,
  play: async ({ canvas }) => {
    await expect(
      (await canvas.findAllByRole("link", { name: "Aarav Kumar" })).length,
    ).toBeGreaterThan(0);
    await expect(
      canvas.queryByRole("link", { name: "Admit a Child" }),
    ).not.toBeInTheDocument();
  },
};

type PlayContext = Parameters<NonNullable<Story["play"]>>[0];

async function fillAdmission(
  { canvas, canvasElement, userEvent }: PlayContext,
  classroom: string,
) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.type(await canvas.findByLabelText("First name"), "Aarav");
  await userEvent.type(canvas.getByLabelText("Date of birth"), "2023-03-10");
  await userEvent.click(canvas.getByLabelText("Gender"));
  await userEvent.click(await body.findByRole("option", { name: "Boy" }));
  await userEvent.click(canvas.getByLabelText("Programme"));
  await userEvent.click(await body.findByRole("option", { name: /Nursery/ }));
  await userEvent.click(canvas.getByLabelText("Classroom"));
  await userEvent.click(
    await body.findByRole("option", { name: new RegExp(classroom) }),
  );
  await userEvent.type(canvas.getByLabelText("Father's name"), "Ravi Kumar");
}

export const Admit: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/children/new" } },
  },
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /children/options": () => ({ json: CHILD_FORM_OPTIONS }),
        "POST /children": () => ({
          status: 201,
          json: { child: profile(), ageWarning: null },
        }),
      },
    });
  },
  render: () => <AdmissionScreen />,
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillAdmission(context, "Nursery A");
    await userEvent.click(canvas.getByRole("button", { name: "Admit Child" }));
    await expect(
      await canvas.findByText(
        "Enter a phone number for the father or the mother",
      ),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Father's mobile"),
      "98400 12345",
    );
    await userEvent.type(
      canvas.getByLabelText("Father's email"),
      "ravi@example.com",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Authorised Pickup" }),
    );
    const pickup = within(
      canvas.getByRole("listitem", { name: "Authorised Pickup 1" }),
    );
    await userEvent.type(pickup.getByLabelText("Name"), "Grandpa");
    await userEvent.type(pickup.getByLabelText("Relationship"), "Grandfather");
    await userEvent.type(pickup.getByLabelText("Mobile"), "9000022222");
    await userEvent.type(canvas.getByLabelText("Allergies"), "Peanuts");
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Birth certificate" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Admit Child" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/preschool/children/${CHILD_ID}`,
      ),
    );
    const sent = calls.find((call) => call.route === "POST /children")?.body as
      Record<string, unknown> | undefined;
    await expect(sent).toMatchObject({
      centreId: CENTRE_IDS.annaNagar,
      child: { firstName: "Aarav", dateOfBirth: "2023-03-10", gender: "boy" },
      father: {
        name: "Ravi Kumar",
        phone: "98400 12345",
        email: "ravi@example.com",
      },
      authorisedPickups: [
        {
          name: "Grandpa",
          relationship: "Grandfather",
          phone: "9000022222",
          photoUrl: null,
        },
      ],
      health: { allergies: "Peanuts", immunisationUpToDate: false },
      documents: { hasBirthCertificate: true, hasAadhaar: false },
      admission: { programmeId: NURSERY_ID, classroomId: NURSERY_A_ID },
    });
  },
};

/** A full Classroom is a form error on the Classroom; a young Child only warns. */
export const ClassroomFull: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/children/new" } },
  },
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /children/options": () => ({ json: CHILD_FORM_OPTIONS }),
        "POST /children": () => ({
          status: 409,
          json: {
            code: "CLASSROOM_FULL",
            message: "The Classroom has no seats left.",
            details: { capacity: 20, filled: 20, seatsLeft: 0 },
          },
        }),
      },
    });
  },
  render: () => <AdmissionScreen />,
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillAdmission(context, "Nursery B");
    await userEvent.clear(canvas.getByLabelText("Date of birth"));
    await userEvent.type(canvas.getByLabelText("Date of birth"), "2024-01-15");
    await expect(
      await canvas.findByText("Age outside the Programme"),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Mother's mobile"),
      "9000033333",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Admit Child" }));
    await expect(
      await canvas.findByText(
        "The Classroom has no seats left. (20 seats, all taken)",
      ),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalledWith(
      expect.stringContaining("/preschool/children/"),
    );
  },
};

export const NoClassroom: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/children/new" } },
  },
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /children/options": () => ({
          json: { ...CHILD_FORM_OPTIONS, classrooms: [] },
        }),
      },
    });
  },
  render: () => <AdmissionScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Classroom this year"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Classrooms" }),
    ).toHaveAttribute("href", "/preschool/classrooms");
  },
};

export const ChildPage: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/children/${CHILD_ID}` } },
  },
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        [`GET /children/${CHILD_ID}`]: () => ({ json: profile() }),
        [`POST /children/${CHILD_ID}/health`]: () => ({
          status: 409,
          json: {
            code: "CHILD_CHANGED",
            message: "Someone else saved this Child since you opened it.",
          },
        }),
        "GET /children/options": () => ({ json: CHILD_FORM_OPTIONS }),
        [`POST /children/${CHILD_ID}/move-classroom`]: () => ({
          json: profile({
            currentAdmission: {
              ...admission,
              id: "9b0e8400-e29b-41d4-a716-446655440002",
              classroomId: NURSERY_B_ID,
              classroomName: "Nursery B",
            },
          }),
        }),
      },
    });
  },
  render: () => <ChildScreen childId={CHILD_ID} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Aarav Kumar" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("LSAN-0007 · 3 y 8 m · Nursery A"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Peanuts", { selector: "div" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open fees" }),
    ).toHaveAttribute("href", `/preschool/fees/children/${CHILD_ID}`);

    await userEvent.click(canvas.getByRole("tab", { name: "Family" }));
    await expect(
      await canvas.findByRole("link", { name: "Anika Kumar" }),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("tab", { name: "Health & documents" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit Health & documents" }),
    );
    await userEvent.click(canvas.getByRole("checkbox", { name: "Aadhaar" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Someone else saved this Child"),
    ).toBeVisible();
    await expect(
      calls.find((call) => call.route.endsWith("/health"))?.body,
    ).toMatchObject({ updatedAt: NOW, documents: { hasAadhaar: true } });

    await userEvent.click(
      canvas.getByRole("button", { name: "Move Classroom" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(await dialog.findByLabelText("New Classroom"));
    await userEvent.click(
      await body.findByRole("option", { name: /Nursery B/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Move Child" }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.route.endsWith("/move-classroom"))?.body,
      ).toMatchObject({ classroomId: NURSERY_B_ID }),
    );
  },
};

/** A Teacher reads the record: no fee link, no editing, no Admission actions. */
export const ChildPageForTeacher: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/children/${CHILD_ID}` } },
  },
  beforeEach() {
    return mockPreschoolApi({
      me: preschoolMe({
        role: "teacher",
        centres: preschoolMe().centres.slice(0, 1),
        classroomIds: [NURSERY_A_ID],
      }),
      memberRole: "teacher",
      routes: {
        [`GET /children/${CHILD_ID}`]: () => ({ json: profile() }),
      },
    });
  },
  render: () => <ChildScreen childId={CHILD_ID} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Aarav Kumar" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Open fees" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /^Edit/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Withdraw" }),
    ).not.toBeInTheDocument();
  },
};

export const WithdrawnChild: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/children/${CHILD_ID}` } },
  },
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        [`GET /children/${CHILD_ID}`]: () => ({
          json: profile({
            status: "withdrawn",
            withdrawnOn: "2026-11-20",
            withdrawReason: "Family moved to Bengaluru",
            currentAdmission: null,
            admissions: [
              {
                ...admission,
                status: "ended",
                endedOn: "2026-11-20",
                endReason: "withdrawn",
              },
            ],
          }),
        }),
      },
    });
  },
  render: () => <ChildScreen childId={CHILD_ID} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Withdrawn on 20 Nov 2026"),
    ).toBeVisible();
    await expect(canvas.getByText("Family moved to Bengaluru")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Move Classroom" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /^Edit/ }),
    ).not.toBeInTheDocument();
  },
};
