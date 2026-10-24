import type { Page } from "@playwright/test";

import { ProjectPage } from "./ProjectPage";

/** Sales → Inquiries: the list, Quick add and an inquiry's page (CM-1003). */
export class InquiryPage extends ProjectPage {
  constructor(
    page: Page,
    projectId: string,
    private readonly path = "/inquiries/list",
  ) {
    super(page, projectId);
  }

  public get url() {
    return `${this.base}${this.path}`;
  }

  public get table() {
    return this.page.getByRole("table", { name: "Inquiries" });
  }

  public async quickAdd(input: { name: string; mobile: string }) {
    await this.button("Quick add").first().click();
    const dialog = this.page.getByRole("dialog", { name: "Quick add" });
    await dialog.getByLabel("Name", { exact: true }).fill(input.name);
    await dialog.getByLabel("Mobile").fill(input.mobile);
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.waitFor({ state: "detached" });
  }

  public async addFollowUp(remarks: string) {
    await this.button("Add follow-up").click();
    const dialog = this.page.getByRole("dialog", { name: "Add follow-up" });
    await dialog.getByRole("combobox", { name: "Activity" }).click();
    await this.page.getByRole("option").first().click();
    await dialog.getByLabel("Remarks").fill(remarks);
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.waitFor({ state: "detached" });
  }

  /** Close as Converted, booking `unit` (a pattern of its option). */
  public async convert(customer: string, unit: RegExp) {
    await this.button("Close").click();
    const dialog = this.page.getByRole("dialog", { name: `Close ${customer}` });
    await dialog.getByRole("radio", { name: "Converted" }).check();
    await dialog.getByRole("combobox", { name: "Unit" }).click();
    await this.page.getByRole("option", { name: unit }).first().click();
    await dialog.getByRole("button", { name: "Book and close" }).click();
    await dialog.waitFor({ state: "detached" });
  }

  public async closeAsLost(customer: string) {
    await this.button("Close").click();
    const dialog = this.page.getByRole("dialog", { name: `Close ${customer}` });
    await dialog.getByRole("radio", { name: "Lost" }).check();
    await dialog.getByRole("combobox", { name: "Lost Reason" }).click();
    await this.page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Close as Lost" }).click();
    await dialog.waitFor({ state: "detached" });
  }
}
