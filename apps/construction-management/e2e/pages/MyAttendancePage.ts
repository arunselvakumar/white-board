import type { Page } from "@playwright/test";

import { HrmsPage } from "./HrmsPage";

export class MyAttendancePage extends HrmsPage {
  constructor(page: Page) {
    super(page, "/attendance/my");
  }

  public get checkInButton() {
    return this.button("Check In");
  }

  public get checkOutButton() {
    return this.button("Check Out");
  }

  public get today() {
    return this.section("Today");
  }
}
