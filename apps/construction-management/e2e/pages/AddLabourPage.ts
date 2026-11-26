import { AppShellPage } from "./AppShellPage";

export class AddLabourPage extends AppShellPage {
  public get url() {
    return "/app/staff/labours/new";
  }

  public async fill(input: {
    name: string;
    wagePerDay: string;
    joiningDate?: string;
    category?: string;
  }) {
    await this.field("Labour name").fill(input.name);
    if (input.joiningDate != null)
      await this.field("Joining date").fill(input.joiningDate);
    await this.field("Wage per day").fill(input.wagePerDay);
    if (input.category != null)
      await this.choose("Labour Category", input.category);
  }

  public get saveButton() {
    return this.button("Save");
  }
}
