---
name: "sprite-stack-object"
description: "Build a sprite-stacked pixel art object (car, building, prop) as a code-drawn slice sheet and show it in a turnable browser viewer. Use when asked to make, preview or add a sprite stack object."
---

# Sprite stack object

Make a 3D-looking pixel object from flat slices drawn in code, and show it in a browser viewer the user can turn. No game engine or image generator is needed.

## What sprite stacking is

- A slice sheet is one row of equal slices, ground slice on the left, top slice on the right. Each slice is a top-down picture of one 1 px layer of the object.
- Draw slice 0 first, then each next slice `round(z * spacing)` px higher on screen. Later slices cover earlier ones.
- Every slice is rotated by the same angle around its center, then squashed vertically (0.75 by default, 1 is straight down), then lifted.
- Sampling is nearest neighbor. Positions stay on whole pixels.
- In the sheet the object's front is the bottom edge of each slice (+y).

## Steps

1. Settle the object and its size. If the user already has a viewer artifact from this skill, add the new object to it instead of making a new page (read the page, add a build function and an entry in `OBJECTS`, republish).
2. Plan the object as a list of height bands before writing code (see "Designing the slices").
3. Write a `buildX(scheme)` function that fills a sheet with the helpers below.
4. Run the checks in Node (see "Checks"), render one preview frame to a PNG and look at it once.
5. Publish the viewer as an HTML artifact (single self-contained page). Tell the user the art is placeholder art drawn in code, the slice size and count, and which checks ran.

## Sizes that work

| Object | Slice size | Slices | Stage buffer | Ground point | Max spacing |
|---|---|---|---|---|---|
| Car | 24 x 43 | 15 | 128 | (64, 76) | 3 |
| Apartment block | 36 x 36 | 56 | 160 | (80, 136) | 2 |

For a new object: the stage buffer must hold the slice diagonal plus `(count - 1) * maxSpacing` px of lift above the ground point, and about `diagonal / 2 * squash` px below it. Cap the spacing slider so the object never clips.

## Designing the slices

- Think in height bands: for each band of z, what does the footprint look like from above? Write the bands as comments first (for example: z0-1 plinth, z2-9 podium, z10-34 tower, z35-49 setback, z50-55 roof clutter).
- The side of the object is made from the edges of the slices. Whatever color is on the outer 2 px of a slice at height z becomes one row of the wall at that height. Put windows, lights, signs and trim there. Use 2 px, not 1, so the wall has no gaps on diagonals.
- The top of the object is whatever is not covered by the slice above. Fill interiors with a solid color so there are no holes, and make upper slices smaller to reveal roofs, hoods and terraces.
- Shade by height: darker fills low, lighter fills high. This reads as depth without any soft shading.
- Use flat fills and bold shapes. Avoid 1 px details, thin stripes and in-between shades: they flicker or smear when turned. Make small parts at least 2 x 2 px.
- Do not bake an outline into the slices. Outline the finished stack once.
- Overhangs (awnings, balconies, signs) are fine in hand-built slices: draw them outside the wall line on the slices at that height.
- Repeating structure belongs in a helper. For a building: a floor is 5 slices (slab, sill, three window slices) and a `tower(z0, floors, x0, y0, x1, y1, wall, seed)` helper stamps floors, choosing each window's color from a hash of (floor, side, index) so lit windows look random but are stable.
- Give the build function a small color scheme argument (body and stripe for vehicles, two neon accents for cyberpunk buildings) so the viewer can offer swatches.

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

```js
// W, H: slice size. COUNT: slices. VIEW: square buffer size. (px, py): ground point, whole pixels.
// transform = translate(pos) * translate(0, -lift) * scale(1, squash) * rotate(turn)
function drawSlice(buf, sheet, z, px, py, turn, squash, lift, flat) {
  var cos = Math.cos(turn), sin = Math.sin(turn);
  var hw = Math.floor(W / 2), hh = Math.floor(H / 2);
  var R = Math.ceil(Math.sqrt(W * W + H * H) / 2) + 1;
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
      }
    }
  }
}
function drawStack(buf, sheet, px, py, turn, squash, spacing) {
  for (var z = 0; z < COUNT; z++) drawSlice(buf, sheet, z, px, py, turn, squash, Math.round(z * spacing), null);
}
```

Per frame, in this order: clear the buffer, `drawStack`, measure the bounding box of alpha 255 pixels (for the size readout), outline (set every non-opaque pixel with an opaque 4-neighbor to a dark color with alpha 254 so it is not outlined again), then the ground shadow (`drawSlice` of a footprint slice at offset (+3, +3), lift 0, flat color `[0, 0, 0, 70]`).

## Viewer page

One self-contained HTML page:

- A square stage with a ground grid as CSS background and the canvas on top; a small readout "covers W x H px".
- Drag on the stage or arrow keys to turn; a Turn slider (0 to 359); Spin (about 30 degrees per second, off when the user prefers reduced motion) and Reset buttons.
- Squash slider 0.4 to 1, step 0.05, default 0.75. Spacing slider 0 to the object's max, step 0.5, default 1.
- A checkbox to outline the finished stack, on by default.
- An Object switch when the page holds more than one object, and color scheme swatches for the current object.
- The slice sheet underneath, scaled 2x or 3x in a horizontally scrolling strip with slice numbers, and a line stating slice count and size.
- Keep objects in one `OBJECTS` array: `{ id, name, w, h, count, view, pos, maxSpacing, shadowSlice, sheetScale, build, paints }`. Switching objects sets W, H, COUNT, VIEW, resizes both canvases and rebuilds the sheet.
- Put the sheet helpers, build functions and renderer between `//CORE-START` and `//CORE-END` comments, free of DOM calls, so Node can test them.

## Checks

Extract the core between the markers and `eval` it in Node, then confirm:

- Straight down (squash 1, turn 0, spacing 1) equals pasting each slice by hand at `(px - floor(W/2), py - floor(H/2) - z)`: zero differing bytes.
- Squash 0.75 is shorter than squash 1. Spacing 2 is taller than spacing 1. Spacing 0 with squash 1 is flat.
- Turned 90 degrees, the width matches the straight-down height of the footprint.
- The object stays inside the buffer at max spacing and any turn.

Then write one frame (turn about 35 degrees, squash 0.75) to a PPM, convert it to PNG scaled up 4x with nearest neighbor, and look at it once. Fix what reads badly (muddy details, parts hidden behind others, a flat silhouette), then publish.

## Pitfalls

- Slow turns jitter with nearest neighbor sampling. This is expected; say so instead of hiding it.
- An outline drawn per slice, or baked into the sheet, shows as dark speckle inside the body.
- Fractional ground positions shimmer. Keep the ground point on whole pixels.
- A stack that never turns should be drawn once and reused as a plain sprite.
- If the user wants this in a game engine, the same sheet works: draw each slice as a rotated, vertically scaled, nearest-filtered blit, and sort whole stacks by ground point, never slice by slice.