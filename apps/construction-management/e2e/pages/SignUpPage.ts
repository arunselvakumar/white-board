import { BasePage } from "./BasePage";

export class SignUpPage extends BasePage {
  public get url() {
    return "/sign-up";
  }

  public get pageHeading() {
    return this.heading("Create your account");
  }

  public get nameField() {
    return this.field("Your name");
  }

  public get emailField() {
    return this.field("Email");
  }

  public get passwordField() {
    return this.page.getByRole("textbox", { name: "Password" });
  }

  public get createAccountButton() {
    return this.button("Create account");
  }

  public get codeInput() {
    return this.page.getByRole("textbox", { name: "6-digit code" });
  }

  public get verifyEmailButton() {
    return this.button("Verify email");
  }

  public errorText(text: string | RegExp) {
    return this.page.getByText(text);
  }

  public async fillDetails(input: {
    name: string;
    email: string;
    password: string;
  }) {
    await this.nameField.fill(input.name);
    await this.emailField.fill(input.email);
    await this.passwordField.fill(input.password);
    await this.createAccountButton.click();
  }

  public async enterCode(code: string) {
    await this.codeInput.fill(code);
    await this.verifyEmailButton.click();
  }
}
