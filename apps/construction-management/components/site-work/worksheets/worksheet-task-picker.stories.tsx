import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  CUM_ID,
  mockWorksheetApi,
  PROJECT_ID,
  SQM_ID,
  WORKSHEET_TASKS,
} from "./worksheet-fixtures";
import {
  WorksheetTaskPicker,
  type WorksheetTaskChoice,
} from "./worksheet-task-picker";

function Picker({
  initial,
  quantity,
  unitId,
}: {
  initial: WorksheetTaskChoice | null;
  quantity: string;
  unitId: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="max-w-md p-6">
      <WorksheetTaskPicker
        id="sheet-task"
        projectId={PROJECT_ID}
        value={value}
        onChange={setValue}
        work={{ quantity, unitId }}
      />
    </div>
  );
}

const meta = {
  title: "Site work/Daily Worksheet/Task picker",
  component: Picker,
  args: { initial: null, quantity: "12.5", unitId: CUM_ID },
  beforeEach: () => mockWorksheetApi().restore,
  render: (args) => (
    <StoryQueries>
      <Picker {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof Picker>;

export default meta;
type Story = StoryObj<typeof meta>;

const [SLAB, BRICKWORK, WATERPROOFING] = WORKSHEET_TASKS;

/** Search by T-number or name, then choose: the work in the task's unit posts. */
export const SearchAndPost: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const input = canvas.getByLabelText("Task");
    await userEvent.type(input, "slab");
    const options = within(
      await within(canvasElement.ownerDocument.body).findByRole("listbox", {
        name: "Tasks",
      }),
    );
    await expect(options.getAllByRole("option")).toHaveLength(1);
    await userEvent.click(
      options.getByRole("option", { name: /First floor slab/ }),
    );
    await expect(
      await canvas.findByText("Will add 12.5 cum to T-7's progress"),
    ).toBeVisible();
  },
};

/** Another unit: linked only, naming the task's unit. */
export const OtherUnit: Story = {
  args: { initial: SLAB ?? null, unitId: SQM_ID },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Linked only — the unit differs from the task's (cum)"),
    ).toBeVisible();
  },
};

/** A task that tracks percent: linked only. */
export const PercentTask: Story = {
  args: { initial: WATERPROOFING ?? null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Linked only — the task tracks percent"),
    ).toBeVisible();
  },
};

/** No Approx Work Done yet: linked only, saying what would post. */
export const NoWorkDone: Story = {
  args: { initial: BRICKWORK ?? null, quantity: "", unitId: "" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Linked only — enter Approx Work Done in sqm to add to T-8's progress",
      ),
    ).toBeVisible();
  },
};
