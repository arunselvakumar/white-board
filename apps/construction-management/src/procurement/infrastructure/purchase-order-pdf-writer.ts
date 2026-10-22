/**
 * The Purchase Request and Purchase Order PDFs' page writer (CM-503,
 * CM-504) now lives in the shared kernel, so the Work Order PDF (CM-1104)
 * uses the same one.
 */
export * from "@/src/shared-kernel/pdf/document-pdf-writer";
