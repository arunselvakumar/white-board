import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { SiteEngineerCreated } from "@/src/queries/site-engineers";

import { mockApi, StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import { signInAs } from "@/.storybook/mocks/auth";
import {
  OWN_SIGN_IN_PENDING,
  PROJECT_OPTIONS,
  PROJECT_OPTIONS_URL,
  SITE_ENGINEERS_URL,
  SRI_HEIGHTS,
  siteEngineer,
} from "@/app/app/staff/site-engineers/_components/site-engineer-fixtures";
import { AddSiteEngineer } from "./add-site-engineer";

let api: ReturnType<typeof mockApi> | null = null;

/** Projects, and `created` answering each POST in turn. */
function serve(...answers: ((call: ApiCall) => Response)[]) {
  return () => {
    let posts = 0;
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === PROJECT_OPTIONS_URL)
        return Response.json(PROJECT_OPTIONS);
      if (call.method === "POST" && call.path === SITE_ENGINEERS_URL) {
        const answer = answers[Math.min(posts, answers.length - 1)];
        posts += 1;
        return answer?.(call);
      }
      return undefined;
    });
    return api.restore;
  };
}

function created(overrides: Partial<SiteEngineerCreated> = {}) {
  return () =>
    Response.json(
      {
        ...siteEngineer(),
        passwordIgnored: null,
        passwordSet: true,
        invited: false,
        ...overrides,
      } satisfies SiteEngineerCreated,
      { status: 201 },
    );
}

function postedBody(): Record<string, unknown> {
  const call = api?.calls.mock.calls.find(
    ([sent]) => sent.method === "POST" && sent.path === SITE_ENGINEERS_URL,
  );
  return (call?.[0].body ?? {}) as Record<string, unknown>;
}

const meta = {
  title: "Human Resources/Site Engineers/Add",
  component: AddSiteEngineer,
  args: { canSeeSalary: true },
  beforeEach() {
    signInAs("owner", { name: "Anugraha Engineers" });
  },
  render: (args) => (
    <StoryQueries>
      <AddSiteEngineer {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof AddSiteEngineer>;

export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story["play"]>>[0];

async function choose(
  { canvas, canvasElement, userEvent }: Context,
  label: string,
  name: string,
) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("combobox", { name: label }));
  await userEvent.click(await body.findByRole("option", { name }));
}

function cardTitles(canvas: Context["canvas"]): string[] {
  return canvas
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent.replace(/\W+$/, ""));
}

/**
 * One page of cards. A name, a mobile or an email, and a way to sign in
 * are required; a server error lands under its field.
 */
export const Validation: Story = {
  beforeEach: serve(
    () =>
      Response.json(
        {
          code: "SUPERVISOR_NAME_IN_USE",
          message: "A Site Engineer with this name already exists.",
        },
        { status: 409 },
      ),
    created(),
  ),
  play: async (context) => {
    const { canvas, userEvent } = context;
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
    await expect(canvas.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/app/staff/site-engineers",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Add Site Engineer" }),
    );
    await expect(await canvas.findByText("Enter the name")).toBeVisible();
    await expect(
      canvas.getByText("Enter a mobile number or an email"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "A Site Engineer signs in: invite them, or set a password for them",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveFocus();

    await userEvent.type(canvas.getByLabelText("Name"), "Karthik Raja");
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    const invite = canvas.getByRole("checkbox", { name: /Invite them/ });
    await expect(invite).toHaveAttribute("data-disabled");
    await expect(
      canvas.getByText("Type an email to invite them."),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Experience (years)"), "8.5");
    await userEvent.type(canvas.getByLabelText("IFSC"), "HDFC1234");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Site Engineer" }),
    );
    await expect(
      await canvas.findByText("A whole number of years, 0 to 60"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter an IFSC like HDFC0001234"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "A Site Engineer signs in: invite them, or set a password for them",
      ),
    ).toBeVisible();
    await expect(api?.calls).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
    );

    // An email makes Invite them available, ticked; that is enough.
    await userEvent.clear(canvas.getByLabelText("Experience (years)"));
    await userEvent.type(canvas.getByLabelText("Experience (years)"), "8");
    await userEvent.clear(canvas.getByLabelText("IFSC"));
    await userEvent.type(canvas.getByLabelText("Email"), "karthik@anugraha.in");
    await expect(invite).toBeChecked();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );
    // The server's name check lands under Name.
    await expect(
      await canvas.findByText("A Site Engineer with this name already exists."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveFocus();
    await expect(postedBody()["signIn"]).toEqual({
      invite: true,
      password: null,
    });
  },
};

/** Every card filled, with a password: the body sent, then "can sign in now". */
export const FullSubmit: Story = {
  beforeEach: serve(created()),
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    await userEvent.type(await canvas.findByLabelText("Name"), "Karthik Raja");
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.type(canvas.getByLabelText("Email"), "karthik@anugraha.in");
    await userEvent.type(
      canvas.getByLabelText("Address"),
      "12 Anna Nagar, Madurai",
    );
    await userEvent.type(
      canvas.getByLabelText("Emergency contact"),
      "Priya, +91 98400 12345",
    );
    await userEvent.type(
      canvas.getByLabelText("Set a password"),
      "first-pass-1234",
    );
    await expect(
      canvas.getByRole("checkbox", { name: /Invite them/ }),
    ).not.toBeChecked();
    await expect(
      canvas.getByText(/They can sign in now with their mobile or email/),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Father's name"), "Selvam");
    await userEvent.type(canvas.getByLabelText("Date of birth"), "1990-04-12");
    await choose(context, "Gender", "Male");
    await choose(context, "Blood group", "B+");
    await userEvent.type(canvas.getByLabelText("Employee code"), "SE-001");
    await userEvent.type(canvas.getByLabelText("Joining date"), "2024-06-01");
    await userEvent.type(canvas.getByLabelText("Qualification"), "B.E. Civil");
    await userEvent.type(canvas.getByLabelText("Experience (years)"), "8");
    await userEvent.type(
      canvas.getByLabelText("Specialisation"),
      "Steel / PEB",
    );
    await userEvent.type(canvas.getByLabelText("Aadhaar"), "2345 6789 0124");
    await userEvent.type(canvas.getByLabelText("PAN"), "abcpe1234f");
    await userEvent.type(canvas.getByLabelText("Salary per month"), "45,000");
    await userEvent.type(
      canvas.getByLabelText("Account holder"),
      "Karthik Raja",
    );
    await userEvent.type(
      canvas.getByLabelText("Account number"),
      "5010 0123 456789",
    );
    await userEvent.type(canvas.getByLabelText("IFSC"), "hdfc0001234");
    await userEvent.type(canvas.getByLabelText("Bank name"), "HDFC Bank");
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: /Sri Heights/ }),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Add Site Engineer" }),
    );
    await expect(
      await canvas.findByRole("heading", {
        name: "Karthik Raja can sign in now",
      }),
    ).toBeVisible();
    await expect(postedBody()).toEqual({
      name: "Karthik Raja",
      mobile: "+917708165767",
      email: "karthik@anugraha.in",
      address: "12 Anna Nagar, Madurai",
      emergencyContact: "Priya, +91 98400 12345",
      aadhaar: "2345 6789 0124",
      pan: "ABCPE1234F",
      salaryType: "monthly",
      salaryPerDay: null,
      salaryPerMonth: 4_500_000,
      overtimeWagePerHour: 0,
      workingHoursPerDay: "8",
      weeklyHolidays: [0],
      projectIds: [SRI_HEIGHTS],
      profile: {
        employeeCode: "SE-001",
        fatherName: "Selvam",
        dateOfBirth: "1990-04-12",
        gender: "male",
        bloodGroup: "B+",
        joiningDate: "2024-06-01",
        qualification: "B.E. Civil",
        experienceYears: 8,
        specialisation: "Steel / PEB",
      },
      bank: {
        accountHolder: "Karthik Raja",
        accountNumber: "50100123456789",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
      },
      signIn: { invite: false, password: "first-pass-1234" },
    });
    await expect(
      canvas.getByRole("link", { name: "Back to Site Engineers" }),
    ).toHaveAttribute("href", "/app/staff/site-engineers");
    await waitFor(() =>
      expect(
        within(canvasElement).queryByRole("button", {
          name: "Share invite link",
        }),
      ).not.toBeInTheDocument(),
    );
  },
};

/** Invited by email: Joining Pending, with the link to share. */
export const Invited: Story = {
  beforeEach: serve(
    created({
      signIn: OWN_SIGN_IN_PENDING,
      passwordSet: false,
      invited: true,
    }),
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Name"), "Karthik Raja");
    await userEvent.type(canvas.getByLabelText("Email"), "karthik@anugraha.in");
    await expect(
      canvas.getByText(/We email them a link to join Anugraha Engineers/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Karthik Raja is invited" }),
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

/** Someone already signs in with that mobile: a Join Request instead. */
export const ExistingAccount: Story = {
  beforeEach: serve(
    created({
      signIn: OWN_SIGN_IN_PENDING,
      email: null,
      passwordSet: false,
      passwordIgnored: "existing_account",
    }),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Name"), "Karthik Raja");
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.type(
      canvas.getByLabelText("Set a password"),
      "first-pass-1234",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Site Engineer" }),
    );
    await expect(
      await canvas.findByRole("heading", {
        name: "Karthik Raja already has an account",
      }),
    ).toBeVisible();
    await expect(canvas.getByText(/They got a Join Request/)).toBeVisible();
  },
};

/** Without Financial on Labours: no Salary or Bank card, none sent. */
export const WithoutFinancial: Story = {
  args: { canSeeSalary: false },
  beforeEach: serve(created()),
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
    await userEvent.type(canvas.getByLabelText("Name"), "Karthik Raja");
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.type(
      canvas.getByLabelText("Set a password"),
      "first-pass-1234",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Site Engineer" }),
    );
    await canvas.findByRole("heading", {
      name: "Karthik Raja can sign in now",
    });
    const body = postedBody();
    await expect(body).not.toHaveProperty("bank");
    await expect(body).not.toHaveProperty("salaryType");
    await expect(body).not.toHaveProperty("salaryPerMonth");
  },
};
