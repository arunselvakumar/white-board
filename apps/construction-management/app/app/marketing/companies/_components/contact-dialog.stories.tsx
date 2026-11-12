import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  BALAJI_ID,
  LAKSHMI_ID,
  MARKETING_COMPANIES_API,
  SENTHIL_ID,
  company,
  contact,
  mockCompanyApi,
  type CompanyApiOptions,
} from "./company-fixtures";
import { ContactDialog } from "./contact-dialog";

let api: ReturnType<typeof mockCompanyApi>;

const CONTACTS = `${MARKETING_COMPANIES_API}/${BALAJI_ID}/contacts`;

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

const NO_CONTACTS = company({ contacts: [] });

const meta = {
  title: "Marketing/Prospect Companies/Contact dialog",
  component: ContactDialog,
  args: { company: company(), contact: null, open: true, onOpenChange: fn() },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <ContactDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ContactDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function dialogOf(canvasElement: HTMLElement, name: string) {
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name,
    }),
  );
}

/** The first Contact is primary, and the box says so. */
export const AddFirst: Story = {
  args: { company: NO_CONTACTS },
  beforeEach: serve({ companies: [NO_CONTACTS] }),
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await dialogOf(canvasElement, "Add Contact");
    const primary = dialog.getByRole("checkbox", { name: "Primary Contact" });
    await expect(primary).toBeChecked();
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(
      dialog.getByText("The first Contact is the primary one."),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Name"), "Senthil Kumar");
    await userEvent.type(
      dialog.getByLabelText("Job title"),
      "Purchase Manager",
    );
    await userEvent.type(dialog.getByLabelText("Mobile"), "98450 12345");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts(CONTACTS)).toHaveLength(1));
    await expect(posts(CONTACTS)[0]?.body).toEqual({
      name: "Senthil Kumar",
      jobTitle: "Purchase Manager",
      mobile: "98450 12345",
      email: null,
      remarks: null,
      isPrimary: true,
    });
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
  },
};

/** A second Contact may be made primary as it is added. */
export const AddAsPrimary: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await dialogOf(canvasElement, "Add Contact");
    const primary = dialog.getByRole("checkbox", { name: "Primary Contact" });
    await expect(primary).not.toBeChecked();
    await userEvent.type(dialog.getByLabelText("Name"), "Gopal R");
    await userEvent.click(primary);
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts(CONTACTS)).toHaveLength(1));
    await expect(posts(CONTACTS)[0]?.body).toMatchObject({
      name: "Gopal R",
      isPrimary: true,
    });
  },
};

/** A name is needed; a bad email is refused on the spot. */
export const Validation: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await dialogOf(canvasElement, "Add Contact");
    await userEvent.type(dialog.getByLabelText("Email"), "gopal@");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the Contact's name."),
    ).toBeVisible();
    await expect(
      dialog.getByText("Enter a valid email address."),
    ).toBeVisible();
    await expect(posts(CONTACTS)).toHaveLength(0);
  },
};

/** Edit the primary Contact: filled in, and it stays primary. */
export const EditPrimary: Story = {
  args: { contact: contact() },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await dialogOf(canvasElement, "Edit Senthil Kumar");
    await expect(dialog.getByLabelText("Name")).toHaveValue("Senthil Kumar");
    await expect(dialog.getByLabelText("Mobile")).toHaveValue("+919845012345");
    await expect(
      dialog.getByText("Make another Contact primary to change this."),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("Job title"));
    await userEvent.type(dialog.getByLabelText("Job title"), "Director");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    const update = `${CONTACTS}/${SENTHIL_ID}/update`;
    await waitFor(() => expect(posts(update)).toHaveLength(1));
    await expect(posts(update)[0]?.body).toEqual({
      name: "Senthil Kumar",
      jobTitle: "Director",
      mobile: "+919845012345",
      email: "senthil@balajiinfra.in",
      remarks: null,
      expectedUpdatedAt: "2026-11-02T05:00:00.000Z",
    });
  },
};

/** The server's refusal of a mobile shows under Mobile. */
export const ServerMobileError: Story = {
  args: {
    contact: contact({
      id: LAKSHMI_ID,
      name: "Lakshmi Priya",
      isPrimary: false,
    }),
  },
  beforeEach: serve({
    extra: (call) =>
      call.method === "POST" && call.path.endsWith("/update")
        ? Response.json(
            {
              code: "CONTACT_MOBILE_INVALID",
              message:
                "Enter a 10-digit mobile number, or + and the country code.",
              details: { field: "mobile" },
            },
            { status: 400 },
          )
        : undefined,
  }),
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await dialogOf(canvasElement, "Edit Lakshmi Priya");
    await userEvent.clear(dialog.getByLabelText("Mobile"));
    await userEvent.type(dialog.getByLabelText("Mobile"), "12345");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(
        "Enter a 10-digit mobile number, or + and the country code.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Mobile")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
