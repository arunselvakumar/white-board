import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { PreschoolClassroom } from "@/src/queries/preschool/classrooms";
import type {
  PreschoolStaff,
  PreschoolStaffInvitationOutcome,
} from "@/src/queries/preschool/staff";

import { StaffScreen } from "./staff-screen";

const id = (n: number) =>
  `9c0e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;

function member(overrides: Partial<PreschoolStaff>): PreschoolStaff {
  return {
    id: id(1),
    centreId: CENTRE_IDS.annaNagar,
    name: "Meena R",
    role: "teacher",
    status: "active",
    phone: "98400 12345",
    email: "meena@littlesteps.in",
    designation: "Montessori teacher",
    joinedOn: "2025-06-02",
    invitedAt: "2026-06-03T05:00:00.000Z",
    canSignIn: true,
    classrooms: [{ id: id(30), name: "Nursery A" }],
    ...overrides,
  };
}

const STAFF = [
  member({
    id: id(2),
    name: "Lakshmi K",
    role: "centre_head",
    email: "lakshmi@littlesteps.in",
    designation: null,
    classrooms: [],
  }),
  member({}),
  member({
    id: id(3),
    name: "Priya S",
    email: "priya@littlesteps.in",
    invitedAt: null,
    classrooms: [],
  }),
  member({
    id: id(4),
    name: "Ravi",
    role: "helper",
    email: null,
    phone: null,
    canSignIn: false,
    invitedAt: null,
    classrooms: [],
    designation: "Ayah",
  }),
  member({
    id: id(5),
    name: "Old Teacher",
    status: "inactive",
    classrooms: [],
  }),
];

function classroom(
  n: number,
  name: string,
  teacherIds: number[],
): PreschoolClassroom {
  return {
    id: id(n),
    centreId: CENTRE_IDS.annaNagar,
    academicYearId: id(90),
    programmeId: id(91),
    programmeName: "Nursery (Pre-KG)",
    name,
    capacity: 20,
    childCount: 10,
    seatsLeft: 10,
    isArchived: false,
    teachers: teacherIds.map((each) => ({ staffId: id(each), name: "T" })),
  };
}

const CLASSROOMS = [
  classroom(30, "Nursery A", [1]),
  classroom(31, "Nursery B", [9]),
];

const calls: PreschoolApiCall[] = [];

function api({
  staff = STAFF,
  invitation = "sent",
  role = "owner",
}: {
  staff?: PreschoolStaff[];
  invitation?: PreschoolStaffInvitationOutcome;
  role?: "owner" | "centre_head";
} = {}) {
  calls.length = 0;
  let items = [...staff];
  let outcome = invitation;
  return mockPreschoolApi({
    me: preschoolMe(
      role === "owner"
        ? {}
        : { role: "centre_head", centres: preschoolMe().centres.slice(0, 1) },
    ),
    calls,
    routes: {
      "GET /staff": () => ({ json: { items } }),
      "GET /classrooms": () => ({
        json: {
          academicYear: { id: id(90), name: "2026–27" },
          items: CLASSROOMS,
        },
      }),
      "POST /staff": (body) => {
        const input = body as PreschoolStaff;
        const created = member({
          ...input,
          id: id(9),
          invitedAt: outcome === "sent" ? "2026-11-25T05:00:00.000Z" : null,
          canSignIn: input.role !== "helper",
          classrooms: [],
        });
        items = [...items, created];
        return { status: 201, json: { staff: created, invitation: outcome } };
      },
      [`POST /staff/${id(1)}/details`]: (body) => {
        items = items.map((each) =>
          each.id === id(1)
            ? { ...each, ...(body as Partial<PreschoolStaff>) }
            : each,
        );
        return { json: items.find((each) => each.id === id(1)) };
      },
      [`POST /classrooms/${id(30)}/teachers`]: () => ({ json: CLASSROOMS[0] }),
      [`POST /classrooms/${id(31)}/teachers`]: () => ({ json: CLASSROOMS[1] }),
      [`POST /staff/${id(3)}/invite`]: () => {
        const result = outcome;
        outcome = "sent";
        return { json: { staff: STAFF[2], invitation: result } };
      },
      [`POST /staff/${id(1)}/deactivate`]: () => {
        items = items.map((each) =>
          each.id === id(1) ? { ...each, status: "inactive" } : each,
        );
        return { json: items.find((each) => each.id === id(1)) };
      },
    },
  });
}

const meta = {
  title: "Preschool/Staff",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/staff" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
  render: () => <StaffScreen />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
  beforeEach: () => api(),
  play: async ({ canvas }) => {
    const meena = within(await canvas.findByRole("row", { name: /Meena R/ }));
    await expect(meena.getByText("Teacher")).toBeVisible();
    await expect(meena.getByText("98400 12345")).toBeVisible();
    await expect(meena.getByText("Nursery A")).toBeVisible();
    await expect(meena.getByText("Invited 3 Jun")).toBeVisible();
    await expect(
      meena.getByRole("button", { name: "Resend invitation to Meena R" }),
    ).toBeVisible();
    const ravi = within(canvas.getByRole("row", { name: /Ravi/ }));
    await expect(ravi.getByText("Helper")).toBeVisible();
    await expect(ravi.getByText("No sign-in")).toBeVisible();
    await expect(
      within(canvas.getByRole("row", { name: /Priya S/ })).getByRole("button", {
        name: "Send invitation to Priya S",
      }),
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("row", { name: /Old Teacher/ })).getByText(
        "Inactive",
      ),
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("row", { name: /Lakshmi K/ })).getByText(
        "Centre Head",
      ),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: () => api({ staff: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Staff yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Staff member" }),
    ).toBeVisible();
  },
};

export const AddTeacher: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Staff member" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Add Staff member" }),
    );
    await userEvent.click(
      form.getByRole("button", { name: "Save Staff member" }),
    );
    await expect(await form.findByText("Name is required")).toBeVisible();
    await expect(
      form.getByText(
        "Needed to sign in. Saving sends an invitation to this email.",
      ),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Name"), "Kavya N");
    await userEvent.type(form.getByLabelText("Email"), "kavya@littlesteps.in");
    await userEvent.click(form.getByRole("checkbox", { name: /Nursery B/ }));
    await userEvent.click(
      form.getByRole("button", { name: "Save Staff member" }),
    );
    await expect(await canvas.findByText("Invitation sent")).toBeVisible();
    await expect(
      calls.find((call) => call.route === "POST /staff")?.body,
    ).toEqual({
      name: "Kavya N",
      role: "teacher",
      phone: null,
      email: "kavya@littlesteps.in",
      designation: null,
      joinedOn: null,
      classroomIds: [id(31)],
      centreId: CENTRE_IDS.annaNagar,
    });
  },
};

/** A helper has no Classrooms and no sign-in. */
export const AddHelper: Story = {
  beforeEach: () => api({ invitation: "not_sent" }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Staff member" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Add Staff member" }),
    );
    await userEvent.type(form.getByLabelText("Name"), "Selvi");
    await userEvent.click(form.getByLabelText("Role"));
    await userEvent.click(await body.findByRole("option", { name: "Helper" }));
    await expect(form.getByText("Helpers do not sign in.")).toBeVisible();
    await expect(
      form.queryByRole("group", { name: "Class Teacher of" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      form.getByRole("button", { name: "Save Staff member" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.route === "POST /staff")?.body,
      ).toMatchObject({ name: "Selvi", role: "helper", classroomIds: [] }),
    );
    await expect(canvas.queryByText("Invitation sent")).not.toBeInTheDocument();
  },
};

/** A Centre Head cannot add a Centre Head or change one. */
export const CentreHeadSeesNoCentreHeadRole: Story = {
  beforeEach: () => api({ role: "centre_head" }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const lakshmi = within(
      await canvas.findByRole("row", { name: /Lakshmi K/ }),
    );
    await expect(
      lakshmi.queryByRole("button", { name: "Edit Lakshmi K" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Staff member" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Add Staff member" }),
    );
    await userEvent.click(form.getByLabelText("Role"));
    await expect(
      await body.findByRole("option", { name: "Teacher" }),
    ).toBeVisible();
    await expect(
      body.queryByRole("option", { name: "Centre Head" }),
    ).not.toBeInTheDocument();
  },
};

/** Editing a Teacher's Classrooms moves them through each Classroom's Class Teachers. */
export const EditClassrooms: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit Meena R" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Edit Staff member" }),
    );
    await expect(form.getByLabelText("Name")).toHaveValue("Meena R");
    await userEvent.click(form.getByRole("checkbox", { name: /Nursery A/ }));
    await userEvent.click(form.getByRole("checkbox", { name: /Nursery B/ }));
    await userEvent.click(
      form.getByRole("button", { name: "Save Staff member" }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole("form", { name: "Edit Staff member" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      calls.find((call) => call.route === `POST /classrooms/${id(30)}/teachers`)
        ?.body,
    ).toEqual({ staffIds: [] });
    await expect(
      calls.find((call) => call.route === `POST /classrooms/${id(31)}/teachers`)
        ?.body,
    ).toEqual({ staffIds: [id(9), id(1)] });
  },
};

/** A failed invitation says so and can be tried again. */
export const InvitationFailsThenRetries: Story = {
  beforeEach: () => api({ invitation: "failed" }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Send invitation to Priya S" }),
    );
    await expect(
      await canvas.findByText("Could not send the invitation"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(await canvas.findByText("Invitation sent")).toBeVisible();
  },
};

export const AlreadyMember: Story = {
  beforeEach: () => api({ invitation: "already_member" }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Send invitation to Priya S" }),
    );
    await expect(
      await canvas.findByText("Already a member — they can sign in"),
    ).toBeVisible();
  },
};

export const Deactivate: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Deactivate Meena R" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Activate Meena R" }),
    ).toBeVisible();
  },
};
