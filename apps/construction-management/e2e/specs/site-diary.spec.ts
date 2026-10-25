import { expect } from "@playwright/test";

import { FIXTURES } from "../fixtures";
import { projectTest } from "../helpers/projectTest";
import { GalleryPage } from "../pages/GalleryPage";
import { ProgressReportsPage } from "../pages/ProgressReportsPage";
import { SiteDiaryPage } from "../pages/SiteDiaryPage";

projectTest.describe("Site Diary and Progress Reports", () => {
  projectTest(
    "should make a Daily Progress Report PDF with the day's diary, when the Owner writes the diary and generates the report",
    { tag: ["@pr", "@mobile"] },
    async ({ owner, project, page }) => {
      const siteDiary = new SiteDiaryPage(page, project.id);
      await siteDiary.goto();
      await siteDiary.write({
        notes: "Slab shuttering for the 2nd floor finished; concrete tomorrow.",
        weather: "Sunny",
        photo: FIXTURES.sitePhoto,
      });
      await expect(page).not.toHaveURL(siteDiary.url);

      const gallery = new GalleryPage(page, project.id);
      await gallery.goto();
      await expect(gallery.file("site-photo.jpg")).toBeVisible();

      const reports = new ProgressReportsPage(page, project.id);
      await reports.goto();
      await reports.createDailyReport({
        filledBy: owner.name,
        withImages: true,
      });
      // The report is made by the job queue after the response (`after()`).
      await expect(async () => {
        await page.reload();
        await expect(reports.reports).toContainText("Ready", {
          timeout: 2_000,
        });
      }).toPass({ timeout: 45_000 });

      const href = (await reports.downloadLink.getAttribute("href")) ?? "";
      const pdf = await page.request.get(href);
      expect(pdf.ok()).toBe(true);
      expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    },
  );
});
