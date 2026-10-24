import { expect } from "@playwright/test";

import { createMaterial, createSupplier } from "../api/masters";
import { receiveGoods } from "../api/procurement";
import { projectTest } from "../helpers/projectTest";
import { BankAccountsPage } from "../pages/BankAccountsPage";
import { PartyPaymentsPage } from "../pages/PartyPaymentsPage";
import { TransactionsPage } from "../pages/TransactionsPage";

const CASH = "Company's Cash Account";

projectTest.describe("Finance", () => {
  projectTest(
    "should move the account balance, when the Owner records money in and money out",
    { tag: ["@pr"] },
    async ({ project, page }) => {
      const transactions = new TransactionsPage(page, project.id);
      await transactions.goto();
      await transactions.record({
        direction: "Payment In",
        amount: "50000",
        account: CASH,
        description: "Owner's capital",
      });
      await transactions.record({
        direction: "Payment Out",
        amount: "12000",
        account: CASH,
        description: "JCB hire",
      });

      const accounts = new BankAccountsPage(page);
      await accounts.goto();
      await expect(accounts.account(CASH)).toContainText("₹38,000.00");
    },
  );

  projectTest(
    "should bill the Supplier for a Goods Receipt and clear it, when the Owner pays the bill",
    { tag: ["@pr"] },
    async ({ owner, project, page }) => {
      const material = await createMaterial(owner.api, {
        rateRupees: 400,
        gstRate: "18",
      });
      const supplier = await createSupplier(owner.api, {
        projectIds: [project.id],
      });
      await receiveGoods(owner.api, {
        projectId: project.id,
        supplierId: supplier.id,
        materialId: material.id,
        quantity: "100",
        invoiceNo: "SBT/2026/301",
      });

      const suppliers = new PartyPaymentsPage(page, project.id, "suppliers");
      await suppliers.goto();
      // 100 bags × ₹400 + 18% GST, billed from the Goods Receipt (CM-705).
      await expect(
        await suppliers.amount(supplier.name, "Invoiced"),
      ).toHaveText("₹47,200.00");
      await expect(await suppliers.amount(supplier.name, "Balance")).toHaveText(
        "₹47,200.00",
      );

      await suppliers.pay({
        party: supplier.name,
        label: "Supplier",
        amount: "47200",
      });
      await suppliers.goto();
      await expect(await suppliers.amount(supplier.name, "Paid")).toHaveText(
        "₹47,200.00",
      );
      await expect(await suppliers.amount(supplier.name, "Balance")).toHaveText(
        "₹0.00",
      );
    },
  );
});
