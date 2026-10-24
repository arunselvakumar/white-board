import { AppShellPage } from "./AppShellPage";

export class AddLabourPage extends AppShellPage {
  public get url() {
    return "/app/masters/labours/new";
  }

  public async fill(input: {
    name: string;
    wagePerDay: string;
    project: string;
    joiningDate?: string;
    category?: string;
  }) {
    await this.field("Labour name").fill(input.name);
    if (input.joiningDate != null)
      await this.field("Joining date").fill(input.joiningDate);
    await this.field("Wage per day").fill(input.wagePerDay);
    if (input.category != null)
      await this.choose("Labour Category", input.category);
    await this.choose("Project", input.project);
  }

  public get saveButton() {
    return this.button("Save");
  }
}
