import { EmployeeAttendancePage } from "../pages/EmployeeAttendancePage";
import { projectTest } from "./projectTest";

export const employeeAttendancePageTest = projectTest.extend<{
  employeeAttendancePage: EmployeeAttendancePage;
}>({
  employeeAttendancePage: async ({ page, project }, use) => {
    await use(new EmployeeAttendancePage(page, project.id));
  },
});
