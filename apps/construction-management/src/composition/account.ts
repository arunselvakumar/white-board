import {
  createAccountDeletionHandlers,
  createDeviceHandlers,
} from "@/src/organization/infrastructure/create-account-handlers";

import { deleteMessagingOfUser, pushSessions } from "./push-subscriptions";

/** My Profile → Devices, with messaging's push subscriptions (CM-907). */
export const deviceHandlers = createDeviceHandlers({ push: pushSessions() });

/** Delete My Account, also clearing the User's messaging data (CM-907). */
export const accountDeletionHandlers = createAccountDeletionHandlers({
  hooks: [deleteMessagingOfUser],
});
