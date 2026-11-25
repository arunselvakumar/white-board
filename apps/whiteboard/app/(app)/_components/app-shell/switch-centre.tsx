"use client";

import { useQuery } from "@tanstack/react-query";
import { SidebarMenuItem } from "@repo/ui/components/sidebar";
import { SidebarSwitch } from "@repo/ui/components/sidebar-chrome";

import {
  pickActiveCentre,
  useActiveCentreId,
  writeActiveCentreId,
} from "@/lib/preschool-active-centre";
import { preschoolMeQueryOptions } from "@/src/queries/preschool/me";

import { SIDEBAR_ROW_CLASS } from "./sidebar-nav";

const OWNERSHIP_LABEL = {
  company_owned: "Company-owned",
  franchised: "Franchised",
} as const;

/**
 * Switch Centre, a row at the foot of a Preschool Workspace's sidebar, above
 * Switch Workspace (ADR-0051, ADR-0055). Shown only when the User may open
 * more than one Centre. Picking one remembers it (`wb_preschool_centre`);
 * screens read it through `useActiveCentre()` and reload their data, and the
 * modal closes because the row is keyed by the active Centre.
 */
export function SwitchCentre() {
  const { data: me } = useQuery(preschoolMeQueryOptions());
  const rememberedId = useActiveCentreId();
  const centres = me?.centres ?? [];
  const active = pickActiveCentre(centres, rememberedId);
  if (centres.length < 2 || active == null) return null;

  return (
    <SidebarMenuItem>
      <SidebarSwitch
        key={active.id}
        label="Switch Centre"
        rowLabel={`Switch Centre. Active Centre: ${active.name}`}
        description="Pick the Centre you want to work in."
        rowClassName={SIDEBAR_ROW_CLASS}
        items={centres.map((centre) => ({
          id: centre.id,
          name: centre.name,
          detail:
            centre.status === "closed"
              ? `${centre.code} · Closed`
              : `${centre.code} · ${OWNERSHIP_LABEL[centre.ownership]}`,
        }))}
        activeId={active.id}
        pendingId={null}
        onPick={writeActiveCentreId}
      />
    </SidebarMenuItem>
  );
}
