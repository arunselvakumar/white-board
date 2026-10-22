import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { PROJECT, WORK_ORDER } from "./measurement-fixtures";
import { MeasurementNew } from "./measurement-sheet";
import {
  MEASUREMENTS_API,
  requested,
  serveMeasurements,
} from "./measurement-stories-api";

const meta = {
  title: "Contracts/Measurements/New",
  component: MeasurementNew,
  args: { projectId: PROJECT, side: "contractor", today: "2026-10-22" },
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${PROJECT}/measurements/new` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <MeasurementNew {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MeasurementNew>;

export default meta;
type Story = StoryObj<typeof meta>;

const contractor = serveMeasurements();

/**
 * A contractor-side sheet asks for its lines' quantities only once a Work
 * Order is picked; until then the panel says to pick one.
 */
export const ContractorPicksWorkOrderFirst: Story = {
  beforeEach: contractor.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const quantities = `${MEASUREMENTS_API}/quantities`;
    await expect(
      await canvas.findByText("Pick the Work Order to see each line’s total."),
    ).toBeVisible();
    await expect(requested(contractor.holder.current, quantities)).toEqual([]);
    await userEvent.click(canvas.getByLabelText("Work Order"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "WO/26-27/00001 · Velan Constructions",
      }),
    );
    await waitFor(() =>
      expect(requested(contractor.holder.current, quantities)).toEqual([
        `${quantities}?projectId=${PROJECT}&side=contractor&workOrderId=${WORK_ORDER}`,
      ]),
    );
    await expect(
      canvas.queryByText("Pick the Work Order to see each line’s total."),
    ).toBeNull();
  },
};
