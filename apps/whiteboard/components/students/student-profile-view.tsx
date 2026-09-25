"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { StudentAvatar } from "@/components/students/student-avatar";
import { formatPaiseAsRupees } from "@/lib/money";
import { batchQueries } from "@/src/queries/batches";
import { courseQueries } from "@/src/queries/courses";
import { studentQueries, type StudentResponse } from "@/src/queries/students";

const salutations: Record<string, string> = {
  mr: "Mr.",
  mrs: "Mrs.",
  ms: "Ms.",
  miss: "Miss",
  mx: "Mx.",
  dr: "Dr.",
  prof: "Prof.",
};

export function studentFullName(student: {
  name: string;
  details: { salutation: string | null };
}): string {
  const salutation = student.details.salutation;
  return salutation == null
    ? student.name
    : `${salutations[salutation]} ${student.name}`;
}

const genders: Record<string, string> = {
  female: "Female",
  male: "Male",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium">
        {value == null || value.length === 0 ? "—" : value}
      </dd>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-7">
      <h2 className="mb-5 border-b pb-4 text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function StudentProfileView({
  student,
  courseNameById = new Map(),
  batchNameById = new Map(),
  onBack,
  onEdit,
  onEnroll,
}: {
  student: StudentResponse;
  courseNameById?: Map<string, string>;
  batchNameById?: Map<string, string>;
  onBack: () => void;
  onEdit: () => void;
  onEnroll: () => void;
}) {
  const details = student.details;
  const fullName = studentFullName(student);
  const status = student.droppedAt == null ? "Active" : "Dropped";
  return (
    <div className="w-full p-6">
      <div className="max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Students", onClick: onBack }}
          title={fullName}
          meta={`${student.phone} · ${status}`}
          leading={
            <StudentAvatar
              studentId={student.id}
              name={student.name}
              photoUrl={student.photoUrl}
              className="size-14"
            />
          }
          actions={
            <>
              <Button type="button" variant="outline" onClick={onEdit}>
                Edit Student
              </Button>
              {student.droppedAt == null ? (
                <Button type="button" onClick={onEnroll}>
                  Enroll
                </Button>
              ) : null}
            </>
          }
        />

        <Panel title="Student details">
          <Detail
            label="Gender"
            value={details.gender == null ? null : genders[details.gender]}
          />
          <Detail label="Date of birth" value={details.dateOfBirth} />
          <Detail label="Phone number" value={student.phone} />
          <Detail label="Email address" value={student.email} />
          <Detail label="Address" value={student.address} />
        </Panel>

        <Panel title="Education">
          <Detail
            label="Current education status"
            value={
              details.educationStatus == null
                ? null
                : {
                    school: "Studying at school or college",
                    completed: "Completed studies or working",
                    other: "Other",
                  }[details.educationStatus]
            }
          />
          <Detail
            label="Current school or college"
            value={details.currentInstitution}
          />
          <Detail label="Current class or grade" value={details.currentGrade} />
          <Detail label="School board" value={details.schoolBoard} />
          <Detail
            label="Highest qualification"
            value={details.highestQualification}
          />
        </Panel>

        {(["father", "mother"] as const).map((which) => {
          const parent = details[which];
          return (
            <Panel
              key={which}
              title={`${which === "father" ? "Father" : "Mother"} details`}
            >
              <Detail
                label="Salutation"
                value={
                  parent.salutation == null
                    ? null
                    : salutations[parent.salutation]
                }
              />
              <Detail
                label="Gender"
                value={parent.gender == null ? null : genders[parent.gender]}
              />
              <Detail label="Full name" value={parent.name} />
              <Detail label="Occupation" value={parent.occupation} />
              <Detail label="Primary phone" value={parent.primaryPhone} />
              <Detail
                label="Alternate contact number"
                value={parent.alternatePhone}
              />
              <Detail label="Email address" value={parent.email} />
            </Panel>
          );
        })}

        <Panel title="Guardians">
          {details.guardians.length === 0 ? (
            <p className="text-muted-foreground text-sm sm:col-span-2">
              No additional Guardians.
            </p>
          ) : (
            details.guardians.map((guardian, index) => (
              <div
                key={`${guardian.name}-${String(index)}`}
                className="rounded-xl border p-4 sm:col-span-2"
              >
                <h3 className="mb-4 font-semibold">Guardian {index + 1}</h3>
                <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  <Detail
                    label="Salutation"
                    value={
                      guardian.salutation == null
                        ? null
                        : salutations[guardian.salutation]
                    }
                  />
                  <Detail
                    label="Gender"
                    value={
                      guardian.gender == null ? null : genders[guardian.gender]
                    }
                  />
                  <Detail label="Full name" value={guardian.name} />
                  <Detail
                    label="Relationship to Student"
                    value={guardian.relationship}
                  />
                  <Detail label="Phone number" value={guardian.phone} />
                  <Detail label="Email address" value={guardian.email} />
                </dl>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Emergency & records">
          <Detail
            label="Emergency phone number"
            value={details.emergencyPhone}
          />
          <Detail label="ID proof note" value={student.idProofNote} />
          <Detail
            label="Admission date"
            value={new Date(student.createdAt).toLocaleDateString()}
          />
        </Panel>

        <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-7">
          <h2 className="mb-5 border-b pb-4 text-lg font-semibold tracking-tight">
            Enrollments
          </h2>
          {(student.enrollments?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">
              This Student has no Enrollments yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {student.enrollments?.map((enrollment) => (
                <li
                  key={enrollment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                >
                  <div>
                    <p className="font-medium">
                      {courseNameById.get(enrollment.courseId) ?? "Course"} ·{" "}
                      {batchNameById.get(enrollment.batchId) ?? "Batch"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Remaining dues{" "}
                      {formatPaiseAsRupees(enrollment.remainingDuesPaise)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      enrollment.endedAt == null ? "outline" : "secondary"
                    }
                  >
                    {enrollment.endedAt == null ? "Active" : "Ended"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function StudentProfileScreen({ studentId }: { studentId: string }) {
  const router = useRouter();
  const { data: student } = useSuspenseQuery(studentQueries.detail(studentId));
  const { data: courses } = useSuspenseQuery(courseQueries.list());
  const { data: batches } = useSuspenseQuery(batchQueries.list());
  return (
    <StudentProfileView
      student={student}
      courseNameById={
        new Map(courses.items.map((course) => [course.id, course.name]))
      }
      batchNameById={
        new Map(batches.items.map((batch) => [batch.id, batch.name]))
      }
      onBack={() => {
        router.push("/students");
      }}
      onEdit={() => {
        router.push(`/students/${studentId}/edit`);
      }}
      onEnroll={() => {
        router.push(`/students/${studentId}/enroll`);
      }}
    />
  );
}
