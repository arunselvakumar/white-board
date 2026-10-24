import { BasePage } from "./BasePage";

export class ForgotPasswordPage extends BasePage {
  public get url() {
    return "/forgot-password";
  }

  public get pageHeading() {
    return this.heading("Reset password");
  }

  public get emailField() {
    return this.field("Email");
  }

  public get sendCodeButton() {
    return this.button("Send code");
  }

  public get codeInput() {
    return this.page.getByRole("textbox", { name: "6-digit code" });
  }

  public get newPasswordField() {
    return this.page.getByRole("textbox", { name: "New password" });
  }

  public get resetPasswordButton() {
    return this.button("Reset password");
  }

  public async requestCode(email: string) {
    await this.emailField.fill(email);
    await this.sendCodeButton.click();
  }

  public async reset(code: string, password: string) {
    await this.codeInput.fill(code);
    await this.newPasswordField.fill(password);
    await this.resetPasswordButton.click();
  }
}
