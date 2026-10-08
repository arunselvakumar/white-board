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
    name: "Suresh Kale",
    designation: {
      id: "0199c3a0-0000-7000-8000-000000000201",
      name: "Site Engineer",
    },
    mobile: "+919876543210",
    email: null,
    address: null,
    aadhaarMasked: null,
    panMasked: null,
    emergencyContact: null,
    memberType: "normal",
    isOwner: false,
    status: "joining_pending",
    projectIds: [],
    permissions: {},
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
  name: "Ramesh Patil",
  designation: { id: "0199c3a0-0000-7000-8000-000000000200", name: "Owner" },
  isOwner: true,
  status: "active",
  userId: "user_owner",
  invitePath: null,
});
const PENDING = member({});
const HRMS = member({
  id: "0199c3a0-0000-7000-8000-000000000102",
  name: "Anita Joshi",
  designation: {
    id: "0199c3a0-0000-7000-8000-000000000202",
    name: "Accountant",
  },
  memberType: "hrms",
  status: "active",
  mobile: null,
  email: "anita@patil.in",
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
  title: "Masters/TeamMembersPage",
  component: TeamMembersPage,
  beforeEach() {
    signInAs("owner", { name: "Patil Builders" });
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
    await expect(await canvas.findByText("3 Team Members")).toBeVisible();
    const rows = within(canvas.getByRole("list"));
    await expect(rows.getByText("Joining Pending")).toBeVisible();
    await expect(rows.getByText("HRMS")).toBeVisible();
    // The Owner has no row actions.
    await expect(
      canvas.queryByRole("button", { name: "Actions for Ramesh Patil" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Suresh Kale" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Share invite link" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByLabelText("Invite link")).toHaveValue(
      `${window.location.origin}/join/Zt0kenZt0kenZt0kenZt0kenZt0ken12`,
    );
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Suresh Kale" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await expect(
      confirm.getByText("Their invitation is cancelled."),
    ).toBeVisible();
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(canvas.queryByText("Suresh Kale")).not.toBeInTheDocument(),
    );
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
    await canvas.findByText("1 Team Member");
    await userEvent.click(
      canvas.getByRole("button", { name: "Joining Pending" }),
    );
    await waitFor(() =>
      expect(fetchMock?.spy).toHaveBeenCalledWith(
        `${LIST}?limit=25&status=joining_pending`,
        expect.anything(),
      ),
    );
    await userEvent.type(canvas.getByLabelText("Search Team Members"), "sur");
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
    await expect(await canvas.findByText("No Team Members yet")).toBeVisible();
    const add = canvas.getAllByRole("link", { name: "Add Team Member" });
    await expect(add.at(-1)).toHaveAttribute(
      "href",
      "/app/masters/team-members/new",
    );
  },
};
