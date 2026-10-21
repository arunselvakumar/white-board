import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  INQUIRIES_API,
  INQUIRY_PROJECT_ID,
  WING_ID,
  mockInquiryApi,
} from "./inquiry-fixtures";
import { InquiryQuickAddDialog } from "./inquiry-quick-add-dialog";

let api: ReturnType<typeof mockInquiryApi>;

function posts(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === INQUIRIES_API);
}

const meta = {
  title: "Sales/Inquiries/Quick add",
  component: InquiryQuickAddDialog,
  args: {
    projectId: INQUIRY_PROJECT_ID,
    open: true,
    onOpenChange: fn(),
    onCreated: fn(),
  },
  beforeEach: () => {
    api = mockInquiryApi({ takenMobiles: ["+919845012345"] });
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <InquiryQuickAddDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryQuickAddDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function choose(
  dialog: HTMLElement,
  canvasElement: HTMLElement,
  label: string,
  option: string,
  userEvent: { click: (element: Element) => Promise<void> },
) {
  await userEvent.click(within(dialog).getByRole("combobox", { name: label }));
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole("option", {
      name: option,
    }),
  );
}

/** The few fields of quick add; a name is enough. */
export const Save: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialogElement = await body.findByRole("dialog", {
      name: "Quick add",
    });
    const dialog = within(dialogElement);
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(await dialog.findByText("Enter the name.")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Name"), "Suresh Babu");
    await choose(
      dialogElement,
      canvasElement,
      "Interest Type",
      "Hot",
      userEvent,
    );
    await choose(
      dialogElement,
      canvasElement,
      "Interested In (Wing)",
      "A Wing",
      userEvent,
    );
    await userEvent.type(dialog.getByLabelText("Unit type"), "3BHK");
    await expect(dialog.getByText("Visiting Card")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onCreated).toHaveBeenCalled());
    await expect(posts()[0]?.body).toEqual({
      projectId: INQUIRY_PROJECT_ID,
      name: "Suresh Babu",
      mobile: null,
      interestType: "hot",
      interestedWingId: WING_ID,
      interestedUnitType: "3BHK",
      remarks: null,
      allowDuplicate: false,
    });
  },
};

/** A duplicate mobile asks first; Save anyway saves it. */
export const Duplicate: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Quick add" }),
    );
    await userEvent.type(dialog.getByLabelText("Name"), "Lakshmi");
    await userEvent.type(dialog.getByLabelText("Mobile"), "9845012345");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    const prompt = within(
      await body.findByRole("alertdialog", { name: "Possible duplicate" }),
    );
    await expect(prompt.getByText("Lakshmi Narayanan")).toBeVisible();
    await userEvent.click(prompt.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(args.onCreated).toHaveBeenCalled());
    await expect(posts().at(-1)?.body).toMatchObject({ allowDuplicate: true });
  },
};
