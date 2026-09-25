import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { TeacherForm } from "./teacher-form";
import { TeachersEmptyState } from "./teachers-empty-state";

const meta = { title: "Pages/Teachers", parameters: { layout: "centered" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const AddTeacher: Story = {
  render: () => <div className="w-full p-6"><div className="max-w-4xl min-w-96"><h1 className="mb-6 text-2xl font-semibold">Add Teacher</h1><TeacherForm onSubmit={() => Promise.resolve()} onCancel={() => undefined} /></div></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add Teacher" }));
    await expect(canvas.getByText("Name is required")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Full name"), "Asha Rao");
    await userEvent.type(canvas.getByLabelText("Email"), "asha@example.com");
    await expect(canvas.getByDisplayValue("Asha Rao")).toBeVisible();
  },
};

export const Empty: Story = {
  render: () => <TeachersEmptyState />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "No Teachers yet" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Add Teacher" })).toHaveAttribute("href", "/teachers/new");
  },
};

const saveProfile = fn();
export const EditTeacher: Story = {
  render: () => <div className="w-full p-6"><div className="max-w-4xl min-w-96"><TeacherForm teacher={{
    id: "550e8400-e29b-41d4-a716-446655440000", name: "Asha Rao", email: "asha@example.com",
    kind: "centre_teacher", phone: null, qualificationSummary: null,
    invitationStatus: "accepted", clerkUserId: "user_1", deactivatedAt: null,
    createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z",
  }} onSubmit={saveProfile} onCancel={() => undefined} /></div></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Email")).toHaveAttribute("readonly");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(saveProfile).toHaveBeenCalled();
  },
};
