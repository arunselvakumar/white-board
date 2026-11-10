import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { StudentForm } from "./student-form";

const meta = {
  title: "Pages/Students/Expanded Form Preview",
  component: StudentForm,
  parameters: { layout: "fullscreen" },
  args: { preview: true },
} satisfies Meta<typeof StudentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Blank: Story = {};

export const Interactions: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Add Student" }),
    ).toBeVisible();
    const salutation = canvas.getAllByRole("combobox", {
      name: "Salutation",
    })[0];
    if (salutation == null) throw new Error("Student salutation missing");
    await userEvent.click(salutation);
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Miss",
      }),
    );
    const gender = canvas.getAllByRole("combobox", { name: "Gender" })[0];
    if (gender == null) throw new Error("Student gender missing");
    await userEvent.click(gender);
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Female",
      }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Guardian" }));
    await expect(
      canvas.getByRole("heading", { name: "Guardian 1" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add Guardian" }));
    await expect(
      canvas.getByRole("heading", { name: "Guardian 2" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Guardian 1" }),
    );
    await expect(
      canvas.getByRole("heading", { name: "Guardian 1" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "Guardian 2" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Current education status" }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Studying at school or college",
      }),
    );
    await expect(
      canvas.getByLabelText("Current school or college"),
    ).toBeVisible();
  },
};

const saveWithBatch = fn(() => Promise.resolve());

export const AddWithBatch: Story = {
  args: {
    preview: false,
    enrollmentBatches: [
      { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15", label: "Python · Morning" },
    ],
    onSubmit: saveWithBatch,
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const studentName = canvas.getAllByLabelText("Full name")[0];
    if (studentName == null) throw new Error("Student name missing");
    await userEvent.type(studentName, "Anita Sharma");
    await userEvent.type(canvas.getByLabelText("Phone number"), "9876543210");
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Batch (optional)" }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Python · Morning",
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Student and enroll" }),
    );
    await expect(saveWithBatch).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Anita Sharma" }),
      { batchId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15" },
    );
  },
};

const saveWithoutBatch = fn(() => Promise.resolve());

export const AddWithoutBatch: Story = {
  args: { preview: false, enrollmentBatches: [], onSubmit: saveWithoutBatch },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByText(/No open Batches are available/),
    ).toBeVisible();
    const studentName = canvas.getAllByLabelText("Full name")[0];
    if (studentName == null) throw new Error("Student name missing");
    await userEvent.type(studentName, "Rohan Das");
    await userEvent.type(canvas.getByLabelText("Phone number"), "9876543210");
    await userEvent.click(canvas.getByRole("button", { name: "Save Student" }));
    await expect(saveWithoutBatch).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Rohan Das" }),
      { batchId: null },
    );
  },
};
