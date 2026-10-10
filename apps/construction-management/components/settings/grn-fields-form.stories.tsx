import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { GrnFieldSettingData } from "@/src/queries/grn-fields";
import {
  GRN_FIELD_INFO,
  GRN_OPTIONAL_FIELDS,
} from "@/src/shared-kernel/grn-fields";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { GrnFieldsForm } from "./grn-fields-form";

const BASE = "/api/construction/organization/settings/grn-fields";

const FIELDS = GRN_OPTIONAL_FIELDS.map((key) => ({
  key,
  ...GRN_FIELD_INFO[key],
}));

let setting: GrnFieldSettingData;
let calls: ApiCall[] = [];
let updateResponse: ((body: unknown) => Response) | null = null;

function updates(): unknown[] {
  return calls
    .filter((call) => call.path === `${BASE}/update`)
    .map((call) => call.body);
}

const meta = {
  title: "Settings/GrnFieldsForm",
  component: GrnFieldsForm,
  beforeEach() {
    setting = { hiddenFields: [], fields: FIELDS, updatedAt: null };
    calls = [];
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path === BASE)
        return Response.json(setting);
      if (call.path === `${BASE}/update`) {
        if (updateResponse != null) return updateResponse(call.body);
        const sent = call.body as { hiddenFields: string[] };
        setting = {
          ...setting,
          hiddenFields:
            sent.hiddenFields as GrnFieldSettingData["hiddenFields"],
          updatedAt: "2026-10-08T10:00:00.000Z",
        };
        return Response.json(setting);
      }
      return undefined;
    });
    return () => {
      api.restore();
      updateResponse = null;
    };
  },
  render: () => (
    <StoryQueries>
      <GrnFieldsForm />
    </StoryQueries>
  ),
} satisfies Meta<typeof GrnFieldsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HidesFieldsAndSaves: Story = {
  play: async ({ canvas, userEvent }) => {
    const supplier = within(
      await canvas.findByRole("region", { name: "Supplier details" }),
    );
    const delivery = within(
      canvas.getByRole("region", { name: "Delivery details" }),
    );
    await expect(supplier.getAllByRole("switch")).toHaveLength(3);
    await expect(delivery.getAllByRole("switch")).toHaveLength(6);
    await expect(
      within(canvas.getByRole("region", { name: "Remark" })).getAllByRole(
        "switch",
      ),
    ).toHaveLength(1);

    const vehicle = delivery.getByRole("switch", { name: "Vehicle No" });
    await expect(vehicle).toBeChecked();
    await userEvent.click(vehicle);
    await expect(vehicle).not.toBeChecked();
    await expect(delivery.getByText("Hidden")).toBeVisible();
    await userEvent.click(canvas.getByRole("switch", { name: "Remark" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));

    await expect(await canvas.findByText("Changes saved.")).toBeVisible();
    await expect(updates()).toEqual([
      { hiddenFields: ["vehicleNo", "remark"], expectedUpdatedAt: null },
    ]);
  },
};

export const ShowsAHiddenFieldAgain: Story = {
  beforeEach() {
    setting = {
      hiddenFields: ["ewayBillNo"],
      fields: FIELDS,
      updatedAt: "2026-10-01T10:00:00.000Z",
    };
  },
  play: async ({ canvas, userEvent }) => {
    const eway = await canvas.findByRole("switch", { name: "E-way bill No" });
    await expect(eway).not.toBeChecked();
    await userEvent.click(eway);
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(updates()).toEqual([
        {
          hiddenFields: [],
          expectedUpdatedAt: "2026-10-01T10:00:00.000Z",
        },
      ]),
    );
  },
};

export const ShowsAStaleSaveError: Story = {
  beforeEach() {
    updateResponse = () =>
      Response.json(
        {
          code: "GRN_FIELD_SETTING_CHANGED",
          message:
            "Someone else changed these settings after you opened them. Reload to see their changes.",
        },
        { status: 409 },
      );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("switch", { name: "Invoice No" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText(/Someone else changed these settings/),
    ).toBeVisible();
  },
};
