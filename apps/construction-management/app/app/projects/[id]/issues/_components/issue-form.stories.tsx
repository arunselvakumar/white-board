import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { localToday } from "@/components/payments/payment-format";
import { addDays } from "@/src/shared-kernel/calendar-date";

import {
  CATEGORY_ID,
  CONTRACTOR_ID,
  issue,
  ISSUE_PROJECT_ID,
  ISSUES_API,
  KARTHIK_MEMBER_ID,
  mockIssueApi,
  PENDING_ID,
  type IssueApiOptions,
} from "./issue-fixtures";
import { IssueForm } from "./issue-form";

let api: ReturnType<typeof mockIssueApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function issueApi(options: IssueApiOptions = {}) {
  return () => {
    api = mockIssueApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${ISSUE_PROJECT_ID}/issues`;

const meta = {
  title: "Tracking/Issues/Form",
  component: IssueForm,
  args: { projectId: ISSUE_PROJECT_ID, canSolve: true },
  beforeEach: issueApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <IssueForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof IssueForm>;

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

/** Details are required; the Due Date cannot be before the Issue Date. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", { name: "New issue" });
    const form = within(formElement);
    await userEvent.type(
      form.getByLabelText("Due Date"),
      addDays(localToday(), -3),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(await form.findByText("Describe the issue.")).toBeVisible();
    await expect(
      form.getByText("The Due Date cannot be before the Issue Date."),
    ).toBeVisible();
    await expect(posts(ISSUES_API)).toHaveLength(0);
  },
};

/** Save raises a Pending issue with every field; images and attachments wait for it. */
export const Save: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", { name: "New issue" });
    const form = within(formElement);
    await userEvent.type(
      form.getByLabelText("Details"),
      "Plaster cracks on the east wall",
    );
    await choose(formElement, canvasElement, "Priority", "High", userEvent);
    await choose(formElement, canvasElement, "Category", "Quality", userEvent);
    await choose(
      formElement,
      canvasElement,
      "Contractor",
      "Velan Constructions",
      userEvent,
    );
    await choose(
      formElement,
      canvasElement,
      "Assign To",
      "Karthik R",
      userEvent,
    );
    await userEvent.type(
      form.getByLabelText("Due Date"),
      addDays(localToday(), 3),
    );
    await expect(form.getByText("Images")).toBeVisible();
    await expect(form.getByText("Attachments")).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(ISSUES_API)[0]?.body).toEqual({
        projectId: ISSUE_PROJECT_ID,
        issueDate: localToday(),
        details: "Plaster cracks on the east wall",
        priority: "high",
        categoryId: CATEGORY_ID,
        departmentId: null,
        contractorId: CONTRACTOR_ID,
        assigneeMemberId: KARTHIK_MEMBER_ID,
        dueDate: addDays(localToday(), 3),
        siteLocation: null,
        markSolved: false,
      });
    });
    // Saved: the buttons stay busy until the issue's page opens.
    await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled();
  },
};

/** Save & Mark As Solved records an issue fixed on the spot. */
export const SaveAndMarkAsSolved: Story = {
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", { name: "New issue" });
    const form = within(formElement);
    await userEvent.type(form.getByLabelText("Details"), "Loose railing");
    await userEvent.click(
      form.getByRole("button", { name: "Save & Mark As Solved" }),
    );
    await waitFor(async () => {
      await expect(posts(ISSUES_API)[0]?.body).toMatchObject({
        details: "Loose railing",
        markSolved: true,
      });
    });
  },
};

/** Without Update there is no Save & Mark As Solved. */
export const CreateOnly: Story = {
  args: { canSolve: false },
  play: async ({ canvas }) => {
    const form = within(await canvas.findByRole("form", { name: "New issue" }));
    await expect(
      form.queryByRole("button", { name: "Save & Mark As Solved" }),
    ).toBeNull();
  },
};

/** A back-dated Issue Date beyond the policy shows under the date. */
export const BackdatedRefused: Story = {
  beforeEach: issueApi({
    saveError: {
      status: 403,
      code: "BACKDATED_CREATE_BLOCKED",
      message: "You can enter Issues & Snags up to 3 days back.",
    },
  }),
  play: async ({ canvas, userEvent }) => {
    const form = within(await canvas.findByRole("form", { name: "New issue" }));
    await userEvent.type(form.getByLabelText("Details"), "Old crack");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("You can enter Issues & Snags up to 3 days back."),
    ).toBeVisible();
    await expect(form.getByLabelText("Issue Date")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

/** Editing keeps the issue's picks and sends its updatedAt. */
export const Edit: Story = {
  args: { issue: issue(), canSolve: false },
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${PENDING_ID}/edit` } },
  },
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "Edit ISS/26-27/00004",
    });
    const form = within(formElement);
    await expect(
      form.getByRole("combobox", { name: "Priority" }),
    ).toHaveTextContent("High");
    await expect(
      form.getByText(
        "Add or remove images and attachments on the issue's page.",
      ),
    ).toBeVisible();
    await userEvent.clear(form.getByLabelText("Details"));
    await userEvent.type(form.getByLabelText("Details"), "Wider cracks now");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(
        posts(`${ISSUES_API}/${PENDING_ID}/update`)[0]?.body,
      ).toMatchObject({
        details: "Wider cracks now",
        categoryId: CATEGORY_ID,
        expectedUpdatedAt: "2026-10-12T05:30:00.000Z",
      });
    });
  },
};
