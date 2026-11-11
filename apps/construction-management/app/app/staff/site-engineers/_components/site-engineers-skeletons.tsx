import { FormSkeleton } from "@repo/ui/components/skeleton-kit";

import {
  FormPageSkeleton,
  FormSectionSkeleton,
} from "@/app/app/_components/masters/masters-skeletons";
import { SITE_ENGINEERS_PATH } from "@/lib/staff-nav";

/** Edit Site Engineer while the Site Engineer loads (ADR-0047). */
export function SiteEngineerFormSkeleton() {
  return (
    <FormPageSkeleton
      back={{ label: "Site Engineers", href: SITE_ENGINEERS_PATH }}
      meta
    >
      <div className="space-y-6">
        <FormSectionSkeleton title="Details">
          <FormSkeleton
            columns={2}
            actions={0}
            label="Loading Site Engineer"
            gridClassName="gap-4"
            fields={[
              { label: "Name", wide: true },
              { label: "Mobile" },
              { label: "Email" },
              { label: "Address", wide: true },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Sign-in">
          <FormSkeleton columns={1} actions={0} fields={1} />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Personal">
          <FormSkeleton
            columns={2}
            actions={0}
            gridClassName="gap-4"
            fields={[
              { label: "Father's name" },
              { label: "Date of birth" },
              { label: "Gender", control: "select" },
              { label: "Blood group", control: "select" },
            ]}
          />
        </FormSectionSkeleton>
        <FormSectionSkeleton title="Employment">
          <FormSkeleton
            columns={2}
            actions={0}
            gridClassName="gap-4"
            fields={[
              { label: "Employee code" },
              { label: "Joining date" },
              { label: "Qualification" },
              { label: "Experience (years)" },
            ]}
          />
        </FormSectionSkeleton>
      </div>
    </FormPageSkeleton>
  );
}
