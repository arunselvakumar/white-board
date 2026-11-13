import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  KAVERI_ID,
  MURUGAN_ID,
} from "../../companies/_components/company-fixtures";
import {
  BALAJI_ID,
  MARKETING_VISITS_API,
  NEW_VISIT_ID,
  NOW,
  OWNER_MEMBER_ID,
  PLANNED_ID,
  RAVI_MEMBER_ID,
  SENTHIL_ID,
  mockVisitApi,
  type VisitApiOptions,
} from "./visit-fixtures";
import { VisitComplete, VisitEdit, VisitNew } from "./visit-form-pages";

let api: ReturnType<typeof mockVisitApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function serve(options: VisitApiOptions = {}) {
  return () => {
    api = mockVisitApi(options);
    return api.restore;
  };
}

const BASE = "/app/marketing/visits";

const meta = {
  title: "Marketing/Visits/Form",
  component: VisitNew,
  args: { status: "planned", prospectCompanyId: BALAJI_ID, now: NOW },
  beforeEach: serve(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <VisitNew {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof VisitNew>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Plan a Visit from a company's page: the company is picked, Visited by
 * starts with the caller, points of contact are optional, and the time is
 * entered in the Company time zone.
 */
export const Plan: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Plan Visit" }),
    );
    await expect(
      form.getByRole("combobox", { name: "Prospect Company" }),
    ).toHaveValue("Sri Balaji Infra Projects");
    await expect(
      form.getByRole("button", { name: "Remove Arun Selva Kumar" }),
    ).toBeVisible();
    await expect(form.getByLabelText("Location")).toHaveAttribute(
      "placeholder",
      "14, Anna Salai, Guindy",
    );
    await expect(
      form.getByText("In the Company time zone (Asia/Kolkata)."),
    ).toBeVisible();

    await userEvent.clear(form.getByLabelText("Visit date"));
    await userEvent.type(form.getByLabelText("Visit date"), "2026-11-14");
    await userEvent.type(form.getByLabelText("Visit time"), "11:30");
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`${BASE}/${NEW_VISIT_ID}`),
    );
    await expect(posts(MARKETING_VISITS_API)[0]?.body).toMatchObject({
      status: "planned",
      prospectCompanyId: BALAJI_ID,
      visitAt: "2026-11-14T06:00:00.000Z",
      visitorIds: [OWNER_MEMBER_ID],
      contactIds: [],
      newContacts: [],
      discussion: null,
    });
  },
};

/**
 * Log a Visit already made to a company not yet on the list: the company,
 * its primary Contact and another Contact are added in the same save. The
 * Discussion is required.
 */
export const LogWithNewCompany: Story = {
  args: { status: "completed", prospectCompanyId: undefined },
  play: async ({ canvas, userEvent }) => {
    const form = within(await canvas.findByRole("form", { name: "Log Visit" }));
    await expect(form.getByLabelText("Visit date")).toHaveValue("2026-11-12");
    await expect(form.getByLabelText("Visit time")).toHaveValue("12:00");

    await userEvent.click(
      form.getByRole("button", { name: "Add a new company" }),
    );
    await userEvent.type(
      form.getByLabelText("Company name"),
      "Hosur Auto Components",
    );
    await userEvent.type(form.getByLabelText("City"), "Hosur");
    await userEvent.type(form.getByLabelText("Primary Contact"), "Ganesh R");
    await userEvent.type(
      form.getByLabelText("Primary Contact mobile"),
      "9842012345",
    );
    await userEvent.click(form.getByRole("button", { name: "Add a Contact" }));
    await userEvent.type(form.getByLabelText("Name"), "Divya S");

    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Write what was discussed to complete the Visit."),
    ).toBeVisible();
    await expect(posts(MARKETING_VISITS_API)).toHaveLength(0);

    await userEvent.type(
      form.getByLabelText("Discussion"),
      "Need a shed extension.",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`${BASE}/${NEW_VISIT_ID}`),
    );
    const body = posts(MARKETING_VISITS_API)[0]?.body;
    await expect(body).toMatchObject({
      status: "completed",
      visitAt: "2026-11-12T06:30:00.000Z",
      newProspectCompany: {
        name: "Hosur Auto Components",
        city: "Hosur",
        phone: null,
      },
      contactIds: [],
      newContacts: [
        { name: "Ganesh R", jobTitle: null, mobile: "9842012345" },
        { name: "Divya S", jobTitle: null, mobile: null },
      ],
      discussion: "Need a shed extension.",
    });
    await expect(body).not.toHaveProperty("prospectCompanyId");
  },
};

/**
 * Complete a planned Visit: its time is in the future, so the form starts
 * at now. The server refuses (the Contact was removed meanwhile) and its
 * words show under Points of contact.
 */
export const CompleteWithServerError: Story = {
  render: (args) => (
    <StoryQueries>
      <VisitComplete id={PLANNED_ID} now={args.now} />
    </StoryQueries>
  ),
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${PLANNED_ID}/complete` } },
  },
  beforeEach: serve({
    extra: (call) =>
      call.method === "POST" && call.path.endsWith("/complete")
        ? Response.json(
            {
              code: "VISIT_CONTACT_REQUIRED",
              message: "Add the person you met to complete the Visit.",
              details: { field: "contactIds" },
            },
            { status: 400 },
          )
        : undefined,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const form = within(
      await canvas.findByRole("form", { name: "Complete MV-0004" }),
    );
    await expect(form.getByLabelText("Visit date")).toHaveValue("2026-11-12");
    await expect(form.getByLabelText("Visit time")).toHaveValue("12:00");
    await expect(
      form.getByRole("combobox", { name: "Prospect Company" }),
    ).toBeDisabled();

    await userEvent.click(form.getByLabelText("Points of contact"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "Senthil Kumar · Purchase Manager",
      }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.type(
      form.getByLabelText("Discussion"),
      "Went through the quotation.",
    );
    await userEvent.click(form.getByRole("button", { name: "Complete Visit" }));
    await expect(
      await form.findByText("Add the person you met to complete the Visit."),
    ).toBeVisible();
    await expect(
      posts(`${MARKETING_VISITS_API}/${PLANNED_ID}/complete`)[0]?.body,
    ).toMatchObject({
      contactIds: [SENTHIL_ID],
      visitAt: "2026-11-12T06:30:00.000Z",
      expectedUpdatedAt: "2026-11-12T04:00:00.000Z",
    });
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

/**
 * Without View all the caller stays among the visitors: removing their
 * chip puts it back, and the form says why.
 */
export const MustIncludeSelf: Story = {
  beforeEach: serve({ formOptions: { mustIncludeSelf: true } }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const form = within(
      await canvas.findByRole("form", { name: "Plan Visit" }),
    );
    await expect(
      form.getByText(
        "You stay on the Visit: your Role shows you only the Visits you are on.",
      ),
    ).toBeVisible();
    await userEvent.click(form.getByLabelText("Visited by"));
    await userEvent.click(
      await body.findByRole("option", { name: "Ravi Shankar" }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      form.getByRole("button", { name: "Remove Arun Selva Kumar" }),
    );
    await expect(
      form.getByRole("button", { name: "Remove Arun Selva Kumar" }),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Visit time"), "16:00");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts(MARKETING_VISITS_API)).toHaveLength(1));
    await expect(posts(MARKETING_VISITS_API)[0]?.body).toMatchObject({
      visitorIds: [OWNER_MEMBER_ID, RAVI_MEMBER_ID],
    });
  },
};

/** Editing a planned Visit keeps its time: only Reschedule moves it. */
export const EditPlanned: Story = {
  render: (args) => (
    <StoryQueries>
      <VisitEdit id={PLANNED_ID} now={args.now} />
    </StoryQueries>
  ),
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${PLANNED_ID}/edit` } },
  },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Edit MV-0004" }),
    );
    await expect(form.getByLabelText("Visit date")).toBeDisabled();
    await expect(form.getByLabelText("Visit time")).toHaveValue("11:30");
    await expect(
      form.getByText("To change the time, Reschedule the Visit from its page."),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Outcome"), "Bring the samples");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`${BASE}/${PLANNED_ID}`),
    );
    await expect(
      posts(`${MARKETING_VISITS_API}/${PLANNED_ID}/update`)[0]?.body,
    ).toMatchObject({
      visitAt: "2026-11-14T06:00:00.000Z",
      prospectCompanyId: BALAJI_ID,
      outcome: "Bring the samples",
      expectedUpdatedAt: "2026-11-12T04:00:00.000Z",
    });
  },
};

/** A back-dated refusal (403) is said above the buttons. */
export const BackdatedRefused: Story = {
  args: { status: "completed" },
  beforeEach: serve({
    extra: (call) =>
      call.method === "POST" && call.path === MARKETING_VISITS_API
        ? Response.json(
            {
              code: "BACKDATED_CREATE_BLOCKED",
              message:
                "Visits can be entered back to 5 Nov 2026. Ask the Owner to allow older entries.",
            },
            { status: 403 },
          )
        : undefined,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const form = within(await canvas.findByRole("form", { name: "Log Visit" }));
    await userEvent.clear(form.getByLabelText("Visit date"));
    await userEvent.type(form.getByLabelText("Visit date"), "2026-10-01");
    await userEvent.click(form.getByLabelText("Points of contact"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "Senthil Kumar · Purchase Manager",
      }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.type(form.getByLabelText("Discussion"), "Introduced us.");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(
        "Visits can be entered back to 5 Nov 2026. Ask the Owner to allow older entries.",
      ),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

/**
 * With Follow-ups create, Plan, Log and Complete can add a Next
 * Follow-up: its type and due date are required once added, the owner
 * starts as the viewer, and it is sent with the Visit.
 */
export const PlanWithNextFollowUp: Story = {
  args: { canAddFollowUp: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const form = within(
      await canvas.findByRole("form", { name: "Plan Visit" }),
    );
    await userEvent.type(form.getByLabelText("Visit time"), "11:30");
    await userEvent.click(
      form.getByRole("button", { name: "Add Next Follow-up" }),
    );
    await expect(form.getByLabelText("Owner")).toHaveTextContent(
      "Arun Selva Kumar",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Choose the type of Follow-up."),
    ).toBeVisible();
    await expect(form.getByText("Choose the date it is due.")).toBeVisible();
    await expect(posts(MARKETING_VISITS_API)).toHaveLength(0);

    await userEvent.click(form.getByLabelText("Type"));
    await userEvent.click(await body.findByRole("option", { name: "Call" }));
    await userEvent.type(form.getByLabelText("Due date"), "2026-11-19");
    await userEvent.click(form.getByLabelText("Owner"));
    await userEvent.click(
      await body.findByRole("option", { name: "Ravi Shankar" }),
    );
    await userEvent.type(form.getByLabelText("Note"), "Send the rates");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts(MARKETING_VISITS_API)).toHaveLength(1));
    await expect(posts(MARKETING_VISITS_API)[0]?.body).toMatchObject({
      status: "planned",
      nextFollowUp: {
        type: "call",
        dueDate: "2026-11-19",
        ownerMemberId: RAVI_MEMBER_ID,
        note: "Send the rates",
      },
    });
  },
};

/** Without Follow-ups create there is no Next Follow-up, nor on Edit. */
export const NoNextFollowUp: Story = {
  play: async ({ canvas }) => {
    await canvas.findByRole("form", { name: "Plan Visit" });
    await expect(
      canvas.queryByRole("heading", { name: "Next Follow-up" }),
    ).toBeNull();
  },
};

/**
 * Log the visit from a Follow-up: the company, its Visit's Contact and the
 * Follow-up's owner as visitor are filled in.
 */
export const LogTheVisitFilledIn: Story = {
  args: {
    status: "completed",
    prospectCompanyId: KAVERI_ID,
    contactIds: [MURUGAN_ID],
    visitorIds: [RAVI_MEMBER_ID],
  },
  play: async ({ canvas }) => {
    const form = within(await canvas.findByRole("form", { name: "Log Visit" }));
    await expect(
      form.getByRole("combobox", { name: "Prospect Company" }),
    ).toHaveValue("Kaveri Cement Works");
    await expect(
      await form.findByRole("button", { name: "Remove Murugan P · Director" }),
    ).toBeVisible();
    await expect(
      form.getByRole("button", { name: "Remove Ravi Shankar" }),
    ).toBeVisible();
    await expect(
      form.queryByRole("button", { name: "Remove Arun Selva Kumar" }),
    ).toBeNull();
  },
};
