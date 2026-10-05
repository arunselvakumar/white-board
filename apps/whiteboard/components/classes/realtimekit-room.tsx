"use client";

import { useEffect } from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
} from "@cloudflare/realtimekit-react";
import { RtkMeeting } from "@cloudflare/realtimekit-react-ui";

export default function RealtimeKitRoom({ authToken }: { authToken: string }) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  useEffect(() => {
    void initMeeting({ authToken });
  }, [authToken, initMeeting]);
  // The SDK returns undefined until initMeeting resolves.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (meeting === undefined)
    return (
      <div className="bg-card flex min-h-96 items-center justify-center rounded-xl border">
        Opening class…
      </div>
    );
  return (
    <RealtimeKitProvider value={meeting}>
      <div className="h-[min(75vh,800px)] min-h-96 overflow-hidden rounded-xl border">
        <RtkMeeting mode="fill" meeting={meeting} showSetupScreen />
      </div>
    </RealtimeKitProvider>
  );
}
