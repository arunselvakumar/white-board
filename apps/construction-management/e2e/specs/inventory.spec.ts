import { expect } from "@playwright/test";

import { createMaterial, createSupplier } from "../api/masters";
import { receiveGoods } from "../api/procurement";
import { createProject } from "../api/projects";
import { unique } from "../api/session";
import { projectTest } from "../helpers/projectTest";
import { GoodsReceiptPage } from "../pages/GoodsReceiptPage";
import { InventoryPage } from "../pages/InventoryPage";
import { TransfersPage } from "../pages/TransfersPage";

projectTest.describe("Inventory", () => {
  projectTest(
    "should take the quantity out of stock, when the Owner records material consumed",
    async ({ owner, project, page }) => {
      const material = await createMaterial(owner.api);
      const supplier = await createSupplier(owner.api, {
        projectIds: [project.id],
      });
      await receiveGoods(owner.api, {
        projectId: project.id,
        supplierId: supplier.id,
        materialId: material.id,
        quantity: "100",
      });

      const inventory = new InventoryPage(page, project.id);
      await inventory.goto();
      await expect(inventory.row(material.name)).toContainText("100");
      await inventory.button("Consume").click();
      const dialog = page.getByRole("dialog", { name: "Consume Material" });
      await dialog.getByRole("combobox", { name: "Material" }).click();
      await page
        .getByRole("option", { name: new RegExp(`^${material.name}`) })
        .click();
      await expect(dialog.getByText("In stock: 100 Bag")).toBeVisible();
      await dialog.getByLabel("Quantity").fill("30");
      await dialog.getByLabel("Remarks").fill("Plastering, 3rd floor");
      await dialog.getByRole("button", { name: "Save consumption" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(inventory.row(material.name)).toContainText("70");
    },
  );

  projectTest(
    "should put the goods in stock, when the Owner records a Goods Receipt without a Purchase Order",
    async ({ owner, project, page }) => {
      const material = await createMaterial(owner.api, { unit: "Bag" });
      const supplier = await createSupplier(owner.api, {
        projectIds: [project.id],
      });

      const receipt = new GoodsReceiptPage(page, project.id);
      await receipt.goto();
      await receipt.choose("Supplier", supplier.name);
      await receipt.button("Add material").click();
      await page.getByRole("combobox", { name: "Material, line 1" }).click();
      await page
        .getByRole("option", { name: new RegExp(`^${material.name}`) })
        .click();
      await receipt.field("Quantity (Bag)").fill("25");
      await receipt.saveButton.click();
      await expect(receipt.documentNumber).toBeVisible();

      const inventory = new InventoryPage(page, project.id);
      await inventory.goto();
      await expect(inventory.row(material.name)).toContainText("25");
    },
  );

  projectTest(
    "should move stock to the other Project, when a Material Transfer is approved and delivered",
    async ({ owner, project, page }) => {
      const other = await createProject(owner.api, {
        name: unique("Kaveri Nagar"),
      });
      const material = await createMaterial(owner.api);
      const supplier = await createSupplier(owner.api, {
        projectIds: [project.id],
      });
      await receiveGoods(owner.api, {
        projectId: project.id,
        supplierId: supplier.id,
        materialId: material.id,
        quantity: "80",
      });

      const transfers = new TransfersPage(page, project.id);
      await transfers.goto();
      const form = page.getByRole("form", { name: "New Material Transfer" });
      await form.getByRole("combobox", { name: "Material" }).click();
      await page
        .getByRole("option", { name: new RegExp(`^${material.name}`) })
        .click();
      await form.getByRole("combobox", { name: "To" }).click();
      await page.getByRole("option", { name: other.name }).click();
      await form.getByLabel(/^Quantity/).fill("30");
      await form.getByLabel("Receiver Name").fill("Murugan");
      await form.getByRole("button", { name: "Save & Approve" }).click();

      await transfers.button("Mark as Delivered").first().click();
      const deliver = page.getByRole("dialog", { name: "Mark as Delivered" });
      await deliver.getByRole("button", { name: "Mark as Delivered" }).click();
      await expect(deliver).toHaveCount(0);

      const from = new InventoryPage(page, project.id);
      await from.goto();
      await expect(from.row(material.name)).toContainText("50");
      const to = new InventoryPage(page, other.id);
      await to.goto();
      await expect(to.row(material.name)).toContainText("30");
    },
  );
});
