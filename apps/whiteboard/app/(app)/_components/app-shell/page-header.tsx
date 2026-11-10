import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@repo/ui/components/button";

export type PageHeaderBack =
  { label: string; href: string } | { label: string; onClick: () => void };

const backClassName =
  "text-muted-foreground h-auto justify-start gap-1.5 p-0 text-left text-sm font-normal whitespace-normal hover:text-foreground";

function PageHeaderBackLink({ back }: { back: PageHeaderBack }) {
  const content = (
    <>
      <ArrowLeft aria-hidden="true" />
      Back to {back.label}
    </>
  );
  if ("href" in back) {
    return (
      <Button
        variant="link"
        className={backClassName}
        render={<Link href={back.href} />}
      >
        {content}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="link"
      className={backClassName}
      onClick={back.onClick}
    >
      {content}
    </Button>
  );
}

export function PageHeader({
  back,
  title,
  meta,
  leading,
  actions,
}: {
  back?: PageHeaderBack;
  title: string;
  meta?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      {back == null ? null : <PageHeaderBackLink back={back} />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {leading}
          <div className="min-w-0 space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight break-words">
              {title}
            </h1>
            {meta == null ? null : (
              <p className="text-muted-foreground text-sm">{meta}</p>
            )}
          </div>
        </div>
        {actions == null ? null : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
