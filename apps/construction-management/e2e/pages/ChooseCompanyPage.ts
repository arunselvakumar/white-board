import { BasePage } from "./BasePage";

export class ChooseCompanyPage extends BasePage {
  public get url() {
    return "/choose-company";
  }

  public get pageHeading() {
    return this.heading("Choose a Company");
  }

  public company(name: string) {
    return this.page.getByRole("listitem").filter({ hasText: name });
  }

  public openButton(name: string) {
    return this.button(`Open ${name}`);
  }
}
