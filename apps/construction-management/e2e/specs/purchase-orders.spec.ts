import { expect } from "@playwright/test";

import { addDays, todayInIndia } from "../api/dates";
import { createMaterial, createSupplier } from "../api/masters";
import { createBillingAddress } from "../api/organization";
import { projectTest } from "../helpers/projectTest";
import { GoodsReceiptPage } from "../pages/GoodsReceiptPage";
import { PurchaseOrderPage } from "../pages/PurchaseOrderPage";

projectTest.describe("Purchase Orders", () => {
  projectTest(
    "should print the PO as a PDF and count what arrived, when only part of the order is received",
    async ({ owner, project, page }) => {
      const material = await createMaterial(owner.api, {
        rateRupees: 62,
        gstRate: "18",
      });
      const supplier = await createSupplier(owner.api, {
        projectIds: [project.id],
      });
      await createBillingAddress(owner.api);

      const purchaseOrder = new PurchaseOrderPage(page, project.id);
      await purchaseOrder.goto();
      await purchaseOrder.fillHeader({
        supplier: supplier.name,
        expectedDelivery: addDays(todayInIndia(), 3),
      });
      await purchaseOrder.addLine(material.name, "200");
      await purchaseOrder.saveAndApproveButton.click();
      await expect(purchaseOrder.documentNumber).toBeVisible();
      const poNumber = (await purchaseOrder.documentNumber.textContent()) ?? "";
      const poUrl = page.url();

      const pdfRequest = page
        .context()
        .waitForEvent("request", (request) =>
          /\/pdf(\?|$)/.test(request.url()),
        );
      await purchaseOrder.button("Download PDF").click();
      const pdfUrl = (await pdfRequest).url();
      expect(pdfUrl).toMatch(/\/purchase-orders\/[0-9a-f-]+\/pdf/);
      const pdf = await page.request.get(pdfUrl);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
      expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

      const receipt = new GoodsReceiptPage(page, project.id);
      await receipt.goto();
      await receipt.choosePurchaseOrder(
        new RegExp(poNumber.replaceAll("/", "\\/")),
      );
      await receipt.receivedNow(material.name).fill("120");
      await receipt.saveButton.click();
      await expect(receipt.documentNumber).toBeVisible();

      await page.goto(poUrl);
      await expect(
        purchaseOrder.main.getByRole("row").filter({ hasText: material.name }),
      ).toContainText("120");
      await expect(purchaseOrder.main).toContainText("Goods Receipts");
      await expect(
        purchaseOrder.main.getByRole("link", { name: /^GRN\// }),
      ).toBeVisible();
    },
  );
});
