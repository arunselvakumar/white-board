import { SelectWorkspaceForm } from "@/components/onboarding/select-workspace-form";
import { postWorkspacePath } from "@/lib/safe-redirect";

type SelectWorkspacePageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

export default async function SelectWorkspacePage({
  searchParams,
}: SelectWorkspacePageProps) {
  const params = await searchParams;
  const raw = params.redirect_url;
  const redirectUrl = postWorkspacePath(Array.isArray(raw) ? raw[0] : raw);

  return <SelectWorkspaceForm redirectUrl={redirectUrl} />;
}
