import { AppShellPage } from "./AppShellPage";

export class SubscriptionPage extends AppShellPage {
  public get url() {
    return "/app/subscription";
  }

  public get pageHeading() {
    return this.heading("Your Subscription", { level: 1 });
  }

  public get choosePlanLink() {
    return this.link("Choose a plan");
  }

  public get invoices() {
    return this.page.getByRole("region", { name: "Invoices" });
  }

  public usage(term: string) {
    return this.page
      .getByRole("term")
      .filter({ hasText: term })
      .locator("xpath=following-sibling::*[1]");
  }
}
