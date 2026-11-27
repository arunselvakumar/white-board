import { AppShellPage } from "./AppShellPage";

export class EmployeesPage extends AppShellPage {
  public get url() {
    return "/app/staff/employees";
  }

  public get table() {
    return this.page.getByRole("table", { name: "Employees" });
  }

  public row(name: string) {
    return this.table.getByRole("row").filter({ hasText: name });
  }

  public get addEmployeeLink() {
    return this.link("Add Employee");
  }

  public get importButton() {
    return this.button("Import");
  }
}
