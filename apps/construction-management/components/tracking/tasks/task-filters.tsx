"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { locationOptionsQuery } from "@/src/queries/location-options";
import {
  taskFormOptionsQuery,
  tasksFiltered,
  type TaskFilters,
} from "@/src/queries/tracking-tasks";
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskStatus,
} from "@/src/tracking/domain/task-progress";
import {
  TRACKING_PRIORITIES,
  type TrackingPriority,
} from "@/src/tracking/domain/tracking-documents";

const ALL = "all";

function FilterSelect<Value extends string>({
  label,
  anyLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: Value | null | undefined;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value | null) => void;
}) {
  const items = [{ value: ALL, label: anyLabel }, ...options];
  return (
    <Select
      items={items}
      value={value ?? ALL}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === ALL ? null : (next as Value));
      }}
    >
      <SelectTrigger aria-label={label} className="w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Every place on the Project a task can name, for the Location filter. */
function useLocationChoices(projectId: string) {
  const { data } = useSuspenseQuery(locationOptionsQuery(projectId));
  return [
    ...data.wings.map((wing) => ({ value: wing.id, label: wing.name })),
    ...data.amenities.map((item) => ({ value: item.id, label: item.name })),
    ...data.commonDevelopments.map((item) => ({
      value: item.id,
      label: item.name,
    })),
    ...data.locations.map((item) => ({ value: item.id, label: item.name })),
  ];
}

/**
 * The task list's filters (CM-802): search by Task No. or name and status
 * always; assignee, priority, tag, department, contractor, location and a
 * planned-date range behind **Filters**.
 */
export function TaskFilterBar({
  projectId,
  filters,
  onChange,
}: {
  projectId: string;
  filters: TaskFilters;
  onChange: (next: Partial<TaskFilters>) => void;
}) {
  const { data: options } = useSuspenseQuery(taskFormOptionsQuery(projectId));
  const locations = useLocationChoices(projectId);
  const more =
    filters.assigneeId != null ||
    filters.priority != null ||
    filters.tagId != null ||
    filters.departmentId != null ||
    filters.contractorId != null ||
    filters.locationId != null ||
    (filters.from ?? "") !== "" ||
    (filters.to ?? "") !== "";
  const [open, setOpen] = useState(more);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          type="search"
          aria-label="Search by Task No. or name"
          placeholder="Task No. or name"
          className="h-8 w-full sm:w-56"
          value={filters.search ?? ""}
          onChange={(event) => {
            onChange({ search: event.target.value });
          }}
        />
        <FilterSelect<TaskStatus>
          label="Status"
          anyLabel="Any status"
          value={filters.status}
          options={TASK_STATUSES.map((value) => ({
            value,
            label: TASK_STATUS_LABELS[value],
          }))}
          onChange={(status) => {
            onChange({ status });
          }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls="task-more-filters"
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
          </Button>
          {tasksFiltered(filters) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({
                  status: null,
                  assigneeId: null,
                  priority: null,
                  tagId: null,
                  departmentId: null,
                  contractorId: null,
                  locationId: null,
                  from: "",
                  to: "",
                  search: "",
                });
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div
          id="task-more-filters"
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <FilterSelect<string>
            label="Assignee"
            anyLabel="Anyone"
            value={filters.assigneeId}
            options={options.members.map((member) => ({
              value: member.id,
              label: member.name,
            }))}
            onChange={(assigneeId) => {
              onChange({ assigneeId });
            }}
          />
          <FilterSelect<TrackingPriority>
            label="Priority"
            anyLabel="Any priority"
            value={filters.priority}
            options={TRACKING_PRIORITIES.map((item) => ({
              value: item.key,
              label: item.label,
            }))}
            onChange={(priority) => {
              onChange({ priority });
            }}
          />
          {options.tags.length > 0 && (
            <FilterSelect<string>
              label="Tag"
              anyLabel="Any tag"
              value={filters.tagId}
              options={options.tags.map((tag) => ({
                value: tag.id,
                label: tag.name,
              }))}
              onChange={(tagId) => {
                onChange({ tagId });
              }}
            />
          )}
          {options.departments.length > 0 && (
            <FilterSelect<string>
              label="Department"
              anyLabel="Any Department"
              value={filters.departmentId}
              options={options.departments.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={(departmentId) => {
                onChange({ departmentId });
              }}
            />
          )}
          {options.contractors.length > 0 && (
            <FilterSelect<string>
              label="Contractor"
              anyLabel="Any Contractor"
              value={filters.contractorId}
              options={options.contractors.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={(contractorId) => {
                onChange({ contractorId });
              }}
            />
          )}
          {locations.length > 0 && (
            <FilterSelect<string>
              label="Location"
              anyLabel="Any location"
              value={filters.locationId}
              options={locations}
              onChange={(locationId) => {
                onChange({ locationId });
              }}
            />
          )}
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="tasks-from" className="text-xs">
                From
              </Label>
              <Input
                id="tasks-from"
                type="date"
                className="h-8 w-36"
                value={filters.from ?? ""}
                onChange={(event) => {
                  onChange({ from: event.target.value });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tasks-to" className="text-xs">
                To
              </Label>
              <Input
                id="tasks-to"
                type="date"
                className="h-8 w-36"
                value={filters.to ?? ""}
                onChange={(event) => {
                  onChange({ to: event.target.value });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
