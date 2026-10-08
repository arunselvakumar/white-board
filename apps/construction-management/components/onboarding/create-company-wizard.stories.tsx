import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { CreateCompanyWizard } from "./create-company-wizard";
import { OnboardingShell } from "./onboarding-shell";

type FetchArgs = Parameters<typeof fetch>;

function mockFetch(respond: (url: string, init?: RequestInit) => Response) {
  const original = globalThis.fetch;
  const spy = fn((...args: FetchArgs) => {
    const [input, init] = args;
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return Promise.resolve(respond(url, init));
  });
  globalThis.fetch = spy;
  return {
    spy,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const meta = {
  title: "Onboarding/CreateCompanyWizard",
  component: CreateCompanyWizard,
  beforeEach() {
    signInAs("owner");
    authMocks.workspaceId = null;
    authMocks.companies = [];
  },
  render: () => (
    <OnboardingShell>
      <CreateCompanyWizard />
    </OnboardingShell>
  ),
} satisfies Meta<typeof CreateCompanyWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreatesACompany: Story = {
  play: async ({ canvas, userEvent }) => {
    const { spy, restore } = mockFetch(() =>
      Response.json(
        {
          id: "company_new",
          name: "Patil Builders",
          trialEndsAt: "2026-10-22T06:30:00.000Z",
        },
        { status: 201 },
      ),
    );
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
      await expect(
        await canvas.findByText("Enter the Company name"),
      ).toBeVisible();
      await userEvent.type(
        canvas.getByLabelText("Company name"),
        "Patil Builders",
      );
      await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

      // The Owner's verified mobile is offered as the Company mobile.
      await expect(await canvas.findByLabelText("Company mobile")).toHaveValue(
        "9876543210",
      );
      await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

      await expect(await canvas.findByText("Step 3 of 3")).toBeVisible();
      await userEvent.type(canvas.getByLabelText("GSTIN"), "27AAPFU0939F1ZW");
      await userEvent.click(
        canvas.getByRole("button", { name: "Create Company" }),
      );
      await expect(
        await canvas.findByText("Enter a valid 15-character GSTIN"),
      ).toBeVisible();
      await userEvent.clear(canvas.getByLabelText("GSTIN"));
      await userEvent.type(canvas.getByLabelText("GSTIN"), "27AAPFU0939F1ZV");
      await userEvent.click(
        canvas.getByRole("button", { name: "Create Company" }),
      );

      await expect(
        await canvas.findByRole("heading", { name: "Patil Builders is ready" }),
      ).toBeVisible();
      const sent = spy.mock.calls[0]?.[1]?.body;
      const body = JSON.parse(typeof sent === "string" ? sent : "{}") as Record<
        string,
        unknown
      >;
      await expect(body).toMatchObject({
        name: "Patil Builders",
        mobile: "+919876543210",
        country: "IN",
        currency: "INR",
        gstin: "27AAPFU0939F1ZV",
        pan: null,
      });
      await userEvent.click(
        canvas.getByRole("button", { name: "Open Projects" }),
      );
      await waitFor(() =>
        expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app/projects"),
      );
    } finally {
      restore();
    }
  },
};

export const OutsideIndiaHidesGstin: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Company name"),
      "Gulf Projects",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Continue" }),
    );
    await userEvent.click(await canvas.findByLabelText("Country"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "United Arab Emirates",
      }),
    );
    await waitFor(() =>
      expect(canvas.queryByLabelText("GSTIN")).not.toBeInTheDocument(),
    );
    await expect(canvas.getByLabelText("Currency")).toHaveTextContent("AED");
  },
};

export const ServerErrorReturnsToTheField: Story = {
  play: async ({ canvas, userEvent }) => {
    const { restore } = mockFetch(() =>
      Response.json(
        { code: "COMPANY_NAME_TOO_LONG", message: "Company name is too long." },
        { status: 400 },
      ),
    );
    try {
      await userEvent.type(canvas.getByLabelText("Company name"), "Patil");
      await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
      await userEvent.click(
        await canvas.findByRole("button", { name: "Continue" }),
      );
      await userEvent.click(
        await canvas.findByRole("button", { name: "Create Company" }),
      );
      await expect(
        await canvas.findByText("Company name is too long."),
      ).toBeVisible();
      await expect(canvas.getByText("Step 1 of 3")).toBeVisible();
    } finally {
      restore();
    }
  },
};
