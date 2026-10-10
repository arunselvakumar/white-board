import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import {
  SITE_STAFF,
  STATUTORY,
  STRUCTURES_PATH,
} from "./salary-setup-fixtures";
import {
  EditSalaryStructureScreen,
  NewSalaryStructureScreen,
} from "./salary-structure-form";

let lastCalls: ApiCall[] = [];
let saveResponse: (body: unknown) => Response = (body) =>
  Response.json({ ...SITE_STAFF, ...(body as object) }, { status: 201 });

function nth<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No item ${String(index)}`);
  return item;
}

function saves(): unknown[] {
  return lastCalls
    .filter((call) => call.method === "POST")
    .map((call) => call.body);
}

const meta = {
  title: "HRMS/SalaryStructureForm",
  component: NewSalaryStructureScreen,
  beforeEach() {
    lastCalls = [];
    const api = mockApi((call) => {
      lastCalls.push(call);
      if (call.path === `${STRUCTURES_PATH}/statutory`)
        return Response.json(STATUTORY);
      if (call.path === `${STRUCTURES_PATH}/${SITE_STAFF.id}`)
        return Response.json(SITE_STAFF);
      if (call.method === "POST") return saveResponse(call.body);
      return undefined;
    });
    return () => {
      api.restore();
      saveResponse = (body) =>
        Response.json({ ...SITE_STAFF, ...(body as object) }, { status: 201 });
    };
  },
  render: () => (
    <StoryQueries>
      <NewSalaryStructureScreen />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewSalaryStructureScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddValidatesAndSaves: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Add salary structure" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Enter a name")).toBeVisible();
    await expect(saves()).toHaveLength(0);

    await userEvent.type(canvas.getByLabelText("Name"), "Site staff");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add component" }),
    );
    const names = canvas.getAllByLabelText("Component name");
    await userEvent.type(nth(names, 2), "Conveyance");
    const components = within(canvas.getByRole("list", { name: "Components" }));
    const percents = components.getAllByLabelText("Percent");
    await userEvent.type(nth(percents, 1), "20");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add deduction" }),
    );
    await userEvent.type(canvas.getByLabelText("Deduction 1 name"), "Canteen");
    await userEvent.type(canvas.getByLabelText("Deduction 1 amount"), "500");

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    await expect(saves()[0]).toEqual({
      name: "Site staff",
      description: null,
      isActive: true,
      components: [
        {
          id: null,
          name: "Basic",
          basis: "percent_of_base",
          amount: null,
          percent: "50",
          isBalancing: false,
          countsForPfWage: true,
        },
        {
          id: null,
          name: "Special Allowance",
          basis: "percent_of_base",
          amount: null,
          percent: null,
          isBalancing: true,
          countsForPfWage: false,
        },
        {
          id: null,
          name: "Conveyance",
          basis: "percent_of_base",
          amount: null,
          percent: "20",
          isBalancing: false,
          countsForPfWage: false,
        },
      ],
      pf: {
        applicable: true,
        employeePercent: null,
        capAtCeiling: true,
        wageCeiling: null,
      },
      esi: { applicable: true, employeePercent: null },
      pt: { applicable: true, monthlyAmount: null },
      deductAbsentDays: true,
      deductUnpaidLeave: true,
      otherDeductions: [{ name: "Canteen", amount: 50_000 }],
    });
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        "/app/workspace/hrms/configuration/salary-structures",
      ),
    );
  },
};

export const SampleCalculationFollowsTheForm: Story = {
  play: async ({ canvas, userEvent }) => {
    const sample = within(
      await canvas.findByRole("region", { name: "Sample calculation" }),
    );
    // ₹30,000: Basic ₹15,000 → PF ₹1,800; Karnataka PT ₹200; no ESI.
    const deductions = within(sample.getByLabelText("Deductions"));
    await expect(deductions.getByText("− ₹1,800.00")).toBeVisible();
    await expect(deductions.getByText("− ₹200.00")).toBeVisible();
    await expect(deductions.getByText("₹28,000.00")).toBeVisible();
    await expect(
      sample.getByText(/No ESI: gross is above ₹21,000.00/),
    ).toBeVisible();

    const base = sample.getByLabelText("Base salary a month");
    await userEvent.clear(base);
    await userEvent.type(base, "20000");
    // ₹20,000: PF ₹1,200; ESI 0.75% = ₹150; no PT below ₹25,000.
    const after = within(sample.getByLabelText("Deductions"));
    await expect(await after.findByText("− ₹1,200.00")).toBeVisible();
    await expect(after.getByText("− ₹150.00")).toBeVisible();
    await expect(after.getByText("₹18,650.00")).toBeVisible();

    // Percentages over 100% beside the balancing component cannot be worked out.
    const percents = within(
      canvas.getByRole("list", { name: "Components" }),
    ).getAllByLabelText("Percent");
    const basic = nth(percents, 0);
    await userEvent.clear(basic);
    await userEvent.type(basic, "120");
    await expect(await sample.findByText(/at most 100/)).toBeVisible();
  },
};

export const ShowsTheServerErrorUnderItsField: Story = {
  play: async ({ canvas, userEvent }) => {
    saveResponse = () =>
      Response.json(
        {
          code: "SALARY_STRUCTURE_NAME_TAKEN",
          message: "There is already a salary structure called Site staff.",
          details: { field: "name" },
        },
        { status: 409 },
      );
    await userEvent.type(await canvas.findByLabelText("Name"), "Site staff");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "There is already a salary structure called Site staff.",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const EditKeepsComponentIds: Story = {
  render: () => (
    <StoryQueries>
      <EditSalaryStructureScreen id={SITE_STAFF.id} />
    </StoryQueries>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Site staff" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Name")).toHaveValue("Site staff");
    await userEvent.click(
      canvas.getByRole("switch", { name: "Employees' State Insurance (ESI)" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    await expect(saves()[0]).toMatchObject({
      expectedUpdatedAt: SITE_STAFF.updatedAt,
      esi: { applicable: false, employeePercent: null },
      components: SITE_STAFF.components.map((component) => ({
        id: component.id,
      })),
    });
    await expect(lastCalls.find((call) => call.method === "POST")?.path).toBe(
      `${STRUCTURES_PATH}/${SITE_STAFF.id}/update`,
    );
  },
};
