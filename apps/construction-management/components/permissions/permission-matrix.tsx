"use client";

import { ChevronRight, Search } from "lucide-react";
import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import {
  byCategory,
  columnState,
  filterMenus,
  grantedCount,
  groupState,
  maskOf,
  setColumn,
  setGroup,
  toggleCell,
  type MatrixCategory,
} from "@/lib/permission-matrix";
import {
  FLAGS,
  FLAG_LABELS,
  MENUS,
  hasFlag,
  type Flag,
  type Menu,
  type MenuCategory,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

type Toggle = (menu: Menu, flag: Flag, on: boolean) => void;

const stickyCell = "bg-card sticky left-0 z-10 w-56 min-w-56 pl-4";

/** One menu's row. Memoised on its mask, so a click re-renders one row. */
const MatrixRow = memo(function MatrixRow({
  menu,
  mask,
  readOnly,
  onToggle,
}: {
  menu: Menu;
  mask: number;
  readOnly: boolean;
  onToggle: Toggle;
}) {
  return (
    <TableRow>
      <TableHead
        scope="row"
        className={cn(stickyCell, "font-normal whitespace-normal")}
      >
        {menu.label}
      </TableHead>
      {FLAGS.map((flag) => (
        <TableCell key={flag} className="w-20 text-center">
          {hasFlag(menu.supported, flag) ? (
            <Checkbox
              className="mx-auto"
              aria-label={`${FLAG_LABELS[flag]} — ${menu.label}`}
              checked={hasFlag(mask, flag)}
              readOnly={readOnly}
              onCheckedChange={(checked) => {
                onToggle(menu, flag, checked);
              }}
            />
          ) : null}
        </TableCell>
      ))}
    </TableRow>
  );
});

function GroupCheckbox({
  label,
  state,
  onChange,
}: {
  label: string;
  state: "all" | "some" | "none";
  onChange: (on: boolean) => void;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={state === "all"}
      indeterminate={state === "some"}
      onCheckedChange={() => {
        // A partly selected group selects everything on the first click.
        onChange(state !== "all");
      }}
    />
  );
}

function CategorySection({
  category,
  value,
  open,
  onOpenChange,
  readOnly,
  onToggle,
  onChange,
}: {
  /** The category with the menus the search left. */
  category: MatrixCategory;
  value: PermissionGrants;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  onToggle: Toggle;
  onChange: (next: PermissionGrants) => void;
}) {
  const headingId = useId();
  // The count covers every menu of the category, not only the matches.
  const allMenus = useMemo(
    () => MENUS.filter((menu) => menu.category === category.key),
    [category.key],
  );
  const granted = grantedCount(value, allMenus);
  return (
    <section
      aria-labelledby={headingId}
      className="bg-card overflow-hidden rounded-xl border"
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="bg-muted/40 flex flex-wrap items-center gap-3 px-2 py-1.5">
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="h-auto gap-2 px-2 py-1.5 font-semibold [&[data-panel-open]>svg]:rotate-90"
              />
            }
          >
            <ChevronRight aria-hidden="true" className="transition-transform" />
            <span id={headingId}>{category.label}</span>
            <Badge variant={granted > 0 ? "default" : "secondary"}>
              {granted}
              <span className="sr-only"> granted</span>
            </Badge>
          </CollapsibleTrigger>
          {readOnly ? null : (
            <span className="text-muted-foreground ml-auto flex items-center gap-2 pr-2 text-sm">
              <GroupCheckbox
                label={`Select all in ${category.label}`}
                state={groupState(value, category.menus)}
                onChange={(on) => {
                  onChange(setGroup(value, category.menus, on));
                }}
              />
              <span aria-hidden="true">All</span>
            </span>
          )}
        </div>
        <CollapsibleContent>
          <Table className="min-w-[76rem] table-fixed border-t">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(stickyCell, "text-xs")}>
                  Menu
                </TableHead>
                {FLAGS.map((flag) => {
                  const state = columnState(value, category.menus, flag);
                  return (
                    <TableHead
                      key={flag}
                      className="h-auto w-20 px-1 py-2 text-center align-top text-xs"
                    >
                      <span className="flex flex-col items-center gap-1.5">
                        <span className="leading-tight whitespace-normal">
                          {FLAG_LABELS[flag]}
                        </span>
                        {state == null || readOnly ? null : (
                          <GroupCheckbox
                            label={`Select all ${FLAG_LABELS[flag]} in ${category.label}`}
                            state={state}
                            onChange={(on) => {
                              onChange(
                                setColumn(value, category.menus, flag, on),
                              );
                            }}
                          />
                        )}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {category.menus.map((menu) => (
                <MatrixRow
                  key={menu.key}
                  menu={menu}
                  mask={maskOf(value, menu)}
                  readOnly={readOnly}
                  onToggle={onToggle}
                />
              ))}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

/**
 * The Permission Matrix (ADR CM-0003): menus grouped by category, one column
 * per flag, a checkbox only where the menu supports the flag. Controlled;
 * used by the Team Member wizard and the Designation template editor.
 */
export function PermissionMatrix({
  value,
  onChange,
  readOnly = false,
  className,
}: {
  value: PermissionGrants;
  onChange: (next: PermissionGrants) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<MenuCategory>>(
    () => new Set(),
  );
  const categories = useMemo(
    () => byCategory(filterMenus(MENUS, query)),
    [query],
  );
  const searching = query.trim() !== "";
  const total = grantedCount(value, MENUS);

  // Rows get one stable toggle, so only the clicked row re-renders.
  const latest = useRef({ value, onChange, readOnly });
  useLayoutEffect(() => {
    latest.current = { value, onChange, readOnly };
  });
  const onToggle = useCallback<Toggle>((menu, flag, on) => {
    const current = latest.current;
    if (current.readOnly) return;
    current.onChange(toggleCell(current.value, menu, flag, on));
  }, []);

  return (
    <div className={cn("min-w-0 space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="w-full sm:max-w-xs">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search menus"
            placeholder="Search menus"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </InputGroup>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {total === 1 ? "1 permission" : `${String(total)} permissions`}{" "}
          granted
        </p>
        {readOnly ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sm:ml-auto"
            disabled={total === 0}
            onClick={() => {
              onChange({});
            }}
          >
            Clear all
          </Button>
        )}
      </div>
      {categories.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          No menu matches “{query.trim()}”.
        </p>
      ) : (
        categories.map((category) => (
          <CategorySection
            key={category.key}
            category={category}
            value={value}
            open={searching || !collapsed.has(category.key)}
            onOpenChange={(open) => {
              setCollapsed((previous) => {
                const next = new Set(previous);
                if (open) next.delete(category.key);
                else next.add(category.key);
                return next;
              });
            }}
            readOnly={readOnly}
            onToggle={onToggle}
            onChange={onChange}
          />
        ))
      )}
    </div>
  );
}
