import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";
import {
  ACCOUNTANT_ROLE,
  ROLES,
  ROLES_URL,
} from "@/components/roles/role-fixtures";
import type { TeamMember } from "@/src/queries/team-members";

import { mockFetch, type MockRoute } from "../../.storybook/mock-fetch";
import { signInAs } from "../../.storybook/mocks/auth";
import { EditTeamMember } from "./edit-team-member";
import { teamMember } from "./team-member-fixtures";

const MEMBER = teamMember({ status: "active", userId: "user_prabhu" });
const ONE = `/api/construction/organization/team-members/${MEMBER.id}`;

let fetchMock: ReturnType<typeof mockFetch> | null = null;

function bodyOf(path: string): Record<string, unknown> {
  const call = fetchMock?.spy.mock.calls.find(([input]) => input === path);
  const body = call?.[1]?.body;
  return JSON.parse(typeof body === "string" ? body : "{}") as Record<
    string,
    unknown
  >;
}

/** The member and the Roles, plus `extra` routes. */
function serve(member: TeamMember, extra: MockRoute[] = []) {
  return () => {
    fetchMock?.restore();
    fetchMock = mockFetch([
      { path: ROLES_URL, respond: () => Response.json({ items: ROLES }) },
      ...extra,
      { path: ONE, respond: () => Response.json(member) },
    ]);
    return fetchMock.restore;
  };
}

const meta = {
  title: "Staff & Roles/Staff/EditStaff",
  component: EditTeamMember,
  args: { id: MEMBER.id, canSeeSalary: true },
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
  render: (args) => (
    <QuerySuspense>
      <EditTeamMember {...args} />
    </QuerySuspense>
  ),
} satisfies Meta<typeof EditTeamMember>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditDetailsKeepsAadhaar: Story = {
  beforeEach: serve(MEMBER, [
    {
      method: "POST",
      path: `${ONE}/update`,
      respond: () => Response.json({ ...MEMBER, name: "Prabhu K." }),
    },
  ]),
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Name");
    await expect(canvas.getByText("Role: Site Engineer")).toBeVisible();
    await expect(
      canvas.getByText("Leave blank to keep XXXXXXXX2346."),
    ).toBeVisible();
    // While SMS is off the mobile is only a contact, so it stays editable.
    await expect(canvas.getByLabelText("Mobile")).not.toHaveAttribute(
      "readonly",
    );
    await userEvent.clear(name);
    await userEvent.type(name, "Prabhu K.");
    await userEvent.click(canvas.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(bodyOf(`${ONE}/update`)).toMatchObject({ name: "Prabhu K." }),
    );
    // Blank Aadhaar is left out, so the stored one stays.
    await expect("aadhaar" in bodyOf(`${ONE}/update`)).toBe(false);
  },
};

/**
 * The salary set-up shows in rupees, in the card order of Add Staff, and
 * a change sends the whole set-up (ADR CM-0033 §3).
 */
export const EditSalary: Story = {
  beforeEach: serve(
    {
      ...MEMBER,
      salaryPerMonth: 2_500_050,
      overtimeWagePerHour: 10_000,
      workingHoursPerDay: "9.5",
      weeklyHolidays: [0, 6],
    },
    [
      {
        method: "POST",
        path: `${ONE}/update`,
        respond: () => Response.json({ ...MEMBER, salaryPerMonth: 3_000_000 }),
      },
    ],
  ),
  play: async ({ canvas, userEvent }) => {
    const salary = await canvas.findByLabelText("Salary per month");
    await expect(salary).toHaveValue("25000.50");
    await expect(canvas.getByLabelText("Overtime per hour")).toHaveValue("100");
    await expect(canvas.getByLabelText("Working hours per day")).toHaveValue(
      "9.5",
    );
    const headings = canvas
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent.replace(/\W+$/, ""));
    await expect(headings).toEqual(["Details", "Salary", "Sign-in"]);
    await userEvent.clear(salary);
    await userEvent.type(salary, "30000");
    await userEvent.click(canvas.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(bodyOf(`${ONE}/update`)).toMatchObject({
        salaryType: "monthly",
        salaryPerDay: null,
        salaryPerMonth: 3_000_000,
        overtimeWagePerHour: 10_000,
        workingHoursPerDay: "9.5",
        weeklyHolidays: [0, 6],
      }),
    );
  },
};

/**
 * Without Financial on Staff the type and amounts are not shown, and an
 * edit keeps them; working hours and holidays are still theirs to change.
 */
export const SalaryHiddenWithoutRight: Story = {
  args: { canSeeSalary: false },
  beforeEach: serve(
    { ...MEMBER, overtimeWagePerHour: null },
    [
      {
        method: "POST",
        path: `${ONE}/update`,
        respond: () => Response.json(MEMBER),
      },
    ],
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(
        "You cannot see salaries. Ask the Owner for the Financial right on Staff.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText("Salary per month"),
    ).not.toBeInTheDocument();
    const name = canvas.getByLabelText("Name");
    await userEvent.type(name, " K.");
    await userEvent.click(canvas.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(bodyOf(`${ONE}/update`)).toMatchObject({
        name: "Prabhu Saravanan K.",
        workingHoursPerDay: "8",
      }),
    );
    for (const key of ["salaryType", "salaryPerMonth", "overtimeWagePerHour"])
      await expect(key in bodyOf(`${ONE}/update`)).toBe(false);
  },
};

export const MobileLockedWhileSmsIsOn: Story = {
  beforeEach: serve({ ...MEMBER, mobileLocked: true }),
  play: async ({ canvas }) => {
    // A joined member's mobile is their sign-in while SMS is on.
    await expect(await canvas.findByLabelText("Mobile")).toHaveAttribute(
      "readonly",
    );
    await expect(
      canvas.getByText(
        "They sign in with this number; they change it in My Profile.",
      ),
    ).toBeVisible();
  },
};

/** Change the Role: pick another, see its matrix, save. */
export const ChangeRole: Story = {
  beforeEach() {
    let current: TeamMember = MEMBER;
    return serve(MEMBER, [
      // The detail read answers the latest save.
      { path: ONE, respond: () => Response.json(current) },
      {
        method: "PUT",
        path: `${ONE}/role`,
        respond: () => {
          current = {
            ...MEMBER,
            role: { id: ACCOUNTANT_ROLE.id, name: ACCOUNTANT_ROLE.name },
            permissions: ACCOUNTANT_ROLE.permissions,
          };
          return Response.json(current);
        },
      },
    ])();
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Role" }));
    await expect(
      canvas.getByRole("combobox", { name: "Role" }),
    ).toHaveTextContent("Site Engineer");
    await expect(
      canvas.getByRole("button", { name: "Save Role" }),
    ).toBeDisabled();
    // The matrix is the Role's, read-only: no per-person editing.
    await expect(
      canvas.getByRole("checkbox", { name: "Add — Attendance" }),
    ).toBeChecked();
    await expect(
      canvas.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("combobox", { name: "Role" }));
    await userEvent.click(
      await body.findByRole("option", { name: /^Accountant/ }),
    );
    await expect(
      canvas.getByRole("checkbox", { name: "Add — Attendance" }),
    ).not.toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Save Role" }));
    await expect(
      await canvas.findByText(
        "Role saved. It applies from their next request.",
      ),
    ).toBeVisible();
    await expect(bodyOf(`${ONE}/role`)).toEqual({
      roleId: ACCOUNTANT_ROLE.id,
    });
  },
};

/** Changing your own Role is refused: 403 OWN_ROLE, said plainly. */
export const OwnRoleRefused: Story = {
  beforeEach: serve(MEMBER, [
    {
      method: "PUT",
      path: `${ONE}/role`,
      respond: () =>
        Response.json(
          { code: "OWN_ROLE", message: "You cannot change your own Role." },
          { status: 403 },
        ),
    },
  ]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Role" }));
    await userEvent.click(canvas.getByRole("combobox", { name: "Role" }));
    await userEvent.click(await body.findByRole("option", { name: /^Admin/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Save Role" }));
    await expect(
      await canvas.findByText("You cannot change your own Role."),
    ).toBeVisible();
  },
};

export const OwnerHasNoRole: Story = {
  beforeEach: serve({
    ...MEMBER,
    isOwner: true,
    name: "Arun Selva Kumar",
    role: null,
    canSetPassword: false,
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("tab", { name: "Role" }));
    await expect(
      await canvas.findByText(
        "The Owner can do everything, so they have no Role.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Set a new password" }),
    ).not.toBeInTheDocument();
  },
};

/** Set a new password: a Temporary Password they change on next sign-in. */
export const SetNewPassword: Story = {
  beforeEach: serve(MEMBER, [
    {
      method: "POST",
      path: `${ONE}/password`,
      respond: () => Response.json({ ...MEMBER, passwordIgnored: null }),
    },
  ]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Set a new password" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByText(/must change it the next time they sign in/),
      ).toBeVisible(),
    );
    await expect(
      dialog.getByText(/They are signed out of every device now/),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("New password"), "short");
    await userEvent.click(dialog.getByRole("button", { name: "Set password" }));
    await expect(
      await dialog.findByText("Use at least 8 characters"),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("New password"), "-site-26");
    await userEvent.click(dialog.getByRole("button", { name: "Set password" }));
    await expect(
      await canvas.findByText(
        "Password set. Prabhu Saravanan signs in with their mobile or email and that password, and must change it the next time they sign in.",
      ),
    ).toBeVisible();
    await expect(bodyOf(`${ONE}/password`)).toEqual({
      password: "short-site-26",
    });
  },
};

/** The account belongs to another Company too: refused, said plainly. */
export const PasswordRefusedOtherCompany: Story = {
  beforeEach: serve(MEMBER, [
    {
      method: "POST",
      path: `${ONE}/password`,
      respond: () =>
        Response.json(
          {
            code: "USER_IN_OTHER_COMPANY",
            message:
              "They also work in another Company, so only they can change their password.",
          },
          { status: 409 },
        ),
    },
  ]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Set a new password" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("New password"), "site-pass-26");
    await userEvent.click(dialog.getByRole("button", { name: "Set password" }));
    await expect(
      await dialog.findByText(/only they can change their password/),
    ).toBeVisible();
  },
};

/** No `canSetPassword` (another Company's account): the button is not offered. */
export const CannotSetPassword: Story = {
  beforeEach: serve({ ...MEMBER, canSetPassword: false }),
  play: async ({ canvas }) => {
    await canvas.findByLabelText("Name");
    await expect(
      canvas.queryByRole("button", { name: "Set a new password" }),
    ).not.toBeInTheDocument();
  },
};

/** Joining Pending with an email: send the invitation, then share it. */
export const SendInvitation: Story = {
  beforeEach: serve(
    teamMember({ status: "joining_pending", canSetPassword: true }),
    [
      {
        method: "POST",
        path: `${ONE}/resend-invite`,
        respond: () => Response.json(teamMember()),
      },
    ],
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Send invitation" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByLabelText("Invite link")).toBeVisible(),
    );
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: serve(teamMember({ status: "joining_pending" })),
  render: (args) => (
    <div data-testid="phone" style={{ width: 375 }}>
      <QuerySuspense>
        <EditTeamMember {...args} />
      </QuerySuspense>
    </div>
  ),
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Set a new password" });
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(375);
  },
};
