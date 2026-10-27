import { expect } from "@playwright/test";

import { unique } from "../api/session";
import { companyTest } from "../helpers/companyTest";
import { MasterListPage } from "../pages/MasterListPage";

/** Masters lists added with one name: the list, its title and its Add button. */
const LISTS = [
  {
    list: "departments",
    title: "Departments",
    add: "Add Department",
    name: "Fabrication",
  },
  {
    list: "material-categories",
    title: "Material Categories",
    add: "Add Material Category",
    name: "Waterproofing",
  },
  {
    list: "measurement-units",
    title: "Measurement Units",
    add: "Add Measurement Unit",
    name: "Roll",
  },
  { list: "tags", title: "Tags", add: "Add Tag", name: "Critical path" },
  {
    list: "amenities",
    title: "Amenities",
    add: "Add Amenity",
    name: "Yoga Deck",
  },
  {
    list: "common-developments",
    title: "Common Developments",
    add: "Add Common Development",
    name: "Solar Street Lights",
  },
] as const;

companyTest.describe("Masters lists", () => {
  for (const entry of LISTS)
    companyTest(
      `should list the new entry, when the Owner adds one to ${entry.title}`,
      async ({ page }) => {
        const name = unique(entry.name);
        const master = new MasterListPage(
          page,
          `/app/masters/${entry.list}`,
          entry.title,
        );
        await master.goto();
        await master.button(entry.add).first().click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("textbox").first().fill(name);
        await dialog
          .getByRole("button", { name: /^(Add|Save)/ })
          .last()
          .click();
        await expect(dialog).toHaveCount(0);
        await expect(
          master.main.getByText(name, { exact: true }),
        ).toBeVisible();
      },
    );
});
