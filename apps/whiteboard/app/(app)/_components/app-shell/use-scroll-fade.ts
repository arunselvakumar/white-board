"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Whether a scroll area has more above or below what is shown, kept up to
 * date as it scrolls or its content grows. The sidebar fades the edge where
 * more is hidden, since its scroll bar is not drawn.
 */
export function useScrollFade<Element extends HTMLElement>() {
  const ref = useRef<Element>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  useEffect(() => {
    const element = ref.current;
    if (element == null) return;
    const update = () => {
      const top = element.scrollTop > 1;
      const bottom =
        element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      setFade((current) =>
        current.top === top && current.bottom === bottom
          ? current
          : { top, bottom },
      );
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(element);
    const content = new MutationObserver(() => {
      for (const child of element.children) resize.observe(child);
      update();
    });
    content.observe(element, { childList: true, subtree: true });
    for (const child of element.children) resize.observe(child);
    return () => {
      element.removeEventListener("scroll", update);
      resize.disconnect();
      content.disconnect();
    };
  }, []);

  return { ref, fade };
}

/** Masks the edges of a scroll area that hide more of the list. */
export function scrollFadeClass(fade: {
  top: boolean;
  bottom: boolean;
}): string {
  if (fade.top && fade.bottom)
    return "[mask-image:linear-gradient(to_bottom,transparent,black_2.5rem,black_calc(100%-2.5rem),transparent)]";
  if (fade.bottom)
    return "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]";
  if (fade.top)
    return "[mask-image:linear-gradient(to_bottom,transparent,black_2.5rem)]";
  return "";
}
