import { financeDirectory } from "@/src/composition/finance-directory";
import { createOtherPartyHandlers } from "@/src/finance/infrastructure/other-party-store";

/** Other Party handlers (CM-704), wired once for every route. */
export const otherPartyHandlers = createOtherPartyHandlers({
  directory: financeDirectory,
});

export const OTHER_PARTY_MENU = "masters.other_parties";
