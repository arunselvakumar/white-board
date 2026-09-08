import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function navigateAfterAuth(router: AppRouterInstance, path: string) {
  return ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
    const url = decorateUrl(path);
    if (url.startsWith("http://") || url.startsWith("https://")) {
      window.location.href = url;
      return;
    }
    router.push(url);
  };
}
