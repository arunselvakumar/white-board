import { expect } from "@playwright/test";

import { FIXTURES, PROGRAM_FILE } from "../fixtures";
import { drawingsPageTest } from "../helpers/drawingsPageTest";
import { DocumentsPage } from "../pages/DocumentsPage";
import { GalleryPage } from "../pages/GalleryPage";
import { TestingReportsPage } from "../pages/TestingReportsPage";

drawingsPageTest.describe("Project files", () => {
  drawingsPageTest(
    "should show the drawing in its album and in the Gallery, when the Owner uploads a drawing",
    { tag: ["@pr"] },
    async ({ drawingsPage, project, page }) => {
      await drawingsPage.goto();
      await drawingsPage.album("Architect").click();
      await drawingsPage.uploadDrawing(
        FIXTURES.drawingPdf,
        "Ground floor plan",
      );
      await expect(drawingsPage.uploadDialog).toHaveCount(0);
      await expect(
        drawingsPage.main.getByText("Ground floor plan").first(),
      ).toBeVisible();

      const galleryPage = new GalleryPage(page, project.id);
      await galleryPage.goto();
      await expect(galleryPage.file("drawing.pdf")).toContainText("Drawing");
    },
  );

  drawingsPageTest(
    "should keep a PDF and refuse a program, when the Owner uploads Project documents",
    { tag: ["@pr"] },
    async ({ project, page }) => {
      const documentsPage = new DocumentsPage(page, project.id);
      await documentsPage.goto();
      await documentsPage.uploadFiles([FIXTURES.drawingPdf]);
      await expect(documentsPage.upload_("drawing.pdf")).toContainText("Done");
      await documentsPage.uploadDialog
        .getByLabel("Files to upload")
        .setInputFiles(PROGRAM_FILE);
      await expect(documentsPage.upload_("setup.exe")).not.toContainText(
        "Done",
      );
      await expect(
        documentsPage
          .upload_("setup.exe")
          .getByRole("button", { name: "Dismiss setup.exe" }),
      ).toBeVisible();
      await documentsPage.doneButton.click();

      await page.reload();
      await expect(documentsPage.document("drawing.pdf")).toBeVisible();
      await expect(documentsPage.main.getByText("setup.exe")).toHaveCount(0);
    },
  );

  drawingsPageTest(
    "should list the report under its material, when the Owner uploads a testing report",
    async ({ project, page }) => {
      const testingReportsPage = new TestingReportsPage(page, project.id);
      await testingReportsPage.goto();
      await testingReportsPage.material("Cement").click();
      await testingReportsPage.button("Add report").click();
      const sheet = testingReportsPage.dialog;
      await sheet
        .getByRole("textbox", { name: "Name" })
        .fill("Cube test – pour 12");
      await sheet.getByLabel("Report date").fill("2026-10-20");
      await sheet.getByLabel("Report file").setInputFiles(FIXTURES.drawingPdf);
      await sheet.getByRole("button", { name: "Add report" }).click();
      await expect(sheet).toHaveCount(0);
      await expect(
        testingReportsPage.main.getByText("Cube test – pour 12"),
      ).toBeVisible();
      await expect(testingReportsPage.main.getByText("1 report")).toBeVisible();
    },
  );
});
