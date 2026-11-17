import type { CardTone } from './tones';

/*
 * The sketch-card drawings (canvas Rounds 18–19), as plain marks the
 * SketchCard component draws with react-native-svg.
 *
 * Each drawing keeps a real card's idea — its subject, rough layout and
 * orientation — redrawn fresh as pen lines. Nothing is traced and there are no
 * logos of any kind. Ported one-for-one from docs/redesign/sketch-cards
 * (lib.mjs and motifs2.mjs): same numbers, same random seeds, so the app
 * draws exactly what was approved. Change a drawing there and here together.
 *
 * Landscape drawings sit in a 342×216 box with the text on the left (x < 160);
 * portrait ones in 216×342 with the text top-left and at the bottom.
 */

export const CARD_W = 342;
export const CARD_H = 216;

export type Mark =
  | {
      k: 'path';
      d: string;
      stroke: string;
      width: number;
      opacity: number;
      dash?: string;
      fill?: string;
      fillOpacity?: number;
      /** The faint second pass of the pen, offset (0.9, 0.7). */
      ghost?: boolean;
      round?: boolean;
    }
  | { k: 'dot'; cx: number; cy: number; r: number; fill: string; opacity: number }
  | { k: 'group'; transform: string; marks: Mark[] };

type PenOptions = {
  w?: number;
  color?: string;
  op?: number;
  dash?: string;
  fill?: string;
  fillOp?: number;
  ghost?: boolean;
};
type Pen = (d: string, options?: PenOptions) => Mark[];
type Drawing = (pen: Pen, t: CardTone, variant?: string) => Mark[];

const f = (n: number) => (Math.round(n * 10) / 10).toString();
// Same rounding as the canvas (toFixed), so opacities match it to the digit.
const round2 = (n: number) => Number(n.toFixed(2));

/** The canvas's seeded random, so a drawing is the same on every render. */
const rng = (seed: number) => {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Point = [number, number];
const bez = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};
const P = (cx: number, cy: number, r: number, a: number): Point => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r}L${x + r * 0.22} ${y - r * 0.22}L${x + r} ${y}L${x + r * 0.22} ${y + r * 0.22}L${x} ${y + r}L${x - r * 0.22} ${y + r * 0.22}L${x - r} ${y}L${x - r * 0.22} ${y - r * 0.22}Z`;
const circ = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${cy}a${r} ${r} 0 1 0 ${f(r * 2)} 0a${r} ${r} 0 1 0 ${f(-r * 2)} 0`;
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0`;
const group = (transform: string, marks: Mark[]): Mark => ({ k: 'group', transform, marks });

/** One pen stroke: a firm line plus a faint offset second pass, like ink over pencil. */
export const penFor =
  (t: CardTone): Pen =>
  (d, o = {}) => {
    const width = o.w ?? 1.3;
    const stroke = o.color ?? t.line;
    const opacity = (o.op ?? 1) * t.lineOp;
    const main: Mark = {
      k: 'path',
      d,
      stroke,
      width,
      opacity,
      dash: o.dash,
      round: true,
      ...(o.fill ? { fill: o.fill, fillOpacity: o.fillOp ?? 0.14 } : {}),
    };
    if (o.ghost === false) return [main];
    return [
      main,
      {
        k: 'path',
        d,
        stroke,
        width: round2(width * 0.5),
        opacity: round2(opacity * 0.45),
        dash: o.dash,
        ghost: true,
      },
    ];
  };

const dot = (t: CardTone, x: number, y: number, r = 1.1, op = 1, color?: string): Mark => ({
  k: 'dot',
  cx: Number(f(x)),
  cy: Number(f(y)),
  r,
  fill: color ?? t.line,
  opacity: round2(op * t.lineOp),
});

// --- Landscape drawings from the owner's own cards (lib.mjs MOTIFS) ---

const splash: Drawing = (pen, t) => [
  ...pen('M188 176 C 160 124, 196 54, 264 52 C 324 52, 342 116, 304 146 C 280 164, 244 158, 240 132 C 238 114, 256 104, 270 114'),
  ...pen('M304 146 C 322 170, 330 190, 356 196', { op: 0.8 }),
  ...pen('M206 196 C 246 214, 300 206, 326 176', { op: 0.6 }),
  ...pen('M200 72 C 210 60, 226 52, 240 50', { op: 0.6 }),
  ...pen('M264 52 C 304 48, 334 72, 338 104', { w: 2.4, color: t.hl, op: 1.2, ghost: false }),
  ...pen('M316 44 q 9 -12 20 -13', { w: 1 }),
  ...pen('M300 34 q 3 -11 11 -17', { w: 1 }),
  ...pen('M326 62 a 3.4 3.4 0 1 0 0.1 0', { w: 1.2 }),
  ...pen('M186 96 a 2.4 2.4 0 1 0 0.1 0', { w: 1.1 }),
  ...pen('M342 140 a 2.8 2.8 0 1 0 0.1 0', { w: 1.1 }),
  ...pen('M214 40 a 2 2 0 1 0 0.1 0', { w: 1 }),
];

const LANDSCAPE: Record<string, Drawing> = {
  hairlines: (pen, t) => {
    const marks: Mark[] = [];
    for (let i = 0; i < 26; i++) {
      const x = 118 + i * 9.5;
      marks.push(...pen(`M${x} -6L${x - 66} 222`, { w: 0.7, op: 0.25 + (i / 26) * 0.55, ghost: false }));
    }
    return [
      ...marks,
      ...pen(star(300, 52, 7), { w: 1.1, color: t.hl, op: 1.2 }),
      ...pen(star(318, 72, 4), { w: 0.9, color: t.hl }),
      ...pen('M196 194 C 240 176, 286 172, 330 178', { w: 1.6, color: t.hl, op: 1.1 }),
    ];
  },
  splash,
  stripes: (pen, t) => {
    const marks: Mark[] = [];
    for (let i = 0; i < 34; i++) {
      const x = 70 + i * (7 + i * 0.12);
      marks.push(
        ...pen(`M${f(x)} 222L${f(x + 128)} -6`, { w: 0.85, op: 0.15 + Math.min(1, i / 22) * 0.75, ghost: false })
      );
    }
    return [...marks, ...pen('M226 222L354 -6', { w: 2.6, color: t.hl, op: 1.4, ghost: false })];
  },
  doodles: (pen, t) => {
    const icons = [
      'M-6 -4h12v6a6 6 0 0 1-12 0Z M6 -2h3a2.5 2.5 0 0 1 0 5h-3',
      'M-7 6C-7 -4 2 -8 8 -7C8 2 1 7 -7 6Z M-7 6L3 -3',
      star(0, 0, 7),
      'M-8 -1h16a8 8 0 0 1-16 0Z M-3 -4q2 -3 0 -6 M2 -4q2 -3 0 -6',
      'M-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
      'M-8 3l4 -8l4 6l3 -4l5 6Z',
    ];
    const r = rng(42);
    const marks: Mark[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 178 + col * 34 + (row % 2) * 17 + (r() - 0.5) * 6;
        const y = 22 + row * 44 + (r() - 0.5) * 6;
        if (x > 352 || (y > 150 && x < 214)) continue;
        const k = (row * 6 + col) % icons.length;
        const rot = Math.round((r() - 0.5) * 40);
        marks.push(
          group(
            `translate(${f(x)} ${f(y)}) rotate(${rot})`,
            pen(icons[k], {
              w: 1.05,
              op: 0.55 + (col / 6) * 0.45,
              color: (row * 6 + col) % 7 === 3 ? t.hl : t.line,
            })
          )
        );
      }
    }
    return marks;
  },
  plate: (pen, t) => [
    ...pen('M238 108m-56 0a56 56 0 1 0 112 0a56 56 0 1 0-112 0'),
    ...pen('M238 108m-41 0a41 41 0 1 0 82 0a41 41 0 1 0-82 0', { op: 0.8 }),
    ...pen('M238 108m-48.5 0a48.5 48.5 0 1 0 97 0a48.5 48.5 0 1 0-97 0', { w: 1, dash: '1.5 6', ghost: false }),
    ...pen('M152 48V80C152 95 172 95 172 80V48 M158.5 48V74 M165.5 48V74 M162 92V172'),
    ...pen('M314 172V104 M314 104V46C327 56 331 84 322 100L314 104'),
    ...pen('M214 96 C 222 84, 238 80, 250 84', { w: 2.2, color: t.hl, op: 1.2, ghost: false }),
  ],
  stitch: (pen, t) => {
    const r = rng(7);
    const marks = pen(
      'M20 9H322A11 11 0 0 1 333 20V196A11 11 0 0 1 322 207H20A11 11 0 0 1 9 196V20A11 11 0 0 1 20 9Z',
      { w: 1.1, dash: '5 4', ghost: false }
    );
    for (let i = 0; i < 70; i++) {
      const x = 120 + r() * 210;
      const y = 20 + r() * 176;
      const a = 2 + r() * 3;
      marks.push(...pen(`M${f(x)} ${f(y)}q ${f(a)} ${f(-a)} ${f(a * 2)} 0`, { w: 0.7, op: 0.35, ghost: false }));
    }
    return [...marks, ...pen('M250 60 C 280 50, 312 64, 318 92', { w: 1.8, color: t.hl, op: 1, ghost: false })];
  },
  ribbons: (pen, t) => {
    const A1: Point[] = [[132, 238], [178, 150], [214, 186], [248, 112]];
    const A2: Point[] = [[248, 112], [278, 48], [318, 44], [360, -16]];
    const B1: Point[] = [[170, 240], [214, 160], [252, 200], [284, 128]];
    const B2: Point[] = [[284, 128], [312, 68], [346, 66], [380, 2]];
    const d = (a: Point[], b: Point[]) =>
      `M${a[0][0]} ${a[0][1]}C${a[1].join(' ')} ${a[2].join(' ')} ${a[3].join(' ')}C${b[1].join(' ')} ${b[2].join(' ')} ${b[3].join(' ')}`;
    const at = (curve: Point[], tt: number) => bez(curve[0], curve[1], curve[2], curve[3], tt);
    const marks = [...pen(d(A1, A2)), ...pen(d(B1, B2))];
    for (const tt of [0.2, 0.45, 0.7, 0.9]) {
      const p = at(A1, tt);
      const q = at(B1, tt);
      marks.push(...pen(`M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`, { w: 0.8, op: 0.6, ghost: false }));
    }
    for (const tt of [0.25, 0.5, 0.75]) {
      const p = at(A2, tt);
      const q = at(B2, tt);
      marks.push(...pen(`M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`, { w: 0.8, op: 0.6, ghost: false }));
    }
    marks.push(
      ...pen('M200 236 C 246 196, 296 224, 350 140', { op: 0.75 }),
      ...pen('M230 240 C 272 206, 322 236, 364 166', { op: 0.75 })
    );
    const C: Point[] = [[200, 236], [246, 196], [296, 224], [350, 140]];
    const D: Point[] = [[230, 240], [272, 206], [322, 236], [364, 166]];
    for (const tt of [0.3, 0.6, 0.85]) {
      const p = at(C, tt);
      const q = at(D, tt);
      marks.push(...pen(`M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`, { w: 0.8, op: 0.55, ghost: false }));
    }
    return [...marks, ...pen(d(A1, A2), { w: 2.4, color: t.hl, op: 0.9, ghost: false, dash: '60 400' })];
  },
  parcel: (pen, t) => [
    ...pen('M232 92L262 76L292 92L262 108Z', { fill: t.hl, fillOp: 0.12 }),
    ...pen('M232 92V128L262 144V108 M292 92V128L262 144'),
    ...pen('M247 84L277 100V136', { w: 2.2, color: t.hl, op: 1.2, ghost: false }),
    ...pen('M194 100h22 M186 112h28 M198 124h16', { w: 1.2, op: 0.75 }),
    ...pen(star(312, 66, 6), { w: 1 }),
    ...pen(star(214, 70, 4), { w: 0.9 }),
    ...pen(star(318, 150, 3.5), { w: 0.9 }),
  ],
  facets: (pen, t) => {
    const r = rng(11);
    const pts: Point[][] = [];
    for (let row = 0; row < 6; row++) {
      pts.push([]);
      for (let col = 0; col < 7; col++) {
        pts[row].push([150 + col * 36 + (r() - 0.5) * 16, -10 + row * 47 + (r() - 0.5) * 16]);
      }
    }
    const tri = (p: Point, q: Point, w: Point) =>
      `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}L${f(w[0])} ${f(w[1])}Z`;
    const marks: Mark[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        const a = pts[row][col];
        const b = pts[row][col + 1];
        const c = pts[row + 1][col];
        const dd = pts[row + 1][col + 1];
        const hlCell = (row === 1 && col === 3) || (row === 3 && col === 4);
        const op = 0.25 + (col / 6) * 0.6;
        marks.push(
          ...pen(tri(a, b, (row + col) % 2 ? dd : c), {
            w: 0.8,
            op,
            ghost: false,
            ...(hlCell ? { fill: t.hl, fillOp: 0.22 } : {}),
          }),
          ...pen(tri(b, dd, c), { w: 0.8, op, ghost: false })
        );
      }
    }
    return marks;
  },

  // --- The top-40 library (motifs2.mjs MOTIFS2) ---

  dotgrid: (pen, t) => {
    const marks: Mark[] = [];
    for (let y = 14; y < 210; y += 9) {
      for (let x = 156; x < 340; x += 9) {
        const w = 0.5 + 0.5 * Math.sin(x * 0.03 + y * 0.045);
        marks.push(dot(t, x, y, 1.1, 0.42 + w * 0.6));
      }
    }
    return [...marks, ...pen('M170 196 C 230 150, 280 120, 338 40', { w: 2.2, color: t.hl, op: 1.1, ghost: false })];
  },
  wedge: (pen, t) => {
    const marks = pen('M214 -4L304 220', { w: 1.6 });
    for (let i = 1; i < 16; i++) {
      marks.push(...pen(`M${214 + i * 9} -4L${304 + i * 9} 220`, { w: 0.7, op: 0.4 + i * 0.03, ghost: false }));
    }
    return [...marks, ...pen('M214 -4L304 220', { w: 2.6, color: t.hl, op: 1.2, ghost: false, dash: '70 300' })];
  },
  crossarrows: (pen, t) => [
    ...pen('M212 40L268 108L212 176 M232 40L288 108L232 176 M212 40H232 M212 176H232'),
    ...pen('M336 40L280 108L336 176 M316 40L260 108L316 176 M316 40H336 M316 176H336', { color: t.hl, op: 1.1 }),
  ],
  arrow: (pen, t) => [
    ...pen('M230 46L290 108L230 170 M254 46L314 108L254 170 M230 46H254 M230 170H254', { color: t.hl, op: 1.1 }),
    ...pen('M168 92H208 M160 108H214 M172 124H206', { w: 1.1, op: 0.7 }),
  ],
  shards: (pen, t) => [
    ...pen('M150 220L246 62L342 128 M200 -4L300 92L342 34 M246 62L300 92 M262 220L342 146 M246 62L262 220'),
    ...pen('M246 62L300 92L342 128Z', { w: 0.8, fill: t.hl, fillOp: 0.16, ghost: false }),
    ...pen('M300 92L342 40', { w: 2.2, color: t.hl, op: 1.1, ghost: false }),
  ],
  globe: (pen, t, variant) => {
    const cx = 272;
    const cy = 108;
    const r = 80;
    const marks = pen(circ(cx, cy, r));
    for (const k of [0.3, 0.62, 0.86]) {
      marks.push(...pen(ell(cx, cy, r * Math.cos(k * 1.4), r), { w: 0.9, op: 0.75, ghost: false }));
    }
    for (const d of [-52, -26, 0, 26, 52]) {
      const hw = Math.sqrt(r * r - d * d);
      marks.push(
        ...pen(`M${f(cx - hw)} ${cy + d}Q${cx} ${cy + d + 8} ${f(cx + hw)} ${cy + d}`, { w: 0.85, op: 0.7, ghost: false })
      );
    }
    if (variant === 'route') {
      marks.push(
        ...pen('M196 168 C 222 96, 292 44, 344 40', { w: 1.6, color: t.hl, op: 1.2, dash: '4 5', ghost: false }),
        ...pen('M338 34l10 6-10 6 2-6Z', { w: 1.2, color: t.hl, fill: t.hl, fillOp: 0.6 })
      );
    } else {
      marks.push(...pen(`M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx} ${cy - r}`, { w: 2.2, color: t.hl, op: 1.1, ghost: false }));
    }
    return marks;
  },
  drop: (pen, t) => [
    ...pen('M270 34C270 34 312 88 312 114A42 42 0 1 1 228 114C228 88 270 34 270 34Z'),
    ...pen('M248 120A22 22 0 0 0 268 142', { w: 1.8, color: t.hl, op: 1.2, ghost: false }),
    ...pen('M176 196C214 166 252 204 300 180S340 160 356 172', { op: 0.75 }),
    ...pen('M196 210C232 188 272 220 318 198', { op: 0.55 }),
    ...pen(circ(318, 64, 6), { w: 1 }),
    ...pen(circ(212, 74, 4), { w: 1 }),
  ],
  playdots: (pen, t) => {
    const r = rng(5);
    const marks: Mark[] = [];
    for (let y = 36; y <= 180; y += 7) {
      for (let x = 206; x <= 334; x += 7) {
        const inside = x >= 206 && Math.abs(y - 108) <= (334 - x) * (72 / 128);
        if (inside) {
          marks.push(dot(t, x, y, 1.15, 0.45 + ((x - 206) / 128) * 0.55, (x + y) % 49 === 0 ? t.hl : undefined));
        } else if (x < 260 && r() > 0.86) {
          marks.push(dot(t, x - 40 * r(), y, 0.9, 0.35));
        }
      }
    }
    return [...marks, ...pen('M206 36L334 108L206 180Z', { w: 1, op: 0.55, ghost: false })];
  },
  tree: (pen, t) => {
    const r = rng(9);
    const branches: Mark[] = [];
    const leaves: Mark[] = [];
    const branch = (x: number, y: number, a: number, len: number, depth: number) => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      branches.push(
        ...pen(`M${f(x)} ${f(y)}Q${f((x + x2) / 2 + (r() - 0.5) * 8)} ${f((y + y2) / 2)} ${f(x2)} ${f(y2)}`, {
          w: Math.max(0.6, depth * 0.45),
          ghost: depth > 2,
        })
      );
      if (depth <= 1) {
        leaves.push(dot(t, x2, y2, 2.2, 0.9, r() > 0.8 ? t.hl : undefined));
        return;
      }
      branch(x2, y2, a - 0.42 - r() * 0.2, len * 0.72, depth - 1);
      branch(x2, y2, a + 0.42 + r() * 0.2, len * 0.72, depth - 1);
    };
    branch(262, 222, -Math.PI / 2, 52, 6);
    return [...branches, ...leaves];
  },
  constellation: (pen, t) => {
    const r = rng(21);
    const pts: Point[] = [];
    for (let i = 0; i < 16; i++) pts.push([164 + r() * 172, 18 + r() * 176]);
    const marks: Mark[] = [];
    pts.forEach((p, i) => {
      const nearest = pts
        .map((q, j) => [j, (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2] as const)
        .filter(([j]) => j > i)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);
      nearest.forEach(([j]) => {
        marks.push(...pen(`M${f(p[0])} ${f(p[1])}L${f(pts[j][0])} ${f(pts[j][1])}`, { w: 0.7, op: 0.55, ghost: false }));
      });
    });
    pts.forEach((p, i) => {
      marks.push(dot(t, p[0], p[1], i % 5 === 0 ? 2.2 : 1.4, 1, i % 5 === 0 ? t.hl : undefined));
    });
    return [...marks, ...pen(star(318, 40, 7), { w: 1.1, color: t.hl, op: 1.2 }), ...pen(star(204, 30, 4), { w: 0.9 })];
  },
  burst: (pen, t) => {
    const r = rng(3);
    const marks: Mark[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const r0 = 16 + r() * 14;
      const r1 = 50 + r() * 90;
      const [x0, y0] = P(268, 100, r0, a);
      const [x1, y1] = P(268, 100, r1, a);
      marks.push(
        ...pen(`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`, {
          w: 0.7,
          op: 0.3 + r() * 0.6,
          ghost: false,
          color: i % 9 === 0 ? t.hl : undefined,
        })
      );
    }
    return [...marks, ...pen(circ(268, 100, 9), { w: 1.4, color: t.hl, op: 1.2 })];
  },
  mandala: (pen, t) => {
    const cx = 276;
    const cy = 108;
    const petal = (a: number, r0: number, r1: number, w: number) => {
      const b1 = P(cx, cy, r0, a - w);
      const tip = P(cx, cy, r1, a);
      const b2 = P(cx, cy, r0, a + w);
      const c1 = P(cx, cy, r1 * 0.82, a - w * 0.7);
      const c2 = P(cx, cy, r1 * 0.82, a + w * 0.7);
      return `M${f(b1[0])} ${f(b1[1])}Q${f(c1[0])} ${f(c1[1])} ${f(tip[0])} ${f(tip[1])}Q${f(c2[0])} ${f(c2[1])} ${f(b2[0])} ${f(b2[1])}`;
    };
    const marks = pen(circ(cx, cy, 10), { color: t.hl, op: 1.2 });
    for (let i = 0; i < 10; i++) marks.push(...pen(petal((i / 10) * Math.PI * 2, 12, 34, 0.26), { w: 1 }));
    for (let i = 0; i < 16; i++) marks.push(...pen(petal((i / 16) * Math.PI * 2 + 0.2, 36, 62, 0.15), { w: 0.9, op: 0.85 }));
    marks.push(...pen(circ(cx, cy, 70), { w: 0.8, dash: '1.4 4.6', ghost: false }));
    for (let i = 0; i < 24; i++) {
      marks.push(...pen(petal((i / 24) * Math.PI * 2, 74, 90, 0.09), { w: 0.75, op: 0.65, ghost: false }));
    }
    return marks;
  },
  octane: (pen, t) => [...splash(pen, t), ...pen('M168 128h30 M160 140h40 M172 152h24', { w: 1.2, op: 0.7 })],
  train: (pen, t) => [
    ...pen('M178 150V126H194V104H210V134H224V88H242V118H258V98H276V130H292V82H306V112H322V96H344', { w: 0.9, op: 0.6 }),
    ...pen('M196 186V164Q196 154 208 154H334Q352 156 356 176V186Z'),
    ...pen('M212 162h14v10h-14Z M234 162h14v10h-14Z M256 162h14v10h-14Z M278 162h14v10h-14Z M300 162h14v10h-14Z', {
      w: 0.9,
      ghost: false,
    }),
    ...pen('M180 194H344', { w: 1.2 }),
    ...pen('M190 200h8 M214 200h8 M238 200h8 M262 200h8 M286 200h8 M310 200h8 M334 200h8', { w: 0.9, ghost: false }),
    ...pen('M196 166H356', { w: 1.8, color: t.hl, op: 1.1, ghost: false }),
    ...pen(star(318, 40, 5), { w: 0.9 }),
    ...pen(star(214, 56, 3.5), { w: 0.9 }),
  ],
  pulse: (pen, t) => {
    const marks: Mark[] = [];
    for (let i = 0; i < 8; i++) marks.push(...pen(circ(296, 96, 18 + i * 14), { w: 0.8, op: 0.75 - i * 0.07, ghost: false }));
    return [...marks, ...pen('M156 124H214L226 98L240 150L252 110L260 124H344', { w: 1.8, color: t.hl, op: 1.2 })];
  },
  sphere: (pen, t) => {
    const cx = 292;
    const cy = 112;
    const r = 88;
    const marks = pen(circ(cx, cy, r));
    for (const d of [-66, -44, -22, 0, 22, 44, 66]) {
      const hw = Math.sqrt(r * r - d * d);
      marks.push(
        ...pen(`M${f(cx - hw)} ${cy + d}Q${cx} ${cy + d + 12} ${f(cx + hw)} ${cy + d}`, { w: 0.8, op: 0.65, ghost: false })
      );
    }
    return [
      ...marks,
      ...pen(`M${cx - 60} ${cy - 64}A${r} ${r} 0 0 1 ${cx + 30} ${cy - 83}`, { w: 2.4, color: t.hl, op: 1.2, ghost: false }),
      ...pen(ell(cx, cy, r + 26, 22), { w: 0.9, op: 0.6, ghost: false }),
    ];
  },
  gem: (pen, t) => [
    ...pen('M232 66H308L336 98L270 184L204 98Z'),
    ...pen('M204 98H336 M232 66L248 98L270 66L292 98L308 66 M248 98L270 184L292 98 M220 98L270 184L320 98', {
      w: 0.9,
      op: 0.8,
    }),
    ...pen('M232 66L248 98L270 66Z', { w: 0.8, fill: t.hl, fillOp: 0.22, ghost: false }),
    ...pen(star(336, 52, 7), { w: 1.1, color: t.hl, op: 1.2 }),
    ...pen(star(196, 150, 4), { w: 0.9 }),
  ],
  crystal: (pen, t) => [
    ...pen('M240 34L300 22L334 76L306 196L244 208L208 124Z'),
    ...pen('M240 34L262 118L208 124 M300 22L262 118L306 196 M334 76L262 118 M244 208L262 118', { w: 0.9, op: 0.75 }),
    ...pen('M240 34L300 22L262 118Z', { w: 0.8, fill: t.hl, fillOp: 0.2, ghost: false }),
    ...pen('M300 22L334 76', { w: 2.2, color: t.hl, op: 1.2, ghost: false }),
  ],
  silk: (pen, t) => {
    const marks: Mark[] = [];
    for (let i = 0; i < 16; i++) {
      let d = '';
      for (let x = 150, n = 0; x <= 350; x += 6, n++) {
        const env = Math.exp(-((x - 270) ** 2) / 4200);
        const y = 112 + (40 * env + 6) * Math.sin(x * 0.04 + i * 0.16) + (i - 8) * 2.2;
        d += `${n ? 'L' : 'M'}${x} ${f(y)}`;
      }
      marks.push(
        ...pen(d, {
          w: i === 9 ? 2 : 0.8,
          op: i === 9 ? 1.2 : 0.35 + (i % 4) * 0.12,
          color: i === 9 ? t.hl : undefined,
          ghost: false,
        })
      );
    }
    return marks;
  },
  headphones: (pen, t) => [
    ...pen('M206 126C206 52 334 52 334 126'),
    ...pen('M218 126C218 66 322 66 322 126', { op: 0.75 }),
    ...pen(
      'M196 118h22a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6h-22a6 6 0 0 1-6-6v-46a6 6 0 0 1 6-6Z M316 118h22a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6h-22a6 6 0 0 1-6-6v-46a6 6 0 0 1 6-6Z'
    ),
    ...pen('M206 130v34 M326 130v34', { w: 1, op: 0.6, ghost: false }),
    ...pen('M206 66C236 40 304 40 334 66', { w: 2.2, color: t.hl, op: 1.1, ghost: false }),
    ...pen('M176 96q6 -8 0 -16 M168 100q10 -12 0 -24', { w: 1, op: 0.6 }),
  ],
  signal: (pen, t) => [
    ...pen('M268 196L284 92L300 196 M274 160H294 M278 130H290 M281 112H287'),
    ...pen(circ(284, 86, 5), { color: t.hl, op: 1.2 }),
    ...[18, 32, 46].flatMap((r, i) =>
      pen(
        `M${f(284 - r * 0.8)} ${f(86 - r * 0.6)}A${r} ${r} 0 0 0 ${f(284 - r * 0.8)} ${f(86 + r * 0.6)} M${f(284 + r * 0.8)} ${f(86 - r * 0.6)}A${r} ${r} 0 0 1 ${f(284 + r * 0.8)} ${f(86 + r * 0.6)}`,
        { w: 1.2, op: 0.9 - i * 0.2, color: i === 0 ? t.hl : undefined }
      )
    ),
  ],
  car: (pen, t) => [
    ...pen(
      'M178 178C180 160 194 150 214 146L240 128C252 120 268 116 290 116H312C330 116 344 128 352 146L358 150V178H346 M180 178H198 M234 178H310'
    ),
    ...pen(circ(216, 178, 16)),
    ...pen(circ(328, 178, 16)),
    ...pen(circ(216, 178, 5), { w: 1, ghost: false }),
    ...pen(circ(328, 178, 5), { w: 1, ghost: false }),
    ...pen('M248 146L262 128H300L306 146Z', { w: 0.9, op: 0.8 }),
    ...pen('M214 146H352', { w: 2, color: t.hl, op: 1.1, ghost: false }),
    ...pen('M160 154h20 M164 166h14', { w: 1, op: 0.6 }),
  ],
  aurora: (pen, t) => {
    const r = rng(17);
    const marks: Mark[] = [];
    for (let x = 160; x <= 342; x += 5) {
      const top = 30 + 26 * Math.sin(x * 0.035) + 12 * Math.sin(x * 0.09);
      marks.push(
        ...pen(`M${x} ${f(top)}L${x + 4} ${f(top + 46 + 28 * Math.sin(x * 0.05 + 1))}`, {
          w: 0.8,
          op: 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(x * 0.06)),
          ghost: false,
          color: x % 35 === 0 ? t.hl : undefined,
        })
      );
    }
    for (let i = 0; i < 14; i++) marks.push(dot(t, 160 + r() * 182, 120 + r() * 50, 0.9, 0.8));
    return [
      ...marks,
      ...pen('M150 196C196 176 236 190 276 176S330 168 350 178', { w: 1.4 }),
      ...pen('M150 210C210 196 262 208 350 196', { w: 1, op: 0.6 }),
    ];
  },
  doodlering: (pen, t) => {
    const icons = [
      'M-6 -4h12v6a6 6 0 0 1-12 0Z',
      'M-7 6C-7 -4 2 -8 8 -7C8 2 1 7 -7 6Z',
      star(0, 0, 7),
      'M-8 -1h16a8 8 0 0 1-16 0Z',
      'M-6 -6h12v12h-12Z M-6 -1h12',
      'M-7 5l7 -12 7 12Z',
      'M-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M-2 0h4',
      'M-7 -3h14 M-5 3h10 M-3 -7v14',
    ];
    const marks = pen(circ(270, 108, 30), { color: t.hl, op: 1.1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const [x, y] = P(270, 108, 66, a);
      marks.push(
        group(`translate(${f(x)} ${f(y)}) rotate(${Math.round((a * 180) / Math.PI + 90)})`, pen(icons[i % icons.length], { w: 1.05 }))
      );
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const [x, y] = P(270, 108, 46, a);
      marks.push(dot(t, x, y, 1.6, 0.8));
    }
    return marks;
  },
  fern: (pen, t) => {
    const marks: Mark[] = [];
    for (let i = 0; i < 18; i++) {
      const a = Math.PI + (i - 8.5) * 0.11;
      const [x1, y1] = P(352, 116, 190, a);
      const [cxp, cyp] = P(352, 116, 110, a + 0.22);
      marks.push(
        ...pen(`M352 116Q${f(cxp)} ${f(cyp)} ${f(x1)} ${f(y1)}`, {
          w: i === 6 ? 2 : 0.8,
          op: i === 6 ? 1.2 : 0.45 + (i % 3) * 0.15,
          color: i === 6 ? t.hl : undefined,
          ghost: false,
        })
      );
    }
    return marks;
  },
  laurel: (pen, t) => {
    const cx = 270;
    const cy = 112;
    const r = 62;
    const marks = pen(
      `M${cx - 6} ${cy + r}A${r} ${r} 0 0 1 ${f(cx - r * 0.7)} ${f(cy - r * 0.7)} M${cx + 6} ${cy + r}A${r} ${r} 0 0 0 ${f(cx + r * 0.7)} ${f(cy - r * 0.7)}`
    );
    for (let i = 0; i < 9; i++) {
      for (const side of [-1, 1]) {
        const a = Math.PI / 2 + side * (0.25 + i * 0.27);
        const [x, y] = P(cx, cy, r, a);
        const rot = (a * 180) / Math.PI + (side > 0 ? -40 : 40);
        marks.push(group(`translate(${f(x)} ${f(y)}) rotate(${Math.round(rot)})`, pen('M0 0C5 -5 13 -5 18 0C13 5 5 5 0 0Z', { w: 0.9 })));
      }
    }
    return [...marks, ...pen(star(cx, cy - 4, 14), { w: 1.4, color: t.hl, op: 1.2 })];
  },
  orbits: (pen, t) => [
    group('rotate(-18 276 106)', [...pen(ell(276, 106, 78, 26)), ...pen(ell(276, 106, 58, 18), { op: 0.7 })]),
    group('rotate(30 276 106)', pen(ell(276, 106, 70, 22), { op: 0.8 })),
    ...pen(circ(276, 106, 12), { color: t.hl, op: 1.2, fill: t.hl, fillOp: 0.2 }),
    ...pen(circ(338, 82, 4), { w: 1 }),
    ...pen(circ(214, 134, 3), { w: 1 }),
  ],
  blocks: (pen, t) => [
    ...pen('M196 26H350V86H196Z'),
    ...pen('M222 96H350V138H222Z', { op: 0.75 }),
    ...pen('M250 150H350V198H250Z', { w: 1.2, color: t.hl, fill: t.hl, fillOp: 0.35, op: 1.2 }),
    ...pen('M196 112H210 M196 124H214', { w: 0.9, op: 0.6, ghost: false }),
  ],
};

/** Portrait drawings, in a 216×342 box (motifs2.mjs MOTIFS_P). */
const PORTRAIT: Record<string, Drawing> = {
  tick: (pen, t) => [
    ...pen('M44 132L92 186L176 58 M44 156L92 210L176 82 M44 132V156 M176 58V82', { w: 1.6 }),
    ...pen('M92 186L176 58', { w: 2.6, color: t.hl, op: 1.2, ghost: false }),
    ...pen(circ(170, 150, 12), { w: 1.2 }),
    ...pen(circ(186, 176, 8), { w: 1 }),
    ...pen(star(60, 74, 6), { w: 1 }),
  ],
  feather: (pen, t) => {
    const marks = pen('M178 40C162 92 140 150 104 214', { w: 1.6 });
    for (let i = 0; i < 18; i++) {
      const tt = i / 17;
      const x = 178 - 74 * tt;
      const y = 40 + 174 * tt;
      const len = 24 * Math.sin(Math.PI * Math.min(1, tt * 1.1 + 0.05));
      marks.push(
        ...pen(
          `M${f(x)} ${f(y)}q${f(-len * 0.9)} ${f(-len * 0.1)} ${f(-len * 1.3)} ${f(-len * 0.7)} M${f(x)} ${f(y)}q${f(len * 0.7)} ${f(len * 0.25)} ${f(len * 1.1)} ${f(-len * 0.35)}`,
          { w: 0.75, op: 0.75, ghost: false }
        )
      );
    }
    return [...marks, ...pen('M178 40C170 70 162 96 150 124', { w: 2.4, color: t.hl, op: 1.2, ghost: false })];
  },
  coins: (pen, t) => {
    const marks: Mark[] = [];
    for (let i = 0; i < 6; i++) {
      marks.push(
        ...pen(
          `M98 ${196 - i * 13}a40 12 0 1 0 80 0a40 12 0 1 0-80 0 M98 ${196 - i * 13}v8 M178 ${196 - i * 13}v8`,
          { w: 1.1, op: 0.6 + i * 0.07 }
        )
      );
    }
    marks.push(...pen(ell(138, 131, 40, 12), { w: 1.8, color: t.hl, op: 1.2, ghost: false }));
    return [
      ...marks,
      ...pen(ell(64, 210, 16, 6), { w: 1 }),
      ...pen(star(168, 70, 7), { w: 1.1, color: t.hl, op: 1.1 }),
      ...pen(star(80, 96, 4), { w: 0.9 }),
    ];
  },
};

export const LANDSCAPE_DRAWINGS = Object.keys(LANDSCAPE);
export const PORTRAIT_DRAWINGS = Object.keys(PORTRAIT);

/**
 * A drawing name from the catalogue: a base drawing and an optional variant
 * after a plus ("globe+route" is the Atlas globe with its flight path).
 */
export function parseDrawing(name: string | null | undefined) {
  const [base = '', variant] = (name ?? '').trim().toLowerCase().split('+');
  return { base, variant };
}

export function hasDrawing(name: string | null | undefined, portrait: boolean) {
  const { base } = parseDrawing(name);
  return Boolean((portrait ? PORTRAIT : LANDSCAPE)[base]);
}

/**
 * The marks for one drawing. An unknown name draws nothing — the plain card —
 * so a drawing added to the catalogue before the app ships it is harmless.
 */
export function drawingMarks(name: string | null | undefined, portrait: boolean, t: CardTone): Mark[] {
  const { base, variant } = parseDrawing(name);
  const drawing = (portrait ? PORTRAIT : LANDSCAPE)[base];
  return drawing ? drawing(penFor(t), t, variant) : [];
}

const dotPath = (m: Extract<Mark, { k: 'dot' }>) =>
  `M${f(m.cx - m.r)} ${m.cy}a${m.r} ${m.r} 0 1 0 ${f(m.r * 2)} 0a${m.r} ${m.r} 0 1 0 ${f(-m.r * 2)} 0`;

/**
 * Fewer native views for the same picture. A run of dots that share a colour
 * becomes one filled path per opacity step (to the nearest 0.05, which the eye
 * cannot tell apart); the dot-field drawings go from ~460 circles to a dozen
 * paths. `thumb` also drops the pen's faint second pass, invisible at
 * thumbnail size.
 */
export function compactMarks(marks: Mark[], { thumb = false } = {}): Mark[] {
  const out: Mark[] = [];
  let run: Extract<Mark, { k: 'dot' }>[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const buckets = new Map<string, { fill: string; opacity: number; d: string[] }>();
    for (const item of run) {
      const opacity = Math.round(item.opacity * 20) / 20;
      const key = `${item.fill}|${opacity}`;
      const bucket = buckets.get(key) ?? { fill: item.fill, opacity, d: [] };
      bucket.d.push(dotPath(item));
      buckets.set(key, bucket);
    }
    for (const bucket of buckets.values()) {
      out.push({ k: 'path', d: bucket.d.join(''), stroke: 'none', width: 0, opacity: 0, fill: bucket.fill, fillOpacity: bucket.opacity });
    }
    run = [];
  };
  for (const mark of marks) {
    if (mark.k === 'dot') {
      run.push(mark);
      continue;
    }
    flush();
    if (mark.k === 'group') {
      out.push({ ...mark, marks: compactMarks(mark.marks, { thumb }) });
    } else if (!(thumb && mark.ghost)) {
      out.push(mark);
    }
  }
  flush();
  return out;
}
