import type { PartyFileRouteConfig } from "@/app/api/construction/labour/_party-files/party-file-routes";
import { createEmployeeSignInHandlers } from "@/src/composition/employee-sign-ins";
import { createEmployeeHandlers } from "@/src/labour/infrastructure/create-employee-handlers";

import { EMPLOYEES_MENU, EMPLOYEES_PATH } from "./employee-models";

/** One composition for every Employee route. */
export const employee = createEmployeeHandlers();

/** The Employee and their sign-in (ADR CM-0055 §4), over the same handlers. */
export const employeeSignIns = createEmployeeSignInHandlers({
  employees: employee.employees,
});

/** Photo and documents of an Employee: the Employees menu, `employee` owner. */
export const EMPLOYEE_FILES: PartyFileRouteConfig = {
  ownerType: "employee",
  menu: EMPLOYEES_MENU,
  basePath: EMPLOYEES_PATH,
};
