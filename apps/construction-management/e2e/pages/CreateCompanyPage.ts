import { BasePage } from "./BasePage";

export class CreateCompanyPage extends BasePage {
  public get url() {
    return "/create-company";
  }

  public get companyNameField() {
    return this.field("Company name");
  }

  public get continueButton() {
    return this.button("Continue");
  }

  public get saveButton() {
    return this.button("Save");
  }

  public get signOutButton() {
    return this.button("Sign out");
  }

  /** Steps through the wizard with only the required Company name. */
  public async create(name: string) {
    await this.companyNameField.fill(name);
    await this.continueButton.click();
    await this.continueButton.click();
    await this.saveButton.click();
  }

  public joinRequest(companyName: string) {
    return this.page.getByRole("listitem").filter({ hasText: companyName });
  }

  public acceptButton(companyName: string) {
    return this.joinRequest(companyName).getByRole("button", {
      name: /Accept/,
    });
  }
}
