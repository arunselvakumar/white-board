import type { Page } from "@playwright/test";

import { HrmsPage } from "./HrmsPage";

export class LeaveApprovalsPage extends HrmsPage {
  constructor(page: Page) {
    super(page, "/leave/approvals");
  }

  public get requests() {
    return this.page.getByRole("list", { name: "Leave requests" });
  }

  public request(memberName: string) {
    return this.requests.getByRole("listitem").filter({ hasText: memberName });
  }

  public async decide(
    memberName: string,
    decision: "Approve" | "Reject",
    note?: string,
  ) {
    await this.request(memberName)
      .getByRole("button", { name: decision, exact: true })
      .click();
    if (note != null) await this.dialog.getByRole("textbox").fill(note);
    await this.dialog
      .getByRole("button", { name: decision, exact: true })
      .click();
    await this.dialog.waitFor({ state: "detached" });
  }
}
