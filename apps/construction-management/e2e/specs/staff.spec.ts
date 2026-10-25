import { expect } from "@playwright/test";

import { emailCodeFor, emailLinkFor } from "../api/mailpit";
import { inviteMember, roleId } from "../api/organization";
import { createProject } from "../api/projects";
import {
  PASSWORD,
  newApiSession,
  newEmail,
  newMobile,
  signUpByEmail,
  unique,
} from "../api/session";
import { staffPageTest } from "../helpers/staffPageTest";
import { AddStaffPage } from "../pages/AddStaffPage";
import { EditStaffPage } from "../pages/EditStaffPage";
import { JoinPage } from "../pages/JoinPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { SignUpPage } from "../pages/SignUpPage";
import { StaffPage } from "../pages/StaffPage";
import { signInByMobile } from "../api/session";

const GUEST = { storageState: { cookies: [], origins: [] } };

staffPageTest.describe("Staff", () => {
  staffPageTest(
    "should show the invitee as Active, when the Owner invites by email and they join from the emailed link",
    { tag: ["@pr"] },
    async ({ staffPage, owner, page, browser }) => {
      const name = unique("Prabhu Saravanan");
      const email = newEmail("invitee");

      await staffPage.goto();
      await staffPage.addUserLink.click();
      const addStaffPage = new AddStaffPage(page);
      await addStaffPage.fillDetails({ name, email });
      await expect(addStaffPage.inviteCheckbox).toBeChecked();
      await addStaffPage.continueButton.click();
      await addStaffPage.continueButton.click();
      await addStaffPage.chooseRole("Site Engineer");
      await addStaffPage.button("Add and invite").click();
      await expect(addStaffPage.heading(`${name} is invited`)).toBeVisible();
      await staffPage.goto();
      await expect(staffPage.user(name)).toContainText("Joining Pending");

      const invitee = await (await browser.newContext(GUEST)).newPage();
      const joinPath = await emailLinkFor(email, "/join/", /^Join /);
      const joinPage = new JoinPage(invitee, joinPath);
      await joinPage.goto();
      await joinPage.createAccountLink.click();
      const signUpPage = new SignUpPage(invitee);
      await signUpPage.fillDetails({ name, email, password: PASSWORD });
      await signUpPage.enterCode(await emailCodeFor(email));
      await expect(invitee).toHaveURL(joinPath);
      await joinPage.joinButton(owner.company.name).click();
      await expect(invitee).toHaveURL(/\/app\//);
      await expect(new ProjectsPage(invitee).companySwitcher).toContainText(
        owner.company.name,
      );
      await invitee.context().close();

      await page.reload();
      await expect(staffPage.user(name)).toContainText("Active");
    },
  );

  staffPageTest(
    "should add an Active staff member with their salary on the chosen Project and Role, when the Owner adds staff with a mobile and a password",
    async ({ staffPage, owner, page }) => {
      const project = await createProject(owner.api);
      const name = unique("Murugan K");

      const addStaffPage = new AddStaffPage(page);
      await addStaffPage.goto();
      await addStaffPage.fillDetails({
        name,
        mobile: newMobile().slice(3),
        password: PASSWORD,
        salary: "18,000",
      });
      await addStaffPage.continueButton.click();
      await addStaffPage.projectCheckbox(project.name).check();
      await addStaffPage.continueButton.click();
      await addStaffPage.chooseRole("Site Supervisor");
      await addStaffPage.button("Add Staff").click();
      await expect(
        addStaffPage.heading(`${name} can sign in now`),
      ).toBeVisible();

      await staffPage.goto();
      const row = staffPage.user(name);
      await expect(row).toContainText("Active");
      await expect(row).toContainText("Site Supervisor");

      await row.getByRole("link", { name }).click();
      const editStaffPage = new EditStaffPage(page);
      await expect(editStaffPage.salaryField).toHaveValue("18000");
      await editStaffPage.tab("Projects").click();
      await expect(
        page.getByRole("checkbox", { name: project.name }),
      ).toBeChecked();
    },
  );

  staffPageTest(
    "should list the invitee under Joining Pending with a shareable link, when the invitation is not accepted yet",
    async ({ staffPage, owner }) => {
      const invitee = await inviteMember(owner.api, {
        roleId: await roleId(owner.api, "Site Engineer"),
      });

      await staffPage.goto();
      await staffPage.statusFilter("Joining Pending").click();
      await expect(staffPage.user(invitee.name)).toBeVisible();
      await expect(staffPage.user(owner.name)).toHaveCount(0);

      await staffPage.rowAction(invitee.name, "Share invite link");
      await expect(staffPage.dialog.getByLabel("Invite link")).toHaveValue(
        /\/join\//,
      );
    },
  );

  staffPageTest(
    "should show the invitation as Declined, when the invitee declines it",
    async ({ staffPage, owner, browser, playwright, baseURL }) => {
      const invitee = await inviteMember(owner.api, {
        roleId: await roleId(owner.api, "Site Engineer"),
      });
      const joinPath = await emailLinkFor(invitee.email, "/join/", /^Join /);

      const request = await newApiSession(playwright, baseURL ?? "");
      await signUpByEmail(request, {
        name: invitee.name,
        email: invitee.email,
      });
      const context = await browser.newContext({
        storageState: await request.storageState(),
      });
      const inviteePage = await context.newPage();
      const joinPage = new JoinPage(inviteePage, joinPath);
      await joinPage.goto();
      await joinPage.declineButton.click();
      await expect(joinPage.declineButton).toHaveCount(0);
      await context.close();
      await request.dispose();

      await staffPage.goto();
      await staffPage.statusFilter("Declined").click();
      await expect(staffPage.user(invitee.name)).toBeVisible();
    },
  );

  staffPageTest(
    "should take away the Company's Projects, when the Owner deletes a member",
    async ({ staffPage, owner, newMember }) => {
      const project = await createProject(owner.api);
      const member = await newMember({
        roleName: "Site Engineer",
        projectIds: [project.id],
      });
      const memberPage = await member.page();
      const memberProjects = new ProjectsPage(memberPage);
      await memberProjects.goto();
      await expect(memberProjects.projectCard(project.name)).toBeVisible();

      await staffPage.goto();
      await staffPage.rowAction(member.name, "Delete");
      await staffPage.alertDialog
        .getByRole("button", { name: /Delete/ })
        .click();
      await expect(staffPage.user(member.name)).toHaveCount(0);

      await memberProjects.goto();
      await expect(memberProjects.projectCard(project.name)).toHaveCount(0);
    },
  );

  staffPageTest(
    "should find a staff member by name, when the Owner searches Staff",
    async ({ newMember, owner, page }) => {
      const member = await newMember({
        roleName: "Site Engineer",
        name: unique("Karthik R"),
      });
      const users = new StaffPage(page);
      await users.goto();
      await users.searchBox.fill(member.name);
      await expect(users.user(member.name)).toBeVisible();
      await expect(users.user(owner.name)).toHaveCount(0);
    },
  );

  staffPageTest(
    "should make the member choose a new password, when the Owner sets one for them",
    async ({ newMember, page, playwright, baseURL }) => {
      const member = await newMember({ roleName: "Site Engineer" });
      const users = new StaffPage(page);
      await users.goto();
      await users
        .user(member.name)
        .getByRole("link", { name: member.name })
        .click();
      const editUser = new EditStaffPage(page);
      await editUser.setPasswordButton.click();
      const dialog = page.getByRole("dialog", { name: "Set a new password" });
      await dialog.getByLabel("New password").fill("owner-set-pass-77");
      await dialog.getByRole("button", { name: "Set password" }).click();
      await expect(dialog).toHaveCount(0);

      const request = await newApiSession(playwright, baseURL ?? "");
      await signInByMobile(request, member.mobile, "owner-set-pass-77");
      const memberPage = await page
        .context()
        .browser()
        ?.newContext({
          storageState: await request.storageState(),
        });
      const tab = await memberPage?.newPage();
      await tab?.goto("/app/projects");
      await expect(tab ?? page).toHaveURL("/change-password");
      await memberPage?.close();
      await request.dispose();
    },
  );
});
