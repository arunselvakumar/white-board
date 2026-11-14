import { ProjectPage } from "./ProjectPage";

/** Attendance → Check-In → Log: a day's check-in entries, and Void. */
export class CheckInLogPage extends ProjectPage {
  public get url() {
    return `${this.base}/attendance/check-in/log`;
  }

  public get log() {
    return this.page.getByRole("list", { name: "Check-In log" });
  }

  /** An entry by its name, e.g. "Ravi Kumar, Check In 10:02 am". */
  public entry(name: string | RegExp) {
    return this.log.getByRole("listitem", { name });
  }
}
