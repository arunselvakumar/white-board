import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import type { GetConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/get-backdated-entry-policy-response-model";
import { BACKDATED_MODULES } from "@/src/shared-kernel/backdated-policy";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { BackdatedEntryForm } from "./backdated-entry-form";

const ACCOUNTANT = "0199c0de-0000-7000-8000-000000000001";
const ENGINEER = "0199c0de-0000-7000-8000-000000000002";

const DESIGNATIONS = {
  items: [
    { id: ACCOUNTANT, name: "Accountant" },
    { id: ENGINEER, name: "Site Engineer" },
  ],
};

const none = { days: 0, overrideDesignationIds: [] };

const POLICY: GetConstructionOrganizationBackdatedEntryPolicyResponseModel = {
  create: none,
  edit: none,
  financialClosingDate: null,
  modules: BACKDATED_MODULES.map((item) => ({
    key: item.key,
    label: item.label,
    group: item.group,
    entryDateField: item.entryDateField,
    mode: "global",
    create: none,
    edit: none,
  })),
  updatedAt: null,
};

let lastCalls: ApiCall[] = [];
let updateResponse: (body: unknown) => Response = (body) =>
  Response.json({
    ...POLICY,
    ...(body as object),
    modules: POLICY.modules,
    updatedAt: "2026-10-08T10:00:00.000Z",
  });

function updates(): unknown[] {
  return lastCalls
    .filter((call) => call.path.endsWith("/backdated-entry/update"))
    .map((call) => call.body);
}

const meta = {
  title: "Settings/BackdatedEntryForm",
  component: BackdatedEntryForm,
  beforeEach() {
    lastCalls = [];
    const api = mockApi((call) => {
      lastCalls.push(call);
      if (call.path === "/api/construction/organization/designations")
        return Response.json(DESIGNATIONS);
      if (
        call.path === "/api/construction/organization/settings/backdated-entry"
      )
        return Response.json(POLICY);
      if (call.path.endsWith("/backdated-entry/update"))
        return updateResponse(call.body);
      return undefined;
    });
    return () => {
      api.restore();
      updateResponse = (body) =>
        Response.json({
          ...POLICY,
          ...(body as object),
          modules: POLICY.modules,
          updatedAt: "2026-10-08T10:00:00.000Z",
        });
    };
  },
  render: () => (
    <StoryQueries>
      <BackdatedEntryForm />
    </StoryQueries>
  ),
} satisfies Meta<typeof BackdatedEntryForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SavesDefaultLimitsAndClosingDate: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Back-dated Entry" }),
    ).toBeVisible();
    // Every module starts on the defaults.
    await expect(
      canvas.getAllByText("Global, Create 0d · Edit 0d"),
    ).toHaveLength(24);

    const createDays = canvas.getByLabelText(
      "Restrict creating entries older than",
    );
    await userEvent.clear(createDays);
    await userEvent.type(createDays, "3");
    await userEvent.click(
      canvas.getByLabelText("Designations that may create older entries"),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Accountant" }),
    );
    await userEvent.keyboard("{Escape}");
    await fireEvent.change(canvas.getByLabelText("Closed up to"), {
      target: { value: "2026-03-31" },
    });

    // Module rows on Global follow the new default.
    await expect(
      canvas.getAllByText("Global, Create 3d · Edit 0d"),
    ).toHaveLength(24);

    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("Changes saved.")).toBeVisible();
    await expect(updates()[0]).toMatchObject({
      create: { days: 3, overrideDesignationIds: [ACCOUNTANT] },
      edit: { days: 0, overrideDesignationIds: [] },
      financialClosingDate: "2026-03-31",
      expectedUpdatedAt: null,
    });
  },
};

export const OverridesOneModule: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Override Labour Attendance" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("radio", { name: "Custom limits for this module" }),
    );
    const days = dialog.getByLabelText("Restrict creating entries older than");
    await userEvent.clear(days);
    await userEvent.type(days, "1");
    await userEvent.click(
      dialog.getByLabelText("Designations that may create older entries"),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Site Engineer" }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));

    await expect(
      await canvas.findByText("Custom, Create 1d · Edit 0d"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Override Labour Attendance" }),
    ).toHaveTextContent("Edit");

    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    const sent = updates()[0] as {
      modules: { key: string; mode: string; create: unknown }[];
    };
    await expect(
      sent.modules.find((item) => item.key === "labour_attendance"),
    ).toMatchObject({
      mode: "custom",
      create: { days: 1, overrideDesignationIds: [ENGINEER] },
    });
  },
};

export const RejectsNegativeDays: Story = {
  play: async ({ canvas, userEvent }) => {
    const days = await canvas.findByLabelText(
      "Restrict editing entries older than",
    );
    await userEvent.clear(days);
    await userEvent.type(days, "-2");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("Enter 0 or more days")).toBeVisible();
    await expect(updates()).toHaveLength(0);
  },
};

export const ShowsServerErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    updateResponse = () =>
      Response.json(
        {
          code: "DESIGNATION_NOT_FOUND",
          message:
            "Some override Designations no longer exist. Choose them again.",
        },
        { status: 400 },
      );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save changes" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Some override Designations no longer exist.",
    );
  },
};
