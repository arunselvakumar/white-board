"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";

import {
  closePreschoolCentre,
  preschoolCentreQueries,
  reopenPreschoolCentre,
  updatePreschoolCentreDetails,
  updatePreschoolCentreFranchise,
  type PreschoolCentre,
  type PreschoolCentreDetailsInput,
  type PreschoolCentreFranchiseInput,
} from "@/src/queries/preschool/centres";
import { preschoolKeys } from "@/src/queries/preschool/me";

import { CentreDetail } from "./centre-detail";

export function CentreDetailScreen({ centreId }: { centreId: string }) {
  const queryClient = useQueryClient();
  const { data: centre } = useSuspenseQuery(
    preschoolCentreQueries.detail(centreId),
  );
  const saved = async (next: PreschoolCentre) => {
    queryClient.setQueryData(preschoolCentreQueries.key.detail(centreId), next);
    await queryClient.invalidateQueries({ queryKey: preschoolKeys.all });
  };
  const details = useMutation({
    mutationFn: (input: PreschoolCentreDetailsInput) =>
      updatePreschoolCentreDetails(centreId, input),
    onSuccess: saved,
  });
  const ownership = useMutation({
    mutationFn: (input: PreschoolCentreFranchiseInput) =>
      updatePreschoolCentreFranchise(centreId, input),
    onSuccess: saved,
  });
  const close = useMutation({
    mutationFn: () => closePreschoolCentre(centreId),
    onSuccess: saved,
  });
  const reopen = useMutation({
    mutationFn: () => reopenPreschoolCentre(centreId),
    onSuccess: saved,
  });

  return (
    <CentreDetail
      centre={centre}
      onSaveDetails={async (input) => {
        await details.mutateAsync(input);
      }}
      onSaveOwnership={async (input) => {
        await ownership.mutateAsync(input);
      }}
      onClose={async () => {
        await close.mutateAsync();
      }}
      onReopen={async () => {
        await reopen.mutateAsync();
      }}
    />
  );
}
