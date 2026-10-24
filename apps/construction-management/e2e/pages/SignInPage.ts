import { BasePage } from "./BasePage";

export class SignInPage extends BasePage {
  public get url() {
    return "/sign-in";
  }

  public get pageHeading() {
    return this.heading("Sign in");
  }

  public get emailTab() {
    return this.page.getByRole("tab", { name: "Email" });
  }

  public get mobileTab() {
    return this.page.getByRole("tab", { name: "Mobile" });
  }

  public get emailPanel() {
    return this.page.getByRole("tabpanel", { name: "Email" });
  }

  public get mobilePanel() {
    return this.page.getByRole("tabpanel", { name: "Mobile" });
  }

  public get emailField() {
    return this.emailPanel.getByRole("textbox", { name: "Email" });
  }

  public get mobileField() {
    return this.mobilePanel.getByRole("textbox", { name: /Mobile/ });
  }

  public get forgotPasswordLink() {
    return this.link("Forgot password?");
  }

  public get formAlert() {
    return this.page.getByRole("alert").filter({ hasText: /\S/ });
  }

  public async signInByEmail(email: string, password: string) {
    await this.emailTab.click();
    await this.emailField.fill(email);
    await this.emailPanel
      .getByRole("textbox", { name: "Password" })
      .fill(password);
    await this.emailPanel.getByRole("button", { name: "Sign in" }).click();
  }

  public async signInByMobile(mobile: string, password: string) {
    await this.mobileTab.click();
    await this.mobileField.fill(mobile);
    await this.mobilePanel
      .getByRole("textbox", { name: "Password" })
      .fill(password);
    await this.mobilePanel.getByRole("button", { name: "Sign in" }).click();
  }
}
