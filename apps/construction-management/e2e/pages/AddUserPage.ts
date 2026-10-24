import { AppShellPage } from "./AppShellPage";

export class AddUserPage extends AppShellPage {
  public get url() {
    return "/app/users/new";
  }

  public get pageHeading() {
    return this.heading("Add User", { level: 1 });
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
    designation?: string;
    email?: string;
    mobile?: string;
    password?: string;
  }) {
    await this.nameField.fill(input.name);
    await this.choose("Designation", input.designation ?? "Site Engineer");
    if (input.mobile != null) await this.mobileField.fill(input.mobile);
    if (input.email != null) await this.emailField.fill(input.email);
    if (input.password != null) await this.passwordField.fill(input.password);
  }

  public async chooseRole(name: string) {
    await this.choose("Role", name);
  }
}
