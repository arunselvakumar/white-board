import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { SiteEngineer } from "@/src/queries/site-engineers";

import { mockApi, StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import { signInAs } from "@/.storybook/mocks/auth";
import {
  OFFICE_STAFF_SIGN_IN,
  OWN_SIGN_IN_ACTIVE,
  OWN_SIGN_IN_PENDING,
  PROJECT_OPTIONS,
  PROJECT_OPTIONS_URL,
  SITE_ENGINEERS_URL,
  noSignInEngineer,
  officeStaffEngineer,
  siteEngineer,
} from "@/app/app/staff/site-engineers/_components/site-engineer-fixtures";
import { EditSiteEngineer } from "./edit-site-engineer";

const KARTHIK = siteEngineer();
const SAVED_AT = "2026-10-08T07:00:00.000Z";

let api: ReturnType<typeof mockApi> | null = null;

/** Answers one POST; `save` makes the next GET return the changed record. */
type Answer = (
  call: ApiCall,
  current: SiteEngineer,
  save: (next: SiteEngineer) => SiteEngineer,
) => Response;

/**
 * One Site Engineer over GET; `answers` handle the POSTs by verb (update,
 * password, resend-invite). An update without an answer saves the body.
 */
function serve(
  initial: SiteEngineer,
  answers: Partial<Record<string, Answer>> = {},
) {
  return () => {
    let current = initial;
    const one = `${SITE_ENGINEERS_URL}/${initial.id}`;
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === PROJECT_OPTIONS_URL)
        return Response.json(PROJECT_OPTIONS);
      if (call.method === "GET" && call.path === one)
        return Response.json(current);
      if (call.method !== "POST" || !call.path.startsWith(`${one}/`))
        return undefined;
      const verb = call.path.slice(one.length + 1);
      const answer = answers[verb];
      if (answer != null)
        return answer(call, current, (next) => {
          current = next;
          return next;
        });
      if (verb === "update") {
        const body = call.body as { name: string };
        current = { ...current, name: body.name, updatedAt: SAVED_AT };
        return Response.json(current);
      }
      return undefined;
    });
    return api.restore;
  };
}

function sentTo(verb: string): Record<string, unknown> {
  const call = api?.calls.mock.calls.find(([sent]) =>
    sent.path.endsWith(`/${verb}`),
  );
  return (call?.[0].body ?? {}) as Record<string, unknown>;
}

const meta = {
  title: "Human Resources/Site Engineers/Edit",
  component: EditSiteEngineer,
  args: { id: KARTHIK.id, canSeeSalary: true },
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
  render: (args) => (
    <StoryQueries>
      <EditSiteEngineer {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof EditSiteEngineer>;

export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

function cardTitles(canvas: Context["canvas"]): string[] {
  return canvas
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent.replace(/\W+$/, ""));
}

/**
 * Their own sign-in, Active: the status card in place of the choice. Blank
 * Aadhaar, PAN and account number keep the stored ones.
 */
export const OwnSignIn: Story = {
  beforeEach: serve(KARTHIK, {
    password: (_call, current) =>
      Response.json({ ...current, passwordIgnored: null }),
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Karthik Raja" }),
    ).toBeVisible();
    await canvas.findByRole("heading", { name: /^Projects/ });
    await expect(cardTitles(canvas)).toEqual([
      "Details",
      "Sign-in",
      "Personal",
      "Employment",
      "KYC",
      "Salary",
      "Bank",
      "Projects",
    ]);
    await expect(
      canvas.getByText("Signs in with the Site Engineer Role"),
    ).toBeVisible();
    await expect(canvas.getAllByText("Active")[0]).toBeVisible();
    await expect(
      canvas.queryByRole("checkbox", { name: /Invite them/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Resend invite" }),
    ).not.toBeInTheDocument();

    await expect(canvas.getByLabelText("Mobile")).toHaveValue("7708165767");
    await expect(canvas.getByLabelText("Specialisation")).toHaveValue(
      "Steel / PEB",
    );
    await expect(canvas.getByLabelText("Date of birth")).toHaveValue(
      "1990-04-12",
    );
    await expect(canvas.getByLabelText("Salary per month")).toHaveValue(
      "45000",
    );
    await expect(
      canvas.getByText("Leave blank to keep XXXXXXXX0124."),
    ).toBeVisible();
    await expect(
      canvas.getByText("Leave blank to keep the account ending 6789."),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("checkbox", { name: /Sri Heights/ }),
    ).toBeChecked();

    await userEvent.clear(canvas.getByLabelText("Name"));
    await userEvent.type(canvas.getByLabelText("Name"), "Karthik Raja S");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Saved.")).toBeVisible();
    const body = sentTo("update");
    await expect(body).toMatchObject({
      name: "Karthik Raja S",
      email: "karthik@anugraha.in",
      expectedUpdatedAt: KARTHIK.updatedAt,
      salaryPerMonth: 4_500_000,
      projectIds: [KARTHIK.projectIds[0]],
      bank: {
        accountHolder: "Karthik Raja",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
      },
    });
    await expect(body).not.toHaveProperty("aadhaar");
    await expect(body).not.toHaveProperty("pan");
    await expect(body).not.toHaveProperty("signIn");
    await expect(body["bank"]).not.toHaveProperty("accountNumber");

    // A Temporary Password from the Sign-in card.
    await userEvent.click(canvas.getByRole("button", { name: "Set password" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("New password"), "short");
    await userEvent.click(dialog.getByRole("button", { name: "Set password" }));
    await expect(
      await dialog.findByText("Use at least 8 characters"),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("New password"), "-pass-1234");
    await userEvent.click(dialog.getByRole("button", { name: "Set password" }));
    await expect(
      await canvas.findByText(/^Password set\. Karthik Raja/),
    ).toBeVisible();
    await expect(sentTo("password")).toEqual({ password: "short-pass-1234" });
    // The dialog's submit stays inside the dialog.
    await expect(
      api?.calls.mock.calls.filter(([sent]) => sent.path.endsWith("/update")),
    ).toHaveLength(1);
  },
};

/** Joining Pending: resend the invitation, or share its link. */
export const JoiningPending: Story = {
  beforeEach: serve(siteEngineer({ signIn: OWN_SIGN_IN_PENDING }), {
    "resend-invite": (_call, current) => Response.json(current),
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      (await canvas.findAllByText("Joining Pending"))[0],
    ).toBeVisible();
    await expect(
      canvas.getByText(/They show as Joining Pending until they accept/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Resend invite" }),
    );
    await expect(
      await canvas.findByText(
        "We sent the invitation to karthik@anugraha.in again.",
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Share invite link" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(dialog.getByLabelText("Invite link")).toHaveValue(
      `${window.location.origin}/join/tok_karthik`,
    );
  },
};

/** They joined and sign in by code: the mobile cannot change here. */
export const MobileLocked: Story = {
  beforeEach: serve(siteEngineer({ mobileLocked: true })),
  play: async ({ canvas }) => {
    const mobile = await canvas.findByLabelText("Mobile");
    await expect(mobile).toHaveAttribute("readonly");
    await expect(
      canvas.getByText(
        "They sign in with this number; they change it in My Profile.",
      ),
    ).toBeVisible();
  },
};

/**
 * Linked to an Office Staff member: they sign in as them, so the fields
 * that record keeps are not here, and only the row's fields are sent.
 */
export const OfficeStaff: Story = {
  args: { id: officeStaffEngineer().id },
  beforeEach: serve(officeStaffEngineer()),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(
        /They sign in as the Office Staff member Prabhu Saravanan/,
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", {
        name: "Open Prabhu Saravanan on Office Staff",
      }),
    ).toHaveAttribute(
      "href",
      `/app/staff/office-staff/${OFFICE_STAFF_SIGN_IN.memberId}`,
    );
    await expect(cardTitles(canvas)).toEqual([
      "Details",
      "Sign-in",
      "Personal",
      "Employment",
      "Bank",
    ]);
    await expect(canvas.queryByLabelText("Email")).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText("Address")).not.toBeInTheDocument();
    await expect(
      canvas.getByText("Shown on attendance and reports."),
    ).toBeVisible();

    // No mobile or email is needed: they sign in on the Office Staff record.
    await userEvent.clear(canvas.getByLabelText("Employee code"));
    await userEvent.type(canvas.getByLabelText("Employee code"), "SE-007");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Saved.")).toBeVisible();
    const body = sentTo("update");
    await expect(body).toMatchObject({
      name: "Prabhu Saravanan",
      mobile: null,
      profile: { employeeCode: "SE-007" },
    });
    for (const field of [
      "email",
      "address",
      "aadhaar",
      "pan",
      "salaryType",
      "projectIds",
      "signIn",
    ])
      await expect(body).not.toHaveProperty(field);
  },
};

/** An older one without a sign-in must get one on Save. */
export const NoSignIn: Story = {
  args: { id: noSignInEngineer().id },
  beforeEach: serve(noSignInEngineer(), {
    update: (_call, current, save) =>
      Response.json(
        save({ ...current, signIn: OWN_SIGN_IN_ACTIVE, updatedAt: SAVED_AT }),
      ),
  }),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("No sign-in")).toBeVisible();
    await expect(
      canvas.getByRole("checkbox", { name: /Invite them/ }),
    ).toHaveAttribute("data-disabled");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "A Site Engineer signs in: invite them, or set a password for them",
      ),
    ).toBeVisible();
    await expect(api?.calls).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
    );

    await userEvent.type(
      canvas.getByLabelText("Set a password"),
      "first-pass-1234",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    // Now they have one: the status card takes the choice's place.
    await expect(
      await canvas.findByRole("button", { name: "Set password" }),
    ).toBeVisible();
    await expect(await canvas.findByText("Saved.")).toBeVisible();
    await expect(sentTo("update")["signIn"]).toEqual({
      invite: false,
      password: "first-pass-1234",
    });
  },
};

/** Without Financial on Labours: no Salary or Bank card, neither sent. */
export const WithoutFinancial: Story = {
  args: { canSeeSalary: false },
  beforeEach: serve(
    siteEngineer({
      bank: null,
      salaryPerMonth: null,
      overtimeWagePerHour: null,
    }),
  ),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: /^Projects/ });
    await expect(cardTitles(canvas)).toEqual([
      "Details",
      "Sign-in",
      "Personal",
      "Employment",
      "KYC",
      "Projects",
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Saved.")).toBeVisible();
    const body = sentTo("update");
    for (const field of [
      "bank",
      "salaryType",
      "salaryPerMonth",
      "overtimeWagePerHour",
      "workingHoursPerDay",
      "weeklyHolidays",
    ])
      await expect(body).not.toHaveProperty(field);
  },
};

/** Someone else saved first: say so, and Reload brings theirs in. */
export const Stale: Story = {
  beforeEach: serve(KARTHIK, {
    update: () =>
      Response.json(
        {
          code: "SUPERVISOR_CHANGED",
          message:
            "Someone else changed this Site Engineer after you opened it. Reload to see their changes.",
        },
        { status: 409 },
      ),
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Qualification"),
      " (Hons)",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const alert = await canvas.findByText(/Someone else changed this/);
    await expect(alert).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(
        canvas.queryByText(/Someone else changed this/),
      ).not.toBeInTheDocument(),
    );
    await expect(canvas.getByLabelText("Qualification")).toHaveValue(
      "B.E. Civil",
    );
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};
