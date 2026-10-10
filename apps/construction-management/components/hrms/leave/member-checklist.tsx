"use client";

import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";

export type PickableMember = {
  memberId: string;
  name: string;
  designationName: string | null;
};

/** Team Members with a checkbox each and "All Team Members" on top. */
export function MemberChecklist({
  idPrefix,
  members,
  value,
  onChange,
  invalid,
}: {
  idPrefix: string;
  members: readonly PickableMember[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const chosen = new Set(value);
  const all =
    members.length > 0 && members.every((m) => chosen.has(m.memberId));
  return (
    <div
      className="max-h-64 overflow-y-auto rounded-lg border"
      aria-invalid={invalid === true ? true : undefined}
    >
      <div className="bg-muted/40 flex items-center gap-3 border-b px-3 py-2.5">
        <Checkbox
          id={`${idPrefix}-all`}
          checked={all}
          onCheckedChange={(checked) => {
            onChange(checked ? members.map((m) => m.memberId) : []);
          }}
        />
        <Label htmlFor={`${idPrefix}-all`}>All Team Members</Label>
      </div>
      <ul className="divide-y">
        {members.map((member) => (
          <li
            key={member.memberId}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <Checkbox
              id={`${idPrefix}-${member.memberId}`}
              checked={chosen.has(member.memberId)}
              onCheckedChange={(checked) => {
                onChange(
                  checked
                    ? [...value, member.memberId]
                    : value.filter((id) => id !== member.memberId),
                );
              }}
            />
            <Label
              htmlFor={`${idPrefix}-${member.memberId}`}
              className="min-w-0 flex-1 font-normal"
            >
              <span className="truncate font-medium">{member.name}</span>
              {member.designationName != null ? (
                <span className="text-muted-foreground truncate text-xs">
                  {member.designationName}
                </span>
              ) : null}
            </Label>
          </li>
        ))}
      </ul>
    </div>
  );
}
