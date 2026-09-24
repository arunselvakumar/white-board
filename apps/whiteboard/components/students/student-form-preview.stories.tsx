import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

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
