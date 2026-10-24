"use client";

import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { SplitText } from "gsap/SplitText";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

gsap.registerPlugin(SplitText, ScrambleTextPlugin);

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** A click's ripple: it scrambles each character once as it passes. */
type Wave = {
  x: number;
  y: number;
  age: number;
  reach: number;
  life: number;
  hit: Uint8Array;
};

/**
 * React Bits' Scrambled Text (its `scramble` effect), on GSAP's SplitText and
 * ScrambleText plugins. On first view the characters decode out of `.:` noise,
 * roughly left to right; the pointer re-scrambles the characters near it, and
 * a click sends a scrambling ripple through the text. A hidden copy of each
 * character holds its width, so the lines never reflow while it scrambles.
 * Reduced motion shows the text still, even when it is turned on while the
 * text is on screen. Screen readers get the sentence once
 * from a visually hidden copy.
 */
export function ScrambledText({
  children,
  className,
  radius = 100,
  duration = 1.2,
  speed = 0.5,
  scrambleChars = ".:",
}: {
  children: string;
  className?: string;
  /** Pixels around the pointer whose characters scramble. */
  radius?: number;
  /** Seconds the first decode takes; also the longest hover scramble. */
  duration?: number;
  /** How often the noise changes (ScrambleText's `speed`). */
  speed?: number;
  scrambleChars?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  // Splitting before the web font lands would measure the fallback font.
  const [fontsReady, setFontsReady] = useState(
    () => typeof document === "undefined" || document.fonts.status === "loaded",
  );

  useEffect(() => {
    if (fontsReady) return;
    let live = true;
    const ready = () => {
      if (live) setFontsReady(true);
    };
    document.fonts.ready.then(ready, ready);
    return () => {
      live = false;
    };
  }, [fontsReady]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const textEl = textRef.current;
    // Turning reduced motion on re-runs this effect: the cleanup stops every
    // tween and reverts the split, and this early return leaves it still.
    if (root == null || textEl == null || !fontsReady || reducedMotion) return;

    const split = SplitText.create(textEl, {
      type: "chars",
      smartWrap: true,
      aria: "none",
    });
    const chars = split.chars as HTMLElement[];
    const originals = chars.map((char) => char.textContent);
    const glyphs = chars.map((char, index) => {
      const sizer = document.createElement("span");
      sizer.textContent = originals[index] ?? "";
      sizer.style.visibility = "hidden";
      const glyph = document.createElement("span");
      glyph.textContent = originals[index] ?? "";
      glyph.style.cssText =
        "position:absolute;top:0;left:50%;transform:translateX(-50%);white-space:pre";
      char.replaceChildren(sizer, glyph);
      return glyph;
    });
    textEl.dataset["split"] = "";

    const scramble = (
      index: number,
      length: number,
      revealDelay = 0,
    ): gsap.TweenVars => ({
      overwrite: true,
      duration: length,
      ease: "none",
      scrambleText: {
        text: originals[index] ?? "",
        chars: scrambleChars,
        speed,
        revealDelay,
      },
    });

    // The first decode waits until the text is on screen.
    const intro = gsap.timeline({ paused: true });
    glyphs.forEach((glyph, index) => {
      const reveal =
        0.15 +
        duration * (0.75 * (index / glyphs.length) + 0.25 * Math.random());
      intro.to(glyph, scramble(index, reveal + 0.1, reveal), 0);
    });
    intro.time(0.001);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting !== true) return;
        observer.disconnect();
        intro.play();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(root);

    // Character centres relative to the root, measured lazily.
    const points = chars.map(() => ({ x: 0, y: 0 }));
    let measured = false;
    let fontPx = 16;
    const offsetOf = (el: HTMLElement): [number, number] => {
      let x = 0;
      let y = 0;
      for (
        let node: HTMLElement | null = el;
        node != null;
        node = node.offsetParent as HTMLElement | null
      ) {
        x += node.offsetLeft;
        y += node.offsetTop;
      }
      return [x, y];
    };
    const measure = () => {
      fontPx = parseFloat(window.getComputedStyle(textEl).fontSize) || 16;
      const [rootX, rootY] = offsetOf(root);
      chars.forEach((char, index) => {
        const [x, y] = offsetOf(char);
        points[index] = {
          x: x - rootX + char.offsetWidth / 2,
          y: y - rootY + char.offsetHeight / 2,
        };
      });
      measured = true;
    };
    const toLocal = (event: PointerEvent): [number, number] => {
      const rect = root.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };

    const pointer = { x: 0, y: 0 };
    let moveFrame = 0;
    const scrambleNearPointer = () => {
      moveFrame = 0;
      if (!measured) measure();
      points.forEach((point, index) => {
        const distance = Math.hypot(pointer.x - point.x, pointer.y - point.y);
        if (distance < radius) {
          gsap.to(
            glyphs[index] ?? null,
            scramble(index, duration * (1 - distance / radius)),
          );
        }
      });
    };

    const waves: Wave[] = [];
    let waveFrame = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last === 0 ? 1 / 60 : Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const wave of waves) {
        wave.age += dt;
        const t = Math.min(1, wave.age / wave.life);
        const r = wave.reach * (1 - (1 - t) ** 2);
        points.forEach((point, index) => {
          if (wave.hit[index] === 1) return;
          const distance = Math.hypot(point.x - wave.x, point.y - wave.y);
          if (distance > r) return;
          wave.hit[index] = 1;
          const strength = 1 - (0.6 * distance) / wave.reach;
          gsap.to(
            glyphs[index] ?? null,
            scramble(index, Math.max(0.2, duration * (0.2 + 0.5 * strength))),
          );
        });
      }
      for (let index = waves.length - 1; index >= 0; index -= 1) {
        const wave = waves[index];
        if (wave != null && wave.age >= wave.life) waves.splice(index, 1);
      }
      if (waves.length > 0) {
        waveFrame = requestAnimationFrame(tick);
      } else {
        waveFrame = 0;
        last = 0;
      }
    };

    const handleEnter = () => {
      measured = false;
    };
    const handleMove = (event: PointerEvent) => {
      [pointer.x, pointer.y] = toLocal(event);
      if (moveFrame === 0)
        moveFrame = requestAnimationFrame(scrambleNearPointer);
    };
    const handleDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!measured) measure();
      const [x, y] = toLocal(event);
      const reach =
        Math.max(
          ...points.map((point) => Math.hypot(point.x - x, point.y - y)),
        ) + fontPx;
      if (waves.length > 3) waves.shift();
      waves.push({
        x,
        y,
        age: 0,
        reach,
        life: 0.45 + reach / 1100,
        hit: new Uint8Array(chars.length),
      });
      if (waveFrame === 0) waveFrame = requestAnimationFrame(tick);
    };

    const resize = new ResizeObserver(() => {
      measured = false;
    });
    resize.observe(root);
    root.addEventListener("pointerenter", handleEnter);
    root.addEventListener("pointermove", handleMove);
    root.addEventListener("pointerdown", handleDown);

    return () => {
      root.removeEventListener("pointerenter", handleEnter);
      root.removeEventListener("pointermove", handleMove);
      root.removeEventListener("pointerdown", handleDown);
      resize.disconnect();
      observer.disconnect();
      cancelAnimationFrame(moveFrame);
      cancelAnimationFrame(waveFrame);
      intro.kill();
      gsap.killTweensOf(glyphs);
      split.revert();
      delete textEl.dataset["split"];
    };
  }, [
    children,
    duration,
    fontsReady,
    radius,
    reducedMotion,
    scrambleChars,
    speed,
  ]);

  return (
    <div ref={rootRef} className={className}>
      <span className="sr-only">{children}</span>
      {/* Hidden until split, so the sentence doesn't flash before it decodes. */}
      <p
        key={children}
        ref={textRef}
        aria-hidden="true"
        className="motion-safe:not-data-split:invisible"
      >
        {children}
      </p>
    </div>
  );
}
