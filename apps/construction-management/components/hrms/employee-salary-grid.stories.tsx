import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { EmployeeSalariesModel } from "@/src/queries/hrms-salary-setup";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { EmployeeSalaryGrid } from "./employee-salary-grid";
import {
  EMPLOYEES,
  EMPLOYEES_PATH,
  MEMBER_IDS,
  SITE_STAFF,
} from "./salary-setup-fixtures";

let listing: EmployeeSalariesModel = EMPLOYEES;
let lastCalls: ApiCall[] = [];
const SAVED_AT = "2026-10-10T06:00:00.000Z";

/** Echoes each saved row as Configured. */
function echoSaved(body: unknown): Response {
  const { rows } = body as {
    rows: {
      memberId: string;
      structureId: string;
      baseMonthly: number | null;
      gender: "male" | "female" | "other" | null;
      uan: string | null;
      esiIpNumber: string | null;
      effectiveFrom: string;
    }[];
  };
  return Response.json({
    items: rows.map((row) => {
      const item = listing.items.find(
        (candidate) => candidate.memberId === row.memberId,
      );
      return {
        ...item,
        status: "configured",
        config: {
          id: "0199a1b2-0000-7000-8000-000000000999",
          structureId: row.structureId,
          structureName: SITE_STAFF.name,
          baseMonthly: row.baseMonthly ?? item?.config?.baseMonthly ?? null,
          componentOverrides: {},
          gender: row.gender,
          uan: row.uan,
          esiIpNumber: row.esiIpNumber,
          effectiveFrom: row.effectiveFrom,
          updatedAt: SAVED_AT,
        },
      };
    }),
  });
}

let saveResponse: (body: unknown) => Response = echoSaved;

function saves(): unknown[] {
  return lastCalls
    .filter((call) => call.path === `${EMPLOYEES_PATH}/save`)
    .map((call) => call.body);
}

const meta = {
  title: "HRMS/EmployeeSalaryGrid",
  component: EmployeeSalaryGrid,
  beforeEach() {
    lastCalls = [];
    listing = EMPLOYEES;
    const api = mockApi((call) => {
      lastCalls.push(call);
      if (call.path === EMPLOYEES_PATH) return Response.json(listing);
      if (call.path === `${EMPLOYEES_PATH}/save`)
        return saveResponse(call.body);
      return undefined;
    });
    return () => {
      api.restore();
      saveResponse = echoSaved;
    };
  },
  render: () => (
    <StoryQueries>
      <EmployeeSalaryGrid />
    </StoryQueries>
  ),
} satisfies Meta<typeof EmployeeSalaryGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoStructuresYet: Story = {
  beforeEach() {
    listing = { ...EMPLOYEES, structures: [] };
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Add a salary structure first"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add salary structure" }),
    ).toHaveAttribute(
      "href",
      "/app/workspace/hrms/configuration/salary-structures/new",
    );
  },
};

export const ListsEveryMember: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("1 of 3 configured.", { exact: false }),
    ).toBeVisible();
    const owner = within(
      canvas.getByRole("listitem", { name: "Arun Selva Kumar" }),
    );
    await expect(owner.getByText("Configured")).toBeVisible();
    await expect(owner.getByLabelText("Base salary a month")).toHaveValue(
      "60000",
    );
    await expect(owner.getByLabelText("UAN")).toHaveValue("100123456789");
    const clerk = within(canvas.getByRole("listitem", { name: "Chitra Devi" }));
    await expect(clerk.getByText("HRMS")).toBeVisible();
    await expect(clerk.getByText("Joining Pending")).toBeVisible();
    await expect(clerk.getByText("Not Set")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Save All" }),
    ).toBeDisabled();
  },
};

export const SaveAllSendsOnlyChangedMembers: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const engineer = within(
      await canvas.findByRole("listitem", { name: "Bala Murugan" }),
    );
    await userEvent.click(
      engineer.getByRole("combobox", { name: "Salary structure" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Site staff" }),
    );
    await userEvent.type(
      engineer.getByLabelText("Base salary a month"),
      "35000",
    );
    await userEvent.click(engineer.getByRole("combobox", { name: "Gender" }));
    await userEvent.click(await body.findByRole("option", { name: "Female" }));
    await userEvent.type(
      engineer.getByLabelText("ESI IP number"),
      "3112345678",
    );
    await expect(canvas.getByText("1 changed")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Save All" }));
    await expect(await canvas.findByText("Saved 1 member.")).toBeVisible();
    await expect(saves()).toEqual([
      {
        rows: [
          {
            memberId: MEMBER_IDS.engineer,
            structureId: SITE_STAFF.id,
            baseMonthly: 3_500_000,
            componentOverrides: {},
            gender: "female",
            uan: null,
            esiIpNumber: "3112345678",
            effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-01$/) as unknown,
            expectedUpdatedAt: null,
          },
        ],
      },
    ]);
    await expect(
      within(canvas.getByRole("listitem", { name: "Bala Murugan" })).getByText(
        "Configured",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText("2 of 3 configured.", { exact: false }),
    ).toBeVisible();
  },
};

export const ChecksChangedMembersBeforeSaving: Story = {
  play: async ({ canvas, userEvent }) => {
    const owner = within(
      await canvas.findByRole("listitem", { name: "Arun Selva Kumar" }),
    );
    await userEvent.clear(owner.getByLabelText("UAN"));
    await userEvent.type(owner.getByLabelText("UAN"), "1234");
    await userEvent.click(canvas.getByRole("button", { name: "Save All" }));
    await expect(await owner.findByText("A UAN is 12 digits")).toBeVisible();
    await expect(saves()).toHaveLength(0);
  },
};

export const NamesAMemberSomeoneElseChanged: Story = {
  play: async ({ canvas, userEvent }) => {
    saveResponse = () =>
      Response.json(
        {
          code: "EMPLOYEE_SALARY_CHANGED",
          message:
            "Someone else changed this member's salary after you opened it. Reload to see their changes.",
          details: {
            memberId: MEMBER_IDS.owner,
            memberIds: [MEMBER_IDS.owner],
          },
        },
        { status: 409 },
      );
    const owner = within(
      await canvas.findByRole("listitem", { name: "Arun Selva Kumar" }),
    );
    const base = owner.getByLabelText("Base salary a month");
    await userEvent.clear(base);
    await userEvent.type(base, "65000");
    await userEvent.click(canvas.getByRole("button", { name: "Save All" }));
    await expect(
      await owner.findByText(
        "Someone else changed this member after you opened the screen.",
      ),
    ).toBeVisible();
    await expect(saves()[0]).toMatchObject({
      rows: [
        {
          memberId: MEMBER_IDS.owner,
          baseMonthly: 6_500_000,
          componentOverrides: null,
          expectedUpdatedAt: "2026-10-01T06:00:00.000Z",
        },
      ],
    });
    await expect(canvas.getByRole("button", { name: "Reload" })).toBeVisible();
  },
};

export const PutsAServerErrorOnItsMember: Story = {
  play: async ({ canvas, userEvent }) => {
    saveResponse = () =>
      Response.json(
        {
          code: "BALANCING_COMPONENT_NEGATIVE",
          message:
            "The other components come to more than the base salary, so Special Allowance would be negative.",
          details: { memberId: MEMBER_IDS.owner, field: "baseMonthly" },
        },
        { status: 400 },
      );
    const owner = within(
      await canvas.findByRole("listitem", { name: "Arun Selva Kumar" }),
    );
    const base = owner.getByLabelText("Base salary a month");
    await userEvent.clear(base);
    await userEvent.type(base, "1000");
    await userEvent.click(canvas.getByRole("button", { name: "Save All" }));
    await expect(
      await owner.findByText(/Special Allowance would be negative/),
    ).toBeVisible();
    await expect(base).toHaveAttribute("aria-invalid", "true");
    await expect(
      canvas.getByText("Fix Arun Selva Kumar, then save again."),
    ).toBeVisible();
  },
};

export const SetsAMembersOwnComponentAmount: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const owner = within(
      await canvas.findByRole("listitem", { name: "Arun Selva Kumar" }),
    );
    await userEvent.click(
      owner.getByRole("button", {
        name: "Component amounts for Arun Selva Kumar",
      }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Conveyance"), "2000");
    await expect(
      dialog.getByText("Balancing: what is left of the base salary."),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));
    await expect(
      await owner.findByText("1 component amount of their own"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save All" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    await expect(saves()[0]).toMatchObject({
      rows: [
        {
          memberId: MEMBER_IDS.owner,
          componentOverrides: {
            [SITE_STAFF.components[1]?.id ?? ""]: { amount: 200_000 },
          },
        },
      ],
    });
  },
};

export const HidesAmountsWithoutFinancial: Story = {
  beforeEach() {
    listing = {
      ...EMPLOYEES,
      financial: false,
      items: EMPLOYEES.items.map((item) =>
        item.config == null
          ? item
          : {
              ...item,
              config: {
                ...item.config,
                baseMonthly: null,
                componentOverrides: null,
              },
            },
      ),
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText(/Salary amounts are hidden/),
    ).toBeVisible();
    const owner = within(
      canvas.getByRole("listitem", { name: "Arun Selva Kumar" }),
    );
    await expect(owner.getByLabelText("Base salary a month")).toHaveValue(
      "Hidden",
    );
    const engineer = within(
      canvas.getByRole("listitem", { name: "Bala Murugan" }),
    );
    await expect(
      engineer.getByText(/Someone with Financial access/),
    ).toBeVisible();
    await expect(engineer.queryByLabelText("Salary structure")).toBeNull();

    await userEvent.click(owner.getByRole("combobox", { name: "Gender" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Not recorded" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save All" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    await expect(saves()[0]).toMatchObject({
      rows: [
        {
          memberId: MEMBER_IDS.owner,
          baseMonthly: null,
          componentOverrides: null,
          gender: null,
        },
      ],
    });
  },
};
