import { AppShellPage } from "./AppShellPage";

export class SequenceIdsPage extends AppShellPage {
  public get url() {
    return "/app/settings/sequence-ids";
  }

  public get addRuleButton() {
    return this.button("Add rule");
  }

  public get prefixField() {
    return this.dialog.getByRole("textbox", { name: "Prefix" });
  }
}
