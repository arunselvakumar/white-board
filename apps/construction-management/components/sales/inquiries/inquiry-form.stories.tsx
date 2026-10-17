import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { localToday } from "@/components/payments/payment-format";

import {
  INQUIRIES_API,
  INQUIRY_PROJECT_ID,
  KARTHIK_MEMBER_ID,
  LAKSHMI_ID,
  OWNER_MEMBER_ID,
  SOURCE_IDS,
  STAGE_IDS,
  WING_ID,
  inquiry,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";
import { InquiryForm } from "./inquiry-form";

let api: ReturnType<typeof mockInquiryApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function inquiryApi(options: InquiryApiOptions = {}) {
  return () => {
    api = mockInquiryApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${INQUIRY_PROJECT_ID}/inquiries/list`;

const meta = {
  title: "Sales/Inquiries/Form",
  component: InquiryForm,
  args: { projectId: INQUIRY_PROJECT_ID },
  beforeEach: inquiryApi({ takenMobiles: ["+919845012345"] }),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <InquiryForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function choose(
  formElement: HTMLElement,
  canvasElement: HTMLElement,
  label: string,
  option: string,
  userEvent: { click: (element: Element) => Promise<void> },
) {
  await userEvent.click(
    within(formElement).getByRole("combobox", { name: label }),
  );
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole("option", {
      name: option,
    }),
  );
}

/** A name is needed; a bad email is refused on the spot. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New inquiry",
    });
    const form = within(formElement);
    await userEvent.type(form.getByLabelText("Email"), "lakshmi@");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(await form.findByText("Enter the name.")).toBeVisible();
    await expect(form.getByText("Enter a valid email address.")).toBeVisible();
    await expect(posts(INQUIRIES_API)).toHaveLength(0);
  },
};

/** Defaults: today, the first stage, the viewer as Assignee and Lead Owner. */
export const Save: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New inquiry",
    });
    const form = within(formElement);
    await expect(form.getByLabelText("Inquiry Date")).toHaveValue(localToday());
    await expect(
      form.getByRole("combobox", { name: "Funnel Stage" }),
    ).toHaveTextContent("New");
    await expect(
      form.getByRole("combobox", { name: "Assignee" }),
    ).toHaveTextContent("Arun Selva Kumar (Owner)");
    await userEvent.type(form.getByLabelText("Name"), "Priya Ramesh");
    await userEvent.type(form.getByLabelText("Mobile"), "97900 12345");
    await choose(
      formElement,
      canvasElement,
      "Interest Type",
      "Warm",
      userEvent,
    );
    await choose(
      formElement,
      canvasElement,
      "Interested In (Wing)",
      "A Wing",
      userEvent,
    );
    await userEvent.type(form.getByLabelText("Unit type"), "2BHK");
    await choose(
      formElement,
      canvasElement,
      "Lead Source",
      "Referral",
      userEvent,
    );
    await choose(
      formElement,
      canvasElement,
      "Assignee",
      "Karthik R",
      userEvent,
    );
    await userEvent.type(
      form.getByLabelText("Next follow-up date"),
      "2026-10-20",
    );
    await userEvent.type(form.getByLabelText("Next follow-up time"), "10:30");
    await expect(form.getByText("Visiting Card")).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts(INQUIRIES_API)).toHaveLength(1));
    await expect(posts(INQUIRIES_API)[0]?.body).toMatchObject({
      projectId: INQUIRY_PROJECT_ID,
      name: "Priya Ramesh",
      mobile: "97900 12345",
      interestType: "warm",
      interestedWingId: WING_ID,
      interestedUnitType: "2BHK",
      leadSourceId: SOURCE_IDS.referral,
      funnelStageId: STAGE_IDS.new,
      nextFollowUpDate: "2026-10-20",
      nextFollowUpTime: "10:30",
      assigneeMemberId: KARTHIK_MEMBER_ID,
      leadOwnerMemberId: OWNER_MEMBER_ID,
      allowDuplicate: false,
    });
  },
};

/** A duplicate mobile: the prompt lists the matches; Save anyway resends. */
export const DuplicatePrompt: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New inquiry",
    });
    const form = within(formElement);
    await userEvent.type(form.getByLabelText("Name"), "Lakshmi N");
    await userEvent.type(form.getByLabelText("Mobile"), "98450 12345");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const body = within(canvasElement.ownerDocument.body);
    const prompt = within(
      await body.findByRole("alertdialog", { name: "Possible duplicate" }),
    );
    const matches = within(
      prompt.getByRole("list", { name: "Matching inquiries" }),
    );
    await expect(
      matches.getByRole("link", { name: "Lakshmi Narayanan" }),
    ).toHaveAttribute("href", `${BASE}/${LAKSHMI_ID}`);
    await expect(matches.getByText("An inquiry you cannot see")).toBeVisible();
    await userEvent.click(prompt.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(posts(INQUIRIES_API)).toHaveLength(2));
    await expect(posts(INQUIRIES_API)[1]?.body).toMatchObject({
      allowDuplicate: true,
    });
  },
};

/** A server refusal shows under its field. */
export const ServerFieldError: Story = {
  beforeEach: () => {
    api = mockInquiryApi({
      extra: (call) =>
        call.method === "POST" && call.path === INQUIRIES_API
          ? Response.json(
              {
                code: "INQUIRY_MOBILE_INVALID",
                message: "Enter a 10-digit mobile number.",
                details: { field: "mobile" },
              },
              { status: 400 },
            )
          : undefined,
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New inquiry" }),
    );
    await userEvent.type(form.getByLabelText("Name"), "Anand");
    await userEvent.type(form.getByLabelText("Mobile"), "12345");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Enter a 10-digit mobile number."),
    ).toBeVisible();
  },
};

/** Edit: the fields are filled in; files are managed on the inquiry's page. */
export const Edit: Story = {
  args: { inquiry: inquiry() },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Edit Lakshmi Narayanan" }),
    );
    await expect(form.getByLabelText("Name")).toHaveValue("Lakshmi Narayanan");
    await expect(
      form.getByRole("combobox", { name: "Funnel Stage" }),
    ).toHaveTextContent("Site Visit");
    await expect(
      form.getByText(/Add or remove the Visiting Card and photos/),
    ).toBeVisible();
    await userEvent.clear(form.getByLabelText("Name"));
    await userEvent.type(form.getByLabelText("Name"), "Lakshmi N");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const update = `${INQUIRIES_API}/${LAKSHMI_ID}/update`;
    await waitFor(() => expect(posts(update)).toHaveLength(1));
    await expect(posts(update)[0]?.body).toMatchObject({
      name: "Lakshmi N",
      expectedUpdatedAt: "2026-10-12T05:30:00.000Z",
      assigneeMemberId: KARTHIK_MEMBER_ID,
    });
  },
};
