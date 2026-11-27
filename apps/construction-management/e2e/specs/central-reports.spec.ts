import { expect } from "@playwright/test";

import {
  createEmployee,
  markEmployeeAttendance,
  todayInIndia,
} from "../api/labour";
import { projectTest } from "../helpers/projectTest";

projectTest.describe("Central Reports", () => {
  projectTest(
    "should put a ready Excel workbook in Downloads, when the Owner generates Central Employee Attendance",
    async ({ owner, project, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
      });
      await markEmployeeAttendance(owner.api, {
        projectId: project.id,
        date: todayInIndia(),
        employeeIds: [employee.id],
      });

      await page.goto("/app/workspace/central-reports");
      const form = page.getByRole("form", {
        name: "Central Employee Attendance",
      });
      await form.getByRole("button", { name: "Generate" }).click();

      await page.goto("/app/downloads");
      const row = page
        .getByRole("main")
        .getByRole("listitem")
        .filter({ hasText: "Central Employee Attendance" })
        .first();
      await expect(async () => {
        await page.reload();
        await expect(row).toContainText("Ready", { timeout: 2_000 });
      }).toPass({ timeout: 45_000 });

      const excel = row.getByRole("link", { name: /Excel|XLSX/i }).first();
      const href = (await excel.getAttribute("href")) ?? "";
      const file = await page.request.get(href);
      expect(file.ok()).toBe(true);
      // An .xlsx is a ZIP archive.
      expect((await file.body()).subarray(0, 2).toString()).toBe("PK");
    },
  );
});
