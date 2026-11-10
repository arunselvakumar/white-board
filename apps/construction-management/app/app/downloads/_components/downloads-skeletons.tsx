import { PageHeader } from "@/components/app-shell/page-header";
import { RecentReportsSkeleton } from "@/components/reports/reports-skeletons";

/** Downloads while the first page loads: the real header, then rows (ADR-0047). */
export function DownloadsPageSkeleton() {
  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-4xl min-w-0 space-y-6">
        <PageHeader
          title="Downloads"
          meta="Reports you asked for, on every Project. Report files are kept 30 days after they are ready; Progress Reports until someone deletes them."
        />
        <RecentReportsSkeleton rows={5} label="Loading downloads" />
      </div>
    </div>
  );
}
