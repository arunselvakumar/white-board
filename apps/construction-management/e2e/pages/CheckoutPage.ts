import { expect } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

export class CheckoutPage extends AppShellPage {
  public get url() {
    return "/app/subscription/checkout";
  }

  public get pageHeading() {
    return this.heading("Choose a plan", { level: 1 });
  }

  public get step() {
    return this.page.getByText(/^Step \d of \d/);
  }

  public plan(name: string) {
    return this.page.getByRole("radio", { name: new RegExp(`^${name}`) });
  }

  public get continueButton() {
    return this.button("Continue");
  }

  public get payButton() {
    return this.button(/^Pay/);
  }

  /** Steps to Buyer details, fills them, and stops on the last step. */
  public async continueToPay(buyer: { name: string; address: string }) {
    // Continue validates the step before moving on: wait for each move, and
    // give up after the wizard's five steps.
    for (let moves = 0; moves < 5; moves += 1) {
      const current = (await this.step.textContent()) ?? "";
      if (current.includes("Buyer details")) break;
      await this.continueButton.click();
      await expect(this.step).not.toHaveText(current);
    }
    await expect(this.step).toContainText("Buyer details");
    await this.field("Billing name").fill(buyer.name);
    await this.field("Billing address").fill(buyer.address);
    await this.choose("State", "Tamil Nadu");
    await this.continueButton.click();
  }
}
