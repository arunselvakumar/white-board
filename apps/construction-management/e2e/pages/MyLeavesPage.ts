import type { Page } from "@playwright/test";

import { HrmsPage } from "./HrmsPage";

export class MyLeavesPage extends HrmsPage {
  constructor(page: Page) {
    super(page, "/leave/my");
  }

  public get balances() {
    return this.section("Balances");
  }

  public get requests() {
    return this.section("Requests");
  }

  public balance(leaveType: string) {
    return this.balances.getByRole("listitem").filter({ hasText: leaveType });
  }

  /** The days of `leaveType` still available, as the balance shows them. */
  public async available(leaveType: string): Promise<number> {
    const text = (await this.balance(leaveType).textContent()) ?? "";
    const days = new RegExp(`${leaveType}\\s*([\\d.]+) days?`).exec(text)?.[1];
    if (days == null) throw new Error(`No ${leaveType} balance in "${text}"`);
    return Number(days);
  }

  public async apply(input: {
    leaveType: string;
    from: string;
    to: string;
    reason: string;
  }) {
    await this.button("Apply Leave").first().click();
    const dialog = this.page.getByRole("dialog", { name: "Apply Leave" });
    await this.choose("Leave type", input.leaveType);
    await dialog.getByLabel("From").fill(input.from);
    await dialog.getByLabel("To").fill(input.to);
    await dialog.getByLabel("Reason").fill(input.reason);
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
  }
}
