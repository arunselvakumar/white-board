"use client";

import { useEffect, useRef } from "react";

const PLATE =
  "M43.6002 0H6.4923C2.9067 0 0 2.9067 0 6.4923V43.6002C0 47.1858 2.9067 50.0925 6.4923 50.0925H43.6002C47.1858 50.0925 50.0925 47.1858 50.0925 43.6002V6.4923C50.0925 2.9067 47.1858 0 43.6002 0Z";

const MARKS = [
  "M15.3148 18.5769H10.5924V21.8625C13.1228 25.1392 15.6515 28.3878 18.2078 31.6547H22.9303V28.3692C20.3901 25.0943 17.8681 21.8383 15.3148 18.5769Z",
  "M26.7558 18.5769H22.0334V21.8625C24.5638 25.1392 27.0925 28.3878 29.6488 31.6547H31.8042L34.3608 28.3557C31.824 25.0854 29.3057 21.8336 26.7558 18.5769Z",
  "M34.7779 18.4377H39.5004V21.7233C38.478 23.0472 37.4559 24.3667 36.4322 25.6845C35.217 24.1176 34.0026 22.554 32.7845 20.9905C33.4476 20.1395 34.1116 19.2888 34.7781 18.4379L34.7779 18.4377Z",
];

const LOGO_SIZE = 50.0925;
const MASK_SIZE = 320;
const FIELD_STEP = 18;
const LOGO_STEP = 12;
const LOGO_SCALE = 0.5;

type Kind = "field" | "plate" | "mark";

type Dot = {
  x: number;
  y: number;
  kind: Kind;
};

type GlobePoint = {
  x: number;
  y: number;
  z: number;
  pattern: number;
};

type Blink = {
  layer: "field" | "globe" | "logo";
  index: number;
  start: number;
  duration: number;
};

function smooth(amount: number): number {
  const t = Math.min(1, Math.max(0, amount));
  return t * t * (3 - 2 * t);
}

function logoOpacity(time: number): number {
  const cycle = 13;
  const t = (time % cycle) / cycle;
  if (t < 0.16) return smooth(t / 0.16);
  if (t < 0.5) return 1;
  if (t < 0.68) return 1 - smooth((t - 0.5) / 0.18);
  return 0;
}

function logoMask(): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = MASK_SIZE;
  canvas.height = MASK_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const scale = MASK_SIZE / LOGO_SIZE;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#595fae";
  ctx.fill(new Path2D(PLATE));
  ctx.fillStyle = "#ffffff";
  for (const path of MARKS) {
    ctx.fill(new Path2D(path));
  }

  return ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
}

function buildGlobe(): GlobePoint[] {
  const points: GlobePoint[] = [];
  const latitudes = 46;

  for (let lat = 0; lat < latitudes; lat += 1) {
    const v = (lat + 0.5) / latitudes;
    const phi = (v - 0.5) * Math.PI;
    const y = Math.sin(phi);
    const ring = Math.cos(phi);
    const count = Math.max(8, Math.round(72 * ring));
    for (let lon = 0; lon < count; lon += 1) {
      const theta = (lon / count) * Math.PI * 2;
      const pattern =
        0.55 +
        0.45 *
          Math.max(
            0,
            Math.sin(theta * 2.2 + phi * 1.4) * Math.cos(phi * 3 + theta),
          );
      points.push({
        x: Math.cos(theta) * ring,
        y,
        z: Math.sin(theta) * ring,
        pattern,
      });
    }
  }

  return points;
}

function buildField(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  globeRadius: number,
): Dot[] {
  const dots: Dot[] = [];
  const clear = globeRadius + 10;

  for (let row = 0, y = FIELD_STEP / 2; y < height; y += FIELD_STEP, row += 1) {
    const xStart = FIELD_STEP / 2 + (row % 2 === 0 ? 0 : FIELD_STEP / 2);
    for (let x = xStart; x < width; x += FIELD_STEP) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy < clear * clear) continue;
      dots.push({ x, y, kind: "field" });
    }
  }

  return dots;
}

function buildLogo(
  width: number,
  height: number,
  mask: Uint8ClampedArray,
): Dot[] {
  const logoSide = Math.min(width, height) * LOGO_SCALE;
  const originX = (width - logoSide) / 2;
  const originY = (height - logoSide) / 2;
  const dots: Dot[] = [];

  for (
    let row = 0, y = originY;
    y < originY + logoSide;
    y += LOGO_STEP, row += 1
  ) {
    const xStart = originX + (row % 2 === 0 ? 0 : LOGO_STEP / 2);
    for (let x = xStart; x < originX + logoSide; x += LOGO_STEP) {
      const u = (x - originX) / logoSide;
      const v = (y - originY) / logoSide;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const px = Math.min(MASK_SIZE - 1, Math.floor(u * (MASK_SIZE - 1)));
      const py = Math.min(MASK_SIZE - 1, Math.floor(v * (MASK_SIZE - 1)));
      const index = (py * MASK_SIZE + px) * 4;
      if ((mask[index + 3] ?? 0) < 150) continue;
      dots.push({
        x,
        y,
        kind: (mask[index] ?? 0) > 180 ? "mark" : "plate",
      });
    }
  }

  return dots;
}

export function DottedLogo({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const mask = logoMask();
    if (!ctx || !mask) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const globe = buildGlobe();
    const globeZ = new Float32Array(globe.length);
    const globeOrder = globe.map((_, index) => index);
    let field: Dot[] = [];
    let logo: Dot[] = [];
    let blinks: Blink[] = [];
    let nextBlink = 0;
    let frame = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      if (width === 0 || height === 0) {
        field = [];
        logo = [];
        return;
      }
      const globeRadius = Math.min(width, height) * 0.36;
      field = buildField(width, height, width / 2, height / 2, globeRadius);
      logo = buildLogo(width, height, mask);
      blinks = [];
      nextBlink = 0;
    };

    const drawDot = (
      x: number,
      y: number,
      radius: number,
      red: number,
      green: number,
      blue: number,
      alpha: number,
      blink: number,
    ) => {
      let nextRed = red;
      let nextGreen = green;
      let nextBlue = blue;
      let nextAlpha = alpha;
      let nextRadius = radius;
      if (blink > 0.04) {
        nextRed = Math.round(red + (255 - red) * blink);
        nextGreen = Math.round(green + (255 - green) * blink);
        nextBlue = Math.round(blue + (255 - blue) * blink);
        nextAlpha = Math.min(1, alpha + blink * 0.5);
        nextRadius += blink * 1.2;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${blink * 0.38})`;
        ctx.arc(x, y, nextRadius * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(${nextRed}, ${nextGreen}, ${nextBlue}, ${nextAlpha})`;
      ctx.arc(x, y, nextRadius, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (time: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      const opacity = reduce ? 1 : logoOpacity(time);
      if (!reduce && time >= nextBlink) {
        const roll = Math.random();
        const layer: Blink["layer"] =
          roll < 0.62
            ? "globe"
            : roll < 0.9 || opacity < 0.35
              ? "field"
              : "logo";
        const count =
          layer === "globe"
            ? globe.length
            : layer === "field"
              ? field.length
              : logo.length;
        if (count > 0) {
          blinks.push({
            layer,
            index: Math.floor(Math.random() * count),
            start: time,
            duration: 4.2 + Math.random() * 2.6,
          });
        }
        nextBlink = time + 0.9 + Math.random() * 1.4;
      }
      blinks = blinks.filter((blink) => time - blink.start < blink.duration);

      const fieldBlink = new Float32Array(field.length);
      const logoBlink = new Float32Array(logo.length);
      const globeBlink = new Float32Array(globe.length);
      for (const blink of blinks) {
        const t = (time - blink.start) / blink.duration;
        const amount = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
        const bucket =
          blink.layer === "field"
            ? fieldBlink
            : blink.layer === "logo"
              ? logoBlink
              : globeBlink;
        const current = bucket[blink.index] ?? 0;
        bucket[blink.index] = Math.max(current, amount);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      for (let index = 0; index < field.length; index += 1) {
        const dot = field[index];
        if (!dot) continue;
        drawDot(
          dot.x,
          dot.y,
          1.35,
          132,
          140,
          186,
          0.34,
          fieldBlink[index] ?? 0,
        );
      }

      const logoSide = Math.min(width, height) * LOGO_SCALE;
      const logoLeft = (width - logoSide) / 2;
      const logoTop = (height - logoSide) / 2;
      const coveredByLogo = (sx: number, sy: number) => {
        if (opacity < 0.02) return false;
        const u = (sx - logoLeft) / logoSide;
        const v = (sy - logoTop) / logoSide;
        if (u < 0 || u > 1 || v < 0 || v > 1) return false;
        const px = Math.min(MASK_SIZE - 1, Math.floor(u * (MASK_SIZE - 1)));
        const py = Math.min(MASK_SIZE - 1, Math.floor(v * (MASK_SIZE - 1)));
        const index = (py * MASK_SIZE + px) * 4;
        return (mask[index + 3] ?? 0) > 150;
      };

      const spin = reduce ? 0.7 : time * ((Math.PI * 2) / 38);
      const cos = Math.cos(spin);
      const sin = Math.sin(spin);
      const centerX = width / 2;
      const centerY = height / 2;
      const globeRadius = Math.min(width, height) * 0.36;
      const camera = 3.15;
      const projectedX = new Float32Array(globe.length);
      const projectedY = new Float32Array(globe.length);
      const projectedShade = new Float32Array(globe.length);

      for (let index = 0; index < globe.length; index += 1) {
        const point = globe[index];
        if (!point) continue;
        const x = point.x * cos + point.z * sin;
        const z = -point.x * sin + point.z * cos;
        const persp = camera / (camera - z);
        globeZ[index] = z;
        globeOrder[index] = index;
        projectedX[index] = centerX + x * globeRadius * persp;
        projectedY[index] = centerY + point.y * globeRadius * persp;
        const light = Math.max(0, x * 0.35 + point.y * 0.42 + z * 0.84);
        projectedShade[index] = Math.min(
          1,
          light * 0.72 + point.pattern * 0.38 + Math.max(0, z) * 0.2,
        );
      }

      globeOrder.sort((a, b) => (globeZ[a] ?? 0) - (globeZ[b] ?? 0));

      for (const index of globeOrder) {
        const shade = projectedShade[index] ?? 0;
        const z = globeZ[index] ?? 0;
        const blink = globeBlink[index] ?? 0;
        const x = projectedX[index] ?? 0;
        const y = projectedY[index] ?? 0;
        const covered = coveredByLogo(x, y) ? 1 - opacity : 1;
        if (covered < 0.04 && blink < 0.05) continue;
        const radius = (1.15 + shade * 1.45) * (camera / (camera - z));
        drawDot(
          x,
          y,
          radius,
          Math.round(72 + shade * 168),
          Math.round(78 + shade * 164),
          Math.round(150 + shade * 105),
          (0.22 + shade * 0.72) * covered,
          blink * covered,
        );
      }

      if (opacity > 0.01) {
        for (let index = 0; index < logo.length; index += 1) {
          const dot = logo[index];
          if (!dot) continue;
          const blink = (logoBlink[index] ?? 0) * opacity;
          if (dot.kind === "mark") {
            drawDot(dot.x, dot.y, 3.4, 255, 255, 255, opacity, blink);
          } else {
            drawDot(dot.x, dot.y, 2.7, 188, 196, 248, opacity, blink);
          }
        }
      }
    };

    const tick = (now: number) => {
      if (!running) return;
      draw(now / 1000);
      frame = window.requestAnimationFrame(tick);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    if (reduce) {
      draw(4);
    } else {
      frame = window.requestAnimationFrame(tick);
    }

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
