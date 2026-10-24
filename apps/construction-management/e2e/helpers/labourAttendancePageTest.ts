import { LabourAttendancePage } from "../pages/LabourAttendancePage";
import { projectTest } from "./projectTest";

export const labourAttendancePageTest = projectTest.extend<{
  labourAttendancePage: LabourAttendancePage;
}>({
  labourAttendancePage: async ({ page, project }, use) => {
    await use(new LabourAttendancePage(page, project.id));
  },
});
