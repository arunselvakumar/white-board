import { Building2, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import type { ClientBillSetup } from "@/src/queries/contracts-client-bills";

const BLOCKERS = {
  PROJECT_NOT_CONTRACT_WORK: {
    icon: Building2,
    title: "This Project is Own development",
    description:
      "Its BOQ is a budget and is never billed. Client Bills are for Contract work Projects, built for a Client who is billed. Change the Project's role if it is contract work.",
    action: "Change the Project's role",
  },
  PROJECT_CLIENT_REQUIRED: {
    icon: UserRound,
    title: "No Client linked",
    description:
      "A Client Bill is a tax invoice to the Project's Client. Pick the Client on the Project first, so the bill carries its name, address and GSTIN.",
    action: "Pick the Client",
  },
  PROJECT_STATE_REQUIRED: {
    icon: MapPin,
    title: "No Project state",
    description:
      "The Project's state is the place of supply on the tax invoice (works on immovable property), and decides CGST + SGST or IGST. Set it on the Project first.",
    action: "Set the Project's state",
  },
} as const;

/**
 * Why a Project cannot take Client Bills yet (CM-1107), the first thing to
 * fix with a link to the Project's form: Own development, no Client
 * linked, or no state.
 */
export function ClientBillSetupEmpty({
  projectId,
  setup,
}: {
  projectId: string;
  setup: ClientBillSetup;
}) {
  const first = setup.blockers[0];
  if (first == null) return null;
  const blocker = BLOCKERS[first];
  const Icon = blocker.icon;
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{blocker.title}</EmptyTitle>
        <EmptyDescription>{blocker.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href={`/app/projects/${projectId}/edit`}
          className={buttonVariants({ size: "sm" })}
        >
          {blocker.action}
        </Link>
        {setup.blockers.length > 1 ? (
          <p className="text-muted-foreground text-xs">
            Then also:{" "}
            {setup.blockers
              .slice(1)
              .map((code) => BLOCKERS[code].action.toLowerCase())
              .join(", ")}
            .
          </p>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
