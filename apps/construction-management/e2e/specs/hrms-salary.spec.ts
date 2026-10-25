import { readFile } from "node:fs/promises";

import { expect } from "@playwright/test";

import { configureSalary, createSalaryStructure } from "../api/hrms";
import { companyTest } from "../helpers/companyTest";
import { HrmsPage } from "../pages/HrmsPage";
import { TeamSalaryPage } from "../pages/TeamSalaryPage";

companyTest.describe("HRMS salary", () => {
  companyTest(
    "should give the member a payslip PDF, when the Owner calculates, approves and pays last month's salary",
    async ({ owner, newMember, page }) => {
      const member = await newMember({
        roleName: "HRMS Staff",
        memberType: "hrms",
      });
      const structure = await createSalaryStructure(owner.api);
      await configureSalary(owner.api, {
        structureId: structure.id,
        memberIds: [member.id],
        baseRupees: 30_000,
      });

      const teamSalary = new TeamSalaryPage(page);
      await teamSalary.goto();
      await teamSalary.calculateButton.click();
      await expect(teamSalary.slip(member.name)).toBeVisible();
      await expect(teamSalary.slip(member.name)).toHaveAccessibleName(
        /calculated/i,
      );

      await teamSalary.approve(member.name);
      await expect(teamSalary.slip(member.name)).toHaveAccessibleName(
        /approved/i,
      );
      await teamSalary.markPaid(member.name);
      await expect(teamSalary.slip(member.name)).toHaveAccessibleName(/paid/i);

      const memberPage = await member.page();
      const mySalary = new HrmsPage(memberPage, "/salary/my");
      await mySalary.goto();
      const download = memberPage.waitForEvent("download");
      await mySalary.main
        .getByRole("link", { name: /^Download payslip for / })
        .click();
      const payslip = await download;
      expect(payslip.suggestedFilename()).toMatch(/\.pdf$/);
      const bytes = await readFile(await payslip.path());
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    },
  );
});
