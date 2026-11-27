"use client";

import {
  StaffFiles,
  type StaffFilesApi,
} from "@/app/app/staff/_components/staff-files";
import {
  EMPLOYEES_KEY,
  addEmployeeDocument,
  deleteEmployeeDocument,
  employeeDocumentsQuery,
  removeEmployeePhoto,
  uploadEmployeePhoto,
  type EmployeeResponse,
} from "@/src/queries/employees";

const EMPLOYEE_FILES: StaffFilesApi = {
  queryKey: EMPLOYEES_KEY,
  documentsQuery: employeeDocumentsQuery,
  uploadPhoto: uploadEmployeePhoto,
  removePhoto: removeEmployeePhoto,
  addDocument: addEmployeeDocument,
  deleteDocument: deleteEmployeeDocument,
};

/** Photo and Other Documents on Edit Employee; each change saves at once. */
export function EmployeeFiles({ employee }: { employee: EmployeeResponse }) {
  return <StaffFiles owner={employee} api={EMPLOYEE_FILES} />;
}
