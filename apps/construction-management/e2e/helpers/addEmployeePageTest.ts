import { AddEmployeePage } from "../pages/AddEmployeePage";
import { projectTest } from "./projectTest";

export const addEmployeePageTest = projectTest.extend<{
  addEmployeePage: AddEmployeePage;
}>({
  addEmployeePage: async ({ page }, use) => {
    await use(new AddEmployeePage(page));
  },
});
