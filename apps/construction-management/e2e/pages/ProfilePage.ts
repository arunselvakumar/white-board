import { AppShellPage } from "./AppShellPage";

export class ProfilePage extends AppShellPage {
  public get url() {
    return "/app/profile";
  }

  public get pageHeading() {
    return this.heading("My Profile", { level: 1 });
  }

  public get form() {
    return this.page.getByRole("form", { name: "My Profile" });
  }

  public get nameField() {
    return this.form.getByRole("textbox", { name: "Name" });
  }

  public get emergencyContactField() {
    return this.form.getByRole("textbox", { name: "Emergency contact" });
  }

  public get saveChangesButton() {
    return this.form.getByRole("button", { name: "Save changes" });
  }

  public get photoRegion() {
    return this.page.getByRole("region", { name: "Photo" });
  }

  public async uploadPhoto(file: string) {
    await this.upload("Choose photo file", file);
  }
}
