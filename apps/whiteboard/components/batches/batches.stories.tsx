import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { PageHeader } from "@/components/app-shell/page-header";
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
    meetingOption: "external",
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
          <div className="w-full p-6">
            <div className="flex w-full max-w-4xl flex-col gap-6">
              <PageHeader
                back={{
                  label: "Batches",
                  onClick: () => {
                    setView("list");
                    setEditingId(null);
                  },
                }}
                title={
                  view === "create" ? "Add Batch" : (editing?.name ?? "Batch")
                }
                meta={
                  view === "edit" && editing != null
                    ? `${courses.find((course) => course.id === editing.courseId)?.name ?? "Course"} · ${editing.closedAt == null ? "Open" : "Closed"}`
                    : undefined
                }
              />
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
                        meetingOption: editing.meetingOption,
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
                              meetingOption: input.meetingOption ?? "external",
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
                        meetingOption: input.meetingOption ?? "external",
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

function PaginatedBatches() {
  const [page, setPage] = useState(1);
  const batches = Array.from({ length: 13 }, (_, index) =>
    sampleBatch({
      id: `batch-${index}`,
      name: `Batch ${index + 1}`,
      enrolledCount: index,
    }),
  );
  return (
    <WorkspaceGate>
      <AppShell>
        <BatchCatalog
          batches={batches.slice((page - 1) * 12, page * 12)}
          courses={COURSES}
          courseId="all"
          onCourseIdChange={() => undefined}
          pagination={{
            total: batches.length,
            page,
            pageSize: 12,
            hasNext: page < 2,
            hasPrevious: page > 1,
            onNext: () => {
              setPage(2);
            },
            onPrevious: () => {
              setPage(1);
            },
          }}
          onAdd={() => undefined}
          onEdit={() => undefined}
          onClose={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  );
}

export const Pagination: Story = {
  render: () => <PaginatedBatches />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Showing 1–12 of 13 Batches")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await expect(canvas.getByText("Showing 13–13 of 13 Batches")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Batch 13" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous page" }),
    );
    await expect(canvas.getByText("Showing 1–12 of 13 Batches")).toBeVisible();
  },
};

export const Validation: Story = {
  render: () => (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl">
        <BatchForm
          courses={COURSES}
          defaultValues={{ courseId: "", name: "", capacity: "" }}
          submitLabel="Save Batch"
          onSubmit={() => Promise.resolve()}
        />
      </div>
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
    await expect(
      canvas.getByRole("heading", { name: "Batches" }),
    ).toBeVisible();
    await expect(canvas.getByText("DCA Weekday 9–11 Offline")).toBeVisible();
    await expect(canvas.getByText("Offline")).toBeVisible();
  },
};

export const OnlineMeetingChoice: Story = {
  render: () => (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl">
        <BatchForm
          courses={COURSES}
          defaultValues={{
            courseId: COURSE_ID,
            name: "Python Online",
            classMode: "online",
            timings: [
              { daysOfWeek: [1], startTime: "09:00", endTime: "10:00" },
            ],
          }}
          submitLabel="Save Batch"
          onSubmit={() => Promise.resolve()}
        />
      </div>
    </div>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(canvas.getByLabelText("Join URL")).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Online meeting"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Whiteboard class",
      }),
    );
    await expect(canvas.queryByLabelText("Join URL")).toBeNull();
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
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close" }),
    );
    await expect(await canvas.findByText("Closed")).toBeVisible();
  },
};
