#!/usr/bin/env node
// Checks a sprite stack viewer page and writes a preview PNG per object.
//
//   node check.js <viewer.html> [objectId] [outDir]
//
// The page must keep its helpers, build functions and renderer between //CORE-START and //CORE-END,
// and its objects in `var OBJECTS = [ ... ];`. With no objectId every object is checked.
// Exit code is 1 if any check fails. Needs only Node (no packages).
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const file = process.argv[2], only = process.argv[3], outDir = process.argv[4] || path.dirname(path.resolve(file || "."));
if (!file) { console.error("usage: node check.js <viewer.html> [objectId] [outDir]"); process.exit(2); }
const html = fs.readFileSync(file, "utf8").split("\r").join("");
if (!html.includes("//CORE-START") || !html.includes("//CORE-END")) { console.error("no //CORE-START ... //CORE-END block"); process.exit(2); }
const script = html.split("<script>").pop().split("</script>")[0];
try { new Function(script); } catch (e) { console.error("page script does not parse: " + e.message); process.exit(1); }
const core = html.split("//CORE-START")[1].split("//CORE-END")[0];
const objText = (html.split("var OBJECTS = [")[1] || "").split("\n];")[0];
if (!objText) { console.error("no `var OBJECTS = [ ... ];` found"); process.exit(2); }
const C = new Function(core + "\nreturn { set: function (w, h, c, v) { W = w; H = h; COUNT = c; VIEW = v; }," +
  " height: function (b) { if (typeof HEIGHT !== 'undefined') HEIGHT = b; }," +
  " measureSheet: typeof measureSheet === 'function' ? measureSheet : null," +
  " lightStack: typeof lightStack === 'function' ? lightStack : null," +
  " drawSlice: drawSlice, drawStack: drawStack, outlineStack: outlineStack, OBJECTS: [" + objText + "\n] };")();

function crc32(buf) { let c, crc = -1; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ -1) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(out, rgba, w, h, scale, bg) {
  const W2 = w * scale, H2 = h * scale, raw = Buffer.alloc((W2 * 3 + 1) * H2);
  for (let y = 0; y < H2; y++) { raw[y * (W2 * 3 + 1)] = 0; for (let x = 0; x < W2; x++) {
    const i = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4, al = rgba[i + 3] / 255, o = y * (W2 * 3 + 1) + 1 + x * 3;
    for (let k = 0; k < 3; k++) raw[o + k] = Math.round(rgba[i + k] * al + bg[k] * (1 - al));
  } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W2, 0); ihdr.writeUInt32BE(H2, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

let failed = 0;
function runObject(O) {
  C.set(O.w, O.h, O.count, O.view);
  const t0 = Date.now();
  let sheet = O.build(O.paints[0]);
  if (C.measureSheet) sheet = C.measureSheet(sheet, O.w, O.h, O.count);
  const buildMs = Date.now() - t0;
  const V = O.view, px = O.pos[0], py = O.pos[1], k = O.lightScale || 1;
  function frame(turnDeg, squash, spacing, hb) {
    const b = new Uint8ClampedArray(V * V * 4);
    C.height(hb || null);
    C.drawStack(b, sheet, px, py, turnDeg * Math.PI / 180, squash, spacing);
    C.height(null);
    return b;
  }
  function box(b) {
    let x0 = V, y0 = V, x1 = -1, y1 = -1;
    for (let y = 0; y < V; y++) for (let x = 0; x < V; x++) if (b[(y * V + x) * 4 + 3] === 255) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  const results = [];
  function check(name, ok, detail) { if (!ok) failed++; results.push((ok ? "PASS " : "FAIL ") + name + (detail ? "  (" + detail + ")" : "")); }

  // 1. straight down equals pasting each slice by hand
  const a = frame(0, 1, 1), ref = new Uint8ClampedArray(V * V * 4);
  for (let z = 0; z < O.count; z++) for (let y = 0; y < O.h; y++) for (let x = 0; x < O.w; x++) {
    const si = (y * sheet.width + z * O.w + x) * 4;
    if (sheet.data[si + 3] === 0) continue;
    const dx = px - Math.floor(O.w / 2) + x, dy = py - Math.floor(O.h / 2) - z + y;
    if (dx < 0 || dy < 0 || dx >= V || dy >= V) continue;
    const di = (dy * V + dx) * 4;
    ref[di] = sheet.data[si]; ref[di + 1] = sheet.data[si + 1]; ref[di + 2] = sheet.data[si + 2]; ref[di + 3] = 255;
  }
  let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== ref[i]) diff++;
  check("straight down matches hand paste", diff === 0, diff + " differing bytes");
  // 2. the per-slice reach shortcut must not change any frame
  if (sheet.rad) {
    const rad = sheet.rad; let radDiff = 0;
    for (const t of [20, 77, 143, 301]) { const f1 = frame(t, 0.75, 1); sheet.rad = null; const f2 = frame(t, 0.75, 1); sheet.rad = rad; for (let i = 0; i < f1.length; i++) if (f1[i] !== f2[i]) radDiff++; }
    check("slice reach shortcut changes nothing", radDiff === 0, radDiff + " differing bytes over 4 turns");
  }
  // 3. squash and spacing
  const h1 = box(frame(0, 1, 1)).h, h75 = box(frame(0, 0.75, 1)).h, hs = box(frame(0, 1, O.maxSpacing)).h;
  check("squash 0.75 shorter than 1", h75 < h1, h75 + " < " + h1);
  check("max spacing taller than 1", O.maxSpacing > 1 ? hs > h1 : hs >= h1, hs + " vs " + h1);
  let fx0 = 1e9, fx1 = -1, fy0 = 1e9, fy1 = -1, colours = new Set(), filled = 0;
  for (let z = 0; z < O.count; z++) for (let y = 0; y < O.h; y++) for (let x = 0; x < O.w; x++) {
    const i = (y * sheet.width + z * O.w + x) * 4;
    if (!sheet.data[i + 3]) continue;
    filled++; colours.add(sheet.data[i] << 16 | sheet.data[i + 1] << 8 | sheet.data[i + 2]);
    fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y);
  }
  const fw = fx1 - fx0 + 1, fh = fy1 - fy0 + 1, flat = box(frame(0, 1, 0));
  check("spacing 0, squash 1 is flat", flat.w === fw && flat.h === fh, flat.w + " x " + flat.h + " vs footprint " + fw + " x " + fh);
  // 4. turned 90 degrees, the width equals the footprint height
  const t90 = box(frame(90, 1, 0));
  check("turn 90 width equals footprint height", t90.w === fh, t90.w + " vs " + fh);
  // 5. stays inside the buffer (1 px spare for the outline)
  let worst = 1e9;
  for (const sq of [0.4, 0.75, 1]) for (let t = 0; t < 360; t += 5) {
    const b = box(frame(t, sq, O.maxSpacing));
    worst = Math.min(worst, b.x0, b.y0, V - 1 - b.x1, V - 1 - b.y1);
  }
  check("inside buffer at max spacing, any turn", worst >= 1, "smallest margin " + worst + " px");
  // 6. lighting
  function lit(turnDeg, lightDeg) {
    const hb = new Uint8Array(V * V), b = frame(turnDeg, 0.75, 1, hb);
    C.outlineStack(b, [6, 8, 14]);
    const before = b.slice();
    if (C.lightStack) C.lightStack(b, hb, sheet, lightDeg, k);
    return { b, before };
  }
  if (C.lightStack) {
    const L = lit(35, 315), em = sheet.emSet || {};
    let cov = 0, lampChanged = 0, lamps = 0, darker = 0, brighter = 0, glowPx = 0;
    for (let i = 0; i < L.b.length; i += 4) {
      const o = L.before, n = L.b;
      if ((o[i + 3] === 255) !== (n[i + 3] === 255)) cov++;
      if (o[i + 3] === 255) {
        if (em[o[i] << 16 | o[i + 1] << 8 | o[i + 2]]) { lamps++; if (o[i] !== n[i] || o[i + 1] !== n[i + 1] || o[i + 2] !== n[i + 2]) lampChanged++; }
        else { const d = (n[i] + n[i + 1] + n[i + 2]) - (o[i] + o[i + 1] + o[i + 2]); if (d < 0) darker++; else if (d > 0) brighter++; }
      } else if (o[i + 3] === 0 && n[i + 3] > 0) glowPx++;
    }
    check("lighting keeps the silhouette", cov === 0, cov + " pixels changed coverage");
    check("lamp pixels stay full bright", lampChanged === 0, lamps + " lamp px, " + lampChanged + " changed");
    check("lighting shades and lights the object", darker > 0 && brighter > 0, darker + " darker, " + brighter + " brighter, " + glowPx + " halo px on the ground");
    if ((sheet.emissive || []).length && !lamps) results.push("WARN sheet.emissive is set but no lamp pixel is visible at turn 35");
  }
  for (let i = 0; i < 5; i++) lit(i * 36, 315);
  const tf = Date.now(); for (let i = 0; i < 20; i++) lit(i * 18, 315); const frameMs = (Date.now() - tf) / 20;
  results.push("INFO slices " + O.count + " of " + O.w + " x " + O.h + ", footprint " + fw + " x " + fh + ", " + filled + " filled px, " + colours.size + " colours");
  results.push("INFO sheet build " + buildMs + " ms, full frame " + frameMs.toFixed(1) + " ms" + (frameMs > 33 ? "  (slow: over 33 ms, spin will stutter)" : ""));
  if (O.w * O.count > 16384) results.push("WARN sheet is " + (O.w * O.count) + " px wide: over the 16384 px canvas limit of some browsers");
  // preview: four turns side by side, lit, outlined, with the ground shadow
  const angles = [35, 145, 215, 325], strip = new Uint8ClampedArray(V * angles.length * V * 4);
  angles.forEach((t, n) => {
    const b = lit(t, 315).b;
    C.drawSlice(b, sheet, O.shadowSlice, px + 3, py + 3, t * Math.PI / 180, 0.75, 0, [0, 0, 0, 120]);
    for (let y = 0; y < V; y++) for (let x = 0; x < V; x++) for (let c = 0; c < 4; c++) strip[(y * V * angles.length + n * V + x) * 4 + c] = b[(y * V + x) * 4 + c];
  });
  const out = path.join(outDir, O.id + ".png");
  png(out, strip, V * angles.length, V, V <= 160 ? 3 : V <= 300 ? 2 : 1, [26, 31, 39]);
  console.log("== " + O.name + "\n" + results.join("\n") + "\nINFO preview " + out);
}
const list = C.OBJECTS.filter(o => !only || o.id === only);
if (!list.length) { console.error("no object with id " + only + "; have: " + C.OBJECTS.map(o => o.id).join(", ")); process.exit(2); }
list.forEach(runObject);
process.exit(failed ? 1 : 0);
