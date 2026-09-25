import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { StudentEnrollmentRecovery } from "./student-create-screen";

const retry = fn();
const chooseBatch = fn();
const viewStudent = fn();

const meta = {
  title: "Pages/Students/Enrollment Recovery",
  component: StudentEnrollmentRecovery,
  args: {
    studentName: "Anita Sharma",
    batchLabel: "Python · Morning",
    error: "This Batch is full.",
    retrying: false,
    uncertain: false,
    onRetry: retry,
    onChooseBatch: chooseBatch,
    onViewStudent: viewStudent,
  },
} satisfies Meta<typeof StudentEnrollmentRecovery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EnrollmentFailed: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Student saved" }),
    ).toBeVisible();
    await expect(canvas.getByText(/Anita Sharma was added/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Enrollment" }),
    );
    await expect(retry).toHaveBeenCalledOnce();
    await userEvent.click(
      canvas.getByRole("button", { name: "Choose another Batch" }),
    );
    await expect(chooseBatch).toHaveBeenCalledOnce();
  },
};

export const EnrollmentStatusUnknown: Story = {
  args: {
    uncertain: true,
    error: "Connection lost while saving the Enrollment.",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/could not confirm the Enrollment/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Retry Enrollment" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Choose another Batch" }),
    ).not.toBeInTheDocument();
  },
};
