import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { localToday } from "@/components/procurement/inventory/inventory-format";

import {
  hindrance,
  HINDRANCE_PROJECT_ID,
  HINDRANCES,
  HINDRANCES_API,
  mockHindranceApi,
  type HindranceApiOptions,
} from "./hindrance-fixtures";
import { HindranceDetail } from "./hindrance-detail";

let api: ReturnType<typeof mockHindranceApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function hindranceApi(options: HindranceApiOptions = {}) {
  return () => {
    api = mockHindranceApi(options);
    return api.restore;
  };
}

const OPEN_ID = "0199c4a0-0000-7000-8000-0000000f1001";
const CLOSED_ID = "0199c4a0-0000-7000-8000-0000000f1002";

const meta = {
  title: "Site work/Hindrances/Detail",
  component: HindranceDetail,
  args: { projectId: HINDRANCE_PROJECT_ID, id: OPEN_ID },
  beforeEach: hindranceApi(),
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${HINDRANCE_PROJECT_ID}/hindrances/${OPEN_ID}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <HindranceDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof HindranceDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An open hindrance closes with its end date and hours lost. */
export const Close: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "HR/26-27/00003" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Not signed off yet. Edit the hindrance to record it."),
    ).toBeVisible();
    await expect(
      await canvas.findByText("Location · Culvert C3"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(dialog.getByLabelText("End date")).toHaveValue(localToday());
    await expect(dialog.getByLabelText("Hours lost")).toHaveValue("16.5");
    await userEvent.clear(dialog.getByLabelText("Hours lost"));
    await userEvent.type(dialog.getByLabelText("Hours lost"), "24");
    await userEvent.click(
      dialog.getByRole("button", { name: "Close hindrance" }),
    );
    await waitFor(async () => {
      await expect(
        posts(`${HINDRANCES_API}/${OPEN_ID}/close`)[0]?.body,
      ).toEqual({
        endDate: localToday(),
        hoursLost: "24",
        expectedUpdatedAt: "2026-10-08T09:00:00.000Z",
      });
    });
  },
};

/** A closed hindrance shows its joint sign-off and offers no Close. */
export const ClosedWithSignOff: Story = {
  args: { id: CLOSED_ID },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "HR/26-27/00002" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Close" })).toBeNull();
    await expect(canvas.getByText("Suresh Babu, PMC engineer")).toBeVisible();
    await expect(canvas.getByText("Force majeure")).toBeVisible();
  },
};

/** Raised from a usage sheet, read without write access. */
export const ReadOnly: Story = {
  beforeEach: hindranceApi({
    flags: { "site_work.hindrances": ["read"] },
    hindrances: [
      hindrance({
        cause: "equipment_breakdown",
        equipmentUsageSheet: {
          id: "0199c4a0-0000-7000-8000-0000000f0201",
          number: "EU/26-27/00012",
          sheetDate: "2026-10-07",
        },
        actions: { edit: false, close: false, delete: false, print: false },
      }),
      ...HINDRANCES.slice(1),
    ],
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^EU\/26-27\/00012/)).toBeVisible();
    for (const name of ["Close", "Edit", "Delete"])
      await expect(canvas.queryByRole("button", { name })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
  },
};
