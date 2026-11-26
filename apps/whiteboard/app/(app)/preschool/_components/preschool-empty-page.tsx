import { PagePlaceholder } from "@/app/(app)/_components/app-shell/page-placeholder";
import {
  preschoolPageByHref,
  type PreschoolNavHref,
} from "@/lib/preschool-nav";

/** The placeholder for a Preschool menu page that is not built yet. */
export function PreschoolEmptyPage({ href }: { href: PreschoolNavHref }) {
  const page = preschoolPageByHref(href);
  return <PagePlaceholder title={page.title} description={page.description} />;
}
