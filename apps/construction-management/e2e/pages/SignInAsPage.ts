import { BasePage } from "./BasePage";

/** Support staff sign in as a customer (`/sign-in/as`, ADR CM-0029). */
export class SignInAsPage extends BasePage {
  public get url() {
    return "/sign-in/as";
  }

  public get pageHeading() {
    return this.heading("Sign in as a customer");
  }

  public get customerEmailField() {
    return this.field("Customer email");
  }

  public get adminEmailField() {
    return this.field("Your White Board email");
  }

  public get sendCodeButton() {
    return this.button("Send code");
  }

  public get codeInput() {
    return this.page.getByRole("textbox", { name: "6-digit code" });
  }

  public get signInAsCustomerButton() {
    return this.button("Sign in as customer");
  }

  /** The amber bar on every page while impersonating. */
  public get impersonationBanner() {
    return this.page.getByRole("status").filter({ hasText: "Impersonated by" });
  }

  public get stopButton() {
    return this.impersonationBanner.getByRole("button", { name: "Stop" });
  }
}
