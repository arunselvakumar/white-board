"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { EquipmentFormSkeleton } from "@/app/app/_components/site-work/site-work-skeletons";
import { equipmentQuery } from "@/src/queries/equipment";

import { EquipmentDetailScreen } from "./equipment-detail";
import { EquipmentFormScreen } from "./equipment-form";
import {
  EQUIPMENTS_PATH,
  equipmentPath,
  projectEquipmentPath,
} from "./equipment-tabs";
import { type HrefSuffix, pageHref } from "@/lib/page-href";

export function NewEquipmentPage() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Equipments", href: EQUIPMENTS_PATH }}
          title="Add Equipment"
          meta="A machine the Company owns or hires, at a Project or the warehouse."
        />
        <Suspense fallback={<EquipmentFormSkeleton />}>
          <EquipmentFormScreen
            backHref={EQUIPMENTS_PATH}
            hrefFor={equipmentPath}
          />
        </Suspense>
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
  const detailPath = (suffix: HrefSuffix = "") =>
    projectId == null
      ? equipmentPath(id, suffix)
      : projectEquipmentPath(projectId, id, suffix);
  const detailHref = detailPath();
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: data.name, href: detailHref }}
          title={`Edit ${data.name}`}
          watermark="Equipments"
        />
        <EquipmentFormScreen
          equipment={data}
          backHref={detailHref}
          hrefFor={(_saved, suffix) => detailPath(suffix)}
        />
      </div>
    </div>
  );
}

/** Add equipment from a Project: it starts at this Project. */
export function ProjectNewEquipmentPage({ projectId }: { projectId: string }) {
  const listHref = pageHref("/app/projects/[id]/equipment/register", {
    id: projectId,
  });
  return (
    <div className="w-full space-y-6">
      <PageHeader
        back={{ label: "Equipment", href: listHref }}
        title="Add equipment"
        meta="It starts at this Project."
      />
      <Suspense fallback={<EquipmentFormSkeleton />}>
        <EquipmentFormScreen
          fixedProjectId={projectId}
          backHref={listHref}
          hrefFor={(id, suffix) => projectEquipmentPath(projectId, id, suffix)}
        />
      </Suspense>
    </div>
  );
}

export function MastersEquipmentDetailPage({ id }: { id: string }) {
  return (
    <EquipmentDetailScreen
      id={id}
      back={{ label: "Equipments", href: EQUIPMENTS_PATH }}
      editHref={pageHref("/app/masters/equipments/[id]/edit", { id })}
      afterDeleteHref={EQUIPMENTS_PATH}
    />
  );
}

export function ProjectEquipmentDetailPage({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  const listHref = pageHref("/app/projects/[id]/equipment/register", {
    id: projectId,
  });
  return (
    <EquipmentDetailScreen
      id={id}
      back={{ label: "Equipment", href: listHref }}
      editHref={pageHref(
        "/app/projects/[id]/equipment/register/[equipmentId]/edit",
        { id: projectId, equipmentId: id },
      )}
      afterDeleteHref={listHref}
    />
  );
}
