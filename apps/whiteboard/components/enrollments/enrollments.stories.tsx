import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { CollectPaymentForm } from "@/components/enrollments/collect-payment-form";
import { EnrollmentForm } from "@/components/enrollments/enrollment-form";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { QueryHttpError } from "@/src/queries/http";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const STUDENT_ID = "880e8400-e29b-41d4-a716-446655440000";
const BATCH_ID = "660e8400-e29b-41d4-a716-446655440000";

const STUDENTS = [{ id: STUDENT_ID, name: "Anita Sharma" }];
const BATCHES = [{ id: BATCH_ID, name: "DCA Weekday 9–11 Offline" }];

const meta = {
  title: "Pages/Enrollments",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/students" } },
  },
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.memberships = [
      {
        organization: { id: "org_riverside", name: "Riverside Centre" },
      },
    ];
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InheritTimings: Story = {
  render: function InheritTimingsStory() {
    const [saved, setSaved] = useState(false);
    return (
      <WorkspaceGate>
        <AppShell>
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
            <h1 className="text-2xl tracking-tight">Enroll Student</h1>
            {saved ? (
              <p>Anita Sharma is in DCA Weekday 9–11 Offline.</p>
            ) : (
              <EnrollmentForm
                students={STUDENTS}
                batches={BATCHES}
                defaultValues={{ studentId: STUDENT_ID, batchId: BATCH_ID }}
                submitLabel="Save Enrollment"
                onSubmit={() => {
                  setSaved(true);
                  return Promise.resolve();
                }}
              />
            )}
          </div>
        </AppShell>
      </WorkspaceGate>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Enrollment" }),
    );
    await expect(
      canvas.getByText("Anita Sharma is in DCA Weekday 9–11 Offline."),
    ).toBeVisible();
  },
};

export const StudentSpecificTimings: Story = {
  render: () => (
    <div className="mx-auto max-w-lg p-6">
      <EnrollmentForm
        students={STUDENTS}
        batches={BATCHES}
        defaultValues={{ studentId: STUDENT_ID, batchId: BATCH_ID }}
        submitLabel="Save Enrollment"
        onSubmit={() => Promise.resolve()}
      />
    </div>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByLabelText("Timings"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Student-specific Timings",
      }),
    );
    await userEvent.click(canvas.getByRole("checkbox", { name: "Sun" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Enrollment" }),
    );
  },
};

export const CapacityError: Story = {
  render: () => (
    <div className="mx-auto max-w-lg p-6">
      <EnrollmentForm
        students={STUDENTS}
        batches={BATCHES}
        defaultValues={{ studentId: STUDENT_ID, batchId: BATCH_ID }}
        submitLabel="Save Enrollment"
        onSubmit={() =>
          Promise.reject(
            new QueryHttpError(409, {
              code: "BATCH_AT_CAPACITY",
              message: "Batch is at capacity.",
            }),
          )
        }
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Enrollment" }),
    );
    await expect(
      await canvas.findByText("Batch is at capacity."),
    ).toBeVisible();
  },
};

export const CollectPayment: Story = {
  render: function CollectPaymentStory() {
    const [remaining, setRemaining] = useState(500000);
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <p>Remaining dues: ₹{remaining / 100}</p>
        {remaining === 400000 ? (
          <p>Receipt R-0001</p>
        ) : (
          <CollectPaymentForm
            onSubmit={(input) => {
              setRemaining((current) => current - input.amountPaise);
              return Promise.resolve();
            }}
          />
        )}
      </div>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Amount (₹)"), "1000");
    await userEvent.click(
      canvas.getByRole("button", { name: "Record Fee Payment" }),
    );
    await expect(canvas.getByText("Receipt R-0001")).toBeVisible();
  },
};

export const PaymentValidation: Story = {
  render: () => (
    <div className="mx-auto max-w-lg p-6">
      <CollectPaymentForm onSubmit={() => Promise.resolve()} />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Record Fee Payment" }),
    );
    await expect(canvas.getByText("Amount is required")).toBeVisible();
  },
};
