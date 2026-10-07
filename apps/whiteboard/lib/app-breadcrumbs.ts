export type AppBreadcrumb = {
  label: string;
  href?: string;
};

const dashboard: AppBreadcrumb = { label: "Dashboard", href: "/" };

export function getAppBreadcrumbs(
  pathname: string,
  role?: string | null,
): AppBreadcrumb[] {
  if (pathname === "/calendar")
    return [{ label: "Calendar", href: "/calendar" }];
  if (pathname === "/online-classes")
    return [{ label: "Online Classes", href: "/online-classes" }];
  if (pathname === "/enquiries" || pathname.startsWith("/enquiries/")) {
    const trail = enquiryBreadcrumbs(pathname);
    return role === "org:teacher" ? trail : [dashboard, ...trail];
  }
  if (role === "org:student" || role === "org:parent") {
    const home = role === "org:student" ? "/student" : "/parent";
    if (!pathname.startsWith(`${home}/homework`))
      return [{ label: "Home", href: home }];
    const homework = { label: "Homework", href: `${home}/homework` };
    return pathname === homework.href
      ? [homework]
      : [homework, { label: "Homework details" }];
  }
  if (role === "org:teacher") {
    const myBatches = { label: "My Batches", href: "/teacher" };
    if (pathname === "/teacher") return [myBatches];
    const [, , , batchId, action, homeworkId] = pathname.split("/");
    if (action !== "homework") return [myBatches, { label: "Attendance" }];
    const work = {
      label: "Homework and Study Material",
      href: `/teacher/batches/${batchId}/homework`,
    };
    return homeworkId === undefined
      ? [myBatches, work]
      : [myBatches, work, { label: "Submissions" }];
  }
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
  if (area === "attendance")
    return [
      dashboard,
      { label: "Attendance", href: "/attendance" },
      ...(id ? [{ label: "Batch Register" }] : []),
    ];

  if (
    area !== "students" &&
    area !== "courses" &&
    area !== "batches" &&
    area !== "teachers"
  ) {
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
  if (action === "homework" && area === "batches") {
    const work = {
      label: "Homework and Study Material",
      href: `/batches/${id}/homework`,
    };
    return pathname === work.href
      ? [dashboard, parent, work]
      : [dashboard, parent, work, { label: "Submissions" }];
  }
  if (area === "courses" || area === "batches") {
    return [dashboard, parent, { label: `Edit ${section.singular}` }];
  }
  return [dashboard, parent, { label: section.singular }];
}

function enquiryBreadcrumbs(pathname: string): AppBreadcrumb[] {
  const [, id, action] = pathname.split("/").filter(Boolean);
  if (id === undefined) return [{ label: "Enquiries" }];
  const enquiries = { label: "Enquiries", href: "/enquiries" };
  if (id === "new") return [enquiries, { label: "Add enquiry" }];
  if (id === "sources") return [enquiries, { label: "Enquiry Sources" }];
  if (id === "summary") return [enquiries, { label: "Enquiry summary" }];
  if (action === undefined) return [enquiries, { label: "Enquiry" }];
  const enquiry = { label: "Enquiry", href: `/enquiries/${id}` };
  if (action === "edit") return [enquiries, enquiry, { label: "Edit enquiry" }];
  if (action === "convert")
    return [enquiries, enquiry, { label: "Convert to Student" }];
  return [enquiries, { label: "Enquiry" }];
}
