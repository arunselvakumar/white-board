import { expect } from "@playwright/test";

import { addDays, todayInIndia } from "../api/dates";
import { createMaterial, createSupplier } from "../api/masters";
import { createBillingAddress } from "../api/organization";
import { projectTest } from "../helpers/projectTest";
import { GoodsReceiptPage } from "../pages/GoodsReceiptPage";
import { InventoryPage } from "../pages/InventoryPage";
import { PurchaseOrderPage } from "../pages/PurchaseOrderPage";
import { PurchaseRequestPage } from "../pages/PurchaseRequestPage";

projectTest.describe("Procurement", () => {
  projectTest(
    "should put the received quantity in stock, when a Purchase Request becomes a Purchase Order and its goods are received",
    { tag: ["@pr"] },
    async ({ owner, project, page }) => {
      const material = await createMaterial(owner.api, {
        rateRupees: 400,
        gstRate: "18",
      });
      const supplier = await createSupplier(owner.api, {
        projectIds: [project.id],
      });
      await createBillingAddress(owner.api);

      const purchaseRequest = new PurchaseRequestPage(page, project.id);
      await purchaseRequest.goto();
      await purchaseRequest.create({
        material: material.name,
        quantity: "100",
        requiredDate: addDays(todayInIndia(), 7),
      });
      await expect(purchaseRequest.documentNumber).toBeVisible();
      await expect(purchaseRequest.main).toContainText("Approved");

      await purchaseRequest.button("Generate PO").click();
      const purchaseOrder = new PurchaseOrderPage(page, project.id);
      await purchaseOrder.fillHeader({
        supplier: supplier.name,
        expectedDelivery: addDays(todayInIndia(), 5),
      });
      // 100 bags × ₹400 = ₹40,000 + 18% GST (CGST + SGST in Tamil Nadu).
      await expect(purchaseOrder.grandTotal).toHaveText("₹47,200.00");
      await expect(purchaseOrder.main.getByText("CGST").first()).toBeVisible();
      await purchaseOrder.saveAndApproveButton.click();
      await expect(purchaseOrder.documentNumber).toBeVisible();
      const poNumber = (await purchaseOrder.documentNumber.textContent()) ?? "";

      const receipt = new GoodsReceiptPage(page, project.id);
      await receipt.goto();
      await receipt.choosePurchaseOrder(
        new RegExp(poNumber.replaceAll("/", "\\/")),
      );
      await receipt.receivedNow(material.name).fill("60");
      await receipt.invoiceNoField.fill("SBT/2026/118");
      await receipt.saveButton.click();
      await expect(receipt.documentNumber).toBeVisible();

      const inventory = new InventoryPage(page, project.id);
      await inventory.goto();
      await expect(inventory.row(material.name)).toContainText("60");
    },
  );
});
