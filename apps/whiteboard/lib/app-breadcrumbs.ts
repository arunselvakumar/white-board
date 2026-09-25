export type AppBreadcrumb = {
  label: string;
  href?: string;
};

const dashboard: AppBreadcrumb = { label: "Dashboard", href: "/" };

export function getAppBreadcrumbs(
  pathname: string,
  role?: string | null,
): AppBreadcrumb[] {
  if (pathname === "/calendar") return [{ label: "Calendar", href: "/calendar" }];
  if (role === "org:student") return [{ label: "Student", href: "/student" }];
  if (role === "org:parent") return [{ label: "Parent", href: "/parent" }];
  if (role === "org:teacher") return pathname === "/teacher" ? [{ label: "My Batches", href: "/teacher" }] : [{ label: "My Batches", href: "/teacher" }, { label: "Attendance" }];
  const [area, id, action] = pathname.split("/").filter(Boolean);

  if (area === undefined) {
    return [{ label: "Dashboard", href: "/" }];
  }

  if (area === "enrollments" && id !== undefined) {
    return [dashboard, { label: "Enrollment" }];
  }

  if (area === "payments" && id !== undefined && action === "receipt") {
    return [dashboard, { label: "Fees", href: "/fees" }, { label: "Receipt" }];
  }

  if (area === "fees") {
    return [dashboard, { label: "Fees" }];
  }
  if (area === "attendance") return [dashboard, { label: "Attendance", href: "/attendance" }, ...(id ? [{ label: "Batch Register" }] : [])];

  if (area !== "students" && area !== "courses" && area !== "batches" && area !== "teachers") {
    return [dashboard];
  }

  const sections = {
    students: { label: "Students", singular: "Student", create: "Add Student" },
    courses: { label: "Courses", singular: "Course", create: "Add Course" },
    batches: { label: "Batches", singular: "Batch", create: "Add Batch" },
    teachers: { label: "Teachers", singular: "Teacher", create: "Add Teacher" },
  } as const;
  const section = sections[area];

  if (id === undefined) {
    return [dashboard, { label: section.label }];
  }

  const parent = { label: section.label, href: `/${area}` };
  if (id === "new") {
    return [dashboard, parent, { label: section.create }];
  }

  const resource = { label: section.singular, href: `/${area}/${id}` };
  if (action === "edit" && area === "students") {
    return [dashboard, parent, resource, { label: "Edit Student" }];
  }
  if (action === "enroll" && (area === "students" || area === "batches")) {
    return [dashboard, parent, resource, { label: "Enroll Student" }];
  }
  if (area === "courses" || area === "batches") {
    return [dashboard, parent, { label: `Edit ${section.singular}` }];
  }
  return [dashboard, parent, { label: section.singular }];
}
