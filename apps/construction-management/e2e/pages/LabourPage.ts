import { AppShellPage } from "./AppShellPage";

/** One Labour's page: the Details and Activity tabs. */
export class LabourPage extends AppShellPage {
  constructor(
    page: ConstructorParameters<typeof AppShellPage>[0],
    private readonly labourId: string,
  ) {
    super(page);
  }

  public get url() {
    return `/app/staff/labours/${this.labourId}`;
  }

  public tab(name: "Details" | "Activity") {
    return this.page.getByRole("tab", { name });
  }

  /** The entries of one day, by its heading ("Today", "Yesterday", a date). */
  public day(name: string) {
    return this.page.getByRole("region", { name });
  }
}
