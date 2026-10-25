import { expect } from "@playwright/test";

import { createMaterial, createSupplier } from "../api/masters";
import { projectTest } from "../helpers/projectTest";
import { GoodsReceiptPage } from "../pages/GoodsReceiptPage";
import { PurchaseOrderPage } from "../pages/PurchaseOrderPage";

projectTest.describe("Procurement settings", () => {
  projectTest(
    "should bill the next Purchase Order from the new default address, when the Owner adds a billing address",
    async ({ owner, project, page }) => {
      await page.goto("/app/settings/billing-addresses");
      await page
        .getByRole("button", { name: "Add billing address" })
        .first()
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Name", { exact: true })
        .fill("Coimbatore office");
      await dialog
        .getByLabel("Address", { exact: true })
        .fill("44 Avinashi Road, Coimbatore 641018");
      await dialog.getByRole("combobox", { name: "GST state" }).click();
      await page.getByRole("option", { name: /Tamil Nadu/ }).click();
      await dialog.getByRole("button", { name: "Save address" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("main")).toContainText("Coimbatore office");

      await createSupplier(owner.api, { projectIds: [project.id] });
      await createMaterial(owner.api);
      const purchaseOrder = new PurchaseOrderPage(page, project.id);
      await purchaseOrder.goto();
      await expect(
        page.getByRole("combobox", { name: "Billing Address" }),
      ).toContainText("Coimbatore office");
    },
  );

  projectTest(
    "should drop a field from the Goods Receipt form, when the Owner hides it in GRN fields",
    async ({ project, page }) => {
      await page.goto("/app/settings/grn-fields");
      await page.getByRole("switch", { name: "Vehicle No" }).uncheck();
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: /saved/i }),
      ).toBeVisible();

      const receipt = new GoodsReceiptPage(page, project.id);
      await receipt.goto();
      await expect(receipt.field("Invoice No")).toBeVisible();
      await expect(receipt.field("Vehicle No")).toHaveCount(0);
    },
  );
});
