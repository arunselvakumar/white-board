/*
 * Target point sets for the hero dot field. Each function returns a flat
 * Float32Array of (x, y) pairs in CSS pixels, sampled from an offscreen 2D
 * canvas. They run in the browser only (they need `document`).
 */

/** The Whiteboard logo plate and marks, copied from the sign-in panel. */
const PLATE =
  "M43.6002 0H6.4923C2.9067 0 0 2.9067 0 6.4923V43.6002C0 47.1858 2.9067 50.0925 6.4923 50.0925H43.6002C47.1858 50.0925 50.0925 47.1858 50.0925 43.6002V6.4923C50.0925 2.9067 47.1858 0 43.6002 0Z";

const MARKS = [
  "M15.3148 18.5769H10.5924V21.8625C13.1228 25.1392 15.6515 28.3878 18.2078 31.6547H22.9303V28.3692C20.3901 25.0943 17.8681 21.8383 15.3148 18.5769Z",
  "M26.7558 18.5769H22.0334V21.8625C24.5638 25.1392 27.0925 28.3878 29.6488 31.6547H31.8042L34.3608 28.3557C31.824 25.0854 29.3057 21.8336 26.7558 18.5769Z",
  "M34.7779 18.4377H39.5004V21.7233C38.478 23.0472 37.4559 24.3667 36.4322 25.6845C35.217 24.1176 34.0026 22.554 32.7845 20.9905C33.4476 20.1395 34.1116 19.2888 34.7781 18.4379L34.7779 18.4377Z",
];

const LOGO_SIZE = 50.0925;
const HEX_ROW = Math.sqrt(3) / 2;

/** A box in CSS pixels, given by its centre and size. */
export type ShapeBox = {
  cx: number;
  cy: number;
  width: number;
  height: number;
};

/** An axis-aligned rectangle in CSS pixels. */
export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function context(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas.getContext("2d", { willReadFrequently: true });
}

/** A stable pseudo-random number in [0, 1) for an integer pair. */
function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Walks a hex grid over a `width` x `height` mask and keeps the cells whose
 * alpha passes `threshold`. Returned points are offset by (`left`, `top`).
 */
function sampleMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  step: number,
  left: number,
  top: number,
  threshold = 128,
  hex = true,
): Float32Array {
  const out: number[] = [];
  const rowStep = hex ? step * HEX_ROW : step;
  for (let row = 0, y = rowStep / 2; y < height; y += rowStep, row += 1) {
    const offset = hex && row % 2 === 1 ? step : step / 2;
    for (let x = offset; x < width; x += step) {
      const px = Math.min(width - 1, Math.floor(x));
      const py = Math.min(height - 1, Math.floor(y));
      if ((data[(py * width + px) * 4 + 3] ?? 0) < threshold) continue;
      out.push(left + x, top + y);
    }
  }
  return new Float32Array(out);
}

/**
 * The Whiteboard mark: a dotted plate with the three strokes left as paper,
 * `side` pixels square, centred on (`cx`, `cy`).
 */
export function logoPoints(
  cx: number,
  cy: number,
  side: number,
  step: number,
): Float32Array {
  const size = Math.max(1, Math.round(side));
  const ctx = context(size, size);
  if (!ctx) return new Float32Array();
  ctx.scale(size / LOGO_SIZE, size / LOGO_SIZE);
  ctx.fillStyle = "#000";
  ctx.fill(new Path2D(PLATE));
  ctx.globalCompositeOperation = "destination-out";
  for (const path of MARKS) ctx.fill(new Path2D(path));
  const data = ctx.getImageData(0, 0, size, size).data;
  return sampleMask(data, size, size, step, cx - size / 2, cy - size / 2, 150);
}

/** The CSS font shorthand for Urbanist 600 at `size` pixels. */
export function wordFont(size: number, family: string): string {
  return `600 ${size}px ${family}`;
}

/**
 * The largest font size at which every word fits inside `maxWidth` and whose
 * cap height fits inside `maxHeight`.
 */
export function wordFontSize(
  words: readonly string[],
  family: string,
  maxWidth: number,
  maxHeight: number,
): number {
  const ctx = context(1, 1);
  if (!ctx) return 64;
  ctx.font = wordFont(100, family);
  let widest = 1;
  for (const word of words) {
    widest = Math.max(widest, ctx.measureText(word).width);
  }
  const cap = ctx.measureText("H").actualBoundingBoxAscent || 70;
  return Math.max(
    12,
    Math.min((100 * maxWidth) / widest, (100 * maxHeight) / cap),
  );
}

/**
 * A word set in Urbanist 600 at `fontSize`, as a square dot-matrix of
 * `step` spacing. The cap height is centred on (`cx`, `cy`) so every word sits on
 * the same baseline.
 */
export function wordPoints(
  text: string,
  cx: number,
  cy: number,
  fontSize: number,
  family: string,
  step: number,
): Float32Array {
  const probe = context(1, 1);
  if (!probe) return new Float32Array();
  probe.font = wordFont(fontSize, family);
  const metrics = probe.measureText(text);
  const cap = probe.measureText("H").actualBoundingBoxAscent || fontSize * 0.7;
  const width = Math.ceil(metrics.width + step * 2);
  const height = Math.ceil(fontSize * 1.4);
  const baseline = Math.round(height / 2 + cap / 2);
  const ctx = context(width, height);
  if (!ctx) return new Float32Array();
  ctx.font = wordFont(fontSize, family);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000";
  ctx.fillText(text, width / 2, baseline);
  const data = ctx.getImageData(0, 0, width, height).data;
  // A square grid: stems read as clean columns, like a dot-matrix sign.
  return sampleMask(
    data,
    width,
    height,
    step,
    cx - width / 2,
    cy - height / 2,
    128,
    false,
  );
}

/**
 * A ruled register page filling `box`: an outline, a double header rule,
 * ruled rows on a hex grid, a dense double margin line, two column rules,
 * and short handwritten entries on the first rows.
 */
export function registerPoints(box: ShapeBox, step: number): Float32Array {
  const out: number[] = [];
  const left = box.cx - box.width / 2;
  const top = box.cy - box.height / 2;
  const right = left + box.width;
  const bottom = top + box.height;
  const rowGap = Math.max(step * 3.4, box.height / 12);
  const headerY = top + rowGap * 1.15;
  const marginX = left + box.width * 0.1;
  const columns = [left + box.width * 0.62, left + box.width * 0.8];

  const hline = (y: number, x0: number, x1: number, gap: number, row = 0) => {
    for (let x = x0 + (row % 2 === 0 ? 0 : gap / 2); x <= x1; x += gap) {
      out.push(x, y);
    }
  };
  const vline = (x: number, y0: number, y1: number, gap: number) => {
    for (let y = y0; y <= y1; y += gap) out.push(x, y);
  };

  // Page outline.
  hline(top, left, right, step);
  hline(bottom, left, right, step);
  vline(left, top + step, bottom - step, step);
  vline(right, top + step, bottom - step, step);

  // Header: a double rule, as on a bought register.
  hline(headerY, left + step, right - step, step);
  hline(headerY + step * 0.9, left + step, right - step, step, 1);

  // Ruled rows on a hex grid: alternate rows shift by half a step.
  let row = 0;
  for (let y = headerY + rowGap; y < bottom - step; y += rowGap, row += 1) {
    hline(y, left + step, right - step, step, row);
  }

  // Margin line: two dense columns of dots.
  vline(marginX, top + step, bottom - step, step / 2);
  vline(marginX + step * 0.8, top + step, bottom - step, step / 2);

  // Column rules.
  for (const x of columns) vline(x, headerY + step * 2, bottom - step, step);

  // Title bar in the header band.
  for (let i = 0; i < 2; i += 1) {
    hline(
      top + rowGap * 0.55 + i * step * 0.8,
      marginX + step * 2,
      marginX + box.width * 0.22,
      step * 0.8,
      i,
    );
  }

  // Handwritten entries on the first rows: serial, name, Course, fee.
  const entries = Math.min(row, 5);
  for (let r = 0; r < entries; r += 1) {
    const y = headerY + rowGap * (r + 1) - rowGap * 0.42;
    const name = 0.22 + hash(r, 1) * 0.16;
    const course = 0.06 + hash(r, 2) * 0.06;
    const fee = 0.06 + hash(r, 3) * 0.06;
    const segments: readonly (readonly [number, number])[] = [
      [left + step * 2, left + step * 2 + box.width * 0.03],
      [marginX + step * 2.5, marginX + step * 2.5 + box.width * name],
      [
        (columns[0] ?? 0) + step * 1.5,
        (columns[0] ?? 0) + step * 1.5 + box.width * course,
      ],
      [
        (columns[1] ?? 0) + step * 1.5,
        (columns[1] ?? 0) + step * 1.5 + box.width * fee,
      ],
    ];
    for (const [x0, x1] of segments) {
      hline(y - step * 0.4, x0, x1, step * 0.8, 0);
      hline(y + step * 0.4, x0, x1, step * 0.8, 1);
    }
  }

  return new Float32Array(out);
}

/**
 * The background field: a hex grid of `spacing` covering `width` x `height`,
 * thinned to `keep` density inside `thin` so the copy above it stays legible.
 */
export function fieldPoints(
  width: number,
  height: number,
  spacing: number,
  thin: Rect | null,
  keep: number,
): Float32Array {
  const out: number[] = [];
  const rowStep = spacing * HEX_ROW;
  for (let row = 0, y = rowStep / 2; y < height; y += rowStep, row += 1) {
    const offset = row % 2 === 0 ? spacing / 2 : spacing;
    for (let col = 0, x = offset; x < width; x += spacing, col += 1) {
      if (
        thin &&
        x > thin.left &&
        x < thin.right &&
        y > thin.top &&
        y < thin.bottom &&
        hash(col, row) > keep
      ) {
        continue;
      }
      out.push(x, y);
    }
  }
  return new Float32Array(out);
}

/**
 * Re-orders a point set left to right (with a little jitter so columns do
 * not move in lockstep), so consecutive shapes map onto each other by rank.
 */
export function sortByX(points: Float32Array, jitter: number): Float32Array {
  const count = points.length / 2;
  const keys = new Float32Array(count);
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    order[i] = i;
    keys[i] = (points[i * 2] ?? 0) + (hash(i, 7) - 0.5) * jitter;
  }
  order.sort((a, b) => (keys[a] ?? 0) - (keys[b] ?? 0));
  const out = new Float32Array(points.length);
  for (let i = 0; i < count; i += 1) {
    const from = order[i] ?? 0;
    out[i * 2] = points[from * 2] ?? 0;
    out[i * 2 + 1] = points[from * 2 + 1] ?? 0;
  }
  return out;
}

/**
 * Keeps at most `max` points, dropping evenly so the shape keeps its outline.
 */
export function limitPoints(points: Float32Array, max: number): Float32Array {
  const count = points.length / 2;
  if (count <= max) return points;
  const out = new Float32Array(max * 2);
  for (let i = 0; i < max; i += 1) {
    const from = Math.floor((i * count) / max);
    out[i * 2] = points[from * 2] ?? 0;
    out[i * 2 + 1] = points[from * 2 + 1] ?? 0;
  }
  return out;
}
