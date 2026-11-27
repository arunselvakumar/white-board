import { AppShellPage } from "./AppShellPage";

/** One Employee's page: the Details, Attendance and Activity tabs. */
export class EmployeePage extends AppShellPage {
  constructor(
    page: ConstructorParameters<typeof AppShellPage>[0],
    private readonly employeeId: string,
  ) {
    super(page);
  }

  public get url() {
    return `/app/staff/employees/${this.employeeId}`;
  }

  public tab(name: "Details" | "Attendance" | "Activity") {
    return this.page.getByRole("tab", { name });
  }

  /** The entries of one day, by its heading ("Today", "Yesterday", a date). */
  public day(name: string) {
    return this.page.getByRole("region", { name });
  }
}
