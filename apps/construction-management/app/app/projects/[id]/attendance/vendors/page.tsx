import type { Metadata } from "next";

import { VendorAttendancePage } from "@/components/attendance/vendor/vendor-attendance-page";

export const metadata: Metadata = { title: "Vendor attendance" };

export default async function ProjectVendorAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full max-w-6xl p-6">
      <VendorAttendancePage projectId={id} />
    </div>
  );
}
