import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import {
  chooseFromMenu,
  serveMasters,
  STORY_SUPERVISORS,
  STORY_TEAM_MEMBER_ID,
} from "./masters-story-support";
import { SupervisorsList } from "./supervisors-list";

const BASE = "/api/construction/masters/supervisors";

let api: ReturnType<typeof serveMasters>;

function serve(initial = STORY_SUPERVISORS) {
  return () => {
    api = serveMasters({
      base: BASE,
      code: "SUPERVISOR",
      initial,
      inUse: ["Rakesh Mirtha"],
      teamMembers: [{ id: STORY_TEAM_MEMBER_ID, name: "Prabhu Saravanan" }],
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Supervisors/List",
  component: SupervisorsList,
  render: () => (
    <StoryQueryClient>
      <SupervisorsList />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof SupervisorsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSupervisors: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Supervisors" });
    const rows = within(list).getAllByRole("listitem");
    await expect(
      rows.map((row) => row.querySelector("p")?.textContent),
    ).toEqual(["Prabhu Saravanan", "Rakesh Mirtha", "Vignesh Anand"]);
    const [prabhu, rakesh, vignesh] = rows;
    if (rakesh == null || prabhu == null || vignesh == null)
      throw new Error("Rows missing");
    await expect(within(rakesh).getByText("+91 77081 65767")).toBeVisible();
    await expect(
      within(prabhu).getByText("Team Member: Prabhu Saravanan"),
    ).toBeVisible();
    await expect(within(vignesh).getByText("Disabled")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Search Supervisors"), "77081");
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(canvas.getByLabelText("Search Supervisors"));

    const body = within(canvasElement.ownerDocument.body);
    await chooseFromMenu(canvasElement, userEvent, "Vignesh Anand", "Enable");
    await waitFor(() =>
      expect(
        within(within(list).getAllByRole("listitem")[2] ?? list).queryByText(
          "Disabled",
        ),
      ).toBeNull(),
    );

    await chooseFromMenu(canvasElement, userEvent, "Prabhu Saravanan", "Edit");
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByLabelText("Supervisor name")).toHaveValue(
      "Prabhu Saravanan",
    );
  },
};

export const DeleteAsksFirst: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await chooseFromMenu(canvasElement, userEvent, "Rakesh Mirtha", "Delete");
    const dialog = await body.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await expect(
      await within(dialog).findByText(
        "Labours, Vendors or attendance use this, so it cannot be deleted. Disable it instead.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(body.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    await chooseFromMenu(canvasElement, userEvent, "Vignesh Anand", "Delete");
    await userEvent.click(
      within(await body.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(canvas.queryByText("Vignesh Anand")).not.toBeInTheDocument(),
    );
  },
};

export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Supervisors yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Supervisor" }),
    ).toHaveLength(2);
    await expect(
      canvas.queryByLabelText("Search Supervisors"),
    ).not.toBeInTheDocument();
  },
};
