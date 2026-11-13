import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  KAVERI_ID,
  MURUGAN_ID,
  OWNER_MEMBER_ID,
  RAVI_MEMBER_ID,
} from "../../companies/_components/company-fixtures";
import { KARTHIK_MEMBER_ID } from "../../visits/_components/visit-fixtures";
import {
  MARKETING_FOLLOW_UPS_API,
  OVERDUE_VISIT_ID,
  UPCOMING_QUOTE_ID,
  mockFollowUpApi,
  type FollowUpApiOptions,
} from "./follow-up-fixtures";
import { FollowUpsList } from "./follow-ups-list";

let api: ReturnType<typeof mockFollowUpApi>;

function calls(method: string, prefix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path.startsWith(prefix));
}

function serve(options: FollowUpApiOptions = {}) {
  return () => {
    api = mockFollowUpApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Marketing/Follow-ups/List",
  component: FollowUpsList,
  args: { canCreate: true, canLogVisit: true },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: "/app/marketing/follow-ups" } },
  },
  render: (args) => (
    <StoryQueries>
      <FollowUpsList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof FollowUpsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The cards of one group, by its heading. */
function group(root: HTMLElement, name: string) {
  return within(within(root).getByRole("list", { name }));
}

/**
 * Opens on Mine: the viewer's Open ones in Overdue (it stands out),
 * Today and Upcoming, each with its count. A card shows the type, the
 * company, the due date, the owner, the note and the Visit it came from.
 */
export const Mine: Story = {
  globals: { viewport: { value: "desktop" } },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Overdue 1" }),
    ).toHaveClass("text-red-700");
    await expect(
      canvas.getByRole("heading", { name: "Today 1" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Upcoming 1" }),
    ).toBeVisible();

    const [overdue] = group(canvasElement, "Overdue").getAllByRole("listitem");
    if (overdue == null) throw new Error("one overdue");
    await expect(within(overdue).getByText("Visit")).toBeVisible();
    await expect(
      within(overdue).getByRole("link", { name: "Kaveri Cement Works" }),
    ).toHaveAttribute("href", `/app/marketing/companies/${KAVERI_ID}`);
    await expect(overdue).toHaveTextContent(
      "Due 9 Nov 2026 · Arun Selva Kumar · from MV-0002",
    );
    await expect(overdue).toHaveTextContent("Go again with the PEB brochure");
    for (const name of ["Done", "Edit", "Cancel"])
      await expect(within(overdue).getByRole("button", { name })).toBeVisible();

    const [upcoming] = group(canvasElement, "Upcoming").getAllByRole(
      "listitem",
    );
    await expect(upcoming).toHaveTextContent("Send quotation");
    await expect(upcoming).toHaveTextContent("Due 16 Nov 2026");
    await expect(calls("GET", `${MARKETING_FOLLOW_UPS_API}?`)[0]?.path).toBe(
      `${MARKETING_FOLLOW_UPS_API}?limit=100&mine=1&status=open`,
    );
  },
};

/**
 * With View all: Everyone adds a colleague's (a company the viewer cannot
 * open stays plain text), and the owner filter keeps one person's.
 */
export const EveryoneByOwner: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Overdue 1" });
    await expect(canvas.queryByLabelText("Owner")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Everyone" }));
    await expect(
      await canvas.findByRole("heading", { name: "Overdue 2" }),
    ).toBeVisible();
    const overdue = group(canvasElement, "Overdue").getAllByRole("listitem");
    await expect(overdue[1]).toHaveTextContent("Coimbatore Textiles Ltd");
    await expect(
      within(overdue[1] ?? canvasElement).queryByRole("link", {
        name: "Coimbatore Textiles Ltd",
      }),
    ).toBeNull();

    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByLabelText("Owner"));
    // Someone no longer active stays in the filter: their Follow-ups remain.
    await expect(
      await body.findByRole("option", { name: "Karthik Raja (inactive)" }),
    ).toBeVisible();
    await userEvent.click(
      await body.findByRole("option", { name: "Ravi Shankar" }),
    );
    await waitFor(() =>
      expect(calls("GET", `${MARKETING_FOLLOW_UPS_API}?`).at(-1)?.path).toBe(
        `${MARKETING_FOLLOW_UPS_API}?limit=100&ownerMemberId=${RAVI_MEMBER_ID}&status=open`,
      ),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Today 0" }),
    ).toBeVisible();
    await expect(canvas.getByText("Nothing due today.")).toBeVisible();
    await expect(
      group(canvasElement, "Overdue").getAllByRole("listitem"),
    ).toHaveLength(1);
  },
};

/** The Done tab lists what came of each, with its status. */
export const DoneTab: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "Overdue 1" });
    await userEvent.click(canvas.getByRole("tab", { name: "Done" }));
    const list = within(
      await canvas.findByRole("list", { name: "Done Follow-ups" }),
    );
    const [done] = list.getAllByRole("listitem");
    await expect(done).toHaveTextContent("Done 11 Nov 2026: Sent the rates");
    await expect(
      within(done ?? document.body).queryByRole("button", { name: "Done" }),
    ).toBeNull();
  },
};

/**
 * Done on a Visit-type one asks for the result and the day (today, not
 * after), then offers Log the visit with its company, its Visit's Contact
 * and its owner filled in. The card leaves Overdue.
 */
export const DoneThenLogTheVisit: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Overdue 1" });
    const [overdue] = group(canvasElement, "Overdue").getAllByRole("listitem");
    await userEvent.click(
      within(overdue ?? canvasElement).getByRole("button", { name: "Done" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByText("Visit to Kaveri Cement Works, due 9 Nov 2026"),
    ).toBeVisible();
    const doneOn = dialog.getByLabelText("Done on");
    await expect(doneOn).toHaveValue("2026-11-12");
    await userEvent.clear(doneOn);
    await userEvent.type(doneOn, "2026-11-13");
    await userEvent.click(dialog.getByRole("button", { name: "Mark done" }));
    await expect(
      await dialog.findByText(
        "A Follow-up cannot be done on a day still to come.",
      ),
    ).toBeVisible();
    await userEvent.clear(doneOn);
    await userEvent.type(doneOn, "2026-11-11");
    await userEvent.type(dialog.getByLabelText("Result"), "Met the director");
    await userEvent.click(dialog.getByRole("button", { name: "Mark done" }));

    const link = await body.findByRole("link", { name: "Log the visit" });
    await expect(link).toHaveAttribute(
      "href",
      `/app/marketing/visits/new?status=completed&prospectCompanyId=${KAVERI_ID}&contactIds=${MURUGAN_ID}&visitorIds=${OWNER_MEMBER_ID}`,
    );
    await expect(
      calls("POST", `${MARKETING_FOLLOW_UPS_API}/${OVERDUE_VISIT_ID}/done`)[0]
        ?.body,
    ).toEqual({
      resultNote: "Met the director",
      doneOn: "2026-11-11",
      expectedUpdatedAt: "2026-11-10T09:00:00.000Z",
    });
    await expect(await canvas.findByText("Nothing overdue.")).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
  },
};

/** Cancel asks first; the card leaves the Open groups. */
export const CancelOne: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Upcoming 1" });
    const [upcoming] = group(canvasElement, "Upcoming").getAllByRole(
      "listitem",
    );
    await userEvent.click(
      within(upcoming ?? canvasElement).getByRole("button", { name: "Cancel" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Cancel Follow-up" }),
    );
    await expect(await canvas.findByText("Nothing coming up.")).toBeVisible();
    await expect(
      calls("POST", `${MARKETING_FOLLOW_UPS_API}/${UPCOMING_QUOTE_ID}/cancel`),
    ).toHaveLength(1);
  },
};

/** Nothing owed: says what shows here, with Add Follow-up. */
export const Empty: Story = {
  beforeEach: serve({ followUps: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nothing owed by you")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Follow-up" }),
    ).toHaveLength(2);
  },
};

/**
 * Without View all the switch shows theirs and those they gave a
 * colleague, and there is no owner filter.
 */
export const OwnOnly: Story = {
  args: { canCreate: false },
  beforeEach: serve({ formOptions: { canSeeAll: false } }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "Overdue 1" });
    await expect(canvas.queryByRole("button", { name: "Everyone" })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mine and given" }),
    );
    await canvas.findByRole("heading", { name: /^Overdue/ });
    await expect(canvas.queryByLabelText("Owner")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add Follow-up" }),
    ).toBeNull();
  },
};

/** On a phone each Follow-up is a card with its actions under it. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("heading", { name: "Today 1" });
    const [today] = group(canvasElement, "Today").getAllByRole("listitem");
    if (today == null) throw new Error("one due today");
    await expect(today).toHaveTextContent("Sri Balaji Infra Projects");
    await expect(today).toHaveTextContent("Ask if the drawings reached them");
    await expect(
      within(today).getByRole("button", { name: "Done" }),
    ).toBeVisible();
  },
};

/**
 * From a Team row of someone no longer active: Everyone, with the Owner
 * filter naming them.
 */
export const ArrivalForInactiveOwner: Story = {
  args: { owner: KARTHIK_MEMBER_ID },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("combobox", { name: "Owner" }),
    ).toHaveTextContent("Karthik Raja (inactive)");
    await waitFor(() =>
      expect(
        calls("GET", `${MARKETING_FOLLOW_UPS_API}?`).at(-1)?.path,
      ).toContain(`ownerMemberId=${KARTHIK_MEMBER_ID}`),
    );
  },
};
