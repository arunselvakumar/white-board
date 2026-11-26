import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { CentreRoyaltyStatement } from "@/app/(app)/preschool/head-office/royalty/[centreId]/_components/centre-royalty-statement";
import { RoyaltyScreen } from "@/app/(app)/preschool/head-office/royalty/_components/royalty-screen";
import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import {
  expectFitsPhone,
  withPhoneFrame,
} from "@/app/(app)/preschool/_components/phone-frame";
import { PRESCHOOL_CENTRE_COOKIE } from "@/lib/preschool-active-centre";
import type { PreschoolHeadOffice } from "@/src/queries/preschool/dashboard";
import type {
  PreschoolCentreRoyaltyStatement,
  PreschoolRoyaltyStatement,
} from "@/src/queries/preschool/royalty";

import { HeadOfficeScreen } from "./head-office-screen";

const HEAD_OFFICE: PreschoolHeadOffice = {
  month: "2026-11",
  date: "2026-11-25",
  centres: [
    {
      id: CENTRE_IDS.annaNagar,
      name: "Little Steps Anna Nagar",
      code: "LSAN",
      ownership: "company_owned",
      status: "active",
      activeChildren: 86,
      capacity: 100,
      occupancyPercent: 86,
      presentToday: 71,
      collectedPaise: 12_40_000_00,
      duePaise: 2_10_000_00,
      overduePaise: 85_000_00,
      openEnquiries: 9,
      admissions: 4,
      royaltyBps: 0,
      royaltyDuePaise: 0,
    },
    {
      id: CENTRE_IDS.tambaram,
      name: "Little Steps Tambaram",
      code: "LSTB",
      ownership: "franchised",
      status: "active",
      activeChildren: 41,
      capacity: 60,
      occupancyPercent: 68,
      presentToday: 33,
      collectedPaise: 5_60_000_00,
      duePaise: 40_000_00,
      overduePaise: 0,
      openEnquiries: 3,
      admissions: 1,
      royaltyBps: 1000,
      royaltyDuePaise: 48_000_00,
    },
  ],
  totals: {
    activeChildren: 127,
    capacity: 160,
    occupancyPercent: 79,
    presentToday: 104,
    collectedPaise: 18_00_000_00,
    duePaise: 2_50_000_00,
    overduePaise: 85_000_00,
    openEnquiries: 12,
    admissions: 5,
    royaltyDuePaise: 48_000_00,
  },
};

const TAMBARAM_ROYALTY = {
  centreId: CENTRE_IDS.tambaram,
  name: "Little Steps Tambaram",
  code: "LSTB",
  franchiseeName: "Priya Raman",
  royaltyBps: 1000,
  royaltyPercent: 10,
  byFeeHead: [
    {
      feeHeadId: "e10e8400-e29b-41d4-a716-446655440001",
      name: "Tuition",
      royaltyBearing: true,
      collectedPaise: 10_000_00,
    },
    {
      feeHeadId: "e10e8400-e29b-41d4-a716-446655440002",
      name: "Uniform",
      royaltyBearing: false,
      collectedPaise: 2_000_00,
    },
  ],
  royaltyBearingPaise: 10_000_00,
  otherPaise: 2_000_00,
  royaltyPaise: 1_000_00,
};

const STATEMENT: PreschoolRoyaltyStatement = {
  month: "2026-11",
  startsOn: "2026-11-01",
  endsOn: "2026-11-30",
  centres: [TAMBARAM_ROYALTY],
  totals: {
    royaltyBearingPaise: 10_000_00,
    otherPaise: 2_000_00,
    royaltyPaise: 1_000_00,
  },
};

const CENTRE_STATEMENT: PreschoolCentreRoyaltyStatement = {
  ...TAMBARAM_ROYALTY,
  month: "2026-11",
  startsOn: "2026-11-01",
  endsOn: "2026-11-30",
  payments: [
    {
      paymentId: "e20e8400-e29b-41d4-a716-446655440001",
      receiptNumber: "LSTB/2026/0041",
      receivedOn: "2026-11-05",
      childId: "e30e8400-e29b-41d4-a716-446655440001",
      childName: "Aadhya Kumar",
      royaltyBearingPaise: 6_000_00,
      otherPaise: 2_000_00,
    },
    {
      paymentId: "e20e8400-e29b-41d4-a716-446655440002",
      receiptNumber: "LSTB/2026/0052",
      receivedOn: "2026-11-20",
      childId: "e30e8400-e29b-41d4-a716-446655440001",
      childName: "Aadhya Kumar",
      royaltyBearingPaise: 4_000_00,
      otherPaise: 0,
    },
  ],
};

const meta = {
  title: "Preschool/Head Office",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/head-office" } },
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

export const CentresSideBySide: Story = {
  beforeEach: () => {
    // The test browser is 414 px wide; the table is the layout from 768 px.
    const width = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    const cleanup = mockPreschoolApi({
      routes: { "GET /dashboard/head-office": () => ({ json: HEAD_OFFICE }) },
    });
    return () => {
      cleanup();
      if (width == null) Reflect.deleteProperty(window, "innerWidth");
      else Object.defineProperty(window, "innerWidth", width);
    };
  },
  render: () => <HeadOfficeScreen />,
  play: async ({ canvas, userEvent }) => {
    const totals = within(
      await canvas.findByRole("region", { name: "Totals" }),
    );
    await expect(totals.getByText("18,00,000")).toBeVisible();
    await expect(totals.getByText("48,000")).toBeVisible();
    const tambaram = within(
      canvas.getByRole("row", { name: /Little Steps Tambaram/ }),
    );
    await expect(tambaram.getByText("Franchised")).toBeVisible();
    await expect(tambaram.getByText("41 / 60")).toBeVisible();
    await expect(tambaram.getByText("₹48,000")).toBeVisible();
    await expect(
      within(canvas.getByRole("row", { name: /Anna Nagar/ })).getByText(
        "₹85,000",
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Little Steps Tambaram" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/preschool"),
    );
    await expect(document.cookie).toContain(
      `${PRESCHOOL_CENTRE_COOKIE}=${CENTRE_IDS.tambaram}`,
    );
  },
};

/** On a phone each Centre is a card. */
export const Phone: Story = {
  beforeEach: () =>
    mockPreschoolApi({
      routes: { "GET /dashboard/head-office": () => ({ json: HEAD_OFFICE }) },
    }),
  render: () => <HeadOfficeScreen />,
  decorators: [withPhoneFrame],
  play: async ({ canvas, canvasElement }) => {
    const list = within(await canvas.findByRole("list", { name: "Centres" }));
    await expect(list.getAllByRole("listitem")).toHaveLength(2);
    await expectFitsPhone(canvasElement);
  },
};

export const Royalty: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/head-office/royalty" } },
  },
  beforeEach: () =>
    mockPreschoolApi({
      routes: { "GET /royalty": () => ({ json: STATEMENT }) },
    }),
  render: () => <RoyaltyScreen />,
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Little Steps Tambaram" }),
    ).toBeVisible();
    await expect(canvas.getByText(/Priya Raman/)).toBeVisible();
    await expect(canvas.getByText("10% royalty")).toBeVisible();
    await expect(canvas.getAllByText("₹1,000")).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "By Fee Head" }));
    const split = within(
      canvas.getByRole("list", {
        name: "Collections by Fee Head at Little Steps Tambaram",
      }),
    );
    await expect(split.getByText("Royalty-bearing")).toBeVisible();
    await expect(split.getByText("₹2,000")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "View statement" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining(
        `/preschool/head-office/royalty/${CENTRE_IDS.tambaram}?month=`,
      ),
    );
  },
};

export const NoFranchisedCentres: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/head-office/royalty" } },
  },
  beforeEach: () =>
    mockPreschoolApi({
      routes: {
        "GET /royalty": () => ({
          json: {
            ...STATEMENT,
            centres: [],
            totals: { royaltyBearingPaise: 0, otherPaise: 0, royaltyPaise: 0 },
          },
        }),
      },
    }),
  render: () => <RoyaltyScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Franchised Centres"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Centres" }),
    ).toHaveAttribute("href", "/preschool/centres");
  },
};

export const CentreStatement: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/preschool/head-office/royalty/${CENTRE_IDS.tambaram}`,
      },
    },
  },
  beforeEach: () =>
    mockPreschoolApi({
      routes: {
        [`GET /royalty/${CENTRE_IDS.tambaram}`]: () => ({
          json: CENTRE_STATEMENT,
        }),
      },
    }),
  render: () => <CentreRoyaltyStatement centreId={CENTRE_IDS.tambaram} />,
  play: async ({ canvas }) => {
    const statement = within(
      await canvas.findByRole("article", { name: "Royalty Statement" }),
    );
    await expect(statement.getByText("Priya Raman")).toBeVisible();
    const row = within(
      statement.getByRole("row", { name: /LSTB\/2026\/0041/ }),
    );
    await expect(row.getByText("₹6,000")).toBeVisible();
    await expect(row.getByText("₹2,000")).toBeVisible();
    await expect(statement.getByText("₹10,000")).toBeVisible();
    await expect(statement.getByText("₹1,000")).toBeVisible();
    await expect(
      statement.getByText(/This is a statement, not an invoice\./),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Print" })).toBeVisible();
  },
};
