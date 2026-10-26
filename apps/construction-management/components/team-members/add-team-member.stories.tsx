import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";
import {
  HRMS_STAFF_ROLE,
  ROLES,
  ROLES_URL,
  SITE_ENGINEER_ROLE,
} from "@/components/roles/role-fixtures";

import { mockFetch, type MockRoute } from "../../.storybook/mock-fetch";
import { signInAs } from "../../.storybook/mocks/auth";
import { AddTeamMember } from "./add-team-member";
import { teamMember } from "./team-member-fixtures";

const MEMBERS_URL = "/api/construction/organization/team-members";
const SRI_HEIGHTS = "0199a000-0000-7000-8000-000000000001";

let fetchMock: ReturnType<typeof mockFetch> | null = null;

function sentBody(): Record<string, unknown> {
  const call = fetchMock?.spy.mock.calls.find(
    ([, init]) => init?.method === "POST",
  );
  const body = call?.[1]?.body;
  return JSON.parse(typeof body === "string" ? body : "{}") as Record<
    string,
    unknown
  >;
}

/** Roles, Projects, and `created` as the POST's answer. */
function serve(created: () => Response, extra: MockRoute[] = []) {
  return () => {
    fetchMock = mockFetch([
      { path: ROLES_URL, respond: () => Response.json({ items: ROLES }) },
      {
        path: "/api/construction/projects/projects/options",
        respond: () =>
          Response.json({
            items: [
              { id: SRI_HEIGHTS, name: "Sri Heights", status: "ongoing" },
              {
                id: "0199a000-0000-7000-8000-000000000002",
                name: "Green Valley",
                status: "not_started",
              },
            ],
          }),
      },
      { method: "POST", path: MEMBERS_URL, respond: created },
      ...extra,
    ]);
    return fetchMock.restore;
  };
}

function createdAs(overrides: Parameters<typeof teamMember>[0] = {}) {
  return () =>
    Response.json(
      { ...teamMember(overrides), passwordIgnored: null },
      { status: 201 },
    );
}

const meta = {
  title: "Staff & Roles/Staff/AddStaff",
  component: AddTeamMember,
  args: { canSeeSalary: true },
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
  render: (args) => (
    <QuerySuspense>
      <AddTeamMember {...args} />
    </QuerySuspense>
  ),
} satisfies Meta<typeof AddTeamMember>;

export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

async function choose(
  { canvas, canvasElement, userEvent }: Context,
  label: string,
  name: string | RegExp,
) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByLabelText(label));
  await userEvent.click(await body.findByRole("option", { name }));
}

/** The name, the one field every path fills. */
async function fillBasics(context: Context, name = "Prabhu Saravanan") {
  await context.userEvent.type(
    await context.canvas.findByLabelText("Name"),
    name,
  );
}

/** Email typed: Invite them ticks itself; the share link follows. */
export const InviteByEmail: Story = {
  beforeEach: serve(createdAs()),
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    // One page: every card is there at once, with one button.
    for (const card of ["Details", "Salary", "Projects", "Role", "Sign-in"])
      await expect(
        await canvas.findByRole("heading", { name: new RegExp(`^${card}`) }),
      ).toBeVisible();
    await expect(canvas.queryByText(/Step \d of/)).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Cancel" }),
    ).toHaveAttribute("href", "/app/staff");
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await expect(await canvas.findByText("Enter the name")).toBeVisible();
    await expect(
      canvas.getByText("Enter a mobile number or an email"),
    ).toBeVisible();
    // The first field in error takes the focus, so the page scrolls to it.
    await expect(canvas.getByLabelText("Name")).toHaveFocus();

    await fillBasics(context);
    const invite = canvas.getByRole("checkbox", { name: /Invite them/ });
    await expect(invite).toHaveAttribute("data-disabled");
    await expect(
      canvas.getByText("Type an email to invite them."),
    ).toBeVisible();
    await expect(
      canvas.getByText(/They are a record until you invite them/),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Email"), "prabhu@sakthi.in");
    await expect(invite).not.toHaveAttribute("data-disabled");
    await expect(invite).toBeChecked();
    await expect(
      canvas.getByText(/We email them a link to join Anugraha Engineers/),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.type(canvas.getByLabelText("Aadhaar"), "2341 2341 2346");

    // The salary is set up like a Labour's wage, Monthly by default, the
    // amount optional; overtime shows once there is one (ADR CM-0033 §3).
    await expect(
      canvas.queryByLabelText("Overtime per hour"),
    ).not.toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("Salary per month"), "25k");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );
    await expect(
      await canvas.findByText("Enter an amount in rupees, like 700 or 700.50"),
    ).toBeVisible();
    await userEvent.clear(canvas.getByLabelText("Salary per month"));
    await userEvent.type(canvas.getByLabelText("Salary per month"), "25,000");
    await userEvent.clear(canvas.getByLabelText("Overtime per hour"));
    await userEvent.type(canvas.getByLabelText("Overtime per hour"), "150");
    await userEvent.clear(canvas.getByLabelText("Working hours per day"));
    await userEvent.type(canvas.getByLabelText("Working hours per day"), "9");
    await userEvent.click(canvas.getByRole("button", { name: "Sat" }));

    await userEvent.click(canvas.getByRole("checkbox", { name: /Sri Heights/ }));

    // No Role yet: the Role card says so.
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );
    await expect(
      await canvas.findByText("Choose a Role", { selector: "p" }),
    ).toBeVisible();
    await choose(context, "Role", /^Site Engineer/);
    // What the Role may do folds away until asked for, read-only.
    await userEvent.click(
      canvas.getByRole("button", { name: "Show what this Role may do" }),
    );
    await expect(
      await canvas.findByRole("checkbox", { name: "Add — Attendance" }),
    ).toBeChecked();
    await expect(
      canvas.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Open in Role Management" }),
    ).toHaveAttribute("href", `/app/roles/${SITE_ENGINEER_ROLE.id}`);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );

    await expect(
      await canvas.findByRole("heading", {
        name: "Prabhu Saravanan is invited",
      }),
    ).toBeVisible();
    await expect(sentBody()).toMatchObject({
      name: "Prabhu Saravanan",
      email: "prabhu@sakthi.in",
      mobile: "+917708165767",
      memberType: "normal",
      projectIds: [SRI_HEIGHTS],
      roleId: SITE_ENGINEER_ROLE.id,
      invite: true,
      password: null,
      salaryType: "monthly",
      salaryPerDay: null,
      salaryPerMonth: 2_500_000,
      overtimeWagePerHour: 15_000,
      workingHoursPerDay: "9",
      weeklyHolidays: [0, 6],
    });
    await expect("permissions" in sentBody()).toBe(false);
    await userEvent.click(
      canvas.getByRole("button", { name: "Share invite link" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByLabelText("Invite link")).toBeVisible(),
    );
  },
};

/** A Daily salary: the amount follows the type. */
export const DailySalary: Story = {
  beforeEach: serve(createdAs({ email: null })),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context);
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.click(canvas.getByRole("button", { name: "Daily" }));
    await userEvent.type(canvas.getByLabelText("Salary per day"), "900");
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await waitFor(() =>
      expect(sentBody()).toMatchObject({
        salaryType: "daily",
        salaryPerDay: 90_000,
        salaryPerMonth: null,
        overtimeWagePerHour: 0,
        workingHoursPerDay: "8",
        weeklyHolidays: [0],
      }),
    );
  },
};

/**
 * Without Financial on Staff the salary type and amounts are neither shown
 * nor sent, as a Labour's wage (ADR CM-0032 §3); working hours and weekly
 * holidays still are.
 */
export const WithoutSalaryRight: Story = {
  args: { canSeeSalary: false },
  beforeEach: serve(createdAs({ email: null })),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context);
    await expect(
      canvas.getByText(
        "You cannot see salaries. Ask the Owner for the Financial right on Staff.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText("Salary per month"),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("Salary type")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Working hours per day")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await waitFor(() => expect(sentBody()).toMatchObject({ invite: false }));
    for (const key of [
      "salaryType",
      "salaryPerDay",
      "salaryPerMonth",
      "overtimeWagePerHour",
    ])
      await expect(key in sentBody()).toBe(false);
    await expect(sentBody()).toMatchObject({
      workingHoursPerDay: "8",
      weeklyHolidays: [0],
    });
  },
};

/** A password set: Invite them steps aside; they can sign in now. */
export const SetAPassword: Story = {
  beforeEach: serve(
    createdAs({ email: null, status: "active", userId: "user_prabhu" }),
  ),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context);
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.type(canvas.getByLabelText("Email"), "prabhu@sakthi.in");
    const invite = canvas.getByRole("checkbox", { name: /Invite them/ });
    await expect(invite).toBeChecked();

    await userEvent.type(canvas.getByLabelText("Set a password"), "short");
    await expect(invite).not.toBeChecked();
    await expect(invite).toHaveAttribute("data-disabled");
    await expect(
      canvas.getByText("Not needed: they sign in with the password you set."),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "They can sign in now with their mobile or email and this password. They must change it the first time they sign in.",
      ),
    ).toBeVisible();
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await expect(
      await canvas.findByText("Use at least 8 characters"),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Set a password"), "-site-26");
    await userEvent.click(
      canvas.getByRole("button", { name: "Show password" }),
    );
    await expect(canvas.getByLabelText("Set a password")).toHaveAttribute(
      "type",
      "text",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));

    await expect(
      await canvas.findByRole("heading", {
        name: "Prabhu Saravanan can sign in now",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "They sign in with their mobile and the password you set, and must change it the first time they sign in.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Share invite link" }),
    ).not.toBeInTheDocument();
    await expect(sentBody()).toMatchObject({
      invite: false,
      password: "short-site-26",
      roleId: SITE_ENGINEER_ROLE.id,
    });
  },
};

/** Someone already uses that mobile: no password, a Join Request instead. */
export const ExistingAccount: Story = {
  beforeEach: serve(() =>
    Response.json(
      { ...teamMember({ email: null }), passwordIgnored: "existing_account" },
      { status: 201 },
    ),
  ),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context);
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.type(
      canvas.getByLabelText("Set a password"),
      "site-pass-26",
    );
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await expect(
      await canvas.findByRole("heading", {
        name: "Prabhu Saravanan already has an account",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/we did not set the password\. They got a Join Request/),
    ).toBeVisible();
  },
};

/** Neither invited nor a password: a record until later. */
export const RecordOnly: Story = {
  beforeEach: serve(createdAs({ email: null, invitePath: null })),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context);
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await expect(
      canvas.getByText(
        "They are a record until you invite them or set a password. You can do either later from Edit Staff.",
      ),
    ).toBeVisible();
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await expect(
      await canvas.findByRole("heading", { name: "Prabhu Saravanan is added" }),
    ).toBeVisible();
    await expect(sentBody()).toMatchObject({ invite: false, password: null });
  },
};

/** An email, but Invite them unticked: they are not invited. */
export const EmailWithoutInvite: Story = {
  beforeEach: serve(createdAs()),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context);
    await userEvent.type(canvas.getByLabelText("Email"), "prabhu@sakthi.in");
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Invite them/ }),
    );
    await choose(context, "Role", /^Accountant/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await expect(
      await canvas.findByRole("heading", { name: "Prabhu Saravanan is added" }),
    ).toBeVisible();
    await expect(sentBody()).toMatchObject({ invite: false, password: null });
  },
};

/** HRMS staff: no Projects card, and HRMS Staff is chosen for them. */
export const HrmsMemberStartsOnHrmsStaff: Story = {
  beforeEach: serve(createdAs({ name: "Anitha", memberType: "hrms" })),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await expect(
      await canvas.findByRole("heading", { name: "Projects" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByText("HRMS only"));
    await expect(
      canvas.queryByRole("heading", { name: "Projects" }),
    ).not.toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("Name"), "Anitha");
    await userEvent.type(canvas.getByLabelText("Email"), "anitha@anugraha.in");
    await expect(canvas.getByLabelText("Role")).toHaveTextContent("HRMS Staff");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );
    await waitFor(() =>
      expect(sentBody()).toMatchObject({
        memberType: "hrms",
        mobile: null,
        projectIds: [],
        roleId: HRMS_STAFF_ROLE.id,
        invite: true,
      }),
    );
  },
};

/** A server error lands on its field, in whichever card owns it. */
export const MobileAlreadyInUse: Story = {
  beforeEach: serve(() =>
    Response.json(
      {
        code: "MEMBER_MOBILE_IN_USE",
        message: "Another Team Member in this Company has this mobile number.",
      },
      { status: 409 },
    ),
  ),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context, "Prabhu");
    await userEvent.type(canvas.getByLabelText("Mobile"), "7708165767");
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await expect(
      await canvas.findByText(
        "Another Team Member in this Company has this mobile number.",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Mobile")).toHaveFocus();
  },
};

/** The salary's server errors land in the Salary card. */
export const SalaryErrorOnField: Story = {
  beforeEach: serve(() =>
    Response.json(
      {
        code: "WORKING_HOURS_INVALID",
        message:
          "Working hours must be more than 0 and at most 24, in steps of 0.01.",
      },
      { status: 400 },
    ),
  ),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await fillBasics(context);
    await userEvent.type(canvas.getByLabelText("Mobile"), "7708165767");
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add Staff" }));
    await expect(
      await canvas.findByText(
        "Working hours must be more than 0 and at most 24, in steps of 0.01.",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Working hours per day")).toHaveFocus();
  },
};

/** At phone width the cards stack; nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: serve(createdAs()),
  render: (args) => (
    <div data-testid="phone" style={{ width: 375 }}>
      <QuerySuspense>
        <AddTeamMember {...args} />
      </QuerySuspense>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Set a password"),
      "site-pass-26",
    );
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(375);
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  beforeEach: serve(createdAs()),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Email"),
      "prabhu@sakthi.in",
    );
    await expect(
      canvas.getByRole("checkbox", { name: /Invite them/ }),
    ).toBeChecked();
  },
};
