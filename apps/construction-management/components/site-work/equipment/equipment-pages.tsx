"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app-shell/page-header";
import { equipmentQuery } from "@/src/queries/equipment";

import { EquipmentDetailScreen } from "./equipment-detail";
import { EquipmentFormScreen } from "./equipment-form";
import {
  EQUIPMENTS_PATH,
  equipmentModulePath,
  equipmentPath,
  projectEquipmentPath,
} from "./equipment-tabs";

/** Masters → Equipments → Add Equipment. */
export function NewEquipmentPage() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Equipments", href: EQUIPMENTS_PATH }}
          title="Add Equipment"
          meta="A machine the Company owns or hires, at a Project or the warehouse."
        />
        <EquipmentFormScreen
          backHref={EQUIPMENTS_PATH}
          hrefFor={equipmentPath}
        />
      </div>
    </div>
  );
}

/** Edit a machine, from Masters or from a Project's Equipment module. */
export function EditEquipmentPage({
  id,
  projectId,
}: {
  id: string;
  projectId?: string;
}) {
  const { data } = useSuspenseQuery(equipmentQuery(id));
  const detailHref =
    projectId == null ? equipmentPath(id) : projectEquipmentPath(projectId, id);
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: data.name, href: detailHref }}
          title={`Edit ${data.name}`}
        />
        <EquipmentFormScreen
          equipment={data}
          backHref={detailHref}
          hrefFor={() => detailHref}
        />
      </div>
    </div>
  );
}

/** A Project's Equipment → Add equipment: it starts at this Project. */
export function ProjectNewEquipmentPage({ projectId }: { projectId: string }) {
  const listHref = equipmentModulePath(projectId, "register");
  return (
    <div className="w-full space-y-6">
      <PageHeader
        back={{ label: "Equipment", href: listHref }}
        title="Add equipment"
        meta="It starts at this Project."
      />
      <EquipmentFormScreen
        fixedProjectId={projectId}
        backHref={listHref}
        hrefFor={(id) => projectEquipmentPath(projectId, id)}
      />
    </div>
  );
}

/** Masters → Equipments → one machine. */
export function MastersEquipmentDetailPage({ id }: { id: string }) {
  return (
    <EquipmentDetailScreen
      id={id}
      back={{ label: "Equipments", href: EQUIPMENTS_PATH }}
      editHref={`${equipmentPath(id)}/edit`}
      afterDeleteHref={EQUIPMENTS_PATH}
    />
  );
}

/** A Project's Equipment → one machine. */
export function ProjectEquipmentDetailPage({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const listHref = equipmentModulePath(projectId, "register");
  return (
    <EquipmentDetailScreen
      id={id}
      back={{ label: "Equipment", href: listHref }}
      editHref={`${projectEquipmentPath(projectId, id)}/edit`}
      afterDeleteHref={listHref}
    />
  );
}
