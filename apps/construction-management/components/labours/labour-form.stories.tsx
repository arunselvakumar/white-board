import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import {
  CATEGORY_LIST,
  MASON,
  PROJECT_OPTIONS,
  RAJU,
  SUPERVISOR_LIST,
  TOWER,
  withoutAmounts,
} from "./labour-fixtures";
import { EditLabourScreen, NewLabourScreen } from "./labour-form";

const LABOURS = "/api/construction/labour/labours";

let api: ReturnType<typeof mockFetch>;

function sent(path: string): unknown {
  const call = api.spy.mock.calls.find(
    ([input, init]) => init?.method === "POST" && input === path,
  );
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

function posts(): number {
  return api.spy.mock.calls.filter(([, init]) => init?.method === "POST")
    .length;
}

const LOOKUPS = [
  {
    path: "/api/construction/projects/projects/options",
    respond: () => Response.json({ items: PROJECT_OPTIONS }),
  },
  {
    path: "/api/construction/masters/labour-categories",
    respond: () => Response.json(CATEGORY_LIST),
  },
  {
    path: "/api/construction/masters/supervisors",
    respond: () => Response.json(SUPERVISOR_LIST),
  },
];

type Queries = {
  getByRole: (role: string, options: { name: string }) => HTMLElement;
  findByRole: (role: string, options: { name: string }) => Promise<HTMLElement>;
};
type Click = { click: (element: Element) => Promise<void> };

async function choose(
  canvas: Queries,
  body: Queries,
  userEvent: Click,
  label: string,
  option: string,
) {
  await userEvent.click(canvas.getByRole("combobox", { name: label }));
  await userEvent.click(await body.findByRole("option", { name: option }));
}

const meta = {
  title: "Masters/Labours/Form",
  component: NewLabourScreen,
  render: () => (
    <StoryQueryClient>
      <NewLabourScreen />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof NewLabourScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddValidatesAndSaves: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: LABOURS,
        respond: () => Response.json(RAJU, { status: 201 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Add Labour" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the Labour's name"),
    ).toBeVisible();
    await expect(canvas.getByText("Enter the wage per day")).toBeVisible();
    await expect(canvas.getByText("Choose the Project")).toBeVisible();
    await expect(posts()).toBe(0);

    // The wage type decides which wage field shows.
    await expect(canvas.queryByLabelText("Wage per month")).toBeNull();
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Wage type" })).getByRole(
        "button",
        { name: "Monthly wages" },
      ),
    );
    await expect(canvas.getByLabelText("Wage per month")).toBeVisible();
    await expect(canvas.queryByLabelText("Wage per day")).toBeNull();
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Wage type" })).getByRole(
        "button",
        { name: "Daily wages" },
      ),
    );

    await userEvent.type(canvas.getByLabelText("Labour name"), "Raju Pawar");
    await userEvent.type(canvas.getByLabelText("Labour Id"), "L-001");
    await userEvent.type(canvas.getByLabelText("Joining date"), "2026-09-01");
    await userEvent.type(canvas.getByLabelText("Wage per day"), "700");
    await userEvent.clear(canvas.getByLabelText("Overtime wage per hour"));
    await userEvent.type(
      canvas.getByLabelText("Overtime wage per hour"),
      "100.50",
    );
    await userEvent.type(canvas.getByLabelText("Opening balance"), "-500");
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Weekly holidays" })).getByRole(
        "button",
        { name: "Sat" },
      ),
    );
    await userEvent.type(canvas.getByLabelText("Aadhaar"), "1234");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter a valid 12-digit Aadhaar number"),
    ).toBeVisible();
    await userEvent.clear(canvas.getByLabelText("Aadhaar"));

    await choose(canvas, body, userEvent, "Labour Category", "Mason");
    await expect(body.queryByRole("option", { name: "Welder" })).toBeNull();
    await choose(canvas, body, userEvent, "Project", "Tower A");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent(LABOURS)).toBeDefined());
    await expect(sent(LABOURS)).toMatchObject({
      name: "Raju Pawar",
      labourCode: "L-001",
      joiningDate: "2026-09-01",
      wageType: "daily",
      wagePerDay: 70_000,
      wagePerMonth: null,
      overtimeWagePerHour: 10_050,
      openingBalance: -50_000,
      weeklyHolidays: [0, 6],
      labourCategoryId: MASON.id,
      currentProjectId: TOWER.id,
      aadhaar: null,
    });
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/labours"),
    );
  },
};

export const ServerErrorOnField: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: LABOURS,
        respond: () =>
          Response.json(
            {
              code: "LABOUR_CODE_TAKEN",
              message: "Another Labour has this Labour Id.",
              details: { field: "labourCode" },
            },
            { status: 409 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByLabelText("Labour name"),
      "Raju Pawar",
    );
    await userEvent.type(canvas.getByLabelText("Labour Id"), "L-001");
    await userEvent.type(canvas.getByLabelText("Joining date"), "2026-09-01");
    await userEvent.type(canvas.getByLabelText("Wage per day"), "700");
    await choose(canvas, body, userEvent, "Project", "Tower A");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Another Labour has this Labour Id."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Labour Id")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const EditWithoutFinancial: Story = {
  render: () => (
    <StoryQueryClient>
      <EditLabourScreen id={RAJU.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    const hidden = withoutAmounts(RAJU);
    api = mockFetch([
      ...LOOKUPS,
      { path: `${LABOURS}/${RAJU.id}`, respond: () => Response.json(hidden) },
      {
        path: `${LABOURS}/${RAJU.id}/documents`,
        respond: () =>
          Response.json({
            items: [
              {
                id: "0199a1b2-0000-7000-8000-00000000f001",
                fileName: "Aadhaar card.pdf",
                contentType: "application/pdf",
                bytes: 120_000,
                createdAt: RAJU.createdAt,
                url: `${LABOURS}/${RAJU.id}/documents/0199a1b2-0000-7000-8000-00000000f001`,
              },
            ],
          }),
      },
      {
        method: "POST",
        path: `${LABOURS}/${RAJU.id}/update`,
        respond: () => Response.json(hidden),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Raju Pawar" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Labour name")).toHaveValue(
      "Raju Pawar",
    );
    await expect(canvas.queryByLabelText("Wage per day")).toBeNull();
    await expect(canvas.queryByLabelText("Opening balance")).toBeNull();
    await expect(canvas.getByText(/You cannot see wages/)).toBeVisible();
    await expect(
      canvas.getByText("Leave blank to keep XXXXXXXX2346."),
    ).toBeVisible();
    // No Project field on edit: Transfer moves a labourer.
    await expect(
      canvas.queryByRole("combobox", { name: "Project" }),
    ).toBeNull();
    await expect(
      await canvas.findByRole("link", { name: "Aadhaar card.pdf" }),
    ).toBeVisible();

    await userEvent.clear(canvas.getByLabelText("Labour name"));
    await userEvent.type(canvas.getByLabelText("Labour name"), "Raju P.");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent(`${LABOURS}/${RAJU.id}/update`)).toBeDefined(),
    );
    const update = sent(`${LABOURS}/${RAJU.id}/update`) as Record<
      string,
      unknown
    >;
    await expect(update).toMatchObject({
      name: "Raju P.",
      expectedUpdatedAt: RAJU.updatedAt,
    });
    await expect("wagePerDay" in update).toBe(false);
    await expect("openingBalance" in update).toBe(false);
    await expect("aadhaar" in update).toBe(false);
  },
};
