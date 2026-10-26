import { AppShellPage } from "./AppShellPage";

export class AddStaffPage extends AppShellPage {
  public get url() {
    return "/app/staff/new";
  }

  public get pageHeading() {
    return this.heading("Add Staff", { level: 1 });
  }

  public get nameField() {
    return this.page.getByRole("textbox", { name: "Name", exact: true });
  }

  public get mobileField() {
    return this.page.getByRole("textbox", { name: "Mobile" });
  }

  public get emailField() {
    return this.page.getByRole("textbox", { name: "Email" });
  }

  public get salaryField() {
    return this.page.getByRole("textbox", { name: "Salary per month" });
  }

  public get inviteCheckbox() {
    return this.page.getByRole("checkbox", { name: /Invite them/ });
  }

  public get passwordField() {
    return this.page.getByRole("textbox", { name: "Set a password" });
  }

  public get continueButton() {
    return this.button("Continue");
  }

  public projectCheckbox(name: string) {
    return this.page.getByRole("checkbox", { name });
  }

  public async fillDetails(input: {
    name: string;
    email?: string;
    mobile?: string;
    password?: string;
    salary?: string;
  }) {
    await this.nameField.fill(input.name);
    if (input.mobile != null) await this.mobileField.fill(input.mobile);
    if (input.email != null) await this.emailField.fill(input.email);
    if (input.salary != null) await this.salaryField.fill(input.salary);
    if (input.password != null) await this.passwordField.fill(input.password);
  }

  public async chooseRole(name: string) {
    await this.choose("Role", name);
  }
}
