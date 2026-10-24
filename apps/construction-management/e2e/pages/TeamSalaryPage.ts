import type { Page } from "@playwright/test";

import { HrmsPage } from "./HrmsPage";

export class TeamSalaryPage extends HrmsPage {
  constructor(page: Page) {
    super(page, "/salary/team");
  }

  public get calculateButton() {
    return this.button("Calculate Salary");
  }

  public get salaries() {
    return this.page.getByRole("region", { name: "Salaries" });
  }

  public slip(memberName: string) {
    return this.salaries.getByLabel(new RegExp(`^${memberName}, `));
  }

  public select(memberName: string) {
    return this.page.getByRole("checkbox", { name: `Select ${memberName}` });
  }

  public async approve(memberName: string) {
    await this.select(memberName).check();
    await this.button("Approve (1)").click();
  }

  public async markPaid(memberName: string) {
    await this.select(memberName).check();
    await this.button("Mark Paid (1)").click();
    const dialog = this.page.getByRole("dialog", {
      name: "Mark Salaries as Paid",
    });
    await dialog.getByRole("button", { name: "Mark as Paid" }).click();
    await dialog.waitFor({ state: "detached" });
  }
}
