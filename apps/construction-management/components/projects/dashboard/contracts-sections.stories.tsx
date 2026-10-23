import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import {
  CONTRACTS_DASHBOARD_PATH,
  contractorOnlyDashboard,
  contractsDashboard,
  noContractsDashboard,
} from "./contracts-dashboard-fixtures";
import { ContractsSection } from "./contracts-sections";

const PROJECT_ID = "0199c4a0-0000-7000-8000-00000000a001";

function serve(answer: "data" | "contractor" | "none" | "forbidden") {
  return () =>
    mockApi(({ method, path }) => {
      if (method !== "GET" || !path.startsWith(CONTRACTS_DASHBOARD_PATH))
        return undefined;
      if (answer === "forbidden")
        return Response.json(
          { code: "PERMISSION_DENIED", message: "No." },
          { status: 403 },
        );
      return Response.json(
        answer === "contractor"
          ? contractorOnlyDashboard(PROJECT_ID)
          : answer === "none"
            ? noContractsDashboard(PROJECT_ID)
            : contractsDashboard(PROJECT_ID),
      );
    }).restore;
}

const meta = {
  title: "Projects/Dashboard/Contracts section",
  component: ContractsSection,
  args: { projectId: PROJECT_ID },
  beforeEach: serve("data"),
  render: (args) => (
    <StoryQueries>
      <ContractsSection {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ContractsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Billed against the BOQ, each side's figures, and open Work Orders. */
export const Data: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Billed to date", { selector: "span" }),
    ).toBeVisible();
    await expect(canvas.getByText("· 25.3 %")).toBeVisible();
    const clientFacts = within(canvas.getByLabelText("Client"));
    await expect(
      clientFacts.getByText("Receivable").parentElement,
    ).toHaveTextContent("₹6,12,480");
    await expect(
      clientFacts.getByText("Retention held").parentElement,
    ).toHaveTextContent("₹1,07,375");
    const contractorFacts = within(canvas.getByLabelText("Contractors"));
    await expect(
      contractorFacts.getByText("Payable").parentElement,
    ).toHaveTextContent("₹2,35,600");
    await expect(
      contractorFacts.getByText("Pending approval").parentElement,
    ).toHaveTextContent("1");
    await expect(canvas.getByRole("link", { name: "3" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/work-orders`,
    );
    const bills = canvas.getAllByRole("link", { name: "Bills" });
    await expect(bills[0]).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/client-bills`,
    );
    await expect(bills[1]).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/contractor-bills`,
    );
    await expect(
      canvas.queryByText("Amounts need the Financial permission."),
    ).toBeNull();
  },
};

/** Contractor Bills read without Financial: counts only, amounts as dashes. */
export const WithoutFinancial: Story = {
  beforeEach: serve("contractor"),
  play: async ({ canvas }) => {
    const facts = within(await canvas.findByLabelText("Contractors"));
    await expect(facts.getByText("Payable").parentElement).toHaveTextContent(
      "—",
    );
    await expect(
      facts.getByText("Pending approval").parentElement,
    ).toHaveTextContent("2");
    await expect(canvas.queryByLabelText("Client")).toBeNull();
    await expect(
      canvas.getByText("Amounts need the Financial permission."),
    ).toBeVisible();
  },
};

/** No contracts menu: one line says what is needed. */
export const NoPermission: Story = {
  beforeEach: serve("none"),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Contracts need the BOQ, Work Order or Bills permission on this Project.",
      ),
    ).toBeVisible();
  },
};

/** Without Dashboard read on the Project. */
export const Forbidden: Story = {
  beforeEach: serve("forbidden"),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Contracts need the Dashboard permission on this Project.",
      ),
    ).toBeVisible();
  },
};
