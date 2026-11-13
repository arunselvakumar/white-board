import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  FOLLOW_UPS,
  followUp,
  MARKETING_FOLLOW_UPS_API,
  mockFollowUpApi,
} from "../../../follow-ups/_components/follow-up-fixtures";
import {
  KAVERI_ID,
  MANI_MEMBER_ID,
  NEEDS_REASSIGNING,
  OWNER_MEMBER_ID,
  TEXTILES_ID,
} from "../../_components/company-fixtures";
import { NeedsReassigningPage } from "./needs-reassigning-page";

const MANI = { id: MANI_MEMBER_ID, name: "Mani Kandan" };
function listed(index: number) {
  const found = NEEDS_REASSIGNING.followUps[index];
  if (found == null) throw new Error("two Follow-ups");
  return found;
}
const CALL = listed(0);
const QUOTATION = listed(1);

let api: ReturnType<typeof mockFollowUpApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function serve(needsReassigning = NEEDS_REASSIGNING) {
  return () => {
    api = mockFollowUpApi({
      followUps: [
        ...FOLLOW_UPS,
        followUp({
          id: CALL.id,
          prospectCompany: {
            id: KAVERI_ID,
            name: "Kaveri Cement Works",
            canOpen: true,
          },
          visit: null,
          type: "call",
          dueDate: CALL.dueDate,
          owner: MANI,
          updatedAt: CALL.updatedAt,
        }),
        followUp({
          id: QUOTATION.id,
          prospectCompany: {
            id: TEXTILES_ID,
            name: "Coimbatore Textiles Ltd",
            canOpen: true,
          },
          visit: null,
          type: "send_quotation",
          dueDate: QUOTATION.dueDate,
          owner: MANI,
          updatedAt: QUOTATION.updatedAt,
        }),
      ],
      visits: { companies: { needsReassigning } },
    });
    return api.restore;
  };
}

const meta = {
  title: "Marketing/Prospect Companies/Needs reassigning",
  component: NeedsReassigningPage,
  args: { canChangeOwner: true },
  beforeEach: serve(),
  parameters: {
    nextjs: {
      navigation: { pathname: "/app/marketing/companies/needs-reassigning" },
    },
  },
  render: (args) => (
    <StoryQueries>
      <NeedsReassigningPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof NeedsReassigningPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both lists: the company Mani had, and his open Follow-ups. */
export const BothLists: Story = {
  play: async ({ canvas }) => {
    const companies = within(
      await canvas.findByRole("list", { name: "Prospect Companies" }),
    );
    const [kaveri] = companies.getAllByRole("listitem");
    if (kaveri == null) throw new Error("Kaveri");
    await expect(
      within(kaveri).getByRole("link", { name: "Kaveri Cement Works" }),
    ).toHaveAttribute("href", `/app/marketing/companies/${KAVERI_ID}`);
    await expect(kaveri).toHaveTextContent(
      "Tiruchirappalli · Assigned to Mani Kandan",
    );
    await expect(within(kaveri).getByText("Negotiation")).toBeVisible();

    const followUps = within(
      canvas.getByRole("list", { name: "Open Follow-ups" }),
    );
    const rows = followUps.getAllByRole("listitem");
    await expect(rows).toHaveLength(2);
    await expect(rows[0]).toHaveTextContent("Owner Mani Kandan");
    await expect(rows[1]).toHaveTextContent("Coimbatore Textiles Ltd");
  },
};

/**
 * Reassign a company from the list, told how many open Follow-ups go with
 * it; it leaves the list.
 */
export const ReassignCompany: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Reassign Kaveri Cement Works",
      }),
    );
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Reassign Kaveri Cement Works",
      }),
    );
    await expect(dialog.getByText(/^Mani Kandan is its/)).toBeVisible();
    await expect(
      dialog.getByText(/1 open Follow-up moves to the new person too\./),
    ).toBeVisible();
    await userEvent.click(
      await dialog.findByRole("combobox", {
        name: "New Marketing Person",
      }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Arun Selva Kumar" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reassign" }));
    await waitFor(() =>
      expect(
        posts(`/api/construction/marketing/companies/${KAVERI_ID}/reassign`),
      ).toHaveLength(1),
    );
    await expect(
      posts(`/api/construction/marketing/companies/${KAVERI_ID}/reassign`)[0]
        ?.body,
    ).toEqual({
      assignedMemberId: OWNER_MEMBER_ID,
      expectedUpdatedAt: "2026-11-10T09:00:00.000Z",
    });
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
  },
};

/** Change owner opens the Follow-up's Edit dialog with Mani picked. */
export const ChangeOwner: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /^Change owner of the Kaveri Cement Works Follow-up/,
      }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit Follow-up" }),
    );
    await userEvent.click(
      await dialog.findByRole("combobox", { name: "Owner" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Priya Raman" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        posts(`${MARKETING_FOLLOW_UPS_API}/${CALL.id}/update`),
      ).toHaveLength(1),
    );
  },
};

/** Without Follow-ups update there is no Change owner. */
export const WithoutFollowUpUpdate: Story = {
  args: { canChangeOwner: false },
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Open Follow-ups" });
    await expect(
      canvas.queryByRole("button", { name: /^Change owner/ }),
    ).toBeNull();
  },
};

/** Nothing to reassign. */
export const Empty: Story = {
  beforeEach: serve({ companies: [], followUps: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nothing needs reassigning"),
    ).toBeVisible();
  },
};
