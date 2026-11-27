"use client";

import {
  StaffFiles,
  type StaffFilesApi,
} from "@/app/app/staff/_components/staff-files";
import {
  LABOURS_KEY,
  addLabourDocument,
  deleteLabourDocument,
  labourDocumentsQuery,
  removeLabourPhoto,
  uploadLabourPhoto,
  type LabourResponse,
} from "@/src/queries/labours";

const LABOUR_FILES: StaffFilesApi = {
  queryKey: LABOURS_KEY,
  documentsQuery: labourDocumentsQuery,
  uploadPhoto: uploadLabourPhoto,
  removePhoto: removeLabourPhoto,
  addDocument: addLabourDocument,
  deleteDocument: deleteLabourDocument,
};

/** Photo and Other Documents, first on Edit Labour; each change saves at once. */
export function LabourFiles({ labour }: { labour: LabourResponse }) {
  return <StaffFiles owner={labour} api={LABOUR_FILES} />;
}
