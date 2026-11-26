import { AppShellPage } from "./AppShellPage";

/**
 * Add Site Engineer: one page of cards; every new one signs in with their
 * mobile and a password (ADR CM-0037, CM-0053).
 */
export class AddSiteEngineerPage extends AppShellPage {
  public get url() {
    return "/app/staff/site-engineers/new";
  }

  public get pageHeading() {
    return this.heading("Add Site Engineer", { level: 1 });
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

  public get passwordField() {
    return this.page.getByLabel("Password", { exact: true });
  }

  public get mobileLoginCheckbox() {
    return this.page.getByRole("checkbox", {
      name: /Use mobile number as login/,
    });
  }

  public async fillDetails(input: {
    name: string;
    /** Without +91, as typed. */
    mobile?: string;
    email?: string;
    password?: string;
    specialisation?: string;
  }) {
    await this.nameField.fill(input.name);
    if (input.mobile != null) await this.mobileField.fill(input.mobile);
    if (input.email != null) await this.emailField.fill(input.email);
    if (input.password != null) await this.passwordField.fill(input.password);
    if (input.specialisation != null)
      await this.field("Specialisation").fill(input.specialisation);
  }
}
