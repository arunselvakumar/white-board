import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { StudentCatalog } from "@/components/students/student-catalog";
import { StudentForm } from "@/components/students/student-form";
import { StudentProfileView } from "@/components/students/student-profile-view";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import type {
  StudentDetails,
  StudentResponse,
  StudentWriteInput,
} from "@/src/queries/students";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const NOW = "2026-09-12T12:00:00.000Z";

const emptyParent = {
  salutation: null,
  gender: null,
  name: null,
  primaryPhone: null,
  alternatePhone: null,
  occupation: null,
  email: null,
};
const emptyDetails: StudentDetails = {
  salutation: null,
  gender: null,
  dateOfBirth: null,
  educationStatus: null,
  currentInstitution: null,
  currentGrade: null,
  schoolBoard: null,
  highestQualification: null,
  father: emptyParent,
  mother: emptyParent,
  guardians: [],
  emergencyPhone: null,
};

function sampleStudent(
  overrides: Partial<StudentResponse> = {},
): StudentResponse {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Anita Sharma",
    phone: "9876543210",
    email: "anita@example.com",
    photoUrl: null,
    address: null,
    idProofNote: null,
    guardianName: "Ravi Sharma",
    guardianPhone: "9123456780",
    details: emptyDetails,
    droppedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdByUserId: "user_1",
    ...overrides,
  };
}

function StudentWorkspace({
  initialStudents = [],
  initialView = "list",
}: {
  initialStudents?: StudentResponse[];
  initialView?: "list" | "create";
}) {
  const [students, setStudents] = useState(initialStudents);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "create">(initialView);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) {
      return students;
    }
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(q) || student.phone.includes(q),
    );
  }, [search, students]);

  return (
    <WorkspaceGate>
      <AppShell>
        {view === "list" ? (
          <StudentCatalog
            students={visible}
            search={search}
            onSearchChange={setSearch}
            onAdd={() => {
              setView("create");
            }}
            onView={() => undefined}
            onEdit={() => undefined}
            onDrop={(student) => {
              setStudents((current) =>
                current.map((item) =>
                  item.id === student.id
                    ? { ...item, droppedAt: NOW, updatedAt: NOW }
                    : item,
                ),
              );
            }}
          />
        ) : (
          <div className="flex w-full max-w-lg flex-col gap-6 p-6">
            <h1 className="text-2xl tracking-tight">Add Student</h1>
            <StudentForm
              submitLabel="Save Student"
              onCancel={() => {
                setView("list");
              }}
              onSubmit={(input: StudentWriteInput) => {
                setStudents((current) => [
                  {
                    id: crypto.randomUUID(),
                    email: input.email ?? null,
                    photoUrl: input.photoUrl ?? null,
                    address: input.address ?? null,
                    idProofNote: input.idProofNote ?? null,
                    guardianName: input.guardianName ?? null,
                    guardianPhone: input.guardianPhone ?? null,
                    details: {
                      ...emptyDetails,
                      salutation: input.salutation ?? null,
                      gender: input.gender ?? null,
                      dateOfBirth: input.dateOfBirth ?? null,
                      educationStatus: input.educationStatus ?? null,
                      currentInstitution: input.currentInstitution ?? null,
                      currentGrade: input.currentGrade ?? null,
                      schoolBoard: input.schoolBoard ?? null,
                      highestQualification: input.highestQualification ?? null,
                      father: input.father ?? emptyParent,
                      mother: input.mother ?? emptyParent,
                      guardians: input.guardians ?? [],
                      emergencyPhone: input.emergencyPhone ?? null,
                    },
                    droppedAt: null,
                    createdAt: NOW,
                    updatedAt: NOW,
                    createdByUserId: "user_1",
                    name: input.name,
                    phone: input.phone,
                  },
                  ...current,
                ]);
                setView("list");
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
  title: "Pages/Students",
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

export const Empty: Story = {
  render: () => <StudentWorkspace />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Students" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Add the first Student this centre admits."),
    ).toBeVisible();
  },
};

export const Loading: Story = {
  render: () => (
    <StudentCatalog
      students={[]}
      loading
      search=""
      onSearchChange={() => undefined}
      onAdd={() => undefined}
      onView={() => undefined}
      onEdit={() => undefined}
      onDrop={() => undefined}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading Students…")).toBeVisible();
    await expect(
      canvas.getByRole("table", { name: "Loading Students" }),
    ).toBeVisible();
    await expect(
      canvas.queryByText("Add the first Student this centre admits."),
    ).not.toBeInTheDocument();
  },
};

export const Updating: Story = {
  render: () => (
    <StudentCatalog
      students={[sampleStudent()]}
      updating
      search=""
      onSearchChange={() => undefined}
      onAdd={() => undefined}
      onView={() => undefined}
      onEdit={() => undefined}
      onDrop={() => undefined}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Updating Students…")).toBeVisible();
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
  },
};

export const Validation: Story = {
  render: () => (
    <div className="max-w-lg p-6">
      <StudentForm
        submitLabel="Save Student"
        onSubmit={() => Promise.resolve()}
      />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save Student" }));
    await expect(canvas.getByText("Student name is required")).toBeVisible();
    await expect(canvas.getByText("Phone is required")).toBeVisible();
  },
};

export const Search: Story = {
  render: () => (
    <StudentWorkspace
      initialStudents={[
        sampleStudent(),
        sampleStudent({
          id: "660e8400-e29b-41d4-a716-446655440000",
          name: "Rahul",
          phone: "9000000000",
        }),
      ]}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
    await expect(canvas.getByText("Rahul")).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Search by name or phone"),
      "9876543210",
    );
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
    await expect(canvas.queryByText("Rahul")).not.toBeInTheDocument();
  },
};

export const Create: Story = {
  render: () => <StudentWorkspace />,
  play: async ({ canvas, userEvent }) => {
    const addButtons = canvas.getAllByRole("button", { name: "Add Student" });
    const addButton = addButtons[0];
    if (addButton == null) {
      throw new Error("Add Student button missing");
    }
    await userEvent.click(addButton);
    const studentName = canvas.getAllByLabelText("Full name")[0];
    if (studentName == null) throw new Error("Student name missing");
    await userEvent.type(studentName, "Anita Sharma");
    await userEvent.type(
      canvas.getByLabelText("Phone number", { exact: true }),
      "9876543210",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save Student" }));
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
    await expect(canvas.getByText("9876543210")).toBeVisible();
  },
};

export const View: Story = {
  render: () => (
    <StudentProfileView
      student={sampleStudent({
        details: {
          ...emptyDetails,
          salutation: "miss",
          gender: "female",
          currentInstitution: "Riverside School",
          educationStatus: "school",
          father: {
            ...emptyParent,
            salutation: "mr",
            name: "Ravi Sharma",
            occupation: "Teacher",
          },
          guardians: [
            {
              salutation: "mrs",
              gender: "female",
              name: "Meera Sharma",
              relationship: "Grandmother",
              phone: "9000000001",
              email: null,
            },
            {
              salutation: "mr",
              gender: "male",
              name: "Karan Sharma",
              relationship: "Grandfather",
              phone: "9000000002",
              email: null,
            },
          ],
          emergencyPhone: "9000000003",
        },
      })}
      onBack={() => undefined}
      onEdit={() => undefined}
      onEnroll={() => undefined}
    />
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Miss Anita Sharma" }),
    ).toBeVisible();
    await expect(canvas.getByText("Riverside School")).toBeVisible();
    await expect(canvas.getByText("Meera Sharma")).toBeVisible();
    await expect(canvas.getByText("Karan Sharma")).toBeVisible();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};
