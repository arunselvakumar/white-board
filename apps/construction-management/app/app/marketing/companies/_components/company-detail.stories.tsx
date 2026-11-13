import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import { CompanyDetail } from "./company-detail";
import {
  BALAJI_ID,
  BALAJI_VISIT_ID,
  KAVERI_ID,
  LAKSHMI_ID,
  MARKETING_COMPANIES_API,
  SENTHIL_ID,
  company,
  lostCompany,
  mockCompanyApi,
  type CompanyApiOptions,
} from "./company-fixtures";

let api: ReturnType<typeof mockCompanyApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function serve(options: CompanyApiOptions = {}) {
  return () => {
    api = mockCompanyApi(options);
    return api.restore;
  };
}

const BASE = "/app/marketing/companies";
const ONE = `${MARKETING_COMPANIES_API}/${BALAJI_ID}`;

const meta = {
  title: "Marketing/Prospect Companies/Company page",
  component: CompanyDetail,
  args: { id: BALAJI_ID },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${BALAJI_ID}` } },
  },
  render: (args) => (
    <StoryQueries>
      <CompanyDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof CompanyDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Details, Contacts with the primary one marked, and the Stage history. */
export const WithContactsAndHistory: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Sri Balaji Infra Projects" }),
    ).toBeVisible();
    await expect(canvas.getByText("Quotation sent")).toBeVisible();
    await expect(canvas.getByText("Ravi Shankar · Chennai")).toBeVisible();

    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("Reference")).toBeVisible();
    await expect(details.getByText("Chennai, Tamil Nadu 600032")).toBeVisible();
    await expect(details.getByText("33AABCS1429B1Z5")).toBeVisible();

    const contacts = within(canvas.getByRole("list", { name: "Contacts" }));
    const [senthil, lakshmi] = contacts.getAllByRole("listitem");
    if (senthil == null || lakshmi == null) throw new Error("two Contacts");
    await expect(within(senthil).getByText("Primary")).toBeVisible();
    await expect(within(senthil).getByText("+91 98450 12345")).toBeVisible();
    await expect(within(lakshmi).queryByText("Primary")).toBeNull();

    const history = within(canvas.getByRole("list", { name: "History" }));
    const entries = history.getAllByRole("listitem");
    await expect(entries).toHaveLength(6);
    await expect(entries[0]).toHaveTextContent(
      "Moved to Quotation sent · by Ravi Shankar · 12 Nov 2026, 4:05 pm",
    );
    await expect(entries[5]).toHaveTextContent(
      "Added at New · by Arun Selva Kumar · 1 Nov 2026, 10:00 am",
    );
  },
};

/** Visits and their notes join the Stage changes, each linking to its Visit. */
export const HistoryWithVisits: Story = {
  play: async ({ canvas }) => {
    const history = within(
      await canvas.findByRole("list", { name: "History" }),
    );
    const [, note, visit] = history.getAllByRole("listitem");
    if (note == null || visit == null) throw new Error("a note and a Visit");
    await expect(note).toHaveTextContent(
      "Note on MV-0003: Sent the PEB drawings they asked for.",
    );
    await expect(note).toHaveTextContent("by Priya Raman");
    await expect(visit).toHaveTextContent(
      "MV-0003 · Completed · Requirement discussion · by Ravi Shankar, Priya Raman",
    );
    await expect(visit).toHaveTextContent(
      "10 Nov 2026, 1:30 pm · Asked for a quotation",
    );
    for (const item of [note, visit])
      await expect(
        within(item).getByRole("link", { name: "MV-0003" }),
      ).toHaveAttribute("href", `/app/marketing/visits/${BALAJI_VISIT_ID}`);
  },
};

/** With Visits create: Plan Visit and Log Visit open the form on this company. */
export const PlanAndLogVisit: Story = {
  args: { canPlanVisit: true },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Plan Visit" }),
    ).toHaveAttribute(
      "href",
      `/app/marketing/visits/new?status=planned&prospectCompanyId=${BALAJI_ID}`,
    );
    await expect(
      canvas.getByRole("link", { name: "Log Visit" }),
    ).toHaveAttribute(
      "href",
      `/app/marketing/visits/new?status=completed&prospectCompanyId=${BALAJI_ID}`,
    );
  },
};

/** Lost: the reason, with the words for Other, in the details and history. */
export const LostWithReason: Story = {
  args: { id: KAVERI_ID },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Kaveri Cement Works" }),
    ).toBeVisible();
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(
      details.getByText("Other · Budget moved to next year"),
    ).toBeVisible();
    const history = within(canvas.getByRole("list", { name: "History" }));
    const [lost] = history.getAllByRole("listitem");
    await expect(lost).toHaveTextContent("Moved to Lost");
    await expect(lost).toHaveTextContent(
      "Lost Reason: Other · Budget moved to next year",
    );
  },
};

/** A member who may only read: no Actions, no Add Contact, no Contact menus. */
export const ReadOnly: Story = {
  beforeEach: serve({
    companies: [company({ actions: { canUpdate: false, canDelete: false } })],
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { name: "Sri Balaji Infra Projects" });
    await expect(canvas.queryByRole("button", { name: "Actions" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Plan Visit" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add Contact" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for/ }),
    ).toBeNull();
  },
};

/** Actions: Edit links to the form; Move Stage opens its dialog. */
export const ActionsMenu: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Edit" }),
    ).toHaveAttribute("href", `${BASE}/${BALAJI_ID}/edit`);
    await userEvent.click(body.getByRole("menuitem", { name: "Move Stage" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Move Stage" }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: "Negotiation" }));
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Move Stage" })).toBeNull(),
    );
    await expect(posts(`${ONE}/stage`)[0]?.body).toMatchObject({
      stage: "negotiation",
      lostReason: null,
    });
    await expect(await canvas.findByText("Negotiation")).toBeVisible();
    const history = within(canvas.getByRole("list", { name: "History" }));
    await expect(history.getAllByRole("listitem")[0]).toHaveTextContent(
      "Moved to Negotiation",
    );
  },
};

/** Delete asks first, then goes back to the list. */
export const Delete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const confirm = within(
      await body.findByRole("alertdialog", {
        name: "Delete Sri Balaji Infra Projects?",
      }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith(BASE));
    await expect(posts(`${ONE}/delete`)[0]?.body).toEqual({
      expectedUpdatedAt: "2026-11-12T10:35:00.000Z",
    });
  },
};

/** Make primary, then Remove (confirmed) on a Contact's menu. */
export const ContactActions: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Lakshmi Priya" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Make primary" }),
    );
    await waitFor(() =>
      expect(posts(`${ONE}/contacts/${LAKSHMI_ID}/update`)).toHaveLength(1),
    );
    await expect(
      posts(`${ONE}/contacts/${LAKSHMI_ID}/update`)[0]?.body,
    ).toMatchObject({ name: "Lakshmi Priya", isPrimary: true });
    const contacts = within(canvas.getByRole("list", { name: "Contacts" }));
    await waitFor(() =>
      expect(contacts.getAllByRole("listitem")[1]).toHaveTextContent("Primary"),
    );
    await expect(contacts.getAllByRole("listitem")[0]).not.toHaveTextContent(
      "Primary",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Senthil Kumar" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Remove" }),
    );
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Remove Senthil Kumar?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(posts(`${ONE}/contacts/${SENTHIL_ID}/delete`)).toHaveLength(1),
    );
    await waitFor(() =>
      expect(contacts.getAllByRole("listitem")).toHaveLength(1),
    );
  },
};

/** Add Contact opens the dialog; the new Contact joins the list. */
export const AddContact: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Contact" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Contact" }),
    );
    await userEvent.type(dialog.getByLabelText("Name"), "Gopal R");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Add Contact" })).toBeNull(),
    );
    await expect(
      await within(canvas.getByRole("list", { name: "Contacts" })).findByText(
        "Gopal R",
      ),
    ).toBeVisible();
  },
};

/** A refused delete (the company has Visits) says why on the page. */
export const DeleteRefused: Story = {
  args: { id: KAVERI_ID },
  beforeEach: serve({
    companies: [lostCompany()],
    extra: (call) =>
      call.method === "POST" && call.path.endsWith("/delete")
        ? Response.json(
            {
              code: "PROSPECT_COMPANY_HAS_VISITS",
              message:
                "This Prospect Company has Visits, so it cannot be deleted.",
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(
      await canvas.findByText(
        "This Prospect Company has Visits, so it cannot be deleted.",
      ),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};
