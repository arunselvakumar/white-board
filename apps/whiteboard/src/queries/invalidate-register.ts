import type { QueryClient } from "@tanstack/react-query";

import { batchQueries } from "./batches";
import { dashboardQueries } from "./dashboard";
import { enrollmentQueries } from "./enrollments";
import { studentQueries } from "./students";

export function invalidateRegisterQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: enrollmentQueries.key.all }),
    queryClient.invalidateQueries({ queryKey: studentQueries.key.all }),
    queryClient.invalidateQueries({ queryKey: batchQueries.key.all }),
    queryClient.invalidateQueries({ queryKey: dashboardQueries.key.all }),
  ]);
}
