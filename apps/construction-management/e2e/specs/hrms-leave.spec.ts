import { expect } from "@playwright/test";

import { addDays, nextMonday } from "../api/dates";
import { creditLeave } from "../api/hrms";
import { companyTest } from "../helpers/companyTest";
import { LeaveApprovalsPage } from "../pages/LeaveApprovalsPage";
import { MyLeavesPage } from "../pages/MyLeavesPage";

companyTest.describe("HRMS leave", () => {
  companyTest(
    "should take the days off the balance, when a member applies for leave and the Owner approves it",
    { tag: ["@pr"] },
    async ({ owner, newMember, page }) => {
      const member = await newMember({
        roleName: "HRMS Staff",
        memberType: "hrms",
      });
      await creditLeave(owner.api, {
        memberId: member.id,
        leaveType: "Casual Leave",
        days: 5,
      });
      const from = nextMonday();

      const memberPage = await member.page();
      const myLeaves = new MyLeavesPage(memberPage);
      await myLeaves.goto();
      await expect(myLeaves.balance("Casual Leave")).toBeVisible();
      const before = await myLeaves.available("Casual Leave");
      await myLeaves.apply({
        leaveType: "Casual Leave",
        from,
        to: addDays(from, 1),
        reason: "Sister's wedding in Madurai",
      });
      await expect(myLeaves.requests).toContainText("Pending");

      const approvals = new LeaveApprovalsPage(page);
      await approvals.goto();
      await approvals.decide(member.name, "Approve");
      await expect(approvals.request(member.name)).toHaveCount(0);

      await myLeaves.goto();
      await expect(myLeaves.requests).toContainText("Approved");
      await expect
        .poll(() => myLeaves.available("Casual Leave"))
        .toBe(before - 2);
    },
  );

  companyTest(
    "should leave the balance as it was, when the Owner rejects a leave request",
    async ({ owner, newMember, page }) => {
      const member = await newMember({
        roleName: "HRMS Staff",
        memberType: "hrms",
      });
      await creditLeave(owner.api, {
        memberId: member.id,
        leaveType: "Casual Leave",
        days: 4,
      });
      const from = nextMonday(2);

      const memberPage = await member.page();
      const myLeaves = new MyLeavesPage(memberPage);
      await myLeaves.goto();
      await expect(myLeaves.balance("Casual Leave")).toBeVisible();
      const before = await myLeaves.available("Casual Leave");
      await myLeaves.apply({
        leaveType: "Casual Leave",
        from,
        to: from,
        reason: "Personal work at the bank",
      });

      const approvals = new LeaveApprovalsPage(page);
      await approvals.goto();
      await approvals.decide(member.name, "Reject", "Site inspection that day");

      await myLeaves.goto();
      await expect(myLeaves.requests).toContainText("Rejected");
      expect(await myLeaves.available("Casual Leave")).toBe(before);
    },
  );
});
