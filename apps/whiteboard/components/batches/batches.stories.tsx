import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { BatchCatalog } from "@/components/batches/batch-catalog";
import { BatchForm } from "@/components/batches/batch-form";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import type { BatchResponse, BatchWriteInput } from "@/src/queries/batches";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const NOW = "2026-09-12T12:00:00.000Z";
const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";

const COURSES = [{ id: COURSE_ID, name: "DCA" }];

function sampleBatch(overrides: Partial<BatchResponse> = {}): BatchResponse {
  return {
    id: "660e8400-e29b-41d4-a716-446655440000",
    courseId: COURSE_ID,
    name: "DCA Weekday 9–11 Offline",
    classMode: "offline",
    capacity: 20,
    room: "Lab 1",
    joinUrl: null,
    timings: [
      { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" },
    ],
    timezone: "Asia/Kolkata",
    closedAt: null,
    enrolledCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    createdByUserId: "user_1",
    ...overrides,
  };
}

function BatchWorkspace({
  initialBatches = [],
  initialView = "list",
  courses = COURSES,
}: {
  initialBatches?: BatchResponse[];
  initialView?: "list" | "create";
  courses?: { id: string; name: string }[];
}) {
  const [batches, setBatches] = useState(initialBatches);
  const [courseId, setCourseId] = useState("all");
  const [view, setView] = useState<"list" | "create" | "edit">(initialView);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = batches.find((batch) => batch.id === editingId);
  const visible =
    courseId === "all"
      ? batches
      : batches.filter((batch) => batch.courseId === courseId);

  return (
    <WorkspaceGate>
      <AppShell>
        {view === "list" ? (
          <BatchCatalog
            batches={visible}
            courses={courses}
            courseId={courseId}
            onCourseIdChange={setCourseId}
            onAdd={() => {
              setView("create");
            }}
            onEdit={(batch) => {
              setEditingId(batch.id);
              setView("edit");
            }}
            onClose={(batch) => {
              setBatches((current) =>
                current.map((item) =>
                  item.id === batch.id
                    ? { ...item, closedAt: NOW, updatedAt: NOW }
                    : item,
                ),
              );
            }}
          />
        ) : (
          <div className="flex w-full max-w-lg flex-col gap-6 p-6">
            <h1 className="text-2xl tracking-tight">
              {view === "create" ? "Add Batch" : "Edit Batch"}
            </h1>
            <BatchForm
              lockCourse={view === "edit"}
              courses={courses}
              defaultValues={
                view === "edit" && editing != null
                  ? {
                      courseId: editing.courseId,
                      name: editing.name,
                      classMode: editing.classMode,
                      capacity: String(editing.capacity),
                      room: editing.room ?? "",
                      joinUrl: editing.joinUrl ?? "",
                      timings: editing.timings.map((slot) => ({
                        daysOfWeek: [...slot.daysOfWeek],
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                      })),
                    }
                  : { courseId: courses[0]?.id ?? "" }
              }
              submitLabel="Save Batch"
              onCancel={() => {
                setView("list");
                setEditingId(null);
              }}
              onSubmit={(input: BatchWriteInput) => {
                if (view === "edit" && editingId != null) {
                  setBatches((current) =>
                    current.map((item) =>
                      item.id === editingId
                        ? {
                            ...item,
                            ...input,
                            classMode: input.classMode,
                            room: input.room ?? null,
                            joinUrl: input.joinUrl ?? null,
                            updatedAt: NOW,
                          }
                        : item,
                    ),
                  );
                } else {
                  setBatches((current) => [
                    {
                      id: crypto.randomUUID(),
                      courseId: input.courseId ?? COURSE_ID,
                      name: input.name,
                      classMode: input.classMode,
                      capacity: input.capacity,
                      room: input.room ?? null,
                      joinUrl: input.joinUrl ?? null,
                      timings: input.timings,
                      timezone: "Asia/Kolkata",
                      closedAt: null,
                      enrolledCount: 0,
                      createdAt: NOW,
                      updatedAt: NOW,
                      createdByUserId: "user_1",
                    },
                    ...current,
                  ]);
                }
                setView("list");
                setEditingId(null);
                return Promise.resolve();
              }}
            />
          </div>
        )}
      </AppShell>
    </WorkspaceGate>
  );
}

const meta = {
  title: "Pages/Batches",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/batches" } },
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

export const Empty: Story = {
  render: () => <BatchWorkspace initialBatches={[]} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Batches" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Open the first Batch this centre runs."),
    ).toBeVisible();
  },
};

export const Validation: Story = {
  render: () => (
    <div className="max-w-lg p-6">
      <BatchForm
        courses={COURSES}
        defaultValues={{ courseId: "", name: "", capacity: "" }}
        submitLabel="Save Batch"
        onSubmit={() => Promise.resolve()}
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.clear(canvas.getByLabelText("Name"));
    await userEvent.clear(canvas.getByLabelText("Capacity"));
    await userEvent.click(canvas.getByRole("button", { name: "Save Batch" }));
    await expect(canvas.getByText("Course is required")).toBeVisible();
    await expect(canvas.getByText("Batch name is required")).toBeVisible();
    await expect(canvas.getByText("Capacity is required")).toBeVisible();
    await expect(canvas.getByText("Pick at least one day")).toBeVisible();
  },
};

export const Create: Story = {
  render: () => <BatchWorkspace />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const addButtons = canvas.getAllByRole("button", { name: "Add Batch" });
    const addButton = addButtons[0];
    if (addButton == null) {
      throw new Error("Add Batch button missing");
    }
    await userEvent.click(addButton);
    await expect(
      canvas.getByRole("heading", { name: "Add Batch" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Course"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "DCA",
      }),
    );
    await userEvent.type(
      canvas.getByLabelText("Name"),
      "DCA Weekday 9–11 Offline",
    );
    await userEvent.click(canvas.getByRole("checkbox", { name: "Mon" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Tue" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Wed" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Thu" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Fri" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save Batch" }));
    await expect(canvas.getByRole("heading", { name: "Batches" })).toBeVisible();
    await expect(canvas.getByText("DCA Weekday 9–11 Offline")).toBeVisible();
    await expect(canvas.getByText("Offline")).toBeVisible();
  },
};

export const Close: Story = {
  render: () => <BatchWorkspace initialBatches={[sampleBatch()]} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    const body = within(canvasElement.ownerDocument.body);
    const heading = await body.findByRole("heading", {
      name: "Close this Batch?",
    });
    const dialog = heading.closest("[data-slot='alert-dialog-content']");
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Close dialog missing");
    }
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await expect(await canvas.findByText("Closed")).toBeVisible();
  },
};
