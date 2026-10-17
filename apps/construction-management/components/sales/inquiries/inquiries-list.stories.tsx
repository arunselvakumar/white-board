import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import { InquiriesList } from "./inquiries-list";
import {
  INQUIRIES_API,
  INQUIRY_PROJECT_ID,
  INQUIRY_TODAY,
  LAKSHMI_ID,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";

let api: ReturnType<typeof mockInquiryApi>;

function calls(method: string, prefix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path.startsWith(prefix));
}

function inquiryApi(options: InquiryApiOptions = {}) {
  return () => {
    api = mockInquiryApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${INQUIRY_PROJECT_ID}/inquiries/list`;

const meta = {
  title: "Sales/Inquiries/List",
  component: InquiriesList,
  args: { projectId: INQUIRY_PROJECT_ID, today: INQUIRY_TODAY },
  beforeEach: inquiryApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <InquiriesList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiriesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cards at phone width: name, status, interest, stage, follow-up by Due. */
export const List: Story = {
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Inquiries" }));
    const rows = list.getAllByRole("listitem");
    await expect(rows).toHaveLength(4);
    const [lakshmi, ravi, meena, deepak] = rows;
    if (lakshmi == null || ravi == null || meena == null || deepak == null)
      throw new Error("four inquiries");
    await expect(
      within(lakshmi).getByRole("link", { name: "Lakshmi Narayanan" }),
    ).toHaveAttribute("href", `${BASE}/${LAKSHMI_ID}`);
    await expect(within(lakshmi).getByText("Hot")).toBeVisible();
    await expect(within(lakshmi).getByText(/Overdue/)).toBeVisible();
    await expect(within(lakshmi).getByText(/\+91 98450 12345/)).toBeVisible();
    await expect(within(ravi).getByText(/Today 16:30/)).toBeVisible();
    await expect(within(meena).getByText("No follow-up")).toBeVisible();
    await expect(within(deepak).getByText("Lost")).toBeVisible();
    await expect(canvas.getByText("4 inquiries")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Inquiry" }),
    ).toHaveAttribute("href", `${BASE}/new`);
  },
};

/** Status and Due filters go to the server; Due is one at a time. */
export const Filters: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Inquiries" });
    await userEvent.click(canvas.getByRole("button", { name: "Lost" }));
    await waitFor(() =>
      expect(
        calls("GET", `${INQUIRIES_API}?`).some((call) =>
          call.path.includes("status=lost"),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(canvas.getByText("1 inquiry")).toBeVisible());
    await userEvent.click(canvas.getByRole("button", { name: "Lost" }));
    await userEvent.click(canvas.getByRole("button", { name: "Today" }));
    await userEvent.click(canvas.getByRole("button", { name: "Overdue" }));
    await waitFor(() =>
      expect(calls("GET", `${INQUIRIES_API}?`).at(-1)?.path).toContain(
        "due=overdue",
      ),
    );
    await expect(canvas.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  },
};

/** A notification's link opens the Overdue list. */
export const OverdueFromLink: Story = {
  parameters: {
    nextjs: { navigation: { pathname: BASE, query: { due: "overdue" } } },
  },
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Inquiries" }));
    await expect(list.getAllByRole("listitem")).toHaveLength(1);
    await expect(
      canvas.getByRole("button", { name: "Overdue" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};

/** Quick add from the list: a name is enough. */
export const QuickAdd: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Inquiries" });
    await userEvent.click(canvas.getByRole("button", { name: "Quick add" }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Quick add" }),
    );
    await userEvent.type(dialog.getByLabelText("Name"), "Suresh Babu");
    await userEvent.type(dialog.getByLabelText("Mobile"), "97900 55555");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Quick add" })).toBeNull(),
    );
    await expect(calls("POST", INQUIRIES_API).at(-1)?.body).toMatchObject({
      projectId: INQUIRY_PROJECT_ID,
      name: "Suresh Babu",
      mobile: "97900 55555",
      allowDuplicate: false,
    });
    const list = within(canvas.getByRole("list", { name: "Inquiries" }));
    await expect(
      await list.findByRole("link", { name: "Suresh Babu" }),
    ).toBeVisible();
  },
};

/** No inquiries yet: what the list is for, and Add Inquiry. */
export const Empty: Story = {
  beforeEach: inquiryApi({ inquiries: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No inquiries yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Inquiry" }).length,
    ).toBeGreaterThan(0);
  },
};

/** A filter that matches nothing says so, without Add. */
export const NothingMatches: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Inquiries" });
    await userEvent.click(canvas.getByRole("button", { name: "Converted" }));
    await expect(await canvas.findByText("No inquiries match")).toBeVisible();
  },
};

/** Read only: no Add Inquiry or Quick add. */
export const ReadOnly: Story = {
  beforeEach: inquiryApi({ flags: ["read"] }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Inquiries" });
    await expect(
      canvas.queryByRole("link", { name: "Add Inquiry" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Quick add" }),
    ).toBeNull();
  },
};
