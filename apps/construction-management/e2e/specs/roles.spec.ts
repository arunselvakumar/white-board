import { expect } from "@playwright/test";

import { createProject } from "../api/projects";
import { unique } from "../api/session";
import { rolesPageTest } from "../helpers/rolesPageTest";
import { ProjectsPage } from "../pages/ProjectsPage";
import { RoleFormPage } from "../pages/RoleFormPage";
import { createRole } from "../api/organization";
import { RolesPage } from "../pages/RolesPage";

rolesPageTest.describe("Role Management", () => {
  rolesPageTest(
    "should show a view-only member just their Project, without Add buttons or admin menus, when their Role only grants Project View",
    { tag: ["@pr"] },
    async ({ owner, newMember }) => {
      const project = await createProject(owner.api);
      const hidden = await createProject(owner.api);
      const member = await newMember({
        grants: { "projects.project": ["read"] },
        projectIds: [project.id],
      });
      const page = await member.page();
      const projectsPage = new ProjectsPage(page);

      await projectsPage.goto();
      await expect(projectsPage.projectCard(project.name)).toBeVisible();
      await expect(projectsPage.projectCard(hidden.name)).toHaveCount(0);
      await expect(projectsPage.addProjectLink).toHaveCount(0);
      await expect(projectsPage.menuLink("Projects")).toBeVisible();
      await expect(projectsPage.menuLink("Dashboard")).toHaveCount(0);
      await expect(projectsPage.menuLink("Users & Roles")).toHaveCount(0);

      await page.goto("/app/roles/new");
      await expect(new RoleFormPage(page).saveButton).toHaveCount(0);
    },
  );

  rolesPageTest(
    "should give a member new menus, when the Owner adds a grant to their Role",
    { tag: ["@pr"] },
    async ({ owner, newMember, page: ownerPage }) => {
      const project = await createProject(owner.api);
      const member = await newMember({
        grants: { "projects.project": ["read"] },
        projectIds: [project.id],
      });
      const memberPage = await member.page();
      const memberProjects = new ProjectsPage(memberPage);
      await memberProjects.goto();
      await expect(memberProjects.menuLink("Users & Roles")).toHaveCount(0);

      const roleForm = new RoleFormPage(ownerPage, member.roleId);
      await roleForm.goto();
      await roleForm.permission("View", "Role Management").check();
      await roleForm.saveButton.click();
      await expect(ownerPage).toHaveURL("/app/roles");

      await memberPage.reload();
      await expect(memberProjects.menuLink("Users & Roles")).toBeVisible();
    },
  );

  rolesPageTest(
    "should add a Role with the ticked permissions, when the Owner duplicates a seed Role and edits the copy",
    async ({ rolesPage, page }) => {
      await rolesPage.goto();
      await rolesPage.rowAction("Store Keeper", "Duplicate");
      await rolesPage
        .role("Store Keeper (copy)")
        .getByRole("link", { name: "Store Keeper (copy)" })
        .click();

      const roleForm = new RoleFormPage(page);
      const name = unique("Store Keeper North");
      await roleForm.roleNameField.fill(name);
      await roleForm.permission("Add", "Project").check();
      await roleForm.saveButton.click();
      await expect(page).toHaveURL(rolesPage.url);
      await expect(rolesPage.role(name)).toBeVisible();
      await rolesPage.role(name).getByRole("link", { name }).click();
      await expect(roleForm.permission("Add", "Project")).toBeChecked();
    },
  );

  rolesPageTest(
    "should remove an unused custom Role, when the Owner deletes it",
    async ({ owner, page }) => {
      const role = await createRole(
        owner.api,
        { "projects.project": ["read"] },
        unique("Temporary access"),
      );
      const roles = new RolesPage(page);
      await roles.goto();
      await roles.rowAction(role.name, "Delete");
      await roles.alertDialog.getByRole("button", { name: /Delete/ }).click();
      await expect(roles.role(role.name)).toHaveCount(0);
    },
  );
});
