import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { CompanyOwnershipScreen } from "./company-ownership-screen";

const ORG = "/api/construction/organization";
const SCHEDULED = {
  requestedAt: "2026-10-16T05:00:00.000Z",
  scheduledFor: "2026-11-15T05:00:00.000Z",
};

let calls: ApiCall[] = [];
let deletion: typeof SCHEDULED | null = null;

function serve(start: typeof SCHEDULED | null = null) {
  calls = [];
  deletion = start;
  const api = mockApi((call) => {
    calls.push(call);
    if (call.method === "GET" && call.path === `${ORG}/company-deletion`)
      return Response.json({ deletion });
    if (call.method === "GET" && call.path === `${ORG}/ownership/candidates`)
      return Response.json({
        items: [
          {
            id: "member-prabhu",
            name: "Prabhu Saravanan",
            designation: "Site Engineer",
          },
          { id: "member-meena", name: "Meena Sakthi", designation: null },
        ],
      });
    if (call.method === "POST" && call.path === `${ORG}/action-codes`)
      return new Response(null, { status: 204 });
    if (call.method === "POST" && call.path === `${ORG}/ownership/transfer`)
      return Response.json({ ownerId: "member-prabhu" });
    if (call.method === "POST" && call.path === `${ORG}/company-deletion`) {
      const body = call.body as { companyName: string };
      if (body.companyName !== "Anugraha Engineers")
        return Response.json(
          {
            code: "COMPANY_NAME_MISMATCH",
            message: "Type the Company's name exactly as it is shown.",
          },
          { status: 400 },
        );
      deletion = SCHEDULED;
      return Response.json(SCHEDULED, { status: 201 });
    }
    if (
      call.method === "POST" &&
      call.path === `${ORG}/company-deletion/cancel`
    ) {
      deletion = null;
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  return api.restore;
}

const meta = {
  title: "Settings/CompanyOwnership",
  component: CompanyOwnershipScreen,
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/settings/company" } },
  },
  render: () => (
    <StoryQueries>
      <CompanyOwnershipScreen />
    </StoryQueries>
  ),
  beforeEach() {
    signInAs("owner");
  },
} satisfies Meta<typeof CompanyOwnershipScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TransferOwnership: Story = {
  beforeEach: () => serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Transfer…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Transfer ownership" }),
    );
    await expect(await dialog.findByText("Choose the new Owner")).toBeVisible();

    await userEvent.click(await dialog.findByLabelText("New Owner"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "Prabhu Saravanan · Site Engineer",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await dialog.findByLabelText("6-digit code"),
      "482913",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Transfer ownership" }),
    );
    await waitFor(() =>
      expect(authMocks.navigateInApp).toHaveBeenCalledWith("/app"),
    );
    await expect(
      calls.find((call) => call.path === `${ORG}/ownership/transfer`)?.body,
    ).toEqual({ memberId: "member-prabhu", code: "482913" });
    await expect(
      calls.find((call) => call.path === `${ORG}/action-codes`)?.body,
    ).toEqual({
      purpose: "transfer_ownership",
    });
  },
};

export const DeleteCompany: Story = {
  beforeEach: () => serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByText(/Take a full Company backup first/),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Type Anugraha Engineers to confirm"),
      "Anugraha",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Send code" }));
    await userEvent.type(
      await dialog.findByLabelText("6-digit code"),
      "482913",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete Company" }),
    );
    await expect(
      await dialog.findByText(
        "Type the Company's name exactly as it is shown.",
      ),
    ).toBeVisible();

    await userEvent.type(
      dialog.getByLabelText("Type Anugraha Engineers to confirm"),
      " Engineers",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete Company" }),
    );
    await expect(
      await canvas.findByText(
        "Scheduled: Anugraha Engineers will be deleted on 15 Nov 2026. It is read-only until then.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Transfer…" }),
    ).toBeDisabled();
  },
};

export const CancelDeletion: Story = {
  beforeEach: () => serve(SCHEDULED),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Cancel deletion" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Delete…" }),
    ).toBeVisible();
    await expect(
      calls.some((call) => call.path === `${ORG}/company-deletion/cancel`),
    ).toBe(true);
  },
};

export const MemberSeesOwnerOnly: Story = {
  beforeEach() {
    signInAs("member");
    return serve();
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Only the Owner can do this"),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Delete…" })).toBeNull();
  },
};
