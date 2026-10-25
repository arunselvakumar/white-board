import { AppShellPage } from "./AppShellPage";

export class BackdatedEntryPage extends AppShellPage {
  public get url() {
    return "/app/settings/backdated-entry";
  }

  public get createLimitField() {
    return this.page.getByRole("spinbutton", {
      name: "Restrict creating entries older than",
    });
  }

  public get saveButton() {
    return this.button(/^Save/);
  }
}
