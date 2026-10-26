import ExcelJS from "exceljs";
import { expect } from "@playwright/test";

import { createLabour, todayInIndia } from "../api/labour";
import { createProject } from "../api/projects";
import { unique } from "../api/session";
import { laboursPageTest } from "../helpers/laboursPageTest";
import { LabourAttendancePage } from "../pages/LabourAttendancePage";
import { LaboursPage } from "../pages/LaboursPage";

laboursPageTest.describe("Labour records", () => {
  laboursPageTest(
    "should move the Labour and keep the history, when the Owner transfers them to another Project",
    async ({ laboursPage, owner, project }) => {
      const other = await createProject(owner.api, {
        name: unique("Kaveri Nagar"),
      });
      const labour = await createLabour(owner.api, { projectId: project.id });

      await laboursPage.goto();
      await laboursPage.rowAction(labour.name, "Transfer");
      await laboursPage.choose("To Project", other.name);
      await laboursPage.dialog.getByLabel("Transfer date").fill(todayInIndia());
      await laboursPage.dialog
        .getByRole("button", { name: "Transfer" })
        .click();
      await expect(laboursPage.dialog).toHaveCount(0);
      await expect(laboursPage.row(labour.name)).toContainText(other.name);

      await laboursPage.rowAction(labour.name, "Transfer history");
      await expect(laboursPage.dialog).toContainText(project.name);
      await expect(laboursPage.dialog).toContainText(other.name);
    },
  );

  laboursPageTest(
    "should add every row, when the Owner imports Labours from the filled-in sample sheet",
    async ({ laboursPage, project, page }) => {
      const names = [unique("Murugan S"), unique("Selvi R")];

      await laboursPage.goto();
      await laboursPage.importButton.click();
      const download = page.waitForEvent("download");
      await laboursPage.dialog
        .getByRole("link", { name: "Download sample sheet" })
        .click();
      const sample = await (await download).path();

      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(sample);
      const sheet = book.worksheets[0];
      if (sheet == null) throw new Error("The sample has no sheet");
      const headers = (sheet.getRow(1).values as unknown[]).map(String);
      const column = (header: string) => headers.indexOf(header);
      for (const [index, name] of names.entries()) {
        const row = sheet.getRow(index + 2);
        row.values = [];
        row.getCell(column("Labour Name*")).value = name;
        row.getCell(column("Joining Date*")).value = todayInIndia(-5);
        row.getCell(column("Wage Type*")).value = "Daily";
        row.getCell(column("Wage per Day (₹)")).value = 750;
        row.getCell(column("Overtime Wage per Hour (₹)*")).value = 90;
        row.getCell(column("Projects")).value = project.name;
        row.commit();
      }
      const filled = Buffer.from(await book.xlsx.writeBuffer());

      await laboursPage.dialog.getByLabel("Choose Excel file").setInputFiles({
        name: "labours.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: filled,
      });
      await expect(
        laboursPage.dialog.getByRole("table", { name: "Import preview" }),
      ).toContainText(names[0] ?? "");
      await laboursPage.dialog
        .getByRole("button", { name: "Import 2 Labours" })
        .click();
      await expect(laboursPage.status("Imported 2 Labours.")).toBeVisible();
      await laboursPage.dialog.getByRole("button", { name: "Done" }).click();

      for (const name of names)
        await expect(laboursPage.row(name)).toContainText("₹750.00 / day");
    },
  );

  laboursPageTest(
    "should leave an inactive Labour off the attendance sheet, when the Owner deactivates them",
    async ({ owner, project, page }) => {
      const labour = await createLabour(owner.api, { projectId: project.id });
      const attendance = new LabourAttendancePage(page, project.id);
      await attendance.goto();
      await expect(
        attendance.statusButton(labour.name, "Present"),
      ).toBeVisible();

      const labours = new LaboursPage(page);
      await labours.goto();
      await labours.rowAction(labour.name, "Deactivate");
      await page
        .getByRole("alertdialog", { name: `Deactivate ${labour.name}?` })
        .getByRole("button", { name: "Deactivate" })
        .click();
      await expect(labours.row(labour.name)).toContainText("Inactive");

      await attendance.goto();
      await expect(attendance.statusButton(labour.name, "Present")).toHaveCount(
        0,
      );
    },
  );
});
