import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
  type PreschoolApiHandler,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type {
  PreschoolFeeHead,
  PreschoolFeeStructure,
  PreschoolFeeStructureList,
} from "@/src/queries/preschool/fees";

import { FeeStructuresScreen } from "./fee-structures-screen";

const YEAR = "5c0e8400-e29b-41d4-a716-446655440000";
const NURSERY = "9a0e8400-e29b-41d4-a716-446655440001";
const LKG = "9a0e8400-e29b-41d4-a716-446655440002";
const ADMISSION_FEE = "9c0e8400-e29b-41d4-a716-446655440001";
const TUITION = "9c0e8400-e29b-41d4-a716-446655440002";
const KIT = "9c0e8400-e29b-41d4-a716-446655440003";
const TRANSPORT = "9c0e8400-e29b-41d4-a716-446655440004";

function head(
  id: string,
  name: string,
  kind: PreschoolFeeHead["kind"],
  overrides: Partial<PreschoolFeeHead> = {},
): PreschoolFeeHead {
  return {
    id,
    name,
    kind,
    royaltyBearing: false,
    refundable: false,
    sortOrder: 0,
    isArchived: false,
    ...overrides,
  };
}

const HEADS = [
  head(ADMISSION_FEE, "Admission fee", "one_time", { royaltyBearing: true }),
  head(TUITION, "Tuition", "recurring", { royaltyBearing: true }),
  head(KIT, "Kit & books", "one_time"),
  head(TRANSPORT, "Transport", "recurring", { isArchived: true }),
];

function structure(
  id: string,
  programmeId: string,
  centreId: string | null,
  tuitionPaise: number,
): PreschoolFeeStructure {
  return {
    id,
    academicYearId: YEAR,
    programmeId,
    centreId,
    items: [
      {
        feeHeadId: ADMISSION_FEE,
        feeHeadName: "Admission fee",
        kind: "one_time",
        amountPaise: 1_000_000,
        frequency: "one_time",
      },
      {
        feeHeadId: TUITION,
        feeHeadName: "Tuition",
        kind: "recurring",
        amountPaise: tuitionPaise,
        frequency: "monthly",
      },
      {
        feeHeadId: KIT,
        feeHeadName: "Kit & books",
        kind: "one_time",
        amountPaise: 400_000,
        frequency: "annual",
      },
    ],
    annualPaise: 1_000_000 + 12 * tuitionPaise + 400_000,
  };
}

const NURSERY_DEFAULT = structure(
  "9e0e8400-e29b-41d4-a716-446655440001",
  NURSERY,
  null,
  300_000,
);
const LKG_DEFAULT = structure(
  "9e0e8400-e29b-41d4-a716-446655440002",
  LKG,
  null,
  350_000,
);
const LKG_OVERRIDE = structure(
  "9e0e8400-e29b-41d4-a716-446655440003",
  LKG,
  CENTRE_IDS.annaNagar,
  320_000,
);

function list(
  centreId: string | null,
  mayOverride: boolean | null,
): PreschoolFeeStructureList {
  return {
    academicYear: { id: YEAR, name: "2026–27" },
    centreId,
    mayOverride,
    items: [
      {
        programmeId: NURSERY,
        programmeName: "Nursery (Pre-KG)",
        default: NURSERY_DEFAULT,
        override: null,
        effective: NURSERY_DEFAULT,
      },
      {
        programmeId: LKG,
        programmeName: "LKG",
        default: LKG_DEFAULT,
        override: centreId == null ? null : LKG_OVERRIDE,
        effective: centreId == null ? LKG_DEFAULT : LKG_OVERRIDE,
      },
    ],
  };
}

const CENTRE_HEAD = preschoolMe({
  role: "centre_head",
  hasSeveralCentres: true,
  centres: [
    {
      id: CENTRE_IDS.annaNagar,
      name: "Little Steps Anna Nagar",
      code: "LSAN",
      ownership: "company_owned",
      status: "active",
    },
  ],
});

function routes(
  structures: PreschoolFeeStructureList,
  extra: Record<string, PreschoolApiHandler> = {},
): Record<string, PreschoolApiHandler> {
  return {
    "GET /academic-years": () => ({
      json: {
        items: [
          {
            id: YEAR,
            name: "2026–27",
            startsOn: "2026-04-01",
            endsOn: "2027-03-31",
            isCurrent: true,
          },
        ],
      },
    }),
    "GET /fees/structures": () => ({ json: structures }),
    "GET /fees/heads": () => ({ json: { items: HEADS } }),
    ...extra,
  };
}

const calls: PreschoolApiCall[] = [];

const meta = {
  title: "Preschool/Fees/Fee Structures",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/fees/structures" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerEditsTheDefault: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: routes(list(null, null), {
        "POST /fees/structures": () => ({ json: NURSERY_DEFAULT }),
      }),
    });
  },
  render: () => <FeeStructuresScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const nursery = within(
      await canvas.findByRole("listitem", { name: "Nursery (Pre-KG)" }),
    );
    await expect(nursery.getByText("₹50,000 a year")).toBeVisible();
    await expect(nursery.getByText("Tuition")).toBeVisible();
    await expect(
      canvas.getByText("Changes apply to new Admissions only.", {
        exact: false,
      }),
    ).toBeVisible();

    await userEvent.click(
      nursery.getByRole("button", { name: "Edit Nursery (Pre-KG) fees" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.queryByText("Transport")).toBeNull();
    await userEvent.click(dialog.getByLabelText("Admission fee charged"));
    await expect(
      (await body.findAllByRole("option")).map((option) => option.textContent),
    ).toEqual(["One time", "Annual"]);
    await userEvent.keyboard("{Escape}");

    const tuition = dialog.getByLabelText("Tuition amount (₹)");
    await userEvent.clear(tuition);
    await userEvent.type(tuition, "9000");
    await userEvent.click(dialog.getByLabelText("Tuition charged"));
    await userEvent.click(
      await body.findByRole("option", { name: "Per term" }),
    );
    await userEvent.clear(dialog.getByLabelText("Kit & books amount (₹)"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Save Fee Structure" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.route === "POST /fees/structures")?.body,
      ).toEqual({
        academicYearId: YEAR,
        programmeId: NURSERY,
        centreId: null,
        items: [
          {
            feeHeadId: ADMISSION_FEE,
            amountPaise: 1_000_000,
            frequency: "one_time",
          },
          { feeHeadId: TUITION, amountPaise: 900_000, frequency: "term" },
        ],
      }),
    );
  },
};

export const CentreHeadOverrides: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      me: CENTRE_HEAD,
      calls,
      routes: routes(list(CENTRE_IDS.annaNagar, true), {
        [`POST /fees/structures/${LKG_OVERRIDE.id}/remove`]: () => ({
          status: 204,
        }),
      }),
    });
  },
  render: () => <FeeStructuresScreen />,
  play: async ({ canvas, userEvent }) => {
    const nursery = within(
      await canvas.findByRole("listitem", { name: "Nursery (Pre-KG)" }),
    );
    await expect(
      nursery.getByText("Using the Workspace default"),
    ).toBeVisible();
    const lkg = within(canvas.getByRole("listitem", { name: "LKG" }));
    await expect(lkg.getByText("Overridden for this Centre")).toBeVisible();
    await expect(
      canvas.queryByRole("tab", { name: "Workspace default" }),
    ).toBeNull();
    await expect(canvas.queryByText("Fee Heads")).toBeNull();
    await userEvent.click(
      lkg.getByRole("button", { name: "Remove override for LKG" }),
    );
    await waitFor(() =>
      expect(calls.map((call) => call.route)).toContain(
        `POST /fees/structures/${LKG_OVERRIDE.id}/remove`,
      ),
    );
  },
};

export const CentreHeadMayNotOverride: Story = {
  beforeEach() {
    return mockPreschoolApi({
      me: CENTRE_HEAD,
      routes: routes(list(CENTRE_IDS.annaNagar, false)),
    });
  },
  render: () => <FeeStructuresScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/This Centre uses the Workspace default fees/),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /^Edit / })).toBeNull();
  },
};

export const OwnerAddsAFeeHead: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: routes(list(null, null), {
        "POST /fees/heads": (body) =>
          (body as { name: string }).name === "Tuition"
            ? {
                status: 409,
                json: {
                  code: "FEE_HEAD_NAME_IN_USE",
                  message: "There is already a Fee Head called Tuition.",
                },
              }
            : { status: 201, json: head(KIT, "Field trip", "one_time") },
      }),
    });
  },
  render: () => <FeeStructuresScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Fee Heads" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Restore Transport" }),
    ).toBeVisible();
    await expect(canvas.getAllByText("Royalty-bearing")).toHaveLength(2);

    await userEvent.click(canvas.getByRole("button", { name: "Add Fee Head" }));
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Name"), "Tuition");
    await userEvent.click(
      dialog.getByRole("button", { name: "Save Fee Head" }),
    );
    await expect(
      await dialog.findByText("There is already a Fee Head called Tuition."),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("Name"));
    await userEvent.type(dialog.getByLabelText("Name"), "Field trip");
    await userEvent.click(dialog.getByLabelText("Charged"));
    await userEvent.click(
      await body.findByRole("option", { name: "One-time" }),
    );
    await userEvent.click(dialog.getByRole("switch", { name: "Refundable" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Save Fee Head" }),
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.route === "POST /fees/heads").at(-1)?.body,
      ).toEqual({
        name: "Field trip",
        kind: "one_time",
        royaltyBearing: false,
        refundable: true,
      }),
    );
  },
};
