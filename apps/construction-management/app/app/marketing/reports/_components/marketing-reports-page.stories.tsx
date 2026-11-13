import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ReportJob } from "@/src/queries/reports";

import { mockApi, StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import {
  catalogueHandler,
  CENTRAL_CATALOGUE_PATH,
  CENTRAL_FILTER_OPTIONS_PATH,
  CENTRAL_REPORTS_LIST_PATH,
  DONE_CENTRAL_STOCK,
  FILTER_OPTIONS,
  job,
  TODAY,
} from "@/app/app/workspace/central-payment/_components/report-fixtures";

import {
  MARKETING_REPORT_KINDS,
  MarketingReportsPage,
} from "./marketing-reports-page";

const RAVI_ID = "0190a000-0000-7000-8000-0000000000fb";
const KAVERI_ID = "0190a000-0000-7000-8000-0000000000fc";

const DONE_REGISTER = job({
  id: "0190a000-0000-7000-8000-0000000000bb",
  kind: "marketing_visit_register",
  title: "Visit register",
  projectId: null,
  params: { from: "2026-10-01", to: TODAY },
});

let api: ReturnType<typeof mockApi>;

/** The Marketing cards, their pickers and the recent central reports. */
function marketingApi(
  recent: ReportJob[] = [DONE_REGISTER, DONE_CENTRAL_STOCK],
): (call: ApiCall) => Response | undefined {
  const catalogue = catalogueHandler({ central: MARKETING_REPORT_KINDS });
  return (call) => {
    const answered = catalogue(call);
    if (answered != null) return answered;
    if (call.method === "GET" && call.path === CENTRAL_FILTER_OPTIONS_PATH)
      return Response.json(FILTER_OPTIONS);
    if (call.method === "GET" && call.path === CENTRAL_REPORTS_LIST_PATH)
      return Response.json({ items: recent });
    if (call.method === "POST" && call.path === CENTRAL_REPORTS_LIST_PATH)
      return Response.json(
        { ...DONE_REGISTER, id: "0190a000-0000-7000-8000-0000000000bc" },
        { status: 201 },
      );
    return undefined;
  };
}

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Marketing/Reports",
  component: MarketingReportsPage,
  args: { today: TODAY },
  parameters: {
    nextjs: { navigation: { pathname: "/app/marketing/reports" } },
  },
  render: (args) => (
    <StoryQueries>
      <MarketingReportsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MarketingReportsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The three reports, and only the Marketing ones under recent reports. */
export const Reports: Story = {
  beforeEach: () => {
    api = mockApi(marketingApi());
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Marketing Reports" }),
    ).toBeVisible();
    for (const name of [
      "Visit register",
      "Marketing Person summary",
      "Company pipeline",
    ])
      await expect(await canvas.findByRole("form", { name })).toBeVisible();
    const summary = within(
      canvas.getByRole("form", { name: "Marketing Person summary" }),
    );
    await expect(summary.getByLabelText(/Month/)).toBeVisible();
    const pipeline = within(
      canvas.getByRole("form", { name: "Company pipeline" }),
    );
    await expect(pipeline.getByLabelText(/As on/)).toBeVisible();
    await waitFor(() =>
      expect(
        pipeline.getByRole("combobox", { name: "Assigned to" }),
      ).toBeVisible(),
    );
    const recent = within(
      await canvas.findByRole("list", { name: "Recent reports" }),
    );
    await expect(recent.getByText("Visit register")).toBeVisible();
    // A central report from elsewhere is not listed here.
    await expect(recent.queryByText("Stock Register")).toBeNull();
  },
};

/** The register's filters go in the request, without a Project. */
export const RegisterFilters: Story = {
  beforeEach: () => {
    api = mockApi(marketingApi([]));
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = within(
      await canvas.findByRole("form", { name: "Visit register" }),
    );
    await waitFor(() =>
      expect(card.getByRole("combobox", { name: "Visited by" })).toBeVisible(),
    );
    const pick = async (name: string, option: string) => {
      await userEvent.click(card.getByRole("combobox", { name }));
      await userEvent.click(await body.findByRole("option", { name: option }));
    };
    await pick("Visited by", "Ravi Kumar");
    await pick("Prospect Company", "Kaveri Steel");
    await pick("Status", "Missed");
    await pick("Purpose", "Quotation");
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      kind: "marketing_visit_register",
      projectId: null,
      params: {
        from: "2026-10-01",
        to: TODAY,
        memberId: RAVI_ID,
        prospectCompanyId: KAVERI_ID,
        status: "missed",
        purpose: "quotation",
      },
    });
  },
};

/** Without Visits Report the catalogue offers none of them. */
export const NothingToGenerate: Story = {
  beforeEach: () => {
    api = mockApi((call) =>
      call.method === "GET" && call.path === CENTRAL_CATALOGUE_PATH
        ? Response.json({ scope: "central", items: [] })
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Marketing Reports you can generate"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("heading", {
        name: "Your recent Marketing Reports",
      }),
    ).toBeNull();
  },
};
