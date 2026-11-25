"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  childDetailsInput,
  healthInput,
  parentsInput,
  pickupsInput,
} from "@/app/(app)/preschool/children/_components/child-form-fields";
import {
  movePreschoolChildClassroom,
  preschoolChildKeys,
  preschoolChildQueryOptions,
  promotePreschoolChild,
  replacePreschoolChildPickups,
  updatePreschoolChildHealth,
  updatePreschoolChildParents,
  updatePreschoolChildProfile,
  withdrawPreschoolChild,
  type PreschoolChildProfile,
} from "@/src/queries/preschool/children";

import { ChildDetail, type ChildDetailActions } from "./child-detail";

export function ChildScreen({
  childId,
  ageWarning = null,
}: {
  childId: string;
  /** From the admission form: the age is outside the Programme's range. */
  ageWarning?: string | null;
}) {
  const queryClient = useQueryClient();
  const { me } = useActiveCentre();
  const { data: child } = useSuspenseQuery(preschoolChildQueryOptions(childId));
  const [warning, setWarning] = useState(ageWarning);

  const saved = async (next: PreschoolChildProfile) => {
    queryClient.setQueryData(preschoolChildKeys.detail(childId), next);
    await queryClient.invalidateQueries({
      queryKey: [...preschoolChildKeys.all, "list"],
    });
  };
  const version = { updatedAt: child.updatedAt };

  const actions: ChildDetailActions = {
    saveProfile: async (values) => {
      await saved(
        await updatePreschoolChildProfile(childId, {
          ...childDetailsInput(values),
          ...version,
        }),
      );
    },
    saveParents: async (values) => {
      await saved(
        await updatePreschoolChildParents(childId, {
          ...parentsInput(values),
          ...version,
        }),
      );
    },
    savePickups: async (values) => {
      await saved(
        await replacePreschoolChildPickups(childId, {
          authorisedPickups: pickupsInput(values),
          ...version,
        }),
      );
    },
    saveHealth: async (values) => {
      await saved(
        await updatePreschoolChildHealth(childId, {
          ...healthInput(values),
          ...version,
        }),
      );
    },
    reload: async () => {
      await queryClient.invalidateQueries({
        queryKey: preschoolChildKeys.detail(childId),
      });
    },
    move: async (input) => {
      await saved(await movePreschoolChildClassroom(childId, input));
    },
    promote: async (input) => {
      const result = await promotePreschoolChild(childId, input);
      setWarning(result.ageWarning);
      await saved(result.child);
    },
    withdraw: async (input) => {
      await saved(await withdrawPreschoolChild(childId, input));
    },
  };

  return (
    <ChildDetail
      child={child}
      role={me.role}
      ageWarning={warning}
      actions={actions}
    />
  );
}
