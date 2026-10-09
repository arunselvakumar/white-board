import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";

import { mockFetch } from "../../.storybook/mock-fetch";
import { signInAs } from "../../.storybook/mocks/auth";
import { AddTeamMemberWizard } from "./add-team-member-wizard";
import { DESIGNATION_LIST, teamMember } from "./team-member-fixtures";

const DESIGNATIONS_URL = "/api/construction/organization/designations";
const MEMBERS_URL = "/api/construction/organization/team-members";

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

const meta = {
  title: "Masters/AddTeamMemberWizard",
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

async function chooseDesignation(
  canvas: { getByLabelText: (text: string) => HTMLElement },
  body: {
    findByRole: (
      role: string,
      options: { name: string },
    ) => Promise<HTMLElement>;
  },
  userEvent: { click: (element: Element) => Promise<void> },
  name: string,
) {
  await userEvent.click(canvas.getByLabelText("Designation"));
  await userEvent.click(await body.findByRole("option", { name }));
}

export const NormalMemberWithTemplate: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      {
        path: DESIGNATIONS_URL,
        respond: () => Response.json(DESIGNATION_LIST),
      },
      {
        path: "/api/construction/projects/projects/options",
        respond: () =>
          Response.json({
            items: [
              {
                id: "0199a000-0000-7000-8000-000000000001",
                name: "Sri Heights",
                status: "ongoing",
              },
              {
                id: "0199a000-0000-7000-8000-000000000002",
                name: "Green Valley",
                status: "not_started",
              },
            ],
          }),
      },
      {
        method: "POST",
        path: MEMBERS_URL,
        respond: () => Response.json(teamMember(), { status: 201 }),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await expect(await canvas.findByText("Enter the name")).toBeVisible();
    await expect(
      canvas.getByText("Choose a Designation", { selector: "p" }),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Name"), "Prabhu Saravanan");
    await chooseDesignation(canvas, body, userEvent, "Site Engineer");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      await canvas.findByText(
        "Enter an email (to invite them) or a mobile number",
      ),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Email"), "prabhu@sakthi.in");
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.type(canvas.getByLabelText("Aadhaar"), "2341 2341 2345");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      await canvas.findByText("Enter a valid 12-digit Aadhaar number"),
    ).toBeVisible();
    await userEvent.clear(canvas.getByLabelText("Aadhaar"));
    await userEvent.type(canvas.getByLabelText("Aadhaar"), "2341 2341 2346");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await userEvent.click(
      await canvas.findByRole("checkbox", { name: /Sri Heights/ }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    // The matrix starts from the Site Engineer template.
    await expect(
      await canvas.findByRole("checkbox", { name: "Add — Attendance" }),
    ).toBeChecked();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Approve — Purchase Request" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );

    await expect(
      await canvas.findByRole("heading", {
        name: "Prabhu Saravanan is invited",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "They show as Joining Pending until they sign in with prabhu@sakthi.in and accept.",
      ),
    ).toBeVisible();
    await expect(sentBody()).toMatchObject({
      name: "Prabhu Saravanan",
      email: "prabhu@sakthi.in",
      mobile: "+917708165767",
      aadhaar: "2341 2341 2346",
      memberType: "normal",
      projectIds: ["0199a000-0000-7000-8000-000000000001"],
      permissions: {
        "labour.attendance": ["create", "read", "update"],
        "procurement.purchase_requests": ["create", "read", "approve"],
      },
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Share invite link" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByLabelText("Invite link")).toBeVisible(),
    );
    await expect(
      dialog.getByText(/They sign in with prabhu@sakthi\.in/),
    ).toBeVisible();
  },
};

export const MobileOnlyCannotSignInYet: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      {
        path: DESIGNATIONS_URL,
        respond: () => Response.json(DESIGNATION_LIST),
      },
      {
        method: "POST",
        path: MEMBERS_URL,
        respond: () =>
          Response.json(teamMember({ email: null }), { status: 201 }),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByLabelText("Name"),
      "Prabhu Saravanan",
    );
    await chooseDesignation(canvas, body, userEvent, "Site Engineer");
    await expect(
      canvas.getByText(
        "A contact number. Without an email they stay a record and cannot sign in.",
      ),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add and invite" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Prabhu Saravanan is added" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "They have no email, so they cannot sign in yet. Add one to invite them.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Share invite link" }),
    ).not.toBeInTheDocument();
  },
};

export const HrmsMemberSkipsProjects: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      {
        path: DESIGNATIONS_URL,
        respond: () => Response.json(DESIGNATION_LIST),
      },
      {
        method: "POST",
        path: MEMBERS_URL,
        respond: () =>
          Response.json(teamMember({ name: "Anitha", memberType: "hrms" }), {
            status: 201,
          }),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByText("HRMS only"));
    await userEvent.type(canvas.getByLabelText("Name"), "Anitha");
    await chooseDesignation(canvas, body, userEvent, "Accountant");
    await userEvent.type(canvas.getByLabelText("Email"), "anitha@anugraha.in");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await expect(await canvas.findByText(/HRMS default set/)).toBeVisible();
    await expect(canvas.getByText(/Step 2 of 2/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add and invite" }),
    );
    await waitFor(() =>
      expect(sentBody()).toMatchObject({ memberType: "hrms", mobile: null }),
    );
    await expect(sentBody()["permissions"]).toBeUndefined();
  },
};

export const MobileAlreadyInUse: Story = {
  beforeEach() {
    fetchMock = mockFetch([
      {
        path: DESIGNATIONS_URL,
        respond: () => Response.json(DESIGNATION_LIST),
      },
      {
        method: "POST",
        path: MEMBERS_URL,
        respond: () =>
          Response.json(
            {
              code: "MEMBER_MOBILE_IN_USE",
              message:
                "Another Team Member in this Company has this mobile number.",
            },
            { status: 409 },
          ),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await canvas.findByLabelText("Name"), "Prabhu");
    await chooseDesignation(canvas, body, userEvent, "Accountant");
    await userEvent.type(canvas.getByLabelText("Mobile"), "7708165767");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add and invite" }),
    );
    await expect(
      await canvas.findByText(
        "Another Team Member in this Company has this mobile number.",
      ),
    ).toBeVisible();
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
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Add a Designation" }),
    ).toHaveAttribute("href", "/app/masters/designations/new");
  },
};
