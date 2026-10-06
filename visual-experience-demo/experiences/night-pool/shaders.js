// GLSL for Night Pool. Metres, y up: the water's surface is y = 0, the floor 1.4 m below it, the deck
// 12 cm above it. The camera looks from +z toward the two lamps in the far wall (z = -pool.y).
import { CELL } from './sim.js';
export const NB = 12; // bulbs on the string

const COMMON = `
#define NB ${NB}
uniform vec3 uEye, uBulb[NB];
uniform vec2 uPool;
uniform float uTime, uDim;
const float DECK = .12, DEPTH = 1.4, CELL = ${CELL};
const vec3 SIGMA = vec3(.55, .2, .15);         // absorption per metre of water: red goes first, blue last
const vec3 WARM = vec3(1., .6, .3);            // the string's filament bulbs
const vec3 FILL = vec3(1., .9, .76) * .5;      // the house lights behind you
const vec3 TO_FILL = vec3(.115, .955, .272);   // toward them
const vec3 TEAL = vec3(.16, .78, .74);         // light escaping the lit water

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f *= f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y); }

// Light from the string of bulbs on a surface at p facing n.
vec3 bulbLight(vec3 p, vec3 n) {
  float e = 0.;
  for (int i = 0; i < NB; i++) { vec3 l = uBulb[i] - p; float d2 = dot(l, l); e += max(dot(n, l), 0.) * inversesqrt(d2) / d2; }
  return WARM * e * .55;
}
// The bulbs mirrored by a surface at p whose mean normal is n, seen along v (toward the eye). Its tiny
// facets tilt about n with slopes spread by sig (across the view, along it), so each bulb lights the
// facets that happen to face it: a microfacet sum, D·F / 4cosθo per bulb.
vec3 glints(vec3 p, vec3 v, vec3 n, vec2 sig) {
  vec2 m = -n.xz / n.y;
  vec3 hm = normalize(normalize(uBulb[NB / 2] - p) + v);
  if (abs(-hm.z / hm.y - m.y) > sig.y * 8.) return vec3(0); // the string's bulbs all want about this slope along the view
  float s = 0.;
  for (int i = 0; i < NB; i++) {
    vec3 l = uBulb[i] - p; float d2 = dot(l, l);
    vec3 h = normalize(l * inversesqrt(d2) + v);
    vec2 e = (-h.xz / h.y - m) / sig; // the facet slope that would show this bulb, in spreads
    float e2 = dot(e, e);
    if (e2 > 18.) continue;
    float hn = max(dot(h, n), .3), f = 1. - dot(h, v), f2 = f * f;
    s += exp(-.5 * e2) * (.02 + .98 * f2 * f2 * f) / (hn * hn * hn * hn * d2);
  }
  return WARM * s / (25.13 * sig.x * sig.y * max(dot(n, v), .15));
}
vec3 sky(vec3 r) { return mix(vec3(.02, .028, .042), vec3(.003, .005, .01), sqrt(clamp(r.y, 0., 1.))); }
vec3 tone(vec3 c) { return pow(1. - exp(-c * 1.35), vec3(1. / 2.2)); }`;
const DITHER = `float dither() { return (hash(gl_FragCoord.xy) - .5) / 255.; }`;

export const FULL_VS = `void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }`;

// One pass for everything but the prints: the deck, the coping, and the water with the pool under it.
export const POOL_FS = `${COMMON}
${DITHER}
uniform vec2 uRes, uTan; uniform vec3 uF, uR, uU, uLamp[2]; uniform float uPix;
uniform highp sampler2D uHeight; uniform sampler2D uShadow; uniform float uOn;
out vec4 o;
const vec3 LAMP = vec3(.74, 1., .98) * 2.8;
// the lamps strike: a quick soft rise, their light reaching out through the water (uOn: seconds since)
float bloom(float d) { return smoothstep(0., .6, uOn) * smoothstep(0., 1., (uOn * 6.5 - d) / 1.5 + .5); }
const vec3 AIM = vec3(0, -.68, .733); // the lamps face into the pool and steeply down
const vec3 SUN = vec3(-.17, .985, -.03); // toward the moon, high on the left, seen from under the water

// the water's slope (drawn about twice true) and its curvature, from the simulation
vec3 waves(vec2 p) { return texture(uHeight, p / (2. * uPool) + .5).gba; }
// the prints seen from above: r, their soft shadows; g, where they float, sharp
float shadow(vec2 p, float blur) { return textureLod(uShadow, p / (2. * uPool) + .5, blur).r; }
float cover(vec2 p) { return textureLod(uShadow, p / (2. * uPool) + .5, 0.).g; }

// a breath of wind from the far end: long low ripples running toward you
vec2 breeze(vec2 p) {
  vec2 g = vec2(0);
  for (int i = 0; i < 5; i++) {
    float f = float(i), k = 15. * pow(1.37, f), a = .14 * sin(f * 2.3 + .4);
    vec2 d = vec2(sin(a), cos(a));
    g += d * cos(dot(p, d) * k - uTime * sqrt(9.8 * k) * .5 + f * 1.9) * .008 / (1. + f * .16);
  }
  return g;
}

// light thrown on the floor by the rippled surface above
float caustic(vec2 p) {
  vec2 q = mod(p * 6.2832, 6.2832) - 250., i = q; float c = 1.;
  for (int n = 0; n < 3; n++) {
    float t = uTime * .3 * (1. - 3.5 / float(n + 1));
    i = q + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1. / length(vec2(q.x / (sin(i.x + t) / .005), q.y / (cos(i.y + t) / .005)));
  }
  return pow(abs(1.17 - pow(c / 3., 1.4)), 8.);
}

// pale aqua and white mosaic, 12.5 cm, in light grout; px is the size of a pixel there
vec3 mosaic(vec2 p, float px) {
  vec2 g = p / .125, f = abs(fract(g) - .5), id = floor(g);
  float w = px / .125 + .02, line = smoothstep(.465 - w, .465 + w, max(f.x, f.y));
  vec3 tile = mix(vec3(.6, .84, .86), vec3(.84, .94, .94), hash(id)) * (.94 + .06 * hash(id + 7.));
  return mix(tile, vec3(.5, .6, .6), line * clamp(1.2 - w * 3., 0., 1.));
}

// the two lamps in the far wall: light reaching p, facing n, through the water
vec3 lampLight(vec3 p, vec3 n) {
  vec3 e = vec3(0);
  for (int i = 0; i < 2; i++) {
    vec3 l = uLamp[i] - p; float d2 = max(dot(l, l), .03), d = sqrt(d2);
    float a = max(dot(-l / d, AIM), 0.), a2 = a * a;
    e += bloom(d) * (.04 + 1.7 * a2 * a2 * a2) * max(dot(n, l) / d, 0.) / d2 * exp(-SIGMA * d);
  }
  return LAMP * e;
}
// lamp light scattered toward the eye by the water along a ray from o in direction d, for distance t
vec3 inscatter(vec3 o, vec3 d, float t) {
  vec3 s = vec3(0);
  for (int i = 0; i < 2; i++) {
    vec3 m = uLamp[i] - o; float b = dot(m, d), q = sqrt(max(dot(m, m) - b * b, 1e-4));
    vec3 c = normalize(o + d * clamp(b, 0., t) - uLamp[i]); // the lamp's beam where the ray passes nearest
    float a = max(dot(c, AIM), 0.), a2 = a * a, a4 = a2 * a2;
    float beam = .06 + 3.4 * a4 * a4 * a2;
    s += bloom(q + max(b, 0.)) * beam * (atan((t - b) / q) + atan(b / q)) / q * exp(-SIGMA * (q + max(b, 0.)));
  }
  return LAMP * s * .08;
}
// Light on the pool's floor or walls at p (facing n). The lamps light it directly and again off the
// underside of the rippled surface, which gathers that light into a moving net; the light from above
// comes through the same surface. Waves bend and focus both; the prints above block them.
vec3 poolLight(vec3 p, vec3 n) {
  float depth = -p.y;
  vec3 s = p + SUN * (depth / SUN.y);
  vec3 wv = waves(s.xz);
  vec2 c = s.xz - wv.xy * depth * .45;
  float focus = 1. / max(.25, 1. + wv.z * depth * .16);
  float k = caustic(c * 1.45 + vec2(sin(c.y * 1.9 + 1.3), cos(c.x * 1.7 - .6)) * .15) * focus;
  float shade = shadow(c, 0.);
  vec3 lamp = lampLight(p, n) * (.4 + 2. * k) * (1. - .75 * shade);
  vec3 sky = FILL * .22 * max(dot(n, SUN), 0.) * (.05 + .5 * k) * (1. - .9 * shade) * exp(-SIGMA * depth / SUN.y);
  return lamp + sky + TEAL * .007 * (1. - .5 * shade);
}

// The string's bulbs mirrored in the water. A lightly rippled surface is a mosaic of tiny facets, each
// tilted a little at random about the mean surface (more along the view, the way the ripples run) and
// re-tilting as they pass; a facet flashes when it mirrors a bulb to the eye. Near a bulb's mirror point
// many can, farther toward you only the steepest: a narrow column of sparks, thinning toward you, over
// the faint warm glow of the patch's soft reflection. A wake tilts the mean surface and scatters them.
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
vec2 tilt(vec2 id) { return (hash2(id) + hash2(id + 17.3) - 1.) * 2.45; } // about normal, deviation 1
vec3 sparkle(vec3 w, vec3 v, vec3 n, float px) {
  vec2 m = -n.xz / n.y;
  vec3 hm = normalize(normalize(uBulb[NB / 2] - w) + v);
  if (abs(-hm.z / hm.y - m.y) > .22) return vec3(0); // the string's bulbs all want about this slope along the view
  float cs = max(.02, px * 3.5); // a facet: 2 cm, and never under a few pixels
  vec2 g = w.xz / cs, id = floor(g), f = fract(g);
  float t = uTime * 1.7 + hash(id) * 9.;
  vec2 ft = mix(tilt(id + floor(t)), tilt(id + floor(t) + 1.), smoothstep(.15, .85, fract(t))) * vec2(.0015, .03);
  float spot = smoothstep(.36, .1, length(f - .5 - (hash2(id + 5.) - .5) * .4));
  float s = 0., glow = 0.;
  for (int i = 0; i < NB; i++) {
    vec3 l = uBulb[i] - w; float d2 = dot(l, l);
    vec3 h = normalize(l * inversesqrt(d2) + v);
    // a facet flashes when it mirrors the bulb; the glow, averaged over many ripples, hardly sways
    vec2 need = -h.xz / h.y - m, e = (need - ft) / vec2(.0015, .01), eh = (need + m * .6) / vec2(.009, .05);
    float fr = 1. - dot(h, v), b = (.02 + .98 * fr * fr * fr * fr * fr) * (.4 + 1.2 * hash(vec2(float(i) * 7.3, 1.7))) / d2;
    s += b * exp(-.5 * dot(e, e));
    glow += b * exp(-.5 * dot(eh, eh));
  }
  return WARM * (s * spot * 4200. + glow * 55.);
}

vec3 water(vec3 w, vec3 rd, float dist) {
  vec2 g = waves(w.xz).xy + breeze(w.xz);
  vec3 n = normalize(vec3(-g.x, 1, -g.y));
  float c = clamp(dot(-rd, n), 0., 1.), f = 1. - c, F = .02 + .98 * f * f * f * f * f;
  // toward the far end the water takes on more of the dark garden and sky it mirrors
  float Fv = max(F, .4 * smoothstep(.82, .5, c));
  vec3 r = reflect(rd, n); r.y = abs(r.y);
  // a floating print's wet edge stands a little proud of the water, and the ripples mirror it, broken
  float edge = cover(w.xz + r.xz * (.025 / max(r.y, .25))) * (1. - cover(w.xz));
  vec3 above = sky(r) + vec3(.5, .48, .44) * edge * 2.5;
  // refracted into the pool, to its floor or a wall
  vec3 d = refract(rd, n, .75), iv = 1. / max(abs(d), vec3(1e-5));
  float tx = (uPool.x - w.x * sign(d.x)) * iv.x, tz = (uPool.y - w.z * sign(d.z)) * iv.z, ty = (DEPTH + w.y) * iv.y;
  float t = min(min(tx, tz), ty), px = (dist + t) * uPix;
  vec3 x = w + d * t, nx = t == ty ? vec3(0, 1, 0) : t == tx ? vec3(-sign(d.x), 0, 0) : vec3(0, 0, -sign(d.z));
  vec3 alb = mosaic(nx.y > .5 ? x.xz : abs(nx.x) > .5 ? x.zy : x.xy, px);
  if (nx.y < .5) alb = mix(alb, vec3(.07, .2, .25) * (.8 + .4 * hash(floor(x.xz * 16.) + floor(x.y * 16.))), smoothstep(-.19 - px, -.19 + px, x.y));
  vec3 below = alb * poolLight(x, nx) * exp(-SIGMA * t) + inscatter(w, d, t);
  // the lamps' lenses, in chrome rings
  if (nx.z > .5) for (int i = 0; i < 2; i++) {
    float q = length(x.xy - uLamp[i].xy);
    below += exp(-SIGMA * t) * (LAMP * 24. * smoothstep(0., .45, uOn) * (1. - .5 * q / .13) * smoothstep(.13 + px, .13 - px, q) + vec3(.5, .7, .7) * smoothstep(.018 + px, .018 - px, abs(q - .145)));
  }
  return mix(below, above, Fv) + sparkle(w, -rd, n, dist * uPix);
}

// the strip of waterline tile between the water and the coping, lit from the water below it
vec3 rim(vec3 p, vec3 rd) {
  vec3 iv = 1. / max(abs(rd), vec3(1e-5));
  float tx = (uPool.x - p.x * sign(rd.x)) * iv.x, tz = (uPool.y - p.z * sign(rd.z)) * iv.z;
  vec3 x = p + rd * min(tx, tz), n = tx < tz ? vec3(-sign(rd.x), 0, 0) : vec3(0, 0, -sign(rd.z));
  return vec3(.07, .2, .25) * (TEAL * .7 * exp(-x.y / .04) + bulbLight(x, n) + FILL * .04);
}

// pale coping round the edge, its lip catching the pool's light and damp just behind it; then dark
// stone, warm where the bulbs light it
vec3 deck(vec3 p, vec3 rd, float px) {
  vec2 a = abs(p.xz) - uPool;
  float e = max(a.x, a.y), lip = 0.;
  vec3 n = vec3(0, 1, 0), alb;
  if (e < .3) {
    float along = a.x > a.y ? p.z : p.x;
    lip = smoothstep(.045, 0., e);
    vec2 side = a.x > a.y ? vec2(sign(p.x), 0) : vec2(0, sign(p.z));
    n = normalize(vec3(-side.x * lip, 1. - lip * .6, -side.y * lip));
    alb = vec3(.2, .195, .185) * (.88 + .24 * noise(p.xz * 9.)) * (1. - .4 * smoothstep(.004 + px, .004 - px, abs(fract(along / .6 + .5) - .5) * .6));
    alb *= 1. - .4 * smoothstep(.17, .07, e) * (1. - lip);
  } else {
    vec2 g = p.xz / vec2(.9, .6); g.x += .5 * mod(floor(g.y), 2.);
    vec2 f = (.5 - abs(fract(g) - .5)) * vec2(.9, .6);
    alb = vec3(.062, .062, .065) * (.85 + .3 * hash(floor(g))) * (.9 + .2 * noise(p.xz * 11.));
    alb *= 1. - .3 * smoothstep(.004 + px, .004 - px, min(f.x, f.y));
  }
  return alb * (bulbLight(p, n) + FILL * .04 * max(dot(n, TO_FILL), 0.) + TEAL * (.05 * exp(-e / .25) + 1.1 * lip));
}

void main() {
  vec2 q = gl_FragCoord.xy / uRes * 2. - 1.;
  vec3 rd = normalize(uF + uR * q.x * uTan.x + uU * q.y * uTan.y), col;
  float t = (DECK - uEye.y) / min(rd.y, -1e-3);
  vec3 p = uEye + rd * t;
  vec2 edge = abs(p.xz) - uPool;
  if (max(edge.x, edge.y) > 0.) col = deck(p, rd, t * uPix);
  else {
    float tw = -uEye.y / rd.y;
    vec3 w = uEye + rd * tw;
    edge = abs(w.xz) - uPool;
    col = max(edge.x, edge.y) > 0. ? rim(p, rd) : water(w, rd, tw);
  }
  col *= .9 * uDim * (1. - .38 * pow(length(q * vec2(.8, 1)) / 1.28, 3.));
  o = vec4(tone(col) + dither(), 1);
}`;

// Behind a lifted print the pool goes out of focus: its picture, read from a coarser mip level.
export const BLUR_FS = `
uniform sampler2D uScene; uniform vec2 uRes; uniform float uBlur;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, s = exp2(uBlur) / uRes * .7;
  vec3 c = textureLod(uScene, uv + vec2(-s.x, -s.y), uBlur).rgb + textureLod(uScene, uv + vec2(s.x, -s.y), uBlur).rgb
         + textureLod(uScene, uv + vec2(-s.x, s.y), uBlur).rgb + textureLod(uScene, uv + vec2(s.x, s.y), uBlur).rgb;
  o = vec4(c * .25 + (hash(gl_FragCoord.xy) - .5) / 255., 1);
}`;

// The prints (and the drops that fall from a lifted one). Instances: centre and wetness, orientation,
// half size, layer and lift, border and flags.
export const PRINT_VS = `${COMMON}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPos;
layout(location = 2) in vec4 aQuat;
layout(location = 3) in vec4 aShape;
layout(location = 4) in vec4 aMeta;
uniform mat4 uVP;
out vec3 vP, vN, vE, vSheen; out vec2 vL; flat out vec4 vShape, vMeta; flat out vec2 vWet;
vec3 rot(vec4 q, vec3 v) { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  float afloat = (1. - aShape.w) * clamp(1. - aPos.y * 20., 0., 1.);
  vL = aCorner * (aShape.xy + .006 + .016 * afloat); // room for the soft edge, and afloat for the meniscus
  vP = aPos.xyz + rot(aQuat, vec3(vL.x, 0, vL.y));
  vN = rot(aQuat, vec3(0, 1, 0));
  vShape = aShape; vMeta = aMeta; vWet = vec2(aPos.w, afloat);
  // the light on it (the house lights behind you, the string at the far end) and the string's broad
  // sheen in its wet laminate, both smooth enough to take at its corners
  vec3 n = vN, v = normalize(vP - uEye);
  if (dot(n, v) > 0.) n = -n;
  vE = FILL * (.62 + .85 * max(dot(n, TO_FILL), 0.)) + bulbLight(vP, n) * .3;
  vSheen = aMeta.z < -.5 ? vec3(0) : glints(vP, -v, n, vec2(.05, .07)) * .5;
  gl_Position = uVP * vec4(vP, 1);
}`;

export const PRINT_FS = `${COMMON}
${DITHER}
uniform mediump sampler2DArray uPhotos; uniform sampler2D uFullA, uFullB; uniform vec3 uLamp[2];
in vec3 vP, vN, vE, vSheen; in vec2 vL; flat in vec4 vShape, vMeta; flat in vec2 vWet;
out vec4 o;
void main() {
  vec2 hs = vShape.xy;
  if (vMeta.z < -.5) { // a drop of water falling from a lifted print: a bead catching the light
    float r = length(vL / hs), a = smoothstep(1., .7, r);
    if (a <= 0.) discard;
    o = vec4(vec3(.75, .9, .9) * (.25 + .9 * smoothstep(.5, .1, length(vL / hs - vec2(-.25, -.35)))) * a * .8, a * .8);
    return;
  }
  float b = vMeta.x, edge = max(abs(vL.x) - hs.x, abs(vL.y) - hs.y), aa = fwidth(edge) * .7 + 1e-5;
  float a = clamp(.5 - edge / aa, 0., 1.);
  // the water climbs a floating print's edge: a thin dark line where they meet
  float men = vWet.y * .6 * pow(1. - clamp(edge / .016, 0., 1.), 1.5);
  if (a <= 0. && men < .004) discard;
  vec2 uv = (vL + hs - b) / (2. * (hs - b));
  vec3 photo = vMeta.z > 1.5 ? texture(uFullB, uv).rgb : vMeta.z > .5 ? texture(uFullA, uv).rgb : texture(uPhotos, vec3(uv, vShape.z)).rgb;
  photo = mix(photo, photo * photo * (3. - 2. * photo), .3); // a little more punch: the prints are the subject
  float inner = max(abs(uv.x - .5), abs(uv.y - .5)) - .5, ia = fwidth(inner) * .7 + 1e-5, border = clamp(.5 + inner / ia, 0., 1.);
  vec3 paper = vec3(.83, .82, .78) * (1. - .2 * smoothstep(-.014, 0., edge)); // wet paper, darkest at its edge
  vec3 face = mix(photo, paper, border);
  vec3 n = normalize(vN), v = normalize(vP - uEye);
  if (dot(n, v) > 0.) n = -n;
  float lift = vShape.w, F = .04 + .96 * pow(1. - abs(dot(n, v)), 5.);
  // the light on it as a brightness and a warmth
  float lum = dot(vE, vec3(.3, .59, .11));
  vec3 col = face * mix(mix(vec3(1), vE / lum, .3) * (.76 + .22 * smoothstep(.3, 1.1, lum)), vec3(.97), lift);
  // the pool's teal light through the laminate at its edges
  col += TEAL * .1 * smoothstep(-.03, 0., edge) * (.15 + exp(-length(vP.xz - uLamp[0].xz) * .7) + exp(-length(vP.xz - uLamp[1].xz) * .7)) * (1. - lift);
  col *= (1. + vMeta.y * .1) * mix(uDim, 1., lift);
  // a wet, glossy laminate: the night, the bulbs' sheen sliding over it as it tilts, the house lights
  // (held up to be looked at, it is turned out of their glare)
  vec3 r = reflect(v, n);
  vec3 gloss = F * sky(r) + vSheen + F * FILL * 22. * (1. - .85 * lift) * pow(max(dot(r, TO_FILL), 0.), 500.);
  col += tone(gloss * (.4 + .6 * vWet.x) * (1. + .6 * border)) * mix(uDim, 1., lift);
  o = vec4((col + dither()) * a, a + (1. - a) * men);
}`;

// Their shadows: the footprint of every print in a top-down map of the pool: r softened at its edge,
// g sharp, for where the prints float.
export const SHADOW_VS = `
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPos;
layout(location = 2) in vec4 aQuat;
layout(location = 3) in vec4 aShape;
layout(location = 4) in vec4 aMeta;
uniform vec2 uPool;
out vec2 vL; flat out vec4 vH; flat out float vFloat;
vec3 rot(vec4 q, vec3 v) { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  float pen = .07 + max(aPos.y, 0.) * .25; // the penumbra widens as a print rises from the water
  vL = aCorner * (aShape.xy + pen);
  vH = vec4(aShape.xy, pen, aMeta.z < -.5 ? 0. : aMeta.w);
  vFloat = (1. - aShape.w) * clamp(1. - aPos.y * 20., 0., 1.) * step(-.5, aMeta.z);
  vec3 p = aPos.xyz + rot(aQuat, vec3(vL.x, 0, vL.y));
  gl_Position = vec4(p.xz / uPool, 0, 1);
}`;
export const SHADOW_FS = `
in vec2 vL; flat in vec4 vH; flat in float vFloat;
out vec4 o;
void main() {
  vec2 d = abs(vL) - vH.xy;
  float e = length(max(d, 0.)) + min(max(d.x, d.y), 0.);
  o = vec4(vH.w * smoothstep(vH.z, -vH.z, e), vFloat * smoothstep(.008, -.008, e), 0, 1);
}`;
