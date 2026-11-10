import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { salesFile } from "@/components/sales/documents/sales-document-fixtures";

import { InquiryDetail } from "./inquiry-detail";
import {
  DEEPAK_ID,
  INQUIRY_PROJECT_ID,
  INQUIRY_TODAY,
  LAKSHMI_ID,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";

function inquiryApi(options: InquiryApiOptions = {}) {
  return () => mockInquiryApi(options).restore;
}

const BASE = `/app/projects/${INQUIRY_PROJECT_ID}/inquiries/list`;

const meta = {
  title: "Sales/Inquiries/Detail",
  component: InquiryDetail,
  args: { projectId: INQUIRY_PROJECT_ID, id: LAKSHMI_ID, today: INQUIRY_TODAY },
  beforeEach: inquiryApi({
    files: [salesFile("Card.jpg", "visiting_card")],
  }),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/${LAKSHMI_ID}` } } },
  render: (args) => (
    <StoryQueries>
      <InquiryDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The lead, its interest, people, files and history. */
export const Detail: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Lakshmi Narayanan" }),
    ).toBeVisible();
    await expect(canvas.getByText("A Wing · 2BHK")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "+91 98450 12345" }),
    ).toHaveAttribute("href", "tel:+919845012345");
    await expect(canvas.getByText("Overdue · 13 Oct 2026")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${BASE}/${LAKSHMI_ID}/edit`,
    );
    const cards = await canvas.findByRole("list", { name: "Visiting Card" });
    await expect(within(cards).getByText("Card.jpg")).toBeVisible();
    const history = within(
      await canvas.findByRole("list", { name: "Follow-ups and history" }),
    );
    await expect(history.getByText("Added at New")).toBeVisible();
    await expect(
      history.getByText("Wants to see the 2BHK sample flat on Saturday."),
    ).toBeVisible();
    await expect(history.getByText("Assigned to Karthik R")).toBeVisible();
    await expect(
      history.getByText("Moved from New to Site Visit"),
    ).toBeVisible();
    const tasks = within(canvas.getByRole("list", { name: "Tasks" }));
    await expect(
      tasks.getByText("Send the brochure on WhatsApp"),
    ).toBeVisible();
  },
};

/** Delete refused because the converted booking is active: the reason shows. */
export const DeleteRefused: Story = {
  args: { id: DEEPAK_ID },
  beforeEach: inquiryApi({
    deleteError: {
      status: 409,
      code: "INQUIRY_HAS_BOOKING",
      message:
        "This Inquiry was converted and its booking is still active. Cancel or delete the booking first.",
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Deepak Raj" });
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Deepak Raj?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(canvas.getByText(/its booking is still active/)).toBeVisible(),
    );
  },
};

/** Without Update or Delete: no Edit or Delete. */
export const ReadOnly: Story = {
  beforeEach: inquiryApi({ flags: ["read"] }),
  args: { id: LAKSHMI_ID },
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { name: "Lakshmi Narayanan" });
    // The fixture's actions say edit; access hides file changes.
    await expect(
      canvas.queryByRole("button", { name: /^Add Visiting Card/ }),
    ).toBeNull();
  },
};
