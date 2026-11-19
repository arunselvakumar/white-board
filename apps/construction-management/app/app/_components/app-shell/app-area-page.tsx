import { type AppNavHref, appPageByHref } from "@/lib/app-nav";

import { PagePlaceholder } from "./page-placeholder";

/** The empty landing page of a top-level area. */
export function AppAreaPage({ href }: { href: AppNavHref }) {
  const page = appPageByHref(href);
  return <PagePlaceholder title={page.title} description={page.description} />;
}
