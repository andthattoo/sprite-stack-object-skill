---
name: "sprite-stack-object"
description: "Build a sprite-stacked pixel art object (car, building, ship, prop) as a code-drawn slice sheet and show it in a turnable, lit browser viewer. Use when asked to make, preview, light or add a sprite stack object, at any size from a 24 px car to a 300 px ship."
---

# Sprite stack object

Make a 3D-looking pixel object from flat slices drawn in code, and show it in a browser viewer the user can turn and light. No game engine or image generator is needed.

Files in this skill:

- `examples/sprite-stack-viewer.html`: a working viewer with four objects (car, apartment block, gunship, freighter), lighting and the fast renderer. Copy its core and page script instead of retyping them.
- `scripts/check.js`: runs every check below on a viewer page and writes a preview PNG per object. `node scripts/check.js <viewer.html> [objectId] [outDir]`.

## What sprite stacking is

- A slice sheet is one row of equal slices, ground slice on the left, top slice on the right. Each slice is a top-down picture of one 1 px layer of the object.
- Draw slice 0 first, then each next slice `round(z * spacing)` px higher on screen. Later slices cover earlier ones.
- Every slice is rotated by the same angle around its center, then squashed vertically (0.75 by default, 1 is straight down), then lifted.
- Sampling is nearest neighbor. Positions stay on whole pixels.
- In the sheet the object's front is the bottom edge of each slice (+y).

## Steps

1. Settle the object and its size. If the user already has a viewer artifact from this skill, add the new object to it instead of making a new page (read the page, add a build function and an entry in `OBJECTS`, republish). If the user names a slice size, use it even when the object fills only part of it, and say how much it fills.
2. Plan the object as a list of height bands before writing code (see "Designing the slices"). For a reference image, read off the top-view outline as half widths along the length, and the side view as heights.
3. Write a `buildX(scheme)` function that fills a sheet with the helpers below. List the colours that emit light in `S.emissive`.
4. Run `scripts/check.js` on the page, then look at the preview PNG it writes once.
5. Publish the viewer as an HTML artifact (single self-contained page). Tell the user the art is placeholder art drawn in code, the slice size and count, which checks ran, and the frame time for large objects.

## Sizes that work

| Object | Slice size | Slices | Stage buffer | Ground point | Max spacing | Light scale | Full frame |
|---|---|---|---|---|---|---|---|
| Car | 24 x 43 | 15 | 128 | (64, 76) | 3 | 1 | under 1 ms |
| Apartment block | 36 x 36 | 56 | 160 | (80, 136) | 2 | 1 | under 1 ms |
| Gunship | 104 x 152 | 48 | 288 | (144, 190) | 2 | 2 | about 4 ms |
| Freighter | 208 x 304 | 48 | 400 | (200, 236) | 1.5 | 3 | about 10 ms |

For a new object:

- The stage buffer must hold the slice diagonal plus `(count - 1) * maxSpacing` px of lift above the ground point, and about `diagonal / 2 * squash` px below it. Use the footprint's diagonal, not the slice's, when the object fills only part of the slice. Cap the spacing slider so the object never clips.
- Doubling the slice size needs about double the slice count, or the object reads as squat.
- Keep `w * count` under 16384 px: the sheet is one canvas row and some browsers stop there. Use `sheetScale: 1` above about 100 px wide.
- Aim for a full frame under 16 ms, and treat 33 ms as the limit for the Spin button. `check.js` prints the time.

## Designing the slices

- Think in height bands: for each band of z, what does the footprint look like from above? Write the bands as comments first (for example: z0-1 plinth, z2-9 podium, z10-34 tower, z35-49 setback, z50-55 roof clutter).
- The side of the object is made from the edges of the slices. Whatever color is on the outer 2 px of a slice at height z becomes one row of the wall at that height. Put windows, lights, signs and trim there. Use 2 px, not 1, so the wall has no gaps on diagonals. This stays 2 px at every resolution.
- The top of the object is whatever is not covered by the slice above. Fill interiors with a solid color so there are no holes, and make upper slices smaller to reveal roofs, hoods and terraces.
- Shade by height: darker fills low, lighter fills high. This reads as depth without any soft shading, and the lighting pass adds the rest.
- Use flat fills and bold shapes. Avoid 1 px details, thin stripes and in-between shades: they flicker or smear when turned. Make small parts at least 2 x 2 px. Seams and panel lines are 2 px wide at low contrast (about 0.8 of the plate colour).
- Do not bake an outline into the slices. Outline the finished stack once.
- Overhangs (awnings, balconies, signs) are fine in hand-built slices: draw them outside the wall line on the slices at that height.
- Repeating structure belongs in a helper. For a building: a floor is 5 slices (slab, sill, three window slices) and a `tower(z0, floors, x0, y0, x1, y1, wall, seed)` helper stamps floors, choosing each window's color from a hash of (floor, side, index) so lit windows look random but are stable.
- Give the build function a small color scheme argument (`a` accent, `b` body, `glow` for lamps) so the viewer can offer swatches.

## Bigger sprites (100 px and up)

Rectangles stop being enough. Describe shapes as functions and let one helper find the edges.

- **Planform as a half-width function.** For a vehicle, write `hullHW(s)`: the half width at distance `s` from the nose. Piecewise linear is enough (blunt bow, parallel body, waist, tail).
- **Profile as an inset per slice.** `inset(z)` pulls the outline in at the belly and the shoulder: a chamfered or rounded cross-section is one small table or formula. A deck that drops toward the bow is `zTop(s)`: a slice simply leaves out the pixels where `z > zTop(s)`.
- **Round parts** (engines, tanks) are a circle in the z direction: half width `sqrt(r*r - (z - zc)^2)`.
- **Mirror** left and right by testing `Math.abs(x - CX)`, with `CX` at the half pixel between the two middle columns (51.5 for a 104 px slice).
- **`part()` with a mask** draws any shape and applies the 2 px edge rule for you:

```js
function fn(v) { return typeof v === "function" ? v : function () { return v; }; }
// Fill every pixel where inside(x, y) holds. Pixels within 2 px of the outside take edge(x, y), the rest fill(x, y).
// fill and edge are a colour or a function; edge may return null to fall back to fill. Give a generous bounding box.
function part(z, x0, y0, x1, y1, inside, fill, edge) {
  fill = fn(fill); edge = fn(edge);
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(SW - 1, Math.ceil(x1)); y1 = Math.min(SH - 1, Math.ceil(y1));
  var w = x1 - x0 + 5, h = y1 - y0 + 5, m = new Uint8Array(w * h), x, y, i;
  for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) if (inside(x, y)) m[(y - y0 + 2) * w + (x - x0 + 2)] = 1;
  for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
    i = (y - y0 + 2) * w + (x - x0 + 2);
    if (!m[i]) continue;
    var e = !(m[i - 1] && m[i + 1] && m[i - w] && m[i + w] && m[i - 2] && m[i + 2] && m[i - 2 * w] && m[i + 2 * w] &&
              m[i - w - 1] && m[i - w + 1] && m[i + w - 1] && m[i + w + 1]);
    set(z, x, y, (e && edge(x, y)) || fill(x, y));
  }
}
```

- **Sides** are then one function of `(z, s)`: `sideColor(z)` returns the wall colour for that row, with doors, portholes, vents, hazard stripes and trim lines chosen by `z` and `s`. **Tops** are one function of `(x, y)`: `plate(x, y)` returns seams where `s % 34 < 2`, a slight tone per plate from a hash of the plate index, and sparse rust specks.
- **Draw order inside one slice** decides what covers what: wings before the hull so the hull hides the roots, engines before the tail between them.
- **Detail budget.** More pixels need more parts, not finer noise: gear, turrets with barrels, railings (a post every 8 px plus a top rail slice), antenna masts, lifting lugs, lamps. Each stays 2 px or wider.
- **Sloped surfaces** step in by about a pixel per slice and read as horizontal bands, not flat facets. Keep slopes short or make the bands look intended (trim lines, plating rows).
- Build time stays in the tens of milliseconds because `part()` calls `inside()` once per pixel. Do not call `inside()` twelve times per pixel for the edge test.

## Sheet helpers

```js
function makeSheet(w, h, count) {
  var data = new Uint8ClampedArray(w * count * h * 4);
  function set(z, x, y, c) {
    if (x < 0 || y < 0 || x >= w || y >= h || z < 0 || z >= count) return;
    var i = (y * w * count + z * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  function rect(z, x0, y0, x1, y1, c) {
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) set(z, x, y, c);
  }
  function rr(z, x0, y0, x1, y1, r, c) {           // chamfered corners of size r
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var cx = Math.min(x - x0, x1 - x), cy = Math.min(y - y0, y1 - y);
      if (cx + cy < r) continue;
      set(z, x, y, c);
    }
  }
  return { data: data, width: w * count, height: h, set: set, rect: rect, rr: rr };
}

// One slice of a rectangular block: wall fill, with a 2 px edge chosen by edgeColor(side, t, len).
// side: 0 back, 1 right, 2 front, 3 left. t runs along that side. Return null for plain wall.
function block(S, z, x0, y0, x1, y1, wall, edgeColor) {
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    var dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y);
    if (Math.min(dx, dy) >= 2) { S.set(z, x, y, wall); continue; }
    var side, t, len;
    if (dy <= dx) { side = (y - y0 <= y1 - y) ? 0 : 2; t = x - x0; len = x1 - x0 + 1; }
    else { side = (x - x0 <= x1 - x) ? 3 : 1; t = y - y0; len = y1 - y0 + 1; }
    S.set(z, x, y, edgeColor(side, t, len) || wall);
  }
}
function isWindow(t, len) { return t >= 3 && t <= len - 4 && (t - 3) % 4 < 2; }  // 2 px windows, 2 px wall
function hash(a, b, c) {                                                          // 0..99, stable
  var n = Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 1, 83492791);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) % 100;
}
```

## Renderer

Render in software into an RGBA buffer and show it on a canvas scaled up with `image-rendering: pixelated`. Do not use canvas `drawImage` with a rotation: it anti-aliases slice edges.

Two additions make it fast and lightable:

- `measureSheet` records how far each slice's pixels reach from the slice centre. `drawSlice` then loops over that reach instead of the full slice diagonal, which skips the empty space around small top slices and narrow objects. Call it once whenever a sheet is built. It must not change a single pixel; `check.js` compares against the full loop.
- `HEIGHT` is an optional buffer. When it is set, `drawSlice` writes `z + 1` for every pixel it draws, and the lighting pass reads it.

```js
var W, H, COUNT, VIEW;   // slice size, slice count, square buffer size: set from the current object
var HEIGHT = null;       // optional Uint8Array(VIEW * VIEW), slice index + 1 per drawn pixel

function measureSheet(sheet, w, h, count) {
  var hw = Math.floor(w / 2), hh = Math.floor(h / 2), rad = new Uint16Array(count);
  for (var z = 0; z < count; z++) {
    var m = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!sheet.data[(y * sheet.width + z * w + x) * 4 + 3]) continue;
      var dx = Math.max(Math.abs(x - hw), Math.abs(x + 1 - hw)), dy = Math.max(Math.abs(y - hh), Math.abs(y + 1 - hh));
      if (dx * dx + dy * dy > m) m = dx * dx + dy * dy;
    }
    rad[z] = m ? Math.ceil(Math.sqrt(m)) + 1 : 0;
  }
  sheet.rad = rad;
  return sheet;
}

// (px, py): ground point, whole pixels. transform = translate(pos) * translate(0, -lift) * scale(1, squash) * rotate(turn)
function drawSlice(buf, sheet, z, px, py, turn, squash, lift, flat) {
  var cos = Math.cos(turn), sin = Math.sin(turn);
  var hw = Math.floor(W / 2), hh = Math.floor(H / 2);
  var R = sheet.rad ? sheet.rad[z] : Math.ceil(Math.sqrt(W * W + H * H) / 2) + 1;
  var cy = py - lift;
  var y0 = Math.max(0, Math.floor(cy - R * squash)), y1 = Math.min(VIEW - 1, Math.ceil(cy + R * squash));
  var x0 = Math.max(0, px - R), x1 = Math.min(VIEW - 1, px + R);
  for (var y = y0; y <= y1; y++) {
    var ey = (y + 0.5 - cy) / squash;
    for (var x = x0; x <= x1; x++) {
      var ex = x + 0.5 - px;
      var sx = Math.floor(ex * cos + ey * sin + hw);
      var sy = Math.floor(-ex * sin + ey * cos + hh);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      var si = (sy * sheet.width + z * W + sx) * 4;
      if (sheet.data[si + 3] === 0) continue;
      var di = (y * VIEW + x) * 4;
      if (flat) {            // shadow pass: only where nothing was drawn
        if (buf[di + 3] === 0) { buf[di] = flat[0]; buf[di + 1] = flat[1]; buf[di + 2] = flat[2]; buf[di + 3] = flat[3]; }
      } else {
        buf[di] = sheet.data[si]; buf[di + 1] = sheet.data[si + 1]; buf[di + 2] = sheet.data[si + 2]; buf[di + 3] = 255;
        if (HEIGHT) HEIGHT[y * VIEW + x] = z + 1;
      }
    }
  }
}
function drawStack(buf, sheet, px, py, turn, squash, spacing) {
  for (var z = 0; z < COUNT; z++) drawSlice(buf, sheet, z, px, py, turn, squash, Math.round(z * spacing), null);
}
```

Per frame, in this order:

1. Clear the buffer. If lighting is on, set `HEIGHT` to the height buffer and clear it too.
2. `drawStack`, then set `HEIGHT = null`.
3. Measure the bounding box of alpha 255 pixels (for the size readout).
4. Outline: set every non-opaque pixel with an opaque 4-neighbor to a dark color with alpha 254, so it is not outlined again and the lighting pass can tell it from the hull.
5. `lightStack` if lighting is on.
6. Ground shadow: `drawSlice` of a footprint slice at offset (+3, +3), lift 0, flat color `[0, 0, 0, 120]`. Pick the widest slice as `shadowSlice`, not slice 0, when the object stands on gear or a narrow belly.

## Lighting

One pass over the finished frame, using only the height buffer. It is an approximation, not 3D lighting: say so.

- **Light direction** is a compass angle in screen space (0 = top of the screen, 90 = right), fixed while the object turns, so shading moves across the object.
- **Tops** keep their colour. **Walls** (the pixel above is higher) brighten when the light is in front and dim when it is behind.
- A pixel with something taller toward the light is shaded. An edge that drops off toward the light is brightened; the far edge is dimmed.
- **Lamps.** Colours listed in `sheet.emissive` are never shaded, and each lamp pixel adds a soft halo to the hull, the outline and the ground around it. A lamp is matched by exact colour, so:
  - give every lamp its own colour that nothing else uses (a missile's red seeker must not be the navigation-light red);
  - the scheme's `glow` colour must differ from its other colours;
  - list the lamp colours once at the end of the build function: `S.emissive = [GLOW, PORT, RED, GREEN, LAMP];`.
- **Light scale `k`** stretches the sampling distances and the halo for bigger sheets: 1 up to about 60 px, 2 around 100 to 150 px, 3 around 300 px. Store it per object as `lightScale`.
- **Stage.** Halos only read on a dark floor. Use a dark ground colour in both themes (`#1a1f27` with `#232a34` grid lines works), and a dark-on-dark outline such as `[6, 8, 14]`.
- A dark, cool palette (hull around `[46, 52, 68]`, metals shifted toward blue) with a few saturated lamps reads best. A pale hull works too, with fewer and warmer lamps.

```js
function lightStack(buf, height, sheet, lightDeg, k) {
  k = k || 1;
  var a = lightDeg * Math.PI / 180, lx = Math.sin(a), ly = -Math.cos(a);
  var sx = lx > 0.2 ? 1 : lx < -0.2 ? -1 : 0, wx = Math.abs(lx);
  var em = sheet.emSet;
  if (!em) {
    em = sheet.emSet = {};
    (sheet.emissive || []).forEach(function (c) {
      var t = new Uint8ClampedArray(3); t[0] = c[0]; t[1] = c[1]; t[2] = c[2];     // round the way the sheet does
      em[t[0] << 16 | t[1] << 8 | t[2]] = 1;
    });
  }
  function hAt(x, y) { return (x < 0 || y < 0 || x >= VIEW || y >= VIEW) ? 0 : height[y * VIEW + x]; }
  var acc = new Float32Array(VIEW * VIEW * 3), lamps = [];
  var x, y, p, i;
  for (y = 0; y < VIEW; y++) for (x = 0; x < VIEW; x++) {
    p = y * VIEW + x; i = p * 4;
    if (buf[i + 3] !== 255) continue;
    if (em[buf[i] << 16 | buf[i + 1] << 8 | buf[i + 2]]) { lamps.push(p); continue; }
    var h = height[p], f = 1;
    if (hAt(x, y - 1) > h) f = 0.82 + 0.3 * ly;                        // wall: lit from the front, dim from behind
    if (sx !== 0) {
      var toward = hAt(x + sx * 2 * k, y), away = hAt(x - sx * 2 * k, y);
      if (toward >= h + 2 * k) f *= 1 - 0.38 * wx;                     // in the shade of something taller
      else if (toward < h - k) f *= 1 + 0.28 * wx;                     // edge facing the light
      if (away < h - k && toward >= h - k) f *= 1 - 0.16 * wx;         // edge facing away
    }
    if (ly < -0.2 && hAt(x, y - 3 * k) > h + 4 * k) f *= 1 + 0.3 * ly; // cast shadow from a taller part behind
    if (ly > 0.2 && hAt(x, y + 3 * k) > h + k) f *= 1 - 0.3 * ly;      // or from one in front
    f *= 0.92;
    buf[i] = buf[i] * f * 0.95; buf[i + 1] = buf[i + 1] * f; buf[i + 2] = Math.min(255, buf[i + 2] * f * 1.06);   // slight cool tint
  }
  var R = 4 * k, RR = R + 0.3, gain = 0.085 / (k * k);                 // halo: each lamp pixel lights what is near it
  for (var n = 0; n < lamps.length; n++) {
    p = lamps[n]; i = p * 4;
    var px = p % VIEW, py = (p - px) / VIEW, r = buf[i], g = buf[i + 1], b = buf[i + 2];
    for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > RR || d === 0) continue;
      var qx = px + dx, qy = py + dy;
      if (qx < 0 || qy < 0 || qx >= VIEW || qy >= VIEW) continue;
      var w = (1 - d / RR); w = w * w * gain;
      var q = (qy * VIEW + qx) * 3;
      acc[q] += r * w; acc[q + 1] += g * w; acc[q + 2] += b * w;
    }
  }
  for (p = 0; p < VIEW * VIEW; p++) {
    var m = Math.max(acc[p * 3], acc[p * 3 + 1], acc[p * 3 + 2]);
    if (m < 3) continue;
    i = p * 4;
    if (buf[i + 3] >= 254) {                                           // hull or outline: add the light
      if (buf[i + 3] === 255 && em[buf[i] << 16 | buf[i + 1] << 8 | buf[i + 2]]) continue;
      buf[i] = Math.min(255, buf[i] + acc[p * 3]); buf[i + 1] = Math.min(255, buf[i + 1] + acc[p * 3 + 1]);
      buf[i + 2] = Math.min(255, buf[i + 2] + acc[p * 3 + 2]);
    } else if (buf[i + 3] === 0) {                                     // empty: a translucent glow over the ground
      buf[i] = acc[p * 3] / m * 255; buf[i + 1] = acc[p * 3 + 1] / m * 255; buf[i + 2] = acc[p * 3 + 2] / m * 255;
      buf[i + 3] = Math.min(170, m * 1.5);
    }
  }
}
```

The pass must not change which pixels are opaque, and must leave lamp pixels untouched. `check.js` verifies both.

## Viewer page

One self-contained HTML page:

- A square stage with a dark ground grid as CSS background and the canvas on top; a small readout "covers W x H px".
- Drag on the stage or arrow keys to turn; a Turn slider (0 to 359); Spin (about 30 degrees per second, off when the user prefers reduced motion) and Reset buttons.
- Squash slider 0.4 to 1, step 0.05, default 0.75. Spacing slider 0 to the object's max, step 0.5, default 1.
- A checkbox to outline the finished stack, on by default.
- A "Lighting and glow" checkbox, on by default, and a "Light from" slider (0 to 359, step 5, default 315) with a hint that 0 is the top of the screen.
- An Object switch when the page holds more than one object, and color scheme swatches for the current object.
- The slice sheet underneath, scaled 1x to 3x in a horizontally scrolling strip with slice numbers, and a line stating slice count and size.
- Keep objects in one `OBJECTS` array: `{ id, name, w, h, count, view, pos, maxSpacing, shadowSlice, sheetScale, lightScale, build, paintLabel, note, paints }`. Write it as `var OBJECTS = [` ... `];` so `check.js` can read it. Switching objects sets W, H, COUNT, VIEW, resizes both canvases, allocates the height buffer and rebuilds the sheet with `measureSheet(obj.build(paint), obj.w, obj.h, obj.count)`.
- Put the sheet helpers, build functions, renderer and `lightStack` between `//CORE-START` and `//CORE-END` comments, free of DOM calls, so Node can test them.

## Checks

Run `node scripts/check.js <viewer.html> [objectId] [outDir]`. It parses the page script, then for each object confirms:

- Straight down (squash 1, turn 0, spacing 1) equals pasting each slice by hand at `(px - floor(W/2), py - floor(H/2) - z)`: zero differing bytes.
- The slice reach shortcut changes nothing: frames with and without `sheet.rad` are identical at four turns.
- Squash 0.75 is shorter than squash 1. Max spacing is taller than spacing 1. Spacing 0 with squash 1 is flat and equals the footprint.
- Turned 90 degrees, the width matches the straight-down height of the footprint.
- The object stays inside the buffer at max spacing and any turn, with 1 px to spare for the outline.
- Lighting keeps the silhouette, leaves lamp pixels at full brightness, and both darkens and brightens some of the object.

It also prints the footprint, filled pixels, colour count, sheet build time and full-frame time, warns when a sheet is over 16384 px wide or `emissive` matches no visible pixel, and writes `<id>.png`: four turns side by side, lit and outlined on a dark ground.

Look at that PNG once. Fix what reads badly (muddy details, parts hidden behind others, a flat silhouette, too much accent colour), rerun the checks, then publish.

## Pitfalls

- Slow turns jitter with nearest neighbor sampling. This is expected; say so instead of hiding it.
- An outline drawn per slice, or baked into the sheet, shows as dark speckle inside the body.
- Fractional ground positions shimmer. Keep the ground point on whole pixels.
- A stack that never turns should be drawn once and reused as a plain sprite.
- A colour shared by a lamp and a non-lamp part makes the non-lamp part glow. Give lamps their own colours.
- An accent colour on every shoulder, rim and band reads as busy. Keep one stripe and a few panels.
- A stage buffer that is not a whole fraction of the stage's CSS size shows slightly uneven pixels. It is cosmetic; mention it for large objects.
- Do not edit a multi-line script with `sed` or a shell heredoc: quoting breaks on backticks and regex literals. Write the file with the editor tools, or patch it from a small Node script saved to disk.
- If the user wants this in a game engine, the same sheet works: draw each slice as a rotated, vertically scaled, nearest-filtered blit, and sort whole stacks by ground point, never slice by slice. The lighting pass needs a per-pixel height target there, or bake a few light directions.
