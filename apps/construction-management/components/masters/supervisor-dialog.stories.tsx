import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import {
  sentTo,
  StoryQueryClient,
} from "@/components/designations/designation-story-support";

import {
  serveMasters,
  STORY_SUPERVISORS,
  STORY_TEAM_MEMBER_ID,
} from "./masters-story-support";
import { SupervisorDialog } from "./supervisor-dialog";

const BASE = "/api/construction/masters/supervisors";

let api: ReturnType<typeof serveMasters>;

function serve(teamMembers: { id: string; name: string }[] | "forbidden") {
  return () => {
    api = serveMasters({
      base: BASE,
      code: "SUPERVISOR",
      initial: STORY_SUPERVISORS,
      teamMembers,
      build: (body, current) => ({
        ...(current ?? STORY_SUPERVISORS[0]),
        id: current?.id ?? "0199a1b2-0000-7000-8000-0000000004ff",
        name: String(body["name"]),
        mobile: (body["mobile"] as string | null) ?? null,
        teamMemberId: (body["teamMemberId"] as string | null) ?? null,
        teamMemberName: null,
        disabled: false,
        createdAt: "2026-10-08T06:30:00.000Z",
        updatedAt: "2026-10-08T07:00:00.000Z",
      }),
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Supervisors/Form",
  component: SupervisorDialog,
  args: { supervisor: null, onClose: fn() },
  render: (args) => (
    <StoryQueryClient>
      <SupervisorDialog {...args} />
    </StoryQueryClient>
  ),
  beforeEach: serve([{ id: STORY_TEAM_MEMBER_ID, name: "Suresh Kale" }]),
} satisfies Meta<typeof SupervisorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddValidatesAndSaves: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("heading", { name: "Add Supervisor" }),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the Supervisor name"),
    ).toBeVisible();

    await userEvent.type(dialog.getByLabelText("Supervisor name"), "Ganesh");
    await userEvent.type(dialog.getByLabelText("Mobile (optional)"), "12345");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter a valid mobile number"),
    ).toBeVisible();
    await expect(api.spy).not.toHaveBeenCalledWith(BASE, expect.anything());

    await userEvent.clear(dialog.getByLabelText("Mobile (optional)"));
    await userEvent.type(
      dialog.getByLabelText("Mobile (optional)"),
      "98220 12345",
    );
    await userEvent.click(dialog.getByLabelText("Team Member (optional)"));
    await userEvent.click(
      await body.findByRole("option", { name: "Suresh Kale" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(sentTo(api.spy, BASE)).toEqual({
      name: "Ganesh",
      mobile: "+919822012345",
      teamMemberId: STORY_TEAM_MEMBER_ID,
    });
  },
};

export const NameInUse: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(
      dialog.getByLabelText("Supervisor name"),
      "raju mukadam",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("A row with this name already exists."),
    ).toBeVisible();
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

const RAJU = STORY_SUPERVISORS[0];

export const EditSendsLoadedUpdatedAt: Story = {
  args: { supervisor: RAJU ?? null },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await waitFor(() =>
      expect(
        dialog.getByRole("heading", { name: "Edit Raju Mukadam" }),
      ).toBeVisible(),
    );
    await expect(dialog.getByLabelText("Mobile (optional)")).toHaveValue(
      "9876543210",
    );
    await userEvent.clear(dialog.getByLabelText("Mobile (optional)"));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(sentTo(api.spy, `${String(RAJU?.id)}/update`)).toEqual({
      name: "Raju Mukadam",
      mobile: null,
      teamMemberId: null,
      expectedUpdatedAt: RAJU?.updatedAt,
    });
  },
};

export const WithoutTeamMembersRead: Story = {
  beforeEach: serve("forbidden"),
  play: async ({ canvasElement }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await waitFor(() =>
      expect(dialog.getByLabelText("Supervisor name")).toBeVisible(),
    );
    await waitFor(() =>
      expect(
        dialog.queryByLabelText("Team Member (optional)"),
      ).not.toBeInTheDocument(),
    );
  },
};
