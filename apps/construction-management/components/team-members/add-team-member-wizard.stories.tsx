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
import { AddTeamMemberWizard } from "./add-team-member-wizard";
import { DESIGNATION_LIST, teamMember } from "./team-member-fixtures";

const DESIGNATIONS_URL = "/api/construction/organization/designations";
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

/** Designations, Roles, Projects, and `created` as the POST's answer. */
function serve(created: () => Response, extra: MockRoute[] = []) {
  return () => {
    fetchMock = mockFetch([
      {
        path: DESIGNATIONS_URL,
        respond: () => Response.json(DESIGNATION_LIST),
      },
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
  title: "Users & Roles/Users/AddUser",
  component: AddTeamMemberWizard,
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
  render: () => (
    <QuerySuspense>
      <AddTeamMemberWizard />
    </QuerySuspense>
  ),
} satisfies Meta<typeof AddTeamMemberWizard>;

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

/** Name and Designation, the two fields every path fills. */
async function fillBasics(context: Context, name = "Prabhu Saravanan") {
  await context.userEvent.type(
    await context.canvas.findByLabelText("Name"),
    name,
  );
  await choose(context, "Designation", "Site Engineer");
}

/** Email typed: Invite them ticks itself; the share link follows. */
export const InviteByEmail: Story = {
  beforeEach: serve(createdAs()),
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await expect(await canvas.findByText("Enter the name")).toBeVisible();
    await expect(
      canvas.getByText("Enter a mobile number or an email"),
    ).toBeVisible();

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
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await userEvent.click(
      await canvas.findByRole("checkbox", { name: /Sri Heights/ }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    // The Role step: pick one, and see its matrix read-only.
    await expect(await canvas.findByText(/Step 3 of 3: Role/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );
    await expect(
      await canvas.findByText("Choose a Role", { selector: "p" }),
    ).toBeVisible();
    await choose(context, "Role", /^Site Engineer/);
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
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
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
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add User" }));

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
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add User" }));
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
        "They are a record until you invite them or set a password. You can do either later from Edit User.",
      ),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add User" }));
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
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await choose(context, "Role", /^Accountant/);
    await userEvent.click(canvas.getByRole("button", { name: "Add User" }));
    await expect(
      await canvas.findByRole("heading", { name: "Prabhu Saravanan is added" }),
    ).toBeVisible();
    await expect(sentBody()).toMatchObject({ invite: false, password: null });
  },
};

export const HrmsMemberStartsOnHrmsStaff: Story = {
  beforeEach: serve(createdAs({ name: "Anitha", memberType: "hrms" })),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await userEvent.click(await canvas.findByText("HRMS only"));
    await userEvent.type(canvas.getByLabelText("Name"), "Anitha");
    await choose(context, "Designation", "Accountant");
    await userEvent.type(canvas.getByLabelText("Email"), "anitha@anugraha.in");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await expect(await canvas.findByText(/Step 2 of 2: Role/)).toBeVisible();
    await expect(canvas.getByLabelText("Role")).toHaveTextContent("HRMS Staff");
    await expect(
      canvas.getByRole("checkbox", { name: "Add — Attendance" }),
    ).toBeInTheDocument();
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
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await choose(context, "Role", /^Site Engineer/);
    await userEvent.click(canvas.getByRole("button", { name: "Add User" }));
    await expect(
      await canvas.findByText(
        "Another Team Member in this Company has this mobile number.",
      ),
    ).toBeVisible();
    // Back on the details step, at the field.
    await expect(canvas.getByLabelText("Mobile")).toBeVisible();
  },
};

export const NoDesignationsYet: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      {
        path: DESIGNATIONS_URL,
        respond: () => Response.json({ items: [], total: 0 }),
      },
      { path: ROLES_URL, respond: () => Response.json({ items: ROLES }) },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Add a Designation" }),
    ).toHaveAttribute("href", "/app/masters/designations/new");
  },
};

/** At phone width the Sign-in section stacks; nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: serve(createdAs()),
  render: () => (
    <div data-testid="phone" style={{ width: 375 }}>
      <QuerySuspense>
        <AddTeamMemberWizard />
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
