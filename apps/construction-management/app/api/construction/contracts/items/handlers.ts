import { contractsDirectory } from "@/src/composition/contracts-directory";
import { createItemHandlers } from "@/src/contracts/infrastructure/prisma-item-store";

export { ITEMS_MENU } from "@/src/contracts/application/item-handlers";

/**
 * Item Library handlers (CM-1102), wired once for every route. Materials,
 * Labour Categories, Equipment and UoMs are read through the contracts
 * directory (ADR CM-0023 §1).
 */
export const itemHandlers = createItemHandlers({
  directory: contractsDirectory,
});
