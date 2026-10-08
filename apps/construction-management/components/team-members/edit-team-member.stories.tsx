import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";

import { mockFetch } from "../../.storybook/mock-fetch";
import { signInAs } from "../../.storybook/mocks/auth";
import { EditTeamMember } from "./edit-team-member";
import { DESIGNATION_LIST, teamMember } from "./team-member-fixtures";

const MEMBER = teamMember({ status: "active", userId: "user_suresh" });
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

const meta = {
  title: "Masters/EditTeamMember",
  component: EditTeamMember,
  args: { id: MEMBER.id },
  beforeEach() {
    signInAs("owner");
    fetchMock = mockFetch([
      {
        path: "/api/construction/organization/designations",
        respond: () => Response.json(DESIGNATION_LIST),
      },
      { path: ONE, respond: () => Response.json(MEMBER) },
      {
        method: "POST",
        path: `${ONE}/update`,
        respond: () => Response.json({ ...MEMBER, name: "Suresh K." }),
      },
      {
        method: "POST",
        path: `${ONE}/permissions`,
        respond: () => Response.json(MEMBER),
      },
    ]);
    return fetchMock.restore;
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
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Name");
    await expect(
      canvas.getByText("Leave blank to keep XXXXXXXX2346."),
    ).toBeVisible();
    // While SMS is off the mobile is only a contact, so it stays editable.
    await expect(canvas.getByLabelText("Mobile")).not.toHaveAttribute(
      "readonly",
    );
    await userEvent.clear(name);
    await userEvent.type(name, "Suresh K.");
    await userEvent.click(canvas.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(bodyOf(`${ONE}/update`)).toMatchObject({ name: "Suresh K." }),
    );
    // Blank Aadhaar is left out, so the stored one stays.
    await expect("aadhaar" in bodyOf(`${ONE}/update`)).toBe(false);
  },
};

export const MobileLockedWhileSmsIsOn: Story = {
  beforeEach() {
    fetchMock?.restore();
    fetchMock = mockFetch([
      {
        path: "/api/construction/organization/designations",
        respond: () => Response.json(DESIGNATION_LIST),
      },
      {
        path: ONE,
        respond: () => Response.json({ ...MEMBER, mobileLocked: true }),
      },
    ]);
    return fetchMock.restore;
  },
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

export const EditPermissionMatrix: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Permission Matrix" }),
    );
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Delete — Attendance" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Permission Matrix" }),
    );
    await expect(
      await canvas.findByText("Permission Matrix saved."),
    ).toBeVisible();
    await expect(bodyOf(`${ONE}/permissions`)).toEqual({
      permissions: {
        "labour.attendance": ["create", "read", "update", "delete"],
      },
    });
  },
};

export const OwnerMatrixIsFixed: Story = {
  beforeEach() {
    fetchMock?.restore();
    fetchMock = mockFetch([
      {
        path: "/api/construction/organization/designations",
        respond: () => Response.json(DESIGNATION_LIST),
      },
      {
        path: ONE,
        respond: () =>
          Response.json({ ...MEMBER, isOwner: true, name: "Ramesh Patil" }),
      },
    ]);
    return fetchMock.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Permission Matrix" }),
    );
    await expect(
      await canvas.findByText(/The Owner can do everything/),
    ).toBeVisible();
  },
};
