import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

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
          <StudentForm
            back={{
              label: "Students",
              onClick: () => {
                setView("list");
              },
            }}
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
    const summary = within(
      canvas.getByRole("region", { name: "Student summary" }),
    );
    await expect(summary.getByText("Total Students")).toBeVisible();
    await expect(canvas.getByText("AS")).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Search by name or phone"),
      "9876543210",
    );
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
    await expect(canvas.queryByText("Rahul")).not.toBeInTheDocument();
  },
};

function PaginatedStudents() {
  const [page, setPage] = useState(1);
  const names = [
    "Anita Sharma",
    "Rahul Menon",
    "Meera Iyer",
    "Karan Patel",
    "Nisha Khan",
    "Dev Rao",
    "Priya Nair",
    "Farah Ali",
    "Kabir Shah",
    "Sara Fernandes",
    "Aarav Gupta",
    "Isha Verma",
  ];
  const guardians = [
    "Ravi Sharma",
    "Lakshmi Menon",
    null,
    "Rakesh Patel",
    "Samira Khan",
    "Mohan Rao",
    "Deepa Nair",
    "Imran Ali",
    "Leena Shah",
    "Maria Fernandes",
    "Sanjay Gupta",
    "Kavita Verma",
  ];
  const firstPage = Array.from({ length: 12 }, (_, index) =>
    sampleStudent({
      id: `student-${index + 1}`,
      name: names[index] ?? "Student",
      phone: String(9000000000 + index),
      guardianName: guardians[index] ?? null,
      guardianPhone:
        guardians[index] == null ? null : String(9100000000 + index),
      droppedAt: index === 3 ? NOW : null,
    }),
  );
  const secondPage = [sampleStudent({ id: "student-13", name: "Rohan Das" })];
  return (
    <StudentCatalog
      students={page === 1 ? firstPage : secondPage}
      search=""
      onSearchChange={() => undefined}
      onAdd={() => undefined}
      onView={() => undefined}
      onEdit={() => undefined}
      onDrop={() => undefined}
      pagination={{
        total: 13,
        page,
        pageSize: 12,
        hasNext: page === 1,
        hasPrevious: page === 2,
        onNext: () => {
          setPage(2);
        },
        onPrevious: () => {
          setPage(1);
        },
      }}
    />
  );
}

export const Pagination: Story = {
  render: () => <PaginatedStudents />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Showing 1–12 of 13 Students")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await expect(canvas.getByText("Rohan Das")).toBeVisible();
    await expect(
      canvas.getByText("Showing 13–13 of 13 Students"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous page" }),
    );
    await expect(canvas.getByText("Anita Sharma")).toBeVisible();
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
      canvas.getByRole("button", { name: "Back to Students" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Miss Anita Sharma" }),
    ).toBeVisible();
    await expect(canvas.getByText("Riverside School")).toBeVisible();
    await expect(canvas.getByText("Meera Sharma")).toBeVisible();
    await expect(canvas.getByText("Karan Sharma")).toBeVisible();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};
