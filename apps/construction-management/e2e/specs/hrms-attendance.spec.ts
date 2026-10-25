import { expect } from "@playwright/test";

import { createOfficeBranch, setGpsRequirement } from "../api/hrms";
import { companyTest } from "../helpers/companyTest";
import { HrmsPage } from "../pages/HrmsPage";
import { MyAttendancePage } from "../pages/MyAttendancePage";

/** Chennai Central, where the test member "stands". */
const CHENNAI = { latitude: 13.0827, longitude: 80.2707 };
/** Coimbatore, about 400 km away: outside a Chennai fence. */
const COIMBATORE = { latitude: 11.0168, longitude: 76.9558 };

companyTest.describe("HRMS attendance", () => {
  companyTest(
    "should show the member as in today, when they check in from their phone",
    { tag: ["@pr", "@mobile"] },
    async ({ newMember, page }) => {
      const member = await newMember({
        roleName: "HRMS Staff",
        memberType: "hrms",
      });
      const memberPage = await member.page({
        geolocation: CHENNAI,
        permissions: ["geolocation"],
      });
      const myAttendance = new MyAttendancePage(memberPage);
      await myAttendance.goto();
      await myAttendance.checkInButton.click();
      await expect(myAttendance.checkOutButton).toBeVisible();
      await expect(myAttendance.today).not.toContainText(
        "No check-ins today yet.",
      );

      const team = new HrmsPage(page, "/attendance/team");
      await team.goto();
      await expect(team.main.getByText(member.name)).toBeVisible();
      await expect(
        team.main.getByRole("listitem").filter({ hasText: member.name }),
      ).toContainText("Checked in");
    },
  );

  companyTest(
    "should send the check-in to Approvals as Outside Fence, when a member checks in far from their branch",
    async ({ owner, newMember, page }) => {
      const member = await newMember({
        roleName: "HRMS Staff",
        memberType: "hrms",
      });
      await setGpsRequirement(owner.api, "record_only");
      await createOfficeBranch(owner.api, {
        name: "Chennai Office",
        ...CHENNAI,
        radiusMetres: 200,
        memberIds: [member.id],
      });

      const memberPage = await member.page({
        geolocation: COIMBATORE,
        permissions: ["geolocation"],
      });
      const myAttendance = new MyAttendancePage(memberPage);
      await myAttendance.goto();
      await myAttendance.checkInButton.click();
      await expect(
        myAttendance.main.getByText(/Outside Fence/i).first(),
      ).toBeVisible();

      const approvals = new HrmsPage(page, "/attendance/approvals");
      await approvals.goto();
      const request = approvals.main
        .getByRole("listitem")
        .filter({ hasText: member.name });
      await expect(request).toContainText(/Outside Fence/i);
    },
  );
});
