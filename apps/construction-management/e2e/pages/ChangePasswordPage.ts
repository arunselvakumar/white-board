import { BasePage } from "./BasePage";

export class ChangePasswordPage extends BasePage {
  public get url() {
    return "/change-password";
  }

  public get pageHeading() {
    return this.heading("Choose your own password");
  }

  public get currentPasswordField() {
    return this.page.getByRole("textbox", { name: "Current password" });
  }

  public get newPasswordField() {
    return this.page.getByRole("textbox", {
      name: "New password",
      exact: true,
    });
  }

  public get confirmPasswordField() {
    return this.page.getByRole("textbox", { name: "Confirm new password" });
  }

  public get submitButton() {
    return this.button("Save and continue");
  }

  public async change(current: string, next: string) {
    await this.currentPasswordField.fill(current);
    await this.newPasswordField.fill(next);
    await this.confirmPasswordField.fill(next);
    await this.submitButton.click();
  }
}
