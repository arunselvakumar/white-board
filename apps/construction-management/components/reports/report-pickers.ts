"use client";

import { useQuery } from "@tanstack/react-query";

import {
  reportFilterOptionsQuery,
  type ReportFilterOptions,
} from "@/src/queries/report-filter-options";

import {
  cardPickers,
  takesProjects,
  type ReportDefinition,
  type ReportPickerOptions,
} from "./report-catalogue";

const choices = (items: { id: string; name: string }[]) =>
  items.map((item) => ({ value: item.id, label: item.name }));

/** The filter options route's answer as the cards' picker choices. */
export function pickerOptionsOf(
  options: ReportFilterOptions | undefined,
): ReportPickerOptions {
  if (options == null) return {};
  return {
    projects: choices(options.projects),
    store: choices(options.stores),
    vendor: choices(options.vendors),
    labour_category: choices(options.labourCategories),
    supplier: choices(options.suppliers),
    material_category: choices(options.materialCategories),
    material: choices(options.materials),
    created_by: choices(options.creators),
    wing: choices(options.wings),
    lead_source: choices(options.leadSources),
    funnel_stage: choices(options.funnelStages),
    lost_reason: choices(options.lostReasons),
    assignee: choices(options.assignees),
  };
}

/**
 * The choices for the cards' pickers (CM-903), read once for the page
 * and only when one of its cards has a picker. Until they arrive (or
 * when they cannot be read) a card shows its period alone.
 */
export function useReportPickerOptions(
  projectId: string | null,
  definitions: readonly ReportDefinition[],
): ReportPickerOptions {
  const needed = definitions.some(
    (definition) =>
      cardPickers(definition).length > 0 ||
      (projectId == null && takesProjects(definition)),
  );
  const { data } = useQuery({
    ...reportFilterOptionsQuery(projectId),
    enabled: needed,
    retry: false,
  });
  return pickerOptionsOf(data);
}
