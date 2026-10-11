import type { DomainEvent, EventDispatcher } from "@/src/shared-kernel/events";

/**
 * Tells the Project Gallery a document's media went away, after the delete
 * has committed. The Gallery is an index (CM-0014): a failure is logged,
 * never turned into an error for a delete that already happened.
 */
export async function removeFromGallery(
  media: EventDispatcher,
  event: DomainEvent,
): Promise<void> {
  try {
    await media.dispatch([event]);
  } catch (error) {
    console.error("Could not update the Project Gallery", error);
  }
}
