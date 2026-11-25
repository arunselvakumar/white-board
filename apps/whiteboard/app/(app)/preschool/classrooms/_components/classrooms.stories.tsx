import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ClassroomDetailScreen } from "@/app/(app)/preschool/classrooms/[id]/_components/classroom-detail-screen";
import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type {
  PreschoolClassroom,
  PreschoolClassroomDetail,
} from "@/src/queries/preschool/classrooms";
import type { PreschoolStaff } from "@/src/queries/preschool/staff";

import { ClassroomsScreen } from "./classrooms-screen";

const id = (n: number) =>
  `8b0e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;

const CURRENT = { id: id(1), name: "2026–27" };
const NEXT = { id: id(2), name: "2027–28" };
const YEARS = [
  { ...NEXT, startsOn: "2027-04-01", endsOn: "2028-03-31", isCurrent: false },
  { ...CURRENT, startsOn: "2026-04-01", endsOn: "2027-03-31", isCurrent: true },
];
const NURSERY = { id: id(10), name: "Nursery (Pre-KG)" };
const LKG = { id: id(11), name: "LKG" };
const PROGRAMMES = [NURSERY, LKG].map((programme, index) => ({
  ...programme,
  minAgeMonths: null,
  maxAgeMonths: null,
  isDaycare: false,
  sortOrder: index,
  isArchived: false,
}));

function classroom(
  overrides: Partial<PreschoolClassroom> = {},
): PreschoolClassroom {
  return {
    id: id(20),
    centreId: CENTRE_IDS.annaNagar,
    academicYearId: CURRENT.id,
    programmeId: NURSERY.id,
    programmeName: NURSERY.name,
    name: "Nursery A",
    capacity: 20,
    childCount: 17,
    seatsLeft: 3,
    isArchived: false,
    teachers: [{ staffId: id(40), name: "Meena R" }],
    ...overrides,
  };
}

const CLASSROOMS = [
  classroom(),
  classroom({
    id: id(21),
    name: "Nursery B",
    capacity: 15,
    childCount: 15,
    seatsLeft: 0,
    teachers: [],
  }),
  classroom({
    id: id(22),
    programmeId: LKG.id,
    programmeName: LKG.name,
    name: "LKG A",
    capacity: 25,
    childCount: 10,
    seatsLeft: 15,
  }),
];

function staff(overrides: Partial<PreschoolStaff>): PreschoolStaff {
  return {
    id: id(40),
    centreId: CENTRE_IDS.annaNagar,
    name: "Meena R",
    role: "teacher",
    status: "active",
    phone: null,
    email: null,
    designation: null,
    joinedOn: null,
    invitedAt: null,
    canSignIn: true,
    classrooms: [],
    ...overrides,
  };
}

const STAFF = [
  staff({}),
  staff({ id: id(41), name: "Lakshmi K", role: "centre_head" }),
  staff({
    id: id(42),
    name: "Ravi (helper)",
    role: "helper",
    canSignIn: false,
  }),
  staff({ id: id(43), name: "Old Teacher", status: "inactive" }),
];

const calls: PreschoolApiCall[] = [];

function api(initial: PreschoolClassroom[] = CLASSROOMS) {
  calls.length = 0;
  let classrooms = [...initial];
  return mockPreschoolApi({
    calls,
    routes: {
      "GET /academic-years": () => ({ json: { items: YEARS } }),
      "GET /programmes": () => ({ json: { items: PROGRAMMES } }),
      "GET /classrooms": (_body, url) =>
        url.searchParams.get("academicYearId") === NEXT.id
          ? { json: { academicYear: NEXT, items: [] } }
          : { json: { academicYear: CURRENT, items: classrooms } },
      "POST /classrooms": (body) => {
        const input = body as { name: string; capacity: number };
        const created = classroom({
          ...input,
          id: id(29),
          childCount: 0,
          seatsLeft: input.capacity,
          teachers: [],
          programmeId: LKG.id,
          programmeName: LKG.name,
        });
        classrooms = [...classrooms, created];
        return { status: 201, json: created };
      },
      [`POST /classrooms/${id(20)}/archive`]: () => ({
        status: 409,
        json: {
          code: "CLASSROOM_HAS_CHILDREN",
          message: "Nursery A has 17 Children. Move or withdraw them first.",
        },
      }),
      [`POST /classrooms/${id(21)}/details`]: () => ({
        status: 409,
        json: {
          code: "CLASSROOM_CAPACITY_BELOW_CHILDREN",
          message: "This Classroom has 15 Children; capacity cannot be lower.",
        },
      }),
    },
  });
}

const meta = {
  title: "Preschool/Classrooms",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/classrooms" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
  render: () => <ClassroomsScreen />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ByProgramme: Story = {
  beforeEach: () => api(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Little Steps Anna Nagar · 42 Children · 60 seats · 18 seats left",
      ),
    ).toBeVisible();
    const nursery = within(
      canvas.getByRole("region", { name: "Nursery (Pre-KG)" }),
    );
    await expect(nursery.getByText("3 seats left")).toBeVisible();
    await expect(nursery.getByText("Full")).toBeVisible();
    await expect(nursery.getByText("No Class Teacher yet")).toBeVisible();
    await expect(
      nursery.getByRole("link", { name: "Nursery A" }),
    ).toHaveAttribute("href", `/preschool/classrooms/${id(20)}`);
    await expect(
      within(canvas.getByRole("region", { name: "LKG" })).getByText(
        "15 seats left",
      ),
    ).toBeVisible();
  },
};

export const EmptyYear: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Academic Year" }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "2027–28",
      }),
    );
    await expect(
      await canvas.findByText("No Classrooms in 2027–28"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Classroom" }),
    ).toBeVisible();
  },
};

export const AddClassroom: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Classroom" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Add Classroom" }),
    );
    await userEvent.clear(form.getByLabelText("Capacity"));
    await userEvent.click(form.getByRole("button", { name: "Save Classroom" }));
    await expect(await form.findByText("Choose the Programme")).toBeVisible();
    await expect(form.getByText("Classroom name is required")).toBeVisible();
    await expect(form.getByText("Enter 1 to 200")).toBeVisible();

    await userEvent.click(form.getByLabelText("Programme"));
    await userEvent.click(await body.findByRole("option", { name: "LKG" }));
    await userEvent.type(form.getByLabelText("Classroom name"), "LKG B");
    await userEvent.type(form.getByLabelText("Capacity"), "18");
    await userEvent.click(form.getByRole("button", { name: "Save Classroom" }));
    await waitFor(() =>
      expect(
        body.queryByRole("form", { name: "Add Classroom" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      calls.find((call) => call.route === "POST /classrooms")?.body,
    ).toEqual({
      programmeId: LKG.id,
      name: "LKG B",
      capacity: 18,
      centreId: CENTRE_IDS.annaNagar,
      academicYearId: CURRENT.id,
    });
    await expect(
      await canvas.findByRole("link", { name: "LKG B" }),
    ).toBeVisible();
  },
};

export const EditAndArchiveRefused: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit Nursery B" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Edit Classroom" }),
    );
    await expect(form.queryByLabelText("Programme")).not.toBeInTheDocument();
    await userEvent.clear(form.getByLabelText("Capacity"));
    await userEvent.type(form.getByLabelText("Capacity"), "10");
    await userEvent.click(form.getByRole("button", { name: "Save Classroom" }));
    await expect(
      await form.findByText(
        "This Classroom has 15 Children; capacity cannot be lower.",
      ),
    ).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));

    await userEvent.click(
      canvas.getByRole("button", { name: "Archive Nursery A" }),
    );
    await userEvent.click(
      within(await body.findByRole("alertdialog")).getByRole("button", {
        name: "Archive Classroom",
      }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Nursery A has 17 Children.",
    );
  },
};

const DETAIL: PreschoolClassroomDetail = {
  ...classroom(),
  roster: [
    {
      childId: id(60),
      firstName: "Aadhya",
      lastName: "Kumar",
      admissionNumber: "LSAN-0012",
      dateOfBirth: "2023-02-10",
      photoUrl: null,
      fatherPhone: "9840012345",
      motherPhone: null,
    },
    {
      childId: id(61),
      firstName: "Ishaan",
      lastName: null,
      admissionNumber: "LSAN-0013",
      dateOfBirth: "2022-12-01",
      photoUrl: null,
      fatherPhone: null,
      motherPhone: "9876543210",
    },
  ],
};

function detailApi(
  detail: PreschoolClassroomDetail = DETAIL,
  me = preschoolMe(),
) {
  calls.length = 0;
  let current = detail;
  return mockPreschoolApi({
    me,
    calls,
    routes: {
      "GET /academic-years": () => ({ json: { items: YEARS } }),
      [`GET /classrooms/${id(20)}`]: () => ({ json: current }),
      "GET /staff": () => ({ json: { items: STAFF } }),
      [`POST /classrooms/${id(20)}/teachers`]: (body) => {
        const ids = (body as { staffIds: string[] }).staffIds;
        current = {
          ...current,
          teachers: STAFF.filter((member) => ids.includes(member.id)).map(
            (member) => ({ staffId: member.id, name: member.name }),
          ),
        };
        return { json: current };
      },
    },
  });
}

export const ClassroomRoster: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/classrooms/${id(20)}` } },
  },
  beforeEach: () => detailApi(),
  render: () => <ClassroomDetailScreen classroomId={id(20)} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Nursery A" }),
    ).toBeVisible();
    await expect(canvas.getByText("Nursery (Pre-KG) · 2026–27")).toBeVisible();
    await expect(canvas.getByText("3 seats left")).toBeVisible();
    const row = within(canvas.getByRole("row", { name: /Aadhya Kumar/ }));
    await expect(
      row.getByRole("link", { name: "Aadhya Kumar" }),
    ).toHaveAttribute("href", `/preschool/children/${id(60)}`);
    await expect(row.getByText("LSAN-0012")).toBeVisible();
    await expect(row.getByText("9840012345")).toBeVisible();
    await expect(
      within(canvas.getByRole("row", { name: /Ishaan/ })).getByText(
        "9876543210",
      ),
    ).toBeVisible();
  },
};

export const EmptyRoster: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/classrooms/${id(20)}` } },
  },
  beforeEach: () =>
    detailApi({ ...DETAIL, childCount: 0, seatsLeft: 20, roster: [] }),
  render: () => <ClassroomDetailScreen classroomId={id(20)} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Children in this Classroom yet"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Children" }),
    ).toHaveAttribute("href", "/preschool/children");
  },
};

export const ChangeClassTeachers: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/classrooms/${id(20)}` } },
  },
  beforeEach: () => detailApi(),
  render: () => <ClassroomDetailScreen classroomId={id(20)} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Change Class Teachers" }),
    );
    const picker = within(
      canvas.getByRole("group", { name: "Class Teachers" }),
    );
    await expect(picker.queryByText("Ravi (helper)")).not.toBeInTheDocument();
    await expect(picker.queryByText("Old Teacher")).not.toBeInTheDocument();
    await expect(
      picker.getByRole("checkbox", { name: /Meena R/ }),
    ).toBeChecked();
    await userEvent.click(picker.getByRole("checkbox", { name: /Lakshmi K/ }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Class Teachers" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.route.endsWith("/teachers"))?.body,
      ).toEqual({ staffIds: [id(40), id(41)] }),
    );
    await expect(await canvas.findByText("Meena R, Lakshmi K")).toBeVisible();
  },
};

/** A Teacher reads the roster and Class Teachers but cannot change them. */
export const TeacherReadsRoster: Story = {
  parameters: {
    nextjs: { navigation: { pathname: `/preschool/classrooms/${id(20)}` } },
  },
  beforeEach: () =>
    detailApi(
      DETAIL,
      preschoolMe({
        role: "teacher",
        centres: preschoolMe().centres.slice(0, 1),
        classroomIds: [id(20)],
      }),
    ),
  render: () => <ClassroomDetailScreen classroomId={id(20)} />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Class Teachers: Meena R"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Change Class Teachers" }),
    ).not.toBeInTheDocument();
  },
};
