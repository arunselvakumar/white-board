import { expect } from "@playwright/test";

import {
  createLabour,
  markLabourAttendance,
  todayInIndia,
} from "../api/labour";
import { projectTest } from "../helpers/projectTest";
import { BankAccountsPage } from "../pages/BankAccountsPage";
import { TransactionsPage } from "../pages/TransactionsPage";
import { WagesPage } from "../pages/WagesPage";

const CASH = "Company's Cash Account";
const BANK = "Company's Bank Account";

projectTest.describe("Finance accounts", () => {
  projectTest(
    "should move money between the Company's accounts, when the Owner records a Transfer",
    async ({ project, page }) => {
      const transactions = new TransactionsPage(page, project.id);
      await transactions.goto();
      await transactions.record({
        direction: "Payment In",
        amount: "30000",
        account: CASH,
      });

      await transactions.button("Transfer").click();
      const dialog = page.getByRole("dialog", { name: "Transfer" });
      await transactions.choose("From account", new RegExp(`^${CASH}`));
      await transactions.choose("To account", new RegExp(`^${BANK}`));
      await dialog.getByLabel("Amount").fill("8000");
      await dialog.getByRole("button", { name: /^Save/ }).last().click();
      await expect(dialog).toHaveCount(0);

      const accounts = new BankAccountsPage(page);
      await accounts.goto();
      await expect(accounts.account(CASH)).toContainText("₹22,000.00");
      await expect(accounts.account(BANK)).toContainText("₹8,000.00");
    },
  );

  projectTest(
    "should take a Labour's wage out of the cash account, when the Owner pays them in cash",
    async ({ owner, project, page }) => {
      const transactions = new TransactionsPage(page, project.id);
      await transactions.goto();
      await transactions.record({
        direction: "Payment In",
        amount: "5000",
        account: CASH,
      });
      const labour = await createLabour(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 800,
      });
      await markLabourAttendance(owner.api, {
        projectId: project.id,
        date: todayInIndia(),
        labourIds: [labour.id],
      });

      const wages = new WagesPage(page, project.id);
      await wages.goto();
      await wages.pay(labour.name, { amount: "800" });

      const accounts = new BankAccountsPage(page);
      await accounts.goto();
      await expect(accounts.account(CASH)).toContainText("₹4,200.00");
    },
  );

  projectTest(
    "should list an approved Other Expense under its category, when the Owner records one",
    async ({ project, page }) => {
      await page.goto(
        `/app/projects/${project.id}/payments/other-expenses/new`,
      );
      const form = new TransactionsPage(page, project.id);
      await form.choose("Payment Category", "Fuel");
      await page.getByLabel("Paid to").fill("Indian Oil, Avinashi Road");
      await page.getByLabel("Amount").fill("3500");
      await form.button("Save & Approve").click();
      await expect(page).not.toHaveURL(/\/new$/);

      await page.goto(`/app/projects/${project.id}/payments/other-expenses`);
      const row = page.getByRole("main").getByText("Indian Oil, Avinashi Road");
      await expect(row.first()).toBeVisible();
      await expect(page.getByRole("main")).toContainText("₹3,500.00");
    },
  );
});
