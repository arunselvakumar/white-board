import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { PrivacySection } from "./privacy-section";

const ORG = "/api/construction/organization";

let calls: ApiCall[] = [];

function serve(input: {
  owned?: { id: string; name: string }[];
  deleteAnswer?: Response;
}) {
  calls = [];
  const api = mockApi((call) => {
    calls.push(call);
    if (call.method === "GET" && call.path === `${ORG}/me/account`)
      return Response.json({ ownedCompanies: input.owned ?? [] });
    if (call.method === "POST" && call.path === `${ORG}/action-codes`)
      return new Response(null, { status: 204 });
    if (call.method === "POST" && call.path === `${ORG}/me/account/delete`)
      return input.deleteAnswer ?? new Response(null, { status: 204 });
    return undefined;
  });
  return api.restore;
}

const meta = {
  title: "Account/PrivacySection",
  component: PrivacySection,
  render: () => (
    <StoryQueries>
      <PrivacySection />
    </StoryQueries>
  ),
  beforeEach() {
    signInAs("member");
  },
} satisfies Meta<typeof PrivacySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeleteMyAccount: Story = {
  beforeEach: () => serve({}),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete account…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" }),
    );
    await expect(
      await dialog.findByText("Type DELETE in capital letters"),
    ).toBeVisible();
    await expect(dialog.getByText("Enter the 6-digit code")).toBeVisible();

    await userEvent.type(
      dialog.getByLabelText("Why are you leaving? (optional)"),
      "Changed jobs",
    );
    await userEvent.type(
      dialog.getByLabelText("Type DELETE to confirm"),
      "DELETE",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await dialog.findByLabelText("6-digit code"),
      "482913",
    );
    await expect(dialog.getByText(/Send a new code in \d+s/)).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith(
        "/sign-in?account=deleted",
      ),
    );
    await expect(
      calls.find((call) => call.path === `${ORG}/action-codes`)?.body,
    ).toEqual({
      purpose: "delete_account",
    });
    await expect(
      calls.find((call) => call.path === `${ORG}/me/account/delete`)?.body,
    ).toEqual({
      reason: "Changed jobs",
      confirmation: "DELETE",
      code: "482913",
    });
  },
};

export const OwnerMustHandOver: Story = {
  beforeEach: () =>
    serve({ owned: [{ id: "company_anugraha", name: "Anugraha Engineers" }] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete account…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      await dialog.findByText(/You own Anugraha Engineers/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Transfer ownership" }),
    ).toHaveAttribute("href", "/app/settings/company#transfer-ownership");
    await expect(
      dialog.getByRole("link", { name: "Delete Company" }),
    ).toHaveAttribute("href", "/app/settings/company#delete-company");
    await expect(
      dialog.queryByRole("button", { name: "Delete my account" }),
    ).toBeNull();
  },
};

export const WrongCode: Story = {
  beforeEach: () =>
    serve({
      deleteAnswer: Response.json(
        {
          code: "ACTION_CODE_INVALID",
          message: "That code is not right. Check it and try again.",
          details: { attemptsLeft: 4 },
        },
        { status: 400 },
      ),
    }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete account…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Type DELETE to confirm"),
      "DELETE",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await dialog.findByLabelText("6-digit code"),
      "111111",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" }),
    );
    await expect(
      await dialog.findByText(
        "That code is not right. Check it and try again.",
      ),
    ).toBeVisible();
    await expect(authMocks.navigateInApp).not.toHaveBeenCalled();
  },
};

export const RefusedByTheServerForAnOwner: Story = {
  beforeEach: () =>
    serve({
      deleteAnswer: Response.json(
        {
          code: "OWNER_MUST_HAND_OVER",
          message: "You own a Company.",
          details: { companies: [{ id: "c1", name: "Velan Builders" }] },
        },
        { status: 409 },
      ),
    }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete account…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Type DELETE to confirm"),
      "DELETE",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await dialog.findByLabelText("6-digit code"),
      "482913",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete my account" }),
    );
    await expect(
      await dialog.findByText(/You own Velan Builders/),
    ).toBeVisible();
  },
};

export const CodeTooSoon: Story = {
  beforeEach() {
    const api = mockApi((call) => {
      if (call.method === "GET") return Response.json({ ownedCompanies: [] });
      if (call.path === `${ORG}/action-codes`)
        return Response.json(
          {
            code: "ACTION_CODE_TOO_SOON",
            message:
              "We just sent you a code. Wait a minute before asking for another.",
          },
          { status: 429 },
        );
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete account…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Send code" }));
    await expect(
      await dialog.findByText(
        "We just sent you a code. Wait a minute before asking for another.",
      ),
    ).toBeVisible();
  },
};
