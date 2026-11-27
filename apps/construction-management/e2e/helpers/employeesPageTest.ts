import { EmployeesPage } from "../pages/EmployeesPage";
import { projectTest } from "./projectTest";

export const employeesPageTest = projectTest.extend<{
  employeesPage: EmployeesPage;
}>({
  employeesPage: async ({ page }, use) => {
    await use(new EmployeesPage(page));
  },
});
