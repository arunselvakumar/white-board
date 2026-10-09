import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import { EditVendorScreen, NewVendorScreen } from "./vendor-form";
import {
  CARPENTER,
  CATEGORY_LIST,
  HELPER,
  MASON,
  PROJECT_OPTIONS,
  RAMESH_GANG,
} from "./vendor-fixtures";

const VENDORS = "/api/construction/labour/vendors";

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
  title: "Masters/Vendors/Form",
  component: NewVendorScreen,
  render: () => (
    <StoryQueryClient>
      <NewVendorScreen />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof NewVendorScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddWithRateCard: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: VENDORS,
        respond: () => Response.json(RAMESH_GANG, { status: 201 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Add Vendor" }),
    ).toBeVisible();
    // The form starts with Shift 1 and one empty category row.
    await expect(canvas.getByLabelText("Shift name")).toHaveValue("Shift 1");

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the Vendor name"),
    ).toBeVisible();
    await expect(canvas.getByText("Choose a Labour Category")).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.type(canvas.getByLabelText("Vendor name"), "Ramesh Gang");
    await userEvent.type(canvas.getByLabelText("Contact number"), "9876543210");
    await userEvent.type(canvas.getByLabelText("Opening balance"), "25000");
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Tower A" }),
    );

    await choose(
      canvas,
      body,
      userEvent,
      "Shift 1 category 1 Labour Category",
      "Mason",
    );
    await userEvent.type(
      canvas.getByLabelText("Shift 1 category 1 rate per day"),
      "900",
    );
    await userEvent.type(
      canvas.getByLabelText("Shift 1 category 1 overtime per hour"),
      "120",
    );
    // The disabled category is not offered for a new row.
    await userEvent.click(canvas.getByRole("button", { name: "Add category" }));
    await userEvent.click(
      canvas.getByRole("combobox", {
        name: "Shift 1 category 2 Labour Category",
      }),
    );
    await expect(
      await body.findByRole("option", { name: "Mason" }),
    ).toBeInTheDocument();
    await expect(body.queryByRole("option", { name: /Welder/ })).toBeNull();
    await userEvent.click(body.getByRole("option", { name: "Mason" }));
    await userEvent.type(
      canvas.getByLabelText("Shift 1 category 2 rate per day"),
      "550.50",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("This Labour Category is already on this shift"),
    ).toBeVisible();
    await expect(posts()).toBe(0);

    await choose(
      canvas,
      body,
      userEvent,
      "Shift 1 category 2 Labour Category",
      "Helper",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add shift" }));
    const night = within(canvas.getByRole("group", { name: "Shift 2" }));
    await expect(night.getByLabelText("Shift name")).toHaveValue("Shift 2");
    await userEvent.clear(night.getByLabelText("Shift name"));
    await userEvent.type(night.getByLabelText("Shift name"), "Night");
    await choose(
      canvas,
      body,
      userEvent,
      "Shift 2 category 1 Labour Category",
      "Carpenter",
    );
    await userEvent.type(
      canvas.getByLabelText("Shift 2 category 1 rate per day"),
      "1000",
    );

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/vendors"),
    );
    const bodySent = sent(VENDORS) as Record<string, unknown>;
    await expect(bodySent).toMatchObject({
      name: "Ramesh Gang",
      contactNumber: "9876543210",
      address: null,
      projectIds: [PROJECT_OPTIONS[0]?.id],
      openingBalance: 2_500_000,
      shifts: [
        {
          id: null,
          name: "Shift 1",
          startTime: null,
          endTime: null,
          rates: [
            {
              labourCategoryId: MASON.id,
              ratePerDay: 90_000,
              overtimePerHour: 12_000,
            },
            {
              labourCategoryId: HELPER.id,
              ratePerDay: 55_050,
              overtimePerHour: 0,
            },
          ],
        },
        {
          id: null,
          name: "Night",
          rates: [
            {
              labourCategoryId: CARPENTER.id,
              ratePerDay: 100_000,
              overtimePerHour: 0,
            },
          ],
        },
      ],
    });
  },
};

export const AddShowsServerErrorOnTheRow: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: VENDORS,
        respond: () =>
          Response.json(
            {
              code: "LABOUR_CATEGORY_DISABLED",
              message:
                "Mason is disabled in Masters, so it cannot be added to a rate card.",
              details: { labourCategoryId: MASON.id },
            },
            { status: 400 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByLabelText("Vendor name"),
      "Sunil Gang",
    );
    await choose(
      canvas,
      body,
      userEvent,
      "Shift 1 category 1 Labour Category",
      "Mason",
    );
    await userEvent.type(
      canvas.getByLabelText("Shift 1 category 1 rate per day"),
      "800",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "Mason is disabled in Masters, so it cannot be added to a rate card.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", {
        name: "Shift 1 category 1 Labour Category",
      }),
    ).toHaveAttribute("aria-invalid", "true");
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const AddWithoutRateCardWarns: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: VENDORS,
        respond: () =>
          Response.json(
            { ...RAMESH_GANG, shifts: [], hasRateCard: false },
            { status: 201 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Vendor name"),
      "Sunil Gang",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Shift 1" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("No rate card");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/vendors"),
    );
    await expect(sent(VENDORS)).toMatchObject({
      name: "Sunil Gang",
      shifts: [],
      openingBalance: 0,
    });
  },
};

const EDIT_PATH = `${VENDORS}/${RAMESH_GANG.id}`;

export const EditReplacesTheRateCard: Story = {
  render: () => (
    <StoryQueryClient>
      <EditVendorScreen id={RAMESH_GANG.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      { path: EDIT_PATH, respond: () => Response.json(RAMESH_GANG) },
      {
        method: "POST",
        path: `${EDIT_PATH}/update`,
        respond: () => Response.json(RAMESH_GANG),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Ramesh Gang" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Contact number")).toHaveValue(
      "9876543210",
    );
    await expect(canvas.getByLabelText("Opening balance")).toHaveValue("25000");
    const dayRate = canvas.getByLabelText("Shift 1 category 1 rate per day");
    await expect(dayRate).toHaveValue("900");
    await userEvent.clear(dayRate);
    await userEvent.type(dayRate, "950");
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Shift 2" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/vendors"),
    );
    await expect(sent(`${EDIT_PATH}/update`)).toMatchObject({
      expectedUpdatedAt: RAMESH_GANG.updatedAt,
      openingBalance: 2_500_000,
      projectIds: [PROJECT_OPTIONS[0]?.id],
      shifts: [
        {
          id: RAMESH_GANG.shifts[0]?.id,
          name: "Shift 1",
          startTime: "08:00",
          endTime: "17:00",
          rates: [
            {
              labourCategoryId: MASON.id,
              ratePerDay: 95_000,
              overtimePerHour: 12_000,
            },
            {
              labourCategoryId: HELPER.id,
              ratePerDay: 55_000,
              overtimePerHour: 7_000,
            },
          ],
        },
      ],
    });
  },
};

export const EditWithoutFinancialHidesAmounts: Story = {
  render: () => (
    <StoryQueryClient>
      <EditVendorScreen id={RAMESH_GANG.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    const hidden = {
      ...RAMESH_GANG,
      openingBalance: null,
      balance: null,
      shifts: RAMESH_GANG.shifts.map((shift) => ({
        ...shift,
        rates: shift.rates.map((rate) => ({
          ...rate,
          ratePerDay: null,
          overtimePerHour: null,
        })),
      })),
    };
    api = mockFetch([
      ...LOOKUPS,
      { path: EDIT_PATH, respond: () => Response.json(hidden) },
      {
        method: "POST",
        path: `${EDIT_PATH}/update`,
        respond: () => Response.json(hidden),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Ramesh Gang" }),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("Opening balance")).toBeNull();
    await expect(
      canvas.queryByLabelText("Shift 1 category 1 rate per day"),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/vendors"),
    );
    await expect(sent(`${EDIT_PATH}/update`)).toMatchObject({
      openingBalance: null,
      shifts: [
        {
          rates: [
            {
              labourCategoryId: MASON.id,
              ratePerDay: null,
              overtimePerHour: null,
            },
            {
              labourCategoryId: HELPER.id,
              ratePerDay: null,
              overtimePerHour: null,
            },
          ],
        },
        { rates: [{ ratePerDay: null, overtimePerHour: null }] },
      ],
    });
  },
};
