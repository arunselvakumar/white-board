import { expect } from "@playwright/test";

import {
  createFollowUp,
  createProspectCompany,
  createVisit,
} from "../api/marketing";
import { companyTest } from "../helpers/companyTest";
import { VisitsPage } from "../pages/VisitsPage";

/** A date in India, where the test Companies are: `YYYY-MM-DD`. */
function indiaDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
  );
}

companyTest.describe("Follow-ups", () => {
  companyTest(
    "should group a member's Follow-ups as Overdue and Today, and offer to log the visit once a Visit Follow-up is done, when a member on the Marketing Role works through them",
    async ({ newMember }) => {
      const member = await newMember({ roleName: "Marketing" });
      const company = await createProspectCompany(member.api, {
        primaryContact: { name: "Lakshmi Narayanan", mobile: "9840012345" },
      });
      await createFollowUp(member.api, {
        prospectCompanyId: company.id,
        dueDate: indiaDate(-2),
        note: "Call about the drawings",
      });
      await createFollowUp(member.api, {
        prospectCompanyId: company.id,
        dueDate: indiaDate(),
        type: "visit",
        note: "Walk the Sulur plant",
      });
      const page = await member.page();
      const visits = new VisitsPage(page);

      await page.goto("/app/marketing/follow-ups");
      const overdue = page.getByRole("list", { name: "Overdue" });
      const today = page.getByRole("list", { name: "Today" });
      await expect(overdue).toContainText("Call about the drawings");
      await expect(today).toContainText("Walk the Sulur plant");

      await today.getByRole("button", { name: "Done" }).click();
      await visits.dialog.getByLabel("Result").fill("Saw the site");
      await visits.clickAndWaitFor(
        visits.dialog.getByRole("button", { name: "Mark done" }),
        /\/done$/,
      );
      await visits.dialog.getByRole("link", { name: "Log the visit" }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/app/marketing/visits/new\\?.*prospectCompanyId=${company.id}`,
        ),
      );
      await expect(visits.heading("Log Visit", { level: 1 })).toBeVisible();
    },
  );

  companyTest(
    "should save a Next Follow-up with a Visit as it is completed, when a member on the Marketing Role finishes a Visit",
    async ({ newMember }) => {
      const member = await newMember({ roleName: "Marketing" });
      const company = await createProspectCompany(member.api, {
        primaryContact: { name: "Lakshmi Narayanan", mobile: "9840012345" },
      });
      const visit = await createVisit(member.api, {
        prospectCompanyId: company.id,
        visitAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const page = await member.page();
      const visits = new VisitsPage(page);

      await page.goto(`${visits.url}/${visit.id}/complete`);
      await visits.choose("Points of contact", "Lakshmi Narayanan");
      await visits.field("Discussion").fill("They want rates for a 40 m shed.");
      await visits.button("Add Next Follow-up").click();
      // "Type", not the requirement's "Type of work".
      await page.getByRole("combobox", { name: "Type", exact: true }).click();
      await page.getByRole("option", { name: "Send quotation" }).click();
      await visits.field("Due date").fill(indiaDate(3));
      await visits.clickAndWaitFor(
        visits.button("Complete Visit"),
        /\/complete$/,
      );

      const followUps = page.getByRole("region", { name: "Follow-ups" });
      await expect(followUps).toContainText("Send quotation");
    },
  );
});
