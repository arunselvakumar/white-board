import { expect } from "@playwright/test";

import { todayInIndia } from "../api/dates";
import { createProspectCompany, createVisit } from "../api/marketing";
import { FIXTURES } from "../fixtures";
import { companyTest } from "../helpers/companyTest";
import { ProspectCompaniesPage } from "../pages/ProspectCompaniesPage";
import { VisitsPage } from "../pages/VisitsPage";

companyTest.describe("Visits", () => {
  companyTest(
    "should plan a Visit, complete it with the person met, add a note and move the company to Contacted, when a member on the Marketing Role visits",
    { tag: ["@pr", "@mobile"] },
    async ({ newMember }) => {
      const member = await newMember({ roleName: "Marketing" });
      const company = await createProspectCompany(member.api, {
        primaryContact: { name: "Lakshmi Narayanan", mobile: "9840012345" },
      });
      const page = await member.page();
      const visits = new VisitsPage(page);

      await visits.gotoPlan(company.id);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await visits
        .field("Visit date")
        .fill(tomorrow.toISOString().slice(0, 10));
      await visits.field("Visit time").fill("10:00");
      await visits.clickAndWaitFor(
        visits.button("Save"),
        "/api/construction/marketing/visits",
      );
      await expect(visits.heading(/^MV-\d{4}/, { level: 1 })).toBeVisible();
      await expect(visits.main).toContainText("Planned");

      await visits.link("Complete").click();
      await visits.choose("Points of contact", "Lakshmi Narayanan");
      await visits
        .field("Discussion")
        .fill("Needs a 40 m PEB shed at Sulur; drawings next week.");
      // A planned Visit is tomorrow; the form starts a completion at now.
      await visits.clickAndWaitFor(
        visits.button("Complete Visit"),
        /\/complete$/,
      );
      await expect(visits.main).toContainText("Completed");
      await expect(visits.main).toContainText("Lakshmi Narayanan");

      await visits
        .field("Add note")
        .fill("Called back; they want a site visit.");
      await visits.clickAndWaitFor(visits.button("Add note"), /\/notes$/);
      await expect(visits.notes).toContainText(
        "Called back; they want a site visit.",
      );

      const companies = new ProspectCompaniesPage(page);
      await page.goto(`${companies.url}/${company.id}`);
      await expect(companies.main).toContainText("Contacted");
      await expect(companies.history).toContainText("Moved to Contacted");
    },
  );

  companyTest(
    "should show a past planned Visit as Missed and list only a member's own Visits, when the Role has no View all",
    async ({ newMember }) => {
      const ravi = await newMember({ roleName: "Marketing" });
      const priya = await newMember({ roleName: "Marketing" });
      const ravis = await createProspectCompany(ravi.api);
      const priyas = await createProspectCompany(priya.api);
      const missed = await createVisit(ravi.api, {
        prospectCompanyId: ravis.id,
        visitAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      const hidden = await createVisit(priya.api, {
        prospectCompanyId: priyas.id,
      });
      const visits = new VisitsPage(await ravi.page());

      await visits.goto();
      await expect(visits.list).toContainText(missed.number);
      await expect(visits.list).toContainText("Missed");
      await expect(visits.list).not.toContainText(hidden.number);

      await visits.currentPage.goto(`${visits.url}/${hidden.id}`);
      await expect(
        visits.main.getByText("This Visit was not found"),
      ).toBeVisible();
    },
  );

  companyTest(
    "should reschedule a planned Visit keeping the old time, then cancel it with a reason, when the Owner changes plans",
    async ({ owner, page }) => {
      const company = await createProspectCompany(owner.api);
      // Tomorrow at 10:00 am in the Company's zone; moved a day, same time.
      const oldAt = new Date(`${todayInIndia(1)}T10:00:00+05:30`);
      const newDate = todayInIndia(2);
      const newAt = new Date(`${newDate}T10:00:00+05:30`);
      const visit = await createVisit(owner.api, {
        prospectCompanyId: company.id,
        visitAt: oldAt,
      });
      const visits = new VisitsPage(page);

      await page.goto(`${visits.url}/${visit.id}`);
      await visits.action("Reschedule");
      await visits.dialog.getByLabel("New date").fill(newDate);
      await visits.clickAndWaitFor(
        visits.dialog.getByRole("button", { name: "Reschedule" }),
        /\/reschedule$/,
      );
      // Formatted in the browser, as the History line formats them.
      const [oldShown, newShown] = await page.evaluate(
        (instants) =>
          instants.map((at) =>
            new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(at)),
          ),
        [oldAt.toISOString(), newAt.toISOString()],
      );
      await expect(visits.history).toContainText(
        `Rescheduled from ${String(oldShown)} to ${String(newShown)}`,
      );

      await visits.action("Cancel Visit");
      await visits.dialog.getByLabel("Reason").fill("Plant head on leave");
      await visits.clickAndWaitFor(
        visits.dialog.getByRole("button", { name: "Cancel Visit" }),
        /\/cancel$/,
      );
      await expect(visits.main).toContainText("Cancelled");
      await expect(visits.history).toContainText("Plant head on leave");
    },
  );

  companyTest(
    "should add a site photo and a PDF to a Visit and open the photo, when a member on the Marketing Role logs what they saw",
    async ({ newMember }) => {
      const member = await newMember({ roleName: "Marketing" });
      const company = await createProspectCompany(member.api);
      const visit = await createVisit(member.api, {
        prospectCompanyId: company.id,
      });
      const page = await member.page();
      const visits = new VisitsPage(page);

      await page.goto(`${visits.url}/${visit.id}`);
      const done = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/files") &&
          response.ok(),
      );
      await visits.upload("Choose photos or files", [
        FIXTURES.sitePhoto,
        FIXTURES.drawingPdf,
      ]);
      await done;
      const files = visits.main.getByRole("list", { name: "Photos and files" });
      await expect(files.getByRole("link", { name: /^Open / })).toHaveCount(2);
      await expect(files).toContainText("site-photo.jpg");
      await expect(visits.history).toContainText("Photo added");

      await files.getByRole("link", { name: "Open site-photo.jpg" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  );
});
