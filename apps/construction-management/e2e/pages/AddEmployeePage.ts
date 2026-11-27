import { AppShellPage } from "./AppShellPage";

/**
 * Add Employee: one page of cards, starting on Human Resources → Labour;
 * "Can sign in" is off until turned on (ADR CM-0055).
 */
export class AddEmployeePage extends AppShellPage {
  public get url() {
    return "/app/staff/employees/new";
  }

  public get pageHeading() {
    return this.heading("Add Employee", { level: 1 });
  }

  public get departmentSelect() {
    return this.page.getByRole("combobox", { name: "Department" });
  }

  public get roleSelect() {
    return this.page.getByRole("combobox", { name: "Role" });
  }

  public get mobileField() {
    return this.page.getByRole("textbox", { name: "Mobile" });
  }

  public get canSignInSwitch() {
    return this.page.getByRole("switch", { name: "Can sign in" });
  }

  public get mobileLoginCheckbox() {
    return this.page.getByRole("checkbox", {
      name: /Use mobile number as login/,
    });
  }

  public get passwordField() {
    return this.page.getByLabel("Password", { exact: true });
  }

  public async fill(input: {
    name: string;
    wagePerDay: string;
    joiningDate?: string;
    category?: string;
    /** Both or neither: a Role under the Department. */
    department?: string;
    role?: string;
    /** Without +91, as typed. */
    mobile?: string;
  }) {
    await this.field("Employee name").fill(input.name);
    if (input.mobile != null) await this.mobileField.fill(input.mobile);
    if (input.joiningDate != null)
      await this.field("Joining date").fill(input.joiningDate);
    if (input.department != null)
      await this.choose("Department", input.department);
    if (input.role != null) await this.choose("Role", input.role);
    await this.field("Wage per day").fill(input.wagePerDay);
    if (input.category != null)
      await this.choose("Labour Category", input.category);
  }

  /** Turns "Can sign in" on and types their first password. */
  public async signIn(password: string) {
    await this.canSignInSwitch.click();
    await this.passwordField.fill(password);
  }

  public get saveButton() {
    return this.button("Save");
  }
}
