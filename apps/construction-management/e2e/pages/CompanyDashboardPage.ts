import { AppShellPage } from "./AppShellPage";

/** The Company Dashboard (CM-902): totals across the Projects. */
export class CompanyDashboardPage extends AppShellPage {
  public get url() {
    return "/app/dashboard";
  }

  public total(name: string) {
    return this.page
      .getByRole("list", { name: "Totals" })
      .getByRole("listitem")
      .filter({ hasText: name });
  }
}
