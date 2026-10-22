import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { pageOf, PROJECT } from "./measurement-fixtures";
import {
  MEASUREMENTS_API,
  PHONE_375,
  serveMeasurements,
} from "./measurement-stories-api";
import { MeasurementsList } from "./measurements-list";

const meta = {
  title: "Contracts/Measurements/List",
  component: MeasurementsList,
  args: { projectId: PROJECT, canCreate: true },
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${PROJECT}/measurements` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <MeasurementsList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MeasurementsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The list in view (the table from md up, the cards below). */
async function shown(
  canvas: { findAllByLabelText: (text: string) => Promise<HTMLElement[]> },
  label: string,
): Promise<HTMLElement> {
  const found = (await canvas.findAllByLabelText(label)).find((element) =>
    element.checkVisibility(),
  );
  if (found == null) throw new Error(`${label} is not shown`);
  return found;
}

const full = serveMeasurements();

/** Sheets by date with their side, party and status; filter by side, status and Work Order. */
export const List: Story = {
  beforeEach: full.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(await shown(canvas, "Measurement sheets"));
    await expect(
      list.getByRole("link", { name: "20 Oct 2026" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/measurements/0199c0de-1105-7000-8000-000000000111`,
    );
    await expect(
      list.getByText("Contractor side · WO/26-27/00001"),
    ).toBeVisible();
    await expect(list.getByText("Billed")).toBeVisible();
    await expect(canvas.getByText("4 sheets")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Contractor sheet" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/measurements/new?side=contractor`,
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(await body.findByRole("option", { name: "Checked" }));
    await waitFor(() =>
      expect(
        full.holder.current?.calls.mock.calls.some(([call]) =>
          call.path.startsWith(
            `${MEASUREMENTS_API}?projectId=${PROJECT}&status=checked`,
          ),
        ),
      ).toBe(true),
    );
    await expect(await canvas.findByText("2 sheets")).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Work Order"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "WO/26-27/00001 · Velan Constructions",
      }),
    );
    await expect(await canvas.findByText("No sheets match")).toBeVisible();
  },
};

const empty = serveMeasurements({ page: pageOf([]) });

/** No sheets yet: start the first one. */
export const Empty: Story = {
  beforeEach: empty.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No measurement sheets yet"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "New sheet" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/measurements/new?side=client`,
    );
  },
};

const phone = serveMeasurements();

/** At 375 px the sheets are cards and the page never scrolls sideways. */
export const PhoneWidth: Story = {
  ...PHONE_375,
  beforeEach: phone.beforeEach,
  play: async ({ canvas, canvasElement }) => {
    const cards = within(await shown(canvas, "Measurement sheets"));
    await expect(
      cards.getByText("Contractor side · WO/26-27/00001"),
    ).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
