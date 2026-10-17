import { notFound, type DomainError } from "@/src/shared-kernel/domain-error";

/** 404 for a Project that is not a live Project of the Company. */
export function salesProjectNotFound(): DomainError {
  return notFound("PROJECT_NOT_FOUND", "This Project was not found.");
}
