import {
  File,
  FileArchive,
  FileAxis3d,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from "lucide-react";

import {
  documentFileType,
  type DocumentFileType,
} from "@/lib/project-documents";

const ICONS: Record<DocumentFileType, LucideIcon> = {
  pdf: FileText,
  text: FileText,
  image: FileImage,
  archive: FileArchive,
  spreadsheet: FileSpreadsheet,
  drawing: FileAxis3d,
  file: File,
};

/** A file's type at a glance: PDF, picture, zip, spreadsheet, drawing. */
export function DocumentFileIcon({
  fileName,
  contentType,
  className,
}: {
  fileName: string;
  contentType?: string;
  className?: string;
}) {
  const Icon = ICONS[documentFileType(fileName, contentType)];
  return <Icon aria-hidden="true" className={className} />;
}
