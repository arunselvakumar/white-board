/**
 * Projects grouped by their client on the Projects home (ADR CM-0027 §1).
 * The client name is free text, so names that differ only in case or
 * spacing ("Sri Balaji Developers", "sri balaji  developers") are one
 * client, shown as the first Project in `all` spells it (the unfiltered
 * list, so a status filter never changes a heading). Groups go by
 * name; Projects with no client come last, in one group with a null
 * `clientName`. Each group keeps the order the Projects came in.
 */
export type ClientGroup<T> = {
  /** Stable for React keys and ids; "" for the no-client group. */
  key: string;
  clientName: string | null;
  projects: T[];
};

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function tidy(name: string | null): string | null {
  const text = name?.trim().replace(/\s+/g, " ") ?? "";
  return text === "" ? null : text;
}

function keyOf(clientName: string | null): string {
  return clientName?.toLocaleLowerCase("en-IN") ?? "";
}

export function groupByClient<T extends { clientName: string | null }>(
  projects: readonly T[],
  all: readonly { clientName: string | null }[] = projects,
): ClientGroup<T>[] {
  const spelling = new Map<string, string>();
  for (const item of all) {
    const clientName = tidy(item.clientName);
    if (clientName != null && !spelling.has(keyOf(clientName)))
      spelling.set(keyOf(clientName), clientName);
  }
  const groups = new Map<string, ClientGroup<T>>();
  for (const project of projects) {
    const tidied = tidy(project.clientName);
    const key = keyOf(tidied);
    const clientName = tidied == null ? null : (spelling.get(key) ?? tidied);
    const group = groups.get(key);
    if (group == null)
      groups.set(key, { key, clientName, projects: [project] });
    else group.projects.push(project);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.clientName == null) return b.clientName == null ? 0 : 1;
    if (b.clientName == null) return -1;
    return byName.compare(a.clientName, b.clientName);
  });
}
