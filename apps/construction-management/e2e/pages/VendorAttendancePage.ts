import { ProjectPage } from "./ProjectPage";

export class VendorAttendancePage extends ProjectPage {
  public get url() {
    return `${this.base}/attendance/vendors`;
  }

  /** Full-day heads of one Vendor, shift and Labour Category. */
  public fullDay(vendor: string, shift: string, category: string) {
    return this.page.getByLabel(`${vendor} ${shift} ${category} full day`);
  }

  public dayTotal(vendor: string) {
    return this.page.getByLabel(`${vendor} day total`);
  }

  public saveButton(vendor: string) {
    return this.page
      .getByLabel(`${vendor} attendance`)
      .getByRole("button", { name: "Save" });
  }

  public async save(vendor: string) {
    await this.clickAndWaitFor(
      this.saveButton(vendor),
      "/api/construction/labour/attendance/vendors",
    );
  }
}
