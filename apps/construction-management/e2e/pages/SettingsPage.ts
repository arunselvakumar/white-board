import { AppShellPage } from "./AppShellPage";

/** Settings: the Company profile, logo and the Advanced Settings list. */
export class SettingsPage extends AppShellPage {
  public get url() {
    return "/app/settings";
  }

  public get pageHeading() {
    return this.heading("Settings", { level: 1 });
  }

  public get logo() {
    return this.page.getByRole("region", { name: "Logo" });
  }

  public get logoImage() {
    return this.logo.getByRole("img", { name: "Your logo" });
  }

  public async uploadLogo(file: string) {
    await this.upload("Choose logo file", file);
  }

  public get profileForm() {
    return this.page.getByRole("form", { name: "Company profile" });
  }

  public get gstinField() {
    return this.profileForm.getByRole("textbox", { name: "GSTIN" });
  }

  public get panField() {
    return this.profileForm.getByRole("textbox", { name: "Company PAN" });
  }

  public get addressField() {
    return this.profileForm.getByRole("textbox", { name: "Address" });
  }

  public get saveChangesButton() {
    return this.button("Save changes");
  }

  public advancedSetting(name: string) {
    return this.page
      .getByRole("region", { name: "Advanced Settings" })
      .getByRole("link", { name: new RegExp(`^${name}`) });
  }
}
