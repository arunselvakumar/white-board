/**
 * A sidebar row (ADR-0049): muted on the ink panel, the primary pill when
 * current. No hover background of its own: the `SidebarGlide` pill moves
 * under the hovered row (ADR-0050).
 */
export const NAV_BUTTON_CLASS =
  "text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-foreground data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:[&_svg]:text-sidebar-primary-foreground data-active:font-semibold h-10 gap-3 rounded-xl px-3 transition-colors [&_svg]:size-[18px] [&_svg]:text-sidebar-foreground/65 hover:[&_svg]:text-sidebar-foreground";
