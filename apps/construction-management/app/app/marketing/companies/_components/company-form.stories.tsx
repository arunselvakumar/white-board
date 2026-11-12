import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  BALAJI_ID,
  MARKETING_COMPANIES_API,
  NEW_COMPANY_ID,
  RAVI_MEMBER_ID,
  company,
  mockCompanyApi,
  type CompanyApiOptions,
} from "./company-fixtures";
import { CompanyForm } from "./company-form";

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

const meta = {
  title: "Marketing/Prospect Companies/Form",
  component: CompanyForm,
  beforeEach: serve(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <CompanyForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof CompanyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function choose(
  formElement: HTMLElement,
  label: string,
  option: string,
  userEvent: { click: (element: Element) => Promise<void> },
) {
  await userEvent.click(
    within(formElement).getByRole("combobox", { name: label }),
  );
  await userEvent.click(
    await within(formElement.ownerDocument.body).findByRole("option", {
      name: option,
    }),
  );
}

/** Every field, a Marketing Person and a first Contact; then the company page. */
export const Create: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New Prospect Company",
    });
    const form = within(formElement);
    await userEvent.type(form.getByLabelText("Name"), "Velan Builders");
    await userEvent.type(form.getByLabelText("Industry"), "Infra");
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Infrastructure",
      }),
    );
    await userEvent.type(form.getByLabelText("City"), "Salem");
    await choose(formElement, "State", "Tamil Nadu", userEvent);
    await userEvent.type(form.getByLabelText("PIN"), "636007");
    await choose(formElement, "Source", "Cold call", userEvent);
    await expect(
      form.getByRole("combobox", { name: "Marketing Person" }),
    ).toHaveTextContent("Me");
    await choose(formElement, "Marketing Person", "Ravi Shankar", userEvent);
    await userEvent.type(form.getByLabelText("Contact name"), "Velan K");
    await userEvent.type(form.getByLabelText("Contact mobile"), "98400 11111");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts(MARKETING_COMPANIES_API)).toHaveLength(1));
    await expect(posts(MARKETING_COMPANIES_API)[0]?.body).toEqual({
      name: "Velan Builders",
      industry: "Infrastructure",
      address: null,
      city: "Salem",
      stateCode: "33",
      pin: "636007",
      phone: null,
      email: null,
      website: null,
      gstin: null,
      source: "cold_call",
      remarks: null,
      assignedMemberId: RAVI_MEMBER_ID,
      primaryContact: {
        name: "Velan K",
        jobTitle: null,
        mobile: "98400 11111",
        email: null,
      },
    });
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `${BASE}/${NEW_COMPANY_ID}`,
      ),
    );
  },
};

/** Name is needed; a bad PIN and a Contact without a name are refused. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Prospect Company" }),
    );
    await userEvent.type(form.getByLabelText("PIN"), "6360");
    await userEvent.type(form.getByLabelText("Contact mobile"), "98400 11111");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Enter the company's name."),
    ).toBeVisible();
    await expect(form.getByText("Enter the six-digit PIN.")).toBeVisible();
    await expect(
      form.getByText("Enter the Contact's name, or clear the Contact."),
    ).toBeVisible();
    await expect(posts(MARKETING_COMPANIES_API)).toHaveLength(0);
  },
};

/** A name another company has: the server's 409 shows under Name. */
export const NameInUse: Story = {
  beforeEach: serve({ takenNames: ["Velan Builders"] }),
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Prospect Company" }),
    );
    await userEvent.type(form.getByLabelText("Name"), "velan builders");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(
        "A Prospect Company with this name already exists.",
      ),
    ).toBeVisible();
    await expect(form.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

/** Edit: the details are filled in, and the Marketing Person is read-only. */
export const Edit: Story = {
  args: { company: company() },
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${BALAJI_ID}/edit` } },
  },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", {
        name: "Edit Sri Balaji Infra Projects",
      }),
    );
    await expect(form.getByLabelText("Name")).toHaveValue(
      "Sri Balaji Infra Projects",
    );
    await expect(
      form.getByRole("combobox", { name: "State" }),
    ).toHaveTextContent("Tamil Nadu");
    await expect(form.getByLabelText("Marketing Person")).toHaveValue(
      "Ravi Shankar",
    );
    await expect(form.getByLabelText("Marketing Person")).toBeDisabled();
    await expect(form.queryByLabelText("Contact name")).toBeNull();
    await userEvent.clear(form.getByLabelText("City"));
    await userEvent.type(form.getByLabelText("City"), "Kanchipuram");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const update = `${MARKETING_COMPANIES_API}/${BALAJI_ID}/update`;
    await waitFor(() => expect(posts(update)).toHaveLength(1));
    await expect(posts(update)[0]?.body).toMatchObject({
      name: "Sri Balaji Infra Projects",
      city: "Kanchipuram",
      stateCode: "33",
      gstin: "33AABCS1429B1Z5",
      source: "reference",
      expectedUpdatedAt: "2026-11-12T10:35:00.000Z",
    });
    await expect(posts(update)[0]?.body).not.toHaveProperty("assignedMemberId");
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`${BASE}/${BALAJI_ID}`),
    );
  },
};

/** Someone saved the company first: the form says to reload. */
export const Stale: Story = {
  args: { company: company() },
  beforeEach: serve({
    extra: (call) =>
      call.method === "POST" && call.path.endsWith("/update")
        ? Response.json(
            {
              code: "PROSPECT_COMPANY_CHANGED",
              message:
                "Someone else changed this Prospect Company. Reload it and try again.",
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", {
        name: "Edit Sri Balaji Infra Projects",
      }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(/Reload the page to see their changes/),
    ).toBeVisible();
  },
};
