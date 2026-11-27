import { ProjectPage } from "./ProjectPage";

export type AttendanceStatus =
  "Present" | "Half Day" | "Absent" | "Leave" | "Holiday";

export class EmployeeAttendancePage extends ProjectPage {
  public get url() {
    return `${this.base}/attendance/employees`;
  }

  public get dateField() {
    return this.page.getByRole("textbox", { name: "Date", exact: true });
  }

  public get form() {
    return this.page.getByRole("form", { name: "Employee attendance" });
  }

  public statusButton(employee: string, status: AttendanceStatus) {
    return this.form.getByRole("button", {
      name: `${employee} ${status}`,
      exact: true,
    });
  }

  public get saveButton() {
    return this.form.getByRole("button", { name: "Save" });
  }

  public get summary() {
    return this.form.getByText(/saved ·/);
  }
}
