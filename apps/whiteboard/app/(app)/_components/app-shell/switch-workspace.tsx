"use client";

import { useWorkspace, useWorkspaceList } from "@repo/auth/react";
import { useRef, useState } from "react";
import { SidebarSwitch } from "@repo/ui/components/sidebar-chrome";

import { SIDEBAR_ROW_CLASS } from "./sidebar-nav";

const SWITCH_ERROR = "Could not switch to that Workspace. Please try again.";

const ROLE_LABEL = {
  owner: "Owner",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
} as const;

/**
 * Switch Workspace, a row at the foot of the sidebar (ADR-0051). It opens a
 * modal of the User's Workspaces; picking another one makes it the Active
 * Workspace and reloads at the Dashboard. With one Workspace the modal
 * still opens and shows it. A switch that fails says so in the modal, as
 * Workspace Selection does. Closing the modal clears the error, and the
 * spinner too once the switch has answered: if a page's leave-site warning
 * kept the User here, they can pick again.
 */
export function SwitchWorkspace() {
  const { workspace } = useWorkspace();
  const { workspaces, setActive } = useWorkspaceList();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const pick = async (id: string) => {
    setFailed(false);
    setPendingId(id);
    inFlight.current = true;
    // setActive reloads the app at "/" once the switch lands.
    const { error } = await setActive(id, "/");
    inFlight.current = false;
    if (error != null) {
      setFailed(true);
      setPendingId(null);
    }
  };

  return (
    <SidebarSwitch
      label="Switch Workspace"
      rowLabel={`Switch Workspace. Active Workspace: ${workspace?.name ?? "none"}`}
      description="Pick the Workspace you want to work in."
      rowClassName={SIDEBAR_ROW_CLASS}
      items={workspaces.map((item) => ({
        id: item.id,
        name: item.name,
        detail: ROLE_LABEL[item.role],
      }))}
      activeId={workspace?.id ?? null}
      pendingId={pendingId}
      error={failed ? SWITCH_ERROR : null}
      onPick={(id) => {
        void pick(id);
      }}
      onOpenChange={(open) => {
        if (open) return;
        setFailed(false);
        if (!inFlight.current) setPendingId(null);
      }}
    />
  );
}
