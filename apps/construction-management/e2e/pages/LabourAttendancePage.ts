import { ProjectPage } from "./ProjectPage";

export type AttendanceStatus =
  "Present" | "Half Day" | "Absent" | "Leave" | "Holiday";

export class LabourAttendancePage extends ProjectPage {
  public get url() {
    return `${this.base}/attendance/labour`;
  }

  public get dateField() {
    return this.page.getByRole("textbox", { name: "Date", exact: true });
  }

  public get form() {
    return this.page.getByRole("form", { name: "Labour attendance" });
  }

  public statusButton(labour: string, status: AttendanceStatus) {
    return this.form.getByRole("button", {
      name: `${labour} ${status}`,
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
