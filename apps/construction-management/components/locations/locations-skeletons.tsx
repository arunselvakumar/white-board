import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup } from "@repo/ui/components/skeleton-kit";

/**
 * `LocationPicker` while the Project's places load: its heading and the
 * Location Type select, as a Project with several types shows them
 * (ADR-0047).
 */
export function LocationPickerSkeleton({
  label = "Location",
  size = "lg",
}: {
  label?: string;
  /** The selects' size: `lg` (h-10) on pages, `default` (h-8) in dialogs. */
  size?: "lg" | "default";
}) {
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm font-medium">{label}</p>
      <SkeletonGroup
        label={`Loading ${label}`}
        className="grid min-w-0 gap-4 sm:grid-cols-2"
      >
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm leading-none font-medium">Location Type</p>
          <Skeleton className={size === "lg" ? "h-10 w-full" : "h-8 w-full"} />
        </div>
      </SkeletonGroup>
    </div>
  );
}
