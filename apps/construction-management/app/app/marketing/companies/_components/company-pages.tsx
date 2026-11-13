"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { companyPath, companyQuery } from "@/src/queries/marketing-companies";

import { CompanyForm } from "./company-form";

export function CompanyNew() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Prospect Companies", href: companyPath() }}
          title="Add Prospect Company"
        />
        <CompanyForm />
      </div>
    </div>
  );
}

export function CompanyEdit({ id }: { id: string }) {
  const { data: company } = useSuspenseQuery(companyQuery(id));
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: company.name, href: companyPath(company.id) }}
          title={`Edit ${company.name}`}
        />
        {company.actions.canUpdate ? (
          <CompanyForm company={company} />
        ) : (
          <p className="text-muted-foreground text-sm">
            You can see this Prospect Company but not edit it.
          </p>
        )}
      </div>
    </div>
  );
}
