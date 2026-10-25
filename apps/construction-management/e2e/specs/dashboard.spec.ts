import { expect } from "@playwright/test";

import {
  createLabour,
  markLabourAttendance,
  todayInIndia,
} from "../api/labour";
import { createMaterial, createSupplier } from "../api/masters";
import { receiveGoods } from "../api/procurement";
import { createLocation, createProject } from "../api/projects";
import { createIssue } from "../api/tracking";
import { companyTest } from "../helpers/companyTest";
import { CompanyDashboardPage } from "../pages/CompanyDashboardPage";

companyTest.describe("Company Dashboard", () => {
  companyTest(
    "should count today's labour, open issues and the amount due, when the Projects have them",
    { tag: ["@pr"] },
    async ({ owner, page }) => {
      const project = await createProject(owner.api, {
        projectType: "infrastructure",
      });
      const location = await createLocation(
        owner.api,
        project.id,
        "Pump house",
      );
      const labours = await Promise.all([
        createLabour(owner.api, { projectId: project.id }),
        createLabour(owner.api, { projectId: project.id }),
      ]);
      await markLabourAttendance(owner.api, {
        projectId: project.id,
        date: todayInIndia(),
        labourIds: labours.map((labour) => labour.id),
      });
      await createIssue(owner.api, {
        projectId: project.id,
        issueDate: todayInIndia(),
        locationId: location.id,
      });
      const supplier = await createSupplier(owner.api, {
        projectIds: [project.id],
      });
      const material = await createMaterial(owner.api, {
        rateRupees: 400,
        gstRate: "18",
      });
      await receiveGoods(owner.api, {
        projectId: project.id,
        supplierId: supplier.id,
        materialId: material.id,
        quantity: "10",
        invoiceNo: "SBT/2026/77",
      });

      const dashboard = new CompanyDashboardPage(page);
      await dashboard.goto();
      await expect(dashboard.total("Active Projects")).toContainText("1");
      await expect(dashboard.total("Labours present today")).toContainText("2");
      await expect(dashboard.total("Pending Issues & Snags")).toContainText(
        "1",
      );
      // 10 bags × ₹400 + 18% GST.
      await expect(dashboard.total("Amount due")).toContainText("₹4,720");
      await expect(
        page
          .getByRole("table", { name: "Your Projects" })
          .getByRole("link", { name: project.name }),
      ).toBeVisible();
    },
  );
});
