import { type AppNavHref, appPageByHref } from "@/lib/app-nav";

import { PagePlaceholder } from "./page-placeholder";

export function AppEmptyPage({ href }: { href: AppNavHref }) {
  const page = appPageByHref(href);
  return (
    <PagePlaceholder title={page.title} description={page.description} />
  );
}
