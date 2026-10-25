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
import { usersPageTest } from "../helpers/usersPageTest";
import { AddUserPage } from "../pages/AddUserPage";
import { EditUserPage } from "../pages/EditUserPage";
import { JoinPage } from "../pages/JoinPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { SignUpPage } from "../pages/SignUpPage";
import { UsersPage } from "../pages/UsersPage";
import { signInByMobile } from "../api/session";

const GUEST = { storageState: { cookies: [], origins: [] } };

usersPageTest.describe("Users", () => {
  usersPageTest(
    "should show the invitee as Active, when the Owner invites by email and they join from the emailed link",
    { tag: ["@pr"] },
    async ({ usersPage, owner, page, browser }) => {
      const name = unique("Prabhu Saravanan");
      const email = newEmail("invitee");

      await usersPage.goto();
      await usersPage.addUserLink.click();
      const addUserPage = new AddUserPage(page);
      await addUserPage.fillDetails({ name, email });
      await expect(addUserPage.inviteCheckbox).toBeChecked();
      await addUserPage.continueButton.click();
      await addUserPage.continueButton.click();
      await addUserPage.chooseRole("Site Engineer");
      await addUserPage.button("Add and invite").click();
      await expect(addUserPage.heading(`${name} is invited`)).toBeVisible();
      await usersPage.goto();
      await expect(usersPage.user(name)).toContainText("Joining Pending");

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
      await expect(usersPage.user(name)).toContainText("Active");
    },
  );

  usersPageTest(
    "should add an Active User on the chosen Project and Role, when the Owner adds staff with a mobile and a password",
    async ({ usersPage, owner, page }) => {
      const project = await createProject(owner.api);
      const name = unique("Murugan K");

      const addUserPage = new AddUserPage(page);
      await addUserPage.goto();
      await addUserPage.fillDetails({
        name,
        mobile: newMobile().slice(3),
        password: PASSWORD,
      });
      await addUserPage.continueButton.click();
      await addUserPage.projectCheckbox(project.name).check();
      await addUserPage.continueButton.click();
      await addUserPage.chooseRole("Site Supervisor");
      await addUserPage.button("Add User").click();
      await expect(
        addUserPage.heading(`${name} can sign in now`),
      ).toBeVisible();

      await usersPage.goto();
      const row = usersPage.user(name);
      await expect(row).toContainText("Active");
      await expect(row).toContainText("Site Supervisor");

      await row.getByRole("link", { name }).click();
      const editUserPage = new EditUserPage(page);
      await editUserPage.tab("Projects").click();
      await expect(
        page.getByRole("checkbox", { name: project.name }),
      ).toBeChecked();
    },
  );

  usersPageTest(
    "should list the invitee under Joining Pending with a shareable link, when the invitation is not accepted yet",
    async ({ usersPage, owner }) => {
      const invitee = await inviteMember(owner.api, {
        roleId: await roleId(owner.api, "Site Engineer"),
      });

      await usersPage.goto();
      await usersPage.statusFilter("Joining Pending").click();
      await expect(usersPage.user(invitee.name)).toBeVisible();
      await expect(usersPage.user(owner.name)).toHaveCount(0);

      await usersPage.rowAction(invitee.name, "Share invite link");
      await expect(usersPage.dialog.getByLabel("Invite link")).toHaveValue(
        /\/join\//,
      );
    },
  );

  usersPageTest(
    "should show the invitation as Declined, when the invitee declines it",
    async ({ usersPage, owner, browser, playwright, baseURL }) => {
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

      await usersPage.goto();
      await usersPage.statusFilter("Declined").click();
      await expect(usersPage.user(invitee.name)).toBeVisible();
    },
  );

  usersPageTest(
    "should take away the Company's Projects, when the Owner deletes a member",
    async ({ usersPage, owner, newMember }) => {
      const project = await createProject(owner.api);
      const member = await newMember({
        roleName: "Site Engineer",
        projectIds: [project.id],
      });
      const memberPage = await member.page();
      const memberProjects = new ProjectsPage(memberPage);
      await memberProjects.goto();
      await expect(memberProjects.projectCard(project.name)).toBeVisible();

      await usersPage.goto();
      await usersPage.rowAction(member.name, "Delete");
      await usersPage.alertDialog
        .getByRole("button", { name: /Delete/ })
        .click();
      await expect(usersPage.user(member.name)).toHaveCount(0);

      await memberProjects.goto();
      await expect(memberProjects.projectCard(project.name)).toHaveCount(0);
    },
  );

  usersPageTest(
    "should find a User by name, when the Owner searches Users",
    async ({ newMember, owner, page }) => {
      const member = await newMember({
        roleName: "Site Engineer",
        name: unique("Karthik R"),
      });
      const users = new UsersPage(page);
      await users.goto();
      await users.searchBox.fill(member.name);
      await expect(users.user(member.name)).toBeVisible();
      await expect(users.user(owner.name)).toHaveCount(0);
    },
  );

  usersPageTest(
    "should make the member choose a new password, when the Owner sets one for them",
    async ({ newMember, page, playwright, baseURL }) => {
      const member = await newMember({ roleName: "Site Engineer" });
      const users = new UsersPage(page);
      await users.goto();
      await users
        .user(member.name)
        .getByRole("link", { name: member.name })
        .click();
      const editUser = new EditUserPage(page);
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
