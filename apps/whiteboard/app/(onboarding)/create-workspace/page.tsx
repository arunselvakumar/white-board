import { CreateWorkspaceForm } from "@/components/onboarding/create-workspace-form";
import { postWorkspacePath } from "@/lib/safe-redirect";

type CreateWorkspacePageProps = {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
};

export default async function CreateWorkspacePage({
  searchParams,
}: CreateWorkspacePageProps) {
  const params = await searchParams;
  const raw = params.redirect_url;
  const redirectUrl = postWorkspacePath(Array.isArray(raw) ? raw[0] : raw);

  return <CreateWorkspaceForm redirectUrl={redirectUrl} />;
}
