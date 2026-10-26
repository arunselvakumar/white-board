import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { TeamMember } from "@/src/queries/team-members";

import { mockFetch } from "../../.storybook/mock-fetch";
import { signInAs } from "../../.storybook/mocks/auth";
import { TeamMembersPage } from "./team-members-page";

const LIST = "/api/construction/organization/team-members";

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    id: "0199c3a0-0000-7000-8000-000000000101",
    userId: null,
    name: "Prabhu Saravanan",
    mobile: "+917708165767",
    email: "prabhu@sakthi.in",
    address: null,
    aadhaarMasked: null,
    panMasked: null,
    emergencyContact: null,
    salaryType: "monthly",
    salaryPerDay: null,
    salaryPerMonth: null,
    overtimeWagePerHour: 0,
    workingHoursPerDay: "8",
    weeklyHolidays: [0],
    memberType: "normal",
    isOwner: false,
    status: "joining_pending",
    mobileLocked: false,
    projectIds: [],
    role: { id: "0199c3a0-0000-7000-8000-000000000301", name: "Site Engineer" },
    permissions: {},
    canSetPassword: true,
    invitePath: "/join/Zt0kenZt0kenZt0kenZt0kenZt0ken12",
    invitedAt: "2026-10-08T06:30:00.000Z",
    joinedAt: null,
    createdAt: "2026-10-08T06:30:00.000Z",
    updatedAt: "2026-10-08T06:30:00.000Z",
    ...overrides,
  };
}

const OWNER = member({
  id: "0199c3a0-0000-7000-8000-000000000100",
  name: "Arun Selva Kumar",
  isOwner: true,
  status: "active",
  userId: "user_owner",
  invitePath: null,
  role: null,
  canSetPassword: false,
});
const PENDING = member({});
const HRMS = member({
  id: "0199c3a0-0000-7000-8000-000000000102",
  name: "Anitha Selvi",
  memberType: "hrms",
  status: "active",
  mobile: null,
  email: "anitha@anugraha.in",
  invitePath: null,
  role: { id: "0199c3a0-0000-7000-8000-000000000303", name: "HRMS Staff" },
});

/** No email: a record that cannot sign in or be invited (ADR CM-0009). */
const MOBILE_ONLY = member({
  id: "0199c3a0-0000-7000-8000-000000000103",
  name: "Ganesh Kumar",
  mobile: "+919812345678",
  email: null,
});
const DECLINED = member({
  id: "0199c3a0-0000-7000-8000-000000000104",
  name: "Vignesh Pandian",
  email: "vignesh@anugraha.in",
  mobile: null,
  status: "rejected",
  invitePath: null,
});
const DECLINED_MOBILE_ONLY = member({
  id: "0199c3a0-0000-7000-8000-000000000105",
  name: "Senthil Kumar",
  mobile: "+919811122233",
  email: null,
  status: "rejected",
  invitePath: null,
});

let fetchMock: ReturnType<typeof mockFetch> | null = null;

function page(items: TeamMember[]) {
  return Response.json({
    items,
    total: items.length,
    nextCursor: null,
    prevCursor: null,
  });
}

const meta = {
  title: "Staff & Roles/Staff/List",
  component: TeamMembersPage,
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
} satisfies Meta<typeof TeamMembersPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithMembers: Story = {
  beforeEach() {
    let items = [HRMS, PENDING, OWNER];
    fetchMock = mockFetch([
      {
        path: LIST,
        respond: () => page(items),
      },
      {
        method: "POST",
        path: `${LIST}/${PENDING.id}/remove`,
        respond: () => {
          items = items.filter((item) => item.id !== PENDING.id);
          return new Response(null, { status: 204 });
        },
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("3 Staff")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Staff" })).toBeVisible();
    const rows = within(canvas.getByRole("list", { name: "Staff" }));
    await expect(rows.getByText("Joining Pending")).toBeVisible();
    await expect(rows.getByText("HRMS")).toBeVisible();
    // Each row names its Role; the Owner has none.
    await expect(rows.getAllByText("HRMS Staff")[0]).toBeInTheDocument();
    await expect(rows.getAllByText("Site Engineer").length).toBeGreaterThan(1);
    await expect(rows.getAllByText("Owner")[0]).toBeInTheDocument();
    // The Owner has no row actions.
    await expect(
      canvas.queryByRole("button", { name: "Actions for Arun Selva Kumar" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Prabhu Saravanan" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Share invite link" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByLabelText("Invite link")).toHaveValue(
      `${window.location.origin}/join/Zt0kenZt0kenZt0kenZt0kenZt0ken12`,
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Prabhu Saravanan" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    // The dialog animates in; it takes clicks only once fully open.
    await waitFor(() =>
      expect(confirm.getByText("Their invitation is cancelled.")).toBeVisible(),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(canvas.queryByText("Prabhu Saravanan")).not.toBeInTheDocument(),
    );
  },
};

export const InviteNeedsAnEmail: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      {
        path: LIST,
        respond: () => page([MOBILE_ONLY, DECLINED, DECLINED_MOBILE_ONLY]),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("3 Staff")).toBeVisible();
    // Menus animate in; their items are there before they are fully opaque.

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Ganesh Kumar" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Edit" }),
    ).toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: "Share invite link" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("menu")).not.toBeInTheDocument(),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Vignesh Pandian" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Invite again" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("menu")).not.toBeInTheDocument(),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Senthil Kumar" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Edit" }),
    ).toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: "Invite again" }),
    ).not.toBeInTheDocument();
  },
};

export const FiltersByStatus: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      {
        path: LIST,
        respond: () => page([PENDING]),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("1 Staff member");
    await userEvent.click(
      canvas.getByRole("tab", { name: /^Joining Pending/ }),
    );
    await waitFor(() =>
      expect(fetchMock?.spy).toHaveBeenCalledWith(
        `${LIST}?limit=25&status=joining_pending`,
        expect.anything(),
      ),
    );
    await userEvent.type(canvas.getByLabelText("Search Staff"), "sur");
    await waitFor(() =>
      expect(fetchMock?.spy).toHaveBeenCalledWith(
        `${LIST}?limit=25&search=sur&status=joining_pending`,
        expect.anything(),
      ),
    );
  },
};

export const Empty: Story = {
  beforeEach() {
    fetchMock = mockFetch([{ path: LIST, respond: () => page([]) }]);
    return fetchMock.restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Staff yet")).toBeVisible();
    const add = canvas.getAllByRole("link", { name: "Add Staff" });
    await expect(add.at(-1)).toHaveAttribute("href", "/app/staff/new");
  },
};

/** At phone width the Role moves under the details; nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach() {
    fetchMock = mockFetch([
      { path: LIST, respond: () => page([HRMS, PENDING, OWNER]) },
    ]);
    return fetchMock.restore;
  },
  render: () => (
    <div data-testid="phone" style={{ width: 375 }}>
      <TeamMembersPage />
    </div>
  ),
  play: async ({ canvas }) => {
    await canvas.findByText("3 Staff");
    await expect(canvas.getAllByText("Role:")[0]).toBeVisible();
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(375);
  },
};
