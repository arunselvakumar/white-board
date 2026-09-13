import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { CourseCatalog } from "@/components/courses/course-catalog";
import { CourseForm } from "@/components/courses/course-form";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import type { CourseResponse, CourseWriteInput } from "@/src/queries/courses";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const NOW = "2026-09-12T12:00:00.000Z";

function sampleCourse(
  overrides: Partial<CourseResponse> = {},
): CourseResponse {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Tally",
    duration: "45 days",
    description: null,
    defaultFeeAmountPaise: 800000,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdByUserId: "user_1",
    ...overrides,
  };
}

function CourseWorkspace({
  initialCourses = [],
  initialView = "list",
}: {
  initialCourses?: CourseResponse[];
  initialView?: "list" | "create";
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [view, setView] = useState<"list" | "create" | "edit">(initialView);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = courses.find((course) => course.id === editingId);

  return (
    <WorkspaceGate>
      <AppShell>
        {view === "list" ? (
          <CourseCatalog
            courses={courses}
            onAdd={() => {
              setView("create");
            }}
            onEdit={(course) => {
              setEditingId(course.id);
              setView("edit");
            }}
            onArchive={(course) => {
              setCourses((current) =>
                current.map((item) =>
                  item.id === course.id
                    ? { ...item, archivedAt: NOW, updatedAt: NOW }
                    : item,
                ),
              );
            }}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
            <h1 className="text-2xl tracking-tight">
              {view === "create" ? "Add Course" : "Edit Course"}
            </h1>
            <CourseForm
              defaultValues={
                view === "edit" && editing != null
                  ? {
                      name: editing.name,
                      duration: editing.duration,
                      description: editing.description ?? "",
                      defaultFeeRupees: String(
                        editing.defaultFeeAmountPaise / 100,
                      ),
                    }
                  : undefined
              }
              submitLabel="Save Course"
              onCancel={() => {
                setView("list");
                setEditingId(null);
              }}
              onSubmit={(input: CourseWriteInput) => {
                if (view === "edit" && editingId != null) {
                  setCourses((current) =>
                    current.map((item) =>
                      item.id === editingId
                        ? {
                            ...item,
                            ...input,
                            updatedAt: NOW,
                          }
                        : item,
                    ),
                  );
                } else {
                  setCourses((current) => [
                    {
                      id: crypto.randomUUID(),
                      ...input,
                      description: input.description ?? null,
                      archivedAt: null,
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
  title: "Pages/Courses",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/courses" } },
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
  render: () => <CourseWorkspace />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Courses" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Add the first Course this centre teaches."),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Course" }).length,
    ).toBeGreaterThan(0);
  },
};

export const List: Story = {
  render: () => (
    <CourseWorkspace
      initialCourses={[
        sampleCourse(),
        sampleCourse({
          id: "660e8400-e29b-41d4-a716-446655440000",
          name: "Python",
          duration: "8 weeks",
          defaultFeeAmountPaise: 1200000,
        }),
      ]}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Tally")).toBeVisible();
    await expect(canvas.getByText("Python")).toBeVisible();
    await expect(canvas.getByText("₹8,000")).toBeVisible();
  },
};

export const Validation: Story = {
  render: () => (
    <div className="mx-auto max-w-lg p-6">
      <CourseForm
        submitLabel="Save Course"
        onSubmit={() => Promise.resolve()}
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.clear(canvas.getByLabelText("Default fee (₹)"));
    await userEvent.click(canvas.getByRole("button", { name: "Save Course" }));
    await expect(canvas.getByText("Course name is required")).toBeVisible();
    await expect(canvas.getByText("Duration is required")).toBeVisible();
    await expect(canvas.getByText("Default fee is required")).toBeVisible();
  },
};

export const Create: Story = {
  render: () => <CourseWorkspace />,
  play: async ({ canvas, userEvent }) => {
    const addButtons = canvas.getAllByRole("button", { name: "Add Course" });
    const addButton = addButtons[0];
    if (addButton == null) {
      throw new Error("Add Course button missing");
    }
    await userEvent.click(addButton);
    await expect(
      canvas.getByRole("heading", { name: "Add Course" }),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Name"), "DCA");
    await userEvent.type(canvas.getByLabelText("Duration"), "3 months");
    await userEvent.clear(canvas.getByLabelText("Default fee (₹)"));
    await userEvent.type(canvas.getByLabelText("Default fee (₹)"), "5000");
    await userEvent.click(canvas.getByRole("button", { name: "Save Course" }));
    await expect(canvas.getByRole("heading", { name: "Courses" })).toBeVisible();
    await expect(canvas.getByText("DCA")).toBeVisible();
    await expect(canvas.getByText("3 months")).toBeVisible();
    await expect(canvas.getByText("₹5,000")).toBeVisible();
  },
};

export const Archive: Story = {
  render: () => <CourseWorkspace initialCourses={[sampleCourse()]} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Archive" }));
    const body = within(canvasElement.ownerDocument.body);
    const heading = await body.findByRole("heading", {
      name: "Archive this Course?",
    });
    const dialog = heading.closest("[data-slot='alert-dialog-content']");
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Archive dialog missing");
    }
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive" }),
    );
    await expect(await canvas.findByText("Archived")).toBeVisible();
  },
};
