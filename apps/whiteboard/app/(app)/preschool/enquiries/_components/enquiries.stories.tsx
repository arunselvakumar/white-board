import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { EnquiryDetailScreen } from "@/app/(app)/preschool/enquiries/[id]/_components/enquiry-detail-screen";
import { EnquiryCreateScreen } from "@/app/(app)/preschool/enquiries/new/_components/enquiry-create-screen";
import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import {
  CHILD_FORM_OPTIONS,
  LKG_ID as LKG,
  NURSERY_ID as NURSERY,
} from "@/app/(app)/preschool/_components/preschool-story-fixtures";
import type {
  PreschoolEnquiry,
  PreschoolEnquiryDetail,
  PreschoolEnquiryPage,
  PreschoolEnquirySummary,
} from "@/src/queries/preschool/enquiries";

import { EnquiriesScreen } from "./enquiries-screen";

const NOW = "2026-11-25T05:00:00.000Z";

function enquiry(overrides: Partial<PreschoolEnquiry> = {}): PreschoolEnquiry {
  return {
    id: "7a0e8400-e29b-41d4-a716-446655440001",
    centreId: CENTRE_IDS.annaNagar,
    childName: "Aarav",
    childDateOfBirth: "2023-03-10",
    childAgeText: "3 y 8 m",
    childGender: "boy",
    parentName: "Ravi Kumar",
    parentPhone: "9840012345",
    parentEmail: "ravi@example.com",
    programmeId: NURSERY,
    programmeName: "Nursery (Pre-KG)",
    source: "walk_in",
    status: "new",
    visitOn: null,
    nextFollowUpOn: "2026-11-25",
    followUpDue: true,
    lostReason: null,
    notes: null,
    convertedChildId: null,
    convertedAt: null,
    createdByUserId: "user_owner",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const OPEN: PreschoolEnquiry[] = [
  enquiry(),
  enquiry({
    id: "7a0e8400-e29b-41d4-a716-446655440002",
    childName: "Diya",
    parentName: "Meera S",
    parentPhone: "9000011111",
    status: "contacted",
    nextFollowUpOn: "2026-11-28",
    followUpDue: false,
    source: "referral",
  }),
  enquiry({
    id: "7a0e8400-e29b-41d4-a716-446655440003",
    childName: "Kabir",
    parentName: "Anil",
    parentPhone: "9000022222",
    status: "visit_scheduled",
    visitOn: "2026-11-29",
    nextFollowUpOn: "2026-11-29",
    followUpDue: false,
    programmeId: LKG,
    programmeName: "LKG",
  }),
];

function page(items: PreschoolEnquiry[]): PreschoolEnquiryPage {
  return { items, nextCursor: null, total: items.length };
}

function summary(
  overrides: Partial<PreschoolEnquirySummary["byStatus"]> = {},
  followUpsDue = 0,
): PreschoolEnquirySummary {
  const byStatus = {
    new: 0,
    contacted: 0,
    visit_scheduled: 0,
    visited: 0,
    admitted: 0,
    lost: 0,
    ...overrides,
  };
  return {
    centreId: CENTRE_IDS.annaNagar,
    byStatus,
    open:
      byStatus.new +
      byStatus.contacted +
      byStatus.visit_scheduled +
      byStatus.visited,
    followUpsDue,
  };
}

const calls: PreschoolApiCall[] = [];

const meta = {
  title: "Preschool/Enquiries",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/enquiries" } },
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

export const EmptyBoard: Story = {
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /enquiries/summary": () => ({ json: summary() }),
        "GET /enquiries": () => ({ json: page([]) }),
      },
    });
  },
  render: () => <EnquiriesScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No open Enquiries")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Enquiry" })[0],
    ).toHaveAttribute("href", "/preschool/enquiries/new");
  },
};

export const Board: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /enquiries/summary": () => ({
          json: summary(
            { new: 1, contacted: 1, visit_scheduled: 1, lost: 2, admitted: 4 },
            1,
          ),
        }),
        "GET /enquiries": () => ({ json: page(OPEN) }),
        [`POST /enquiries/${OPEN[0]?.id ?? ""}/status`]: () => ({
          json: { ...OPEN[0], status: "contacted", activities: [] },
        }),
      },
    });
  },
  render: () => <EnquiriesScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const newColumn = within(
      await canvas.findByRole("region", { name: /^New/ }),
    );
    await expect(newColumn.getByText("Aarav")).toBeVisible();
    await expect(newColumn.getByText("Due")).toBeVisible();
    await expect(
      newColumn.getByRole("link", { name: "WhatsApp Ravi Kumar" }),
    ).toHaveAttribute("href", "https://wa.me/919840012345");
    await expect(
      newColumn.getByRole("link", { name: /Call Ravi Kumar/ }),
    ).toHaveAttribute("href", "tel:+919840012345");
    const scheduled = within(
      canvas.getByRole("region", { name: /^Visit scheduled/ }),
    );
    await expect(scheduled.getByText("Visit on 29 Nov 2026")).toBeVisible();
    await expect(canvas.getByText("Follow-ups due")).toBeVisible();

    await userEvent.click(
      newColumn.getByRole("button", { name: "Actions for Aarav" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Mark contacted" }),
    );
    await waitFor(() =>
      expect(calls.map((call) => call.route)).toContain(
        `POST /enquiries/${OPEN[0]?.id ?? ""}/status`,
      ),
    );
    await expect(
      calls.find((call) => call.route.endsWith("/status"))?.body,
    ).toEqual({ status: "contacted" });

    await userEvent.click(
      newColumn.getByRole("button", { name: "Actions for Aarav" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Admit" }));
    await expect(getRouter().push).toHaveBeenCalledWith(
      `/preschool/children/new?enquiryId=${OPEN[0]?.id ?? ""}`,
    );
  },
};

export const List: Story = {
  beforeEach() {
    return mockPreschoolApi({
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /enquiries/summary": () => ({ json: summary({ new: 3 }, 1) }),
        "GET /enquiries": () => ({ json: page(OPEN) }),
      },
    });
  },
  render: () => <EnquiriesScreen />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("tab", { name: "List" }));
    const table = await canvas.findByRole("table");
    await expect(within(table).getByText("Diya")).toBeVisible();
    await expect(canvas.getByText("1–3 of 3")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();
  },
};

export const AddEnquiry: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/enquiries/new" } },
  },
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        "GET /children/options": () => ({ json: CHILD_FORM_OPTIONS }),
        "GET /enquiries/phone-matches": () => ({
          json: {
            enquiries: [
              {
                id: OPEN[1]?.id,
                childName: "Diya",
                parentName: "Meera S",
                status: "contacted",
                createdAt: NOW,
              },
            ],
            children: [],
          },
        }),
        "POST /enquiries": () => ({
          status: 201,
          json: { ...enquiry(), activities: [] },
        }),
      },
    });
  },
  render: () => <EnquiryCreateScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save Enquiry" }),
    );
    await expect(
      await canvas.findByText("Enter the child's name"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter a 10-digit Indian mobile number"),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Child's name"), "Aarav");
    await userEvent.type(canvas.getByLabelText("Date of birth"), "2023-03-10");
    await expect(
      await canvas.findByText(/Fits Nursery \(Pre-KG\) this year/),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Parent's name"), "Ravi Kumar");
    await userEvent.type(
      canvas.getByLabelText("Mobile number"),
      "+91 98400 12345",
    );
    await expect(
      await canvas.findByText(
        "An open Enquiry with this number already exists",
      ),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Diya" })).toHaveAttribute(
      "href",
      `/preschool/enquiries/${OPEN[1]?.id ?? ""}`,
    );
    await userEvent.click(canvas.getByLabelText("Programme"));
    await userEvent.click(await body.findByRole("option", { name: /Nursery/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Save Enquiry" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/preschool/enquiries/${enquiry().id}`,
      ),
    );
    await expect(
      calls.find((call) => call.route === "POST /enquiries")?.body,
    ).toEqual({
      centreId: CENTRE_IDS.annaNagar,
      childName: "Aarav",
      childDateOfBirth: "2023-03-10",
      childGender: null,
      parentName: "Ravi Kumar",
      parentPhone: "+91 98400 12345",
      parentEmail: null,
      programmeId: NURSERY,
      source: "walk_in",
      notes: null,
      nextFollowUpOn: null,
    });
  },
};

function detail(
  overrides: Partial<PreschoolEnquiryDetail> = {},
): PreschoolEnquiryDetail {
  return {
    ...enquiry({ status: "contacted" }),
    activities: [
      {
        id: "8a0e8400-e29b-41d4-a716-446655440002",
        kind: "call",
        note: "Mother wants to see the play area.",
        toStatus: null,
        createdByUserId: "user_owner",
        createdByName: "Arun",
        createdAt: NOW,
      },
      {
        id: "8a0e8400-e29b-41d4-a716-446655440001",
        kind: "status_change",
        note: null,
        toStatus: "new",
        createdByUserId: "user_owner",
        createdByName: "Arun",
        createdAt: "2026-11-24T05:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

export const Detail: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: `/preschool/enquiries/${enquiry().id}` },
    },
  },
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      centreId: CENTRE_IDS.annaNagar,
      routes: {
        [`GET /enquiries/${enquiry().id}`]: () => ({ json: detail() }),
        [`POST /enquiries/${enquiry().id}/follow-ups`]: () => ({
          json: detail(),
        }),
      },
    });
  },
  render: () => <EnquiryDetailScreen enquiryId={enquiry().id} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Aarav" }),
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("list", { name: "Pipeline" })).getByText(
        "Contacted",
      ),
    ).toHaveAttribute("aria-current", "step");
    await expect(
      canvas.getByText("Mother wants to see the play area."),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Admit" })).toHaveAttribute(
      "href",
      `/preschool/children/new?enquiryId=${enquiry().id}`,
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Log follow-up" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Note"), "Called back");
    await userEvent.click(dialog.getByLabelText("Status"));
    await userEvent.click(
      await body.findByRole("option", { name: "Visit scheduled" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save follow-up" }),
    );
    await expect(
      await dialog.findByText("Choose the date of the visit"),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Visit date"), "2026-11-29");
    await userEvent.click(
      dialog.getByRole("button", { name: "Save follow-up" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.route.endsWith("/follow-ups"))?.body,
      ).toEqual({
        kind: "call",
        note: "Called back",
        nextFollowUpOn: null,
        status: "visit_scheduled",
        visitOn: "2026-11-29",
      }),
    );
  },
};
