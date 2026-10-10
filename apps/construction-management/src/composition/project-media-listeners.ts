import { createProjectMediaListener } from "@/src/projects/infrastructure/create-project-media-listener";
import {
  InProcessEventDispatcher,
  type DomainEventListener,
  type EventDispatcher,
} from "@/src/shared-kernel/events";

/**
 * Composition root for `ProjectMediaAttached` / `ProjectMediaRemoved`
 * (ADR CM-0014, root ADR-0008): the projects context keeps the Gallery
 * index. A context that attaches images or PDFs to a Project (worksheets,
 * issues, inspections from M6 on) dispatches its events through
 * `projectMediaDispatcher()`; no context raises them in M4.
 */
export function projectMediaListeners(): DomainEventListener[] {
  return [createProjectMediaListener()];
}

export function projectMediaDispatcher(): EventDispatcher {
  return new InProcessEventDispatcher(projectMediaListeners());
}
