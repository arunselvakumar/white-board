import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

import { LoadingScreen } from "@/components/auth/loading-screen";

export default function SsoCallbackPage() {
  return (
    <>
      <AuthenticateWithRedirectCallback />
      <LoadingScreen />
    </>
  );
}
