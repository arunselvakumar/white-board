import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { PageHeader } from "@/components/app-shell/page-header";
import { AppShell } from "@/components/app-shell/app-shell";
import { CourseCatalog } from "@/components/courses/course-catalog";
import {
  CourseForm,
  courseToFormValues,
} from "@/components/courses/course-form";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import type { CourseResponse, CourseWriteInput } from "@/src/queries/courses";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const NOW = "2026-09-12T12:00:00.000Z";

function sampleCourse(overrides: Partial<CourseResponse> = {}): CourseResponse {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Tally",
    duration: { kind: "fixed", value: 45, unit: "days" },
    code: "TALLY",
    category: "Accounting",
    totalLearningHours: 80,
    eligibility: null,
    learningOutcomes: [],
    syllabusOutline: [],
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
          <div className="w-full p-6">
            <div className="flex w-full max-w-4xl flex-col gap-6">
              <PageHeader
                back={{
                  label: "Courses",
                  onClick: () => {
                    setView("list");
                    setEditingId(null);
                  },
                }}
                title={view === "create" ? "Add Course" : "Edit Course"}
                meta={view === "edit" ? editing?.name : undefined}
              />
              <CourseForm
                defaultValues={
                  view === "edit" && editing != null
                    ? courseToFormValues(editing)
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
                        code: input.code ?? null,
                        category: input.category ?? null,
                        totalLearningHours: input.totalLearningHours ?? null,
                        eligibility: input.eligibility ?? null,
                        learningOutcomes: input.learningOutcomes ?? [],
                        syllabusOutline: input.syllabusOutline ?? [],
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
          duration: { kind: "fixed", value: 8, unit: "weeks" },
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

function PaginatedCourses() {
  const [page, setPage] = useState(1);
  const courses = Array.from({ length: 13 }, (_, index) =>
    sampleCourse({ id: `course-${index}`, name: `Course ${index + 1}` }),
  );
  return (
    <WorkspaceGate>
      <AppShell>
        <CourseCatalog
          courses={courses.slice((page - 1) * 12, page * 12)}
          pagination={{
            total: courses.length,
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
          onArchive={() => undefined}
        />
      </AppShell>
    </WorkspaceGate>
  );
}

export const Pagination: Story = {
  render: () => <PaginatedCourses />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Showing 1–12 of 13 Courses")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await expect(canvas.getByText("Showing 13–13 of 13 Courses")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Course 13" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous page" }),
    );
    await expect(canvas.getByText("Showing 1–12 of 13 Courses")).toBeVisible();
  },
};

export const Validation: Story = {
  render: () => (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl">
        <CourseForm
          submitLabel="Save Course"
          onSubmit={() => Promise.resolve()}
        />
      </div>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.clear(canvas.getByLabelText("Default fee (₹)"));
    await userEvent.click(canvas.getByRole("button", { name: "Save Course" }));
    await expect(canvas.getByText("Course name is required")).toBeVisible();
    await expect(
      canvas.getByText("Expected duration is required"),
    ).toBeVisible();
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
    await userEvent.type(canvas.getByLabelText("Expected duration"), "3");
    await userEvent.type(canvas.getByLabelText("Course code"), "DCA");
    await userEvent.type(canvas.getByLabelText("Category"), "Computing");
    await userEvent.type(canvas.getByLabelText("Total learning hours"), "120");
    await userEvent.type(
      canvas.getByLabelText("Eligibility / prerequisites"),
      "Basic computer use",
    );
    await userEvent.type(
      canvas.getByLabelText("Learning outcomes"),
      "Create spreadsheets",
    );
    await userEvent.type(
      canvas.getByLabelText("Syllabus outline"),
      "Computer basics\nSpreadsheets",
    );
    await userEvent.clear(canvas.getByLabelText("Default fee (₹)"));
    await userEvent.type(canvas.getByLabelText("Default fee (₹)"), "5000");
    await userEvent.click(canvas.getByRole("button", { name: "Save Course" }));
    await expect(
      canvas.getByRole("heading", { name: "Courses" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "DCA" })).toBeVisible();
    await expect(canvas.getByText("3 months")).toBeVisible();
    await expect(canvas.getByText("₹5,000")).toBeVisible();
  },
};

export const FlexibleDuration: Story = {
  render: () => <CourseWorkspace />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const addButton = canvas.getAllByRole("button", { name: "Add Course" })[0];
    if (addButton == null) throw new Error("Add Course button missing");
    await userEvent.click(addButton);
    await userEvent.type(canvas.getByLabelText("Name"), "Personal tuition");
    await userEvent.click(canvas.getByLabelText("Duration type"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Flexible",
      }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save Course" }));
    await expect(canvas.getByText("Flexible")).toBeVisible();
  },
};

export const EditDetails: Story = {
  render: () => <CourseWorkspace initialCourses={[sampleCourse()]} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(canvas.getByLabelText("Course code")).toHaveValue("TALLY");
    await expect(canvas.getByLabelText("Total learning hours")).toHaveValue(
      "80",
    );
    await userEvent.clear(canvas.getByLabelText("Category"));
    await userEvent.type(
      canvas.getByLabelText("Category"),
      "Business software",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save Course" }));
    await expect(
      canvas.getByRole("heading", { name: "Courses" }),
    ).toBeVisible();
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
