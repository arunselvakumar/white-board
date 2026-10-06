"use client";

import { useEffect, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LinearSRGBColorSpace,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import {
  fieldPoints,
  limitPoints,
  logoPoints,
  type Rect,
  registerPoints,
  sortByX,
  wordFont,
  wordFontSize,
  wordPoints,
} from "@/lib/dot-shapes";
import { gsap, MOTION_OK } from "@/lib/gsap";

/*
 * The hero dot field: one THREE.Points mesh on paper. Every point blends
 * between two positions (`aFrom` -> `aTo`) and two kinds (hidden, field,
 * shape) as `uMorph` runs 0 -> 1. GSAP drives `uMorph`; three.js only draws.
 *
 * Points [0, field) are the background hex field and never move. Points
 * [field, count) are the pool: they form the current shape, and the ones a
 * shape does not need fall back into the grid next to it, hidden.
 */

const WORDS = ["Students", "Courses", "Batches", "Fees", "Receipts"] as const;
/** Shape indices: 0 logo, 1-5 the words, 6 the register page. */
const LOGO = 0;
const REGISTER = WORDS.length + 1;
const LOOP = [1, 2, 3, 4, 5, REGISTER, LOGO] as const;

const DESKTOP_POINTS = 14_000;
const MOBILE_POINTS = 6_000;
const FIELD_SPACING = 26;
const COPY_KEEP = 0.4;
/** Field dots behind the copy draw at 60% of the field's alpha. */
const COPY_KIND = 0.6;
const PARK_SLOTS = 420;
const STAGGER = 0.3;
const ARC = 0.12;
const FIELD_SIZE = 2.6;
const SHAPE_SIZE = 3.6;
const POINTER_RADIUS = 120;

const KIND_HIDDEN = 0;
const KIND_FIELD = 1;
const KIND_SHAPE = 2;

const VERTEX = /* glsl */ `
uniform float uMorph;
uniform float uTime;
uniform float uMotion;
uniform float uDpr;
uniform float uFieldSize;
uniform float uShapeSize;
uniform float uScroll;
uniform float uRadius;
uniform float uPointerForce;
uniform vec2 uPointer;
uniform vec3 uFieldColor;
uniform vec3 uShapeColor;
uniform vec3 uFieldBlink;
uniform vec3 uShapeBlink;

attribute vec2 aFrom;
attribute vec2 aTo;
attribute vec2 aKind;
attribute float aSeed;
attribute float aBlink;

varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265;
const float STAGGER = ${STAGGER.toFixed(2)};
const float ARC = ${ARC.toFixed(2)};
const float FIELD_ALPHA = 0.34;

void main() {
  float t = clamp((uMorph - aSeed * STAGGER) / (1.0 - STAGGER), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);

  vec2 travel = aTo - aFrom;
  vec2 p = mix(aFrom, aTo, t)
    + vec2(-travel.y, travel.x) * sin(t * PI) * ARC * (aBlink - 0.5);

  float kind = mix(aKind.x, aKind.y, t);
  float shape = clamp(kind - 1.0, 0.0, 1.0);
  float alpha = kind < 1.0 ? FIELD_ALPHA * kind : mix(FIELD_ALPHA, 1.0, shape);
  float size = mix(uFieldSize, uShapeSize, shape);
  vec3 color = mix(uFieldColor, uShapeColor, shape);

  p += uMotion * 0.35 * vec2(
    sin(uTime * 0.7 + aSeed * 40.0),
    cos(uTime * 0.6 + aBlink * 50.0)
  );

  vec2 away = p - uPointer;
  float dist = max(length(away), 0.001);
  float push = 1.0 - smoothstep(0.0, uRadius, dist);
  p += away / dist * push * push * 30.0 * uPointerForce;

  float lift = uScroll * shape;
  p.y -= 80.0 * lift;
  alpha *= 1.0 - 0.8 * lift;

  // Blinks: each point gets a slow pulse every ~7s, and only a few points
  // are picked in any one cycle.
  float phase = uTime * 0.9 + aBlink * 100.0;
  float cycle = floor(phase / 6.2831853);
  float pick = fract(sin(cycle * 12.9898 + aBlink * 78.233) * 43758.5453);
  float chance = mix(0.05, 0.07, shape);
  float bell = pow(0.5 - 0.5 * cos(phase), 8.0);
  float blink = uMotion * smoothstep(0.8, 1.0, kind) * step(pick, chance) * bell;
  color = mix(color, mix(uFieldBlink, uShapeBlink, shape), blink);
  alpha = max(alpha, blink * 0.7 * (1.0 - 0.8 * lift));
  size *= 1.0 + 0.4 * blink;

  vColor = color;
  vAlpha = alpha;
  gl_PointSize = alpha < 0.004 ? 0.0 : size * uDpr;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = vAlpha * (1.0 - smoothstep(0.3, 0.5, d));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

/** Brand colours stored as-is (no linear conversion; the shader writes them raw). */
function brand(hex: number): Color {
  return new Color().setHex(hex, LinearSRGBColorSpace);
}

function smooth(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function random(i: number): number {
  const s = Math.sin(i * 91.345 + 17.17) * 47453.5453;
  return s - Math.floor(s);
}

type Layout = {
  width: number;
  height: number;
  /** Where the section sits in the document, for pointer mapping. */
  pageLeft: number;
  pageTop: number;
  copy: Rect;
  cx: number;
  cy: number;
  boxWidth: number;
  boxHeight: number;
  mobile: boolean;
};

function measure(container: HTMLElement): Layout | null {
  const rect = container.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width < 1 || height < 1) return null;
  const section = container.parentElement;
  const copyEl = section?.querySelector<HTMLElement>("[data-dot-copy]");
  const copyRect = copyEl?.getBoundingClientRect();
  const lastRect = copyEl?.lastElementChild?.getBoundingClientRect();
  const gridRect = copyEl?.parentElement?.getBoundingClientRect();

  const pad = 16;
  const copy: Rect = copyRect
    ? {
        left: copyRect.left - rect.left - pad,
        top: copyRect.top - rect.top - pad,
        right: copyRect.right - rect.left + pad,
        bottom: (lastRect ?? copyRect).bottom - rect.top + pad,
      }
    : { left: 0, top: 0, right: width * 0.45, bottom: height };

  const mobile = width < 1024;
  let cx: number;
  let cy: number;
  let boxWidth: number;
  let boxHeight: number;
  if (mobile) {
    const top = copy.bottom + 8;
    const bottom = copyRect ? copyRect.bottom - rect.top : height - 24;
    cx = width / 2;
    cy = (top + bottom) / 2;
    boxWidth = Math.min(width - 48, 560) * 0.82;
    boxHeight = Math.max(80, bottom - top);
  } else {
    const start = Math.max(width * 0.45, copy.right + 32);
    const gridRight = gridRect ? gridRect.right - rect.left : width;
    const end = Math.min(width, gridRight + width * 0.06);
    cx = (start + end) / 2;
    cy = (copy.top + copy.bottom) / 2;
    boxWidth = Math.min((end - start) * 0.7, 640);
    boxHeight = Math.min(height - 192, boxWidth);
  }

  return {
    width,
    height,
    pageLeft: rect.left + window.scrollX,
    pageTop: rect.top + window.scrollY,
    copy,
    cx,
    cy,
    boxWidth,
    boxHeight,
    mobile,
  };
}

type Buffers = {
  count: number;
  from: Float32Array;
  to: Float32Array;
  kind: Float32Array;
  seed: Float32Array;
  blink: Float32Array;
  geometry: BufferGeometry;
};

function createBuffers(count: number): Buffers {
  const from = new Float32Array(count * 2);
  const to = new Float32Array(count * 2);
  const kind = new Float32Array(count * 2);
  const seed = new Float32Array(count);
  const blink = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    seed[i] = random(i);
    blink[i] = random(i + 0.5);
  }
  const geometry = new BufferGeometry();
  const attribute = (array: Float32Array, size: number) =>
    new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
  geometry.setAttribute("aFrom", attribute(from, 2));
  geometry.setAttribute("aTo", attribute(to, 2));
  geometry.setAttribute("aKind", attribute(kind, 2));
  geometry.setAttribute("aSeed", attribute(seed, 1));
  geometry.setAttribute("aBlink", new BufferAttribute(blink, 1));
  geometry.setDrawRange(0, count);
  return { count, from, to, kind, seed, blink, geometry };
}

export function DotField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const section = container.parentElement ?? container;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const renderer = new WebGLRenderer({
      canvas,
      context: gl,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    const camera = new OrthographicCamera(0, 1, 0, 1, -1, 1);
    const scene = new Scene();
    const uniforms = {
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uDpr: { value: dpr },
      uFieldSize: { value: FIELD_SIZE },
      uShapeSize: { value: SHAPE_SIZE },
      uScroll: { value: 0 },
      uRadius: { value: POINTER_RADIUS },
      uPointerForce: { value: 0 },
      uPointer: { value: { x: -1e4, y: -1e4 } },
      uFieldColor: { value: brand(0x848cba) },
      uShapeColor: { value: brand(0x595fae) },
      uFieldBlink: { value: brand(0x595fae) },
      uShapeBlink: { value: brand(0xd1d6ec) },
    };
    const material = new ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    let buffers = createBuffers(DESKTOP_POINTS);
    const points = new Points(buffers.geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    let disposed = false;
    let layout: Layout | null = null;
    let fontFamily = "sans-serif";
    let field: Float32Array = new Float32Array();
    let fieldCount = 0;
    /** Per field point: 1, or dimmer inside the copy. */
    let fieldKind = new Float32Array();
    let park = new Uint32Array();
    let shapes: Float32Array[] = [];
    /** order[k] = the point holding rank k of the current shape. */
    let order = new Uint32Array();
    let nextOrder = new Uint32Array();
    let picked = new Uint8Array();
    let shapeCount = 0;
    let currentShape = LOGO;
    let motion = false;

    const size = () => {
      if (!layout) return;
      renderer.setSize(layout.width, layout.height, false);
      camera.right = layout.width;
      camera.bottom = layout.height;
      camera.updateProjectionMatrix();
    };

    const flag = () => {
      const attrs = buffers.geometry.attributes;
      for (const name of ["aFrom", "aTo", "aKind", "aSeed"]) {
        const attr = attrs[name];
        if (attr) attr.needsUpdate = true;
      }
    };

    const fieldX = (i: number) => field[i * 2] ?? 0;
    const fieldK = (i: number) => fieldKind[i] ?? KIND_FIELD;
    const fieldY = (i: number) => field[i * 2 + 1] ?? 0;

    /** Sends pool rank `k` (outside the shape) to a grid point near the shape. */
    const parkAt = (slot: number, k: number) => {
      const target = park[k % Math.max(1, park.length)] ?? 0;
      buffers.to[slot * 2] = fieldX(target);
      buffers.to[slot * 2 + 1] = fieldY(target);
      buffers.kind[slot * 2 + 1] = KIND_HIDDEN;
    };

    /** Writes the blended state at `morph` into aFrom / aKind.x (mirrors the shader). */
    const bake = (morph: number) => {
      const { from, to, kind, seed, blink, count } = buffers;
      for (let i = 0; i < count; i += 1) {
        const t = smooth((morph - (seed[i] ?? 0) * STAGGER) / (1 - STAGGER));
        const fx = from[i * 2] ?? 0;
        const fy = from[i * 2 + 1] ?? 0;
        const dx = (to[i * 2] ?? 0) - fx;
        const dy = (to[i * 2 + 1] ?? 0) - fy;
        const arc = Math.sin(t * Math.PI) * ARC * ((blink[i] ?? 0) - 0.5);
        from[i * 2] = fx + dx * t - dy * arc;
        from[i * 2 + 1] = fy + dy * t + dx * arc;
        const k0 = kind[i * 2] ?? 0;
        kind[i * 2] = k0 + ((kind[i * 2 + 1] ?? 0) - k0) * t;
      }
    };

    /**
     * Copies the current blended positions into aFrom, sends the pool to the
     * next shape by rank, parks what is left in the grid, and resets uMorph.
     */
    const setTarget = (shapeIndex: number, fromCurrent = true) => {
      const target = shapes[shapeIndex];
      if (!target || !layout) return;
      if (fromCurrent) bake(uniforms.uMorph.value);
      const pool = order.length;
      const next = Math.min(target.length / 2, pool);
      const prev = shapeCount;
      picked.fill(0, 0, Math.max(next, prev));

      if (next >= prev) {
        // Each old dot moves to the same relative rank; recruits fill the gaps.
        for (let j = 0; j < prev; j += 1) {
          const k = Math.floor((j * next) / Math.max(1, prev));
          nextOrder[k] = order[j] ?? 0;
          picked[k] = 1;
        }
        let r = prev;
        for (let k = 0; k < next; k += 1) {
          if (picked[k]) continue;
          nextOrder[k] = order[r] ?? 0;
          r += 1;
        }
        for (let k = next; k < pool; k += 1, r += 1) {
          nextOrder[k] = order[r] ?? 0;
        }
      } else {
        // Keep an even subset of the old dots; the rest fall back to the grid.
        for (let k = 0; k < next; k += 1) {
          const j = Math.floor((k * prev) / next);
          nextOrder[k] = order[j] ?? 0;
          picked[j] = 1;
        }
        let w = next;
        for (let j = 0; j < prev; j += 1) {
          if (picked[j]) continue;
          nextOrder[w] = order[j] ?? 0;
          w += 1;
        }
        for (let j = prev; j < pool; j += 1, w += 1) {
          nextOrder[w] = order[j] ?? 0;
        }
      }

      const left = layout.cx - layout.boxWidth / 2;
      for (let k = 0; k < pool; k += 1) {
        const slot = nextOrder[k] ?? 0;
        if (k < next) {
          const x = target[k * 2] ?? 0;
          buffers.to[slot * 2] = x;
          buffers.to[slot * 2 + 1] = target[k * 2 + 1] ?? 0;
          buffers.kind[slot * 2 + 1] = KIND_SHAPE;
          // Arrival sweeps left to right, loosely.
          const across = Math.min(1, Math.max(0, (x - left) / layout.boxWidth));
          buffers.seed[slot] = across * 0.55 + random(slot + k) * 0.45;
        } else {
          parkAt(slot, k);
          buffers.seed[slot] = random(slot + k);
        }
      }

      const swap = order;
      order = nextOrder;
      nextOrder = swap;
      shapeCount = next;
      currentShape = shapeIndex;
      uniforms.uMorph.value = 0;
      flag();
    };

    /** Puts every point straight onto `shapeIndex` with no transition. */
    const snap = (shapeIndex: number) => {
      const { from, to, kind } = buffers;
      for (let i = 0; i < fieldCount; i += 1) {
        to[i * 2] = fieldX(i);
        to[i * 2 + 1] = fieldY(i);
        kind[i * 2 + 1] = fieldK(i);
      }
      for (let k = 0; k < order.length; k += 1) order[k] = fieldCount + k;
      shapeCount = 0;
      setTarget(shapeIndex, false);
      from.set(to);
      for (let i = 0; i < buffers.count; i += 1) {
        kind[i * 2] = kind[i * 2 + 1] ?? 0;
      }
      flag();
    };

    /** The load state: the field fades in, the pool is a loose cloud. */
    const scatter = () => {
      if (!layout) return;
      const { from, kind } = buffers;
      const spread = Math.max(layout.boxWidth, layout.boxHeight) * 0.85;
      for (let i = 0; i < fieldCount; i += 1) {
        from[i * 2] = fieldX(i);
        from[i * 2 + 1] = fieldY(i);
        kind[i * 2] = KIND_HIDDEN;
      }
      for (let i = fieldCount; i < buffers.count; i += 1) {
        const angle = random(i * 3.1) * Math.PI * 2;
        const radius = spread * Math.sqrt(random(i * 7.7));
        from[i * 2] = layout.cx + Math.cos(angle) * radius * 1.25;
        from[i * 2 + 1] = layout.cy + Math.sin(angle) * radius * 0.8;
        kind[i * 2] = random(i * 1.3) < 0.4 ? KIND_FIELD : KIND_HIDDEN;
      }
      for (let i = 0; i < fieldCount; i += 1) {
        buffers.to[i * 2] = fieldX(i);
        buffers.to[i * 2 + 1] = fieldY(i);
        kind[i * 2 + 1] = fieldK(i);
      }
      for (let k = 0; k < order.length; k += 1) order[k] = fieldCount + k;
      shapeCount = 0;
      setTarget(LOGO, false);
    };

    /** Measures, then rebuilds the field, the shapes, and the buffers. */
    const build = () => {
      const next = measure(container);
      if (!next) return false;
      layout = next;
      size();

      const count =
        next.mobile && next.width < 768 ? MOBILE_POINTS : DESKTOP_POINTS;
      if (count !== buffers.count) {
        buffers.geometry.dispose();
        buffers = createBuffers(count);
        points.geometry = buffers.geometry;
      }

      field = fieldPoints(
        next.width,
        next.height,
        FIELD_SPACING,
        next.copy,
        COPY_KEEP,
      );
      fieldCount = Math.min(field.length / 2, Math.floor(count * 0.6));
      fieldKind = new Float32Array(fieldCount);
      for (let i = 0; i < fieldCount; i += 1) {
        const x = fieldX(i);
        const y = fieldY(i);
        const c = next.copy;
        const inCopy = x > c.left && x < c.right && y > c.top && y < c.bottom;
        fieldKind[i] = inCopy ? COPY_KIND : KIND_FIELD;
      }
      const pool = count - fieldCount;
      order = new Uint32Array(pool);
      nextOrder = new Uint32Array(pool);
      picked = new Uint8Array(pool);

      // Parking: the grid points nearest the shape, outside the copy.
      const near: number[] = [];
      for (let i = 0; i < fieldCount; i += 1) {
        const x = fieldX(i);
        const y = fieldY(i);
        const c = next.copy;
        if (x > c.left && x < c.right && y > c.top && y < c.bottom) continue;
        near.push(i);
      }
      const distance = (i: number) =>
        Math.hypot(fieldX(i) - next.cx, fieldY(i) - next.cy);
      near.sort((a, b) => distance(a) - distance(b));
      park = Uint32Array.from(near.slice(0, PARK_SLOTS));

      const step = Math.min(7, Math.max(4, next.boxWidth / 95));
      uniforms.uShapeSize.value = Math.min(SHAPE_SIZE, step * 0.66);
      const logoSide = Math.min(next.boxWidth * 0.62, next.boxHeight * 0.85);
      const fontSize = wordFontSize(
        WORDS,
        fontFamily,
        next.boxWidth,
        next.boxHeight * 0.5,
      );
      const pageWidth = next.boxWidth;
      const pageHeight = Math.min(pageWidth * 0.62, next.boxHeight * 0.92);
      const jitter = step * 6;
      const raw = [
        logoPoints(next.cx, next.cy, logoSide, step),
        ...WORDS.map((word) =>
          wordPoints(word, next.cx, next.cy, fontSize, fontFamily, step),
        ),
        registerPoints(
          {
            cx: next.cx,
            cy: next.cy,
            width: pageWidth,
            height: pageHeight,
          },
          step,
        ),
      ];
      shapes = raw.map((shape) => sortByX(limitPoints(shape, pool), jitter));
      return true;
    };

    // Pointer, in canvas pixels. Mapped through the document so a frame never
    // reads layout.
    let pointerX = -1e4;
    let pointerY = -1e4;
    let pointerTarget = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerTarget = 1;
    };
    const onPointerLeave = () => {
      pointerTarget = 0;
    };

    const render = () => {
      if (disposed || !layout) return;
      uniforms.uTime.value = performance.now() / 1000;
      const force = uniforms.uPointerForce.value;
      uniforms.uPointerForce.value = force + (pointerTarget - force) * 0.1;
      uniforms.uPointer.value.x = pointerX + window.scrollX - layout.pageLeft;
      uniforms.uPointer.value.y = pointerY + window.scrollY - layout.pageTop;
      renderer.render(scene, camera);
    };

    // The loop runs only while the hero is on screen. A hidden tab already
    // throttles requestAnimationFrame, so visibility needs no extra gate.
    let onScreen = true;
    let ticking = false;
    const updateLoop = () => {
      const run = motion && onScreen;
      if (run && !ticking) gsap.ticker.add(render);
      if (!run && ticking) gsap.ticker.remove(render);
      ticking = run;
    };
    const intersection = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      updateLoop();
    });
    intersection.observe(container);

    let built = { width: 0, height: 0 };
    let resizeTimer = 0;
    const resize = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      if (
        Math.abs(rect.width - built.width) < 1 &&
        Math.abs(rect.height - built.height) < 1
      ) {
        return;
      }
      if (layout) {
        layout = { ...layout, width: rect.width, height: rect.height };
        size();
      }
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!build() || !layout) return;
        built = { width: layout.width, height: layout.height };
        snap(motion ? currentShape : LOGO);
        if (!motion) uniforms.uMorph.value = 1;
        render();
      }, 150);
    });

    const mm = gsap.matchMedia();

    const start = () => {
      if (disposed || !build() || !layout) return;
      built = { width: layout.width, height: layout.height };
      resize.observe(container);

      mm.add(
        { motion: MOTION_OK, reduce: "(prefers-reduced-motion: reduce)" },
        (context) => {
          if (context.conditions?.["reduce"]) {
            motion = false;
            uniforms.uMotion.value = 0;
            uniforms.uPointerForce.value = 0;
            snap(LOGO);
            uniforms.uMorph.value = 1;
            updateLoop();
            render();
            return;
          }

          motion = true;
          uniforms.uMotion.value = 1;
          scatter();

          const timeline = gsap.timeline();
          timeline.to(uniforms.uMorph, {
            value: 1,
            duration: 1.6,
            ease: "expo.out",
          });
          const loop = gsap.timeline({ repeat: -1 });
          for (const shape of LOOP) {
            loop.call(() => {
              setTarget(shape);
            });
            loop.fromTo(
              uniforms.uMorph,
              { value: 0 },
              {
                value: 1,
                duration: 1.1,
                ease: "power3.inOut",
                immediateRender: false,
              },
            );
            loop.to({}, { duration: 1.4 });
          }
          timeline.add(loop, "+=1.2");

          gsap.to(uniforms.uScroll, {
            value: 1,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "bottom top",
              scrub: 0.6,
            },
          });

          window.addEventListener("pointermove", onPointerMove, {
            passive: true,
          });
          document.documentElement.addEventListener(
            "pointerleave",
            onPointerLeave,
          );
          window.addEventListener("blur", onPointerLeave);
          updateLoop();

          return () => {
            motion = false;
            updateLoop();
            pointerTarget = 0;
            uniforms.uPointerForce.value = 0;
            window.removeEventListener("pointermove", onPointerMove);
            document.documentElement.removeEventListener(
              "pointerleave",
              onPointerLeave,
            );
            window.removeEventListener("blur", onPointerLeave);
          };
        },
      );
    };

    // Words are sampled in the page font, so wait for Urbanist 600.
    fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
    const fontReady = Promise.race([
      document.fonts.load(wordFont(64, fontFamily), WORDS.join("")),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
    void fontReady.catch(() => undefined).then(start);

    return () => {
      disposed = true;
      mm.revert();
      gsap.ticker.remove(render);
      window.clearTimeout(resizeTimer);
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onPointerLeave);
      document.documentElement.removeEventListener(
        "pointerleave",
        onPointerLeave,
      );
      scene.remove(points);
      buffers.geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block size-full" />
    </div>
  );
}
