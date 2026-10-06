// GLSL for Mirror Ball. Light is linear and adds up in a float buffer; `tone` maps it for the
// screen with a bloom that `bright` and `blur` gather from its hottest parts. OPTICS repeats
// throwOf from optics.js, so the GPU and a tap agree on where every square of light falls.
const COMMON = `
uniform vec3 uLampCol; // the pin spot: a warm white halogen near 3800 K, redder while its filament warms
#define LAMP uLampCol
const vec3 SKY = vec3(.0032, .0042, .0068);  // what little comes in from outside
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f *= f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y); }`;

const OPTICS = `
uniform vec3 uBall, uLampPos, uMin, uMax, uAim; uniform float uRadius, uHalf, uDome;
// The pin spot is focused to the ball's outline, brightest in the middle: mirrors toward the rim
// it sees catch less, and none of its light goes past the ball.
float beamAt(vec3 n) { return smoothstep(1., .8, length(cross(n, uAim))); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, c * v.z - s * v.x); }
// The mirror with normal n throws the lamp's light from a virtual source V behind it (the lamp
// mirrored in its plane, drawn close by its dome) onto the room plane its centre ray d meets.
float throwOf(vec3 n, out vec3 C, out vec3 V, out vec3 d, out int axis, out float t) {
  C = uBall + n * uRadius;
  vec3 l = uLampPos - C, m = l - 2. * dot(l, n) * n;
  float dL = length(l);
  d = -normalize(m);
  V = C - d * (uDome * dL / (uDome + dL));
  vec3 tt = (mix(uMin, uMax, step(0., d)) - C) / d;
  axis = tt.x < tt.y ? (tt.x < tt.z ? 0 : 2) : (tt.y < tt.z ? 1 : 2);
  t = min(tt.x, min(tt.y, tt.z));
  return dot(l, n) / dL;
}`;

// The room's paint and boards; axis 0 is a side wall, 1 the floor or ceiling, 2 the back or front.
const SURFACE = `
vec3 albedo(vec3 p, int axis, bool lit) {
  if (axis == 1 && p.y > 1.) return vec3(.035, .035, .04);
  if (axis == 1) {
    float b = p.x / .19, z = p.z / 2.1 + hash(vec2(floor(b), 7.)) * 3.;
    vec2 cell = vec2(floor(b), floor(z)), f = fract(vec2(b, z)), w = fwidth(vec2(b, z)) + vec2(.05, .008);
    float joint = smoothstep(0., w.x, min(f.x, 1. - f.x)) * smoothstep(0., w.y, min(f.y, 1. - f.y));
    float grain = noise(vec2(f.x * 7. + cell.y * 3., z * 9.)) * .5 + noise(vec2(f.x * 30., z * 2.)) * .3;
    return vec3(.12, .09, .07) * (.75 + .35 * hash(cell) + .3 * grain) * mix(.72, 1., joint);
  }
  // matte paint, rolled on: its texture shows only where light falls on it
  vec2 w = vec2(p.x + p.z, p.y);
  vec3 paint = vec3(.26, .25, .265) * (.93 + .14 * noise(w * 2.2));
  if (!lit) return paint;
  float fine = noise(w * 23.) * .55 + noise(w * 57.) * .45, keep = 1. - smoothstep(.3, .8, length(fwidth(w * 57.)));
  return paint * (1. + (fine - .5) * .3 * keep);
}`;

export const room = [`
layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNormal; layout(location = 2) in float aMat;
uniform mat4 uVP;
out vec3 vP, vN; flat out int vMat;
void main() { vP = aPos; vN = aNormal; vMat = int(aMat); gl_Position = uVP * vec4(aPos, 1); }`, `
${COMMON}${OPTICS}${SURFACE}
uniform vec3 uEye; uniform float uLamp, uGlow, uReach;
in vec3 vP, vN; flat in int vMat;
out vec4 o;
void main() {
  vec3 n = normalize(vN), l = normalize(uLampPos - vP), v = normalize(uEye - vP);
  // very little light of its own: a trace from outside and the squares' light bounced round, most
  // of it near the ball; corners and edges, where two surfaces meet, gather less
  vec3 e = min(vP - uMin, uMax - vP), k = max(mix(vec3(.22), vec3(1), smoothstep(0., 1.5, e)), abs(n));
  float ao = k.x * k.y * k.z;
  vec3 light = (SKY + uGlow * LAMP * .0055 * (1. + 2.5 * exp(-distance(vP, uBall) * .6))) * ao, col;
  if (vMat == 3) { // the hanger: dark steel, catching the edge of the beam where it passes
    vec3 h = normalize(l + v), to = vP - uLampPos;
    float beam = smoothstep(1.15, .8, length(cross(to, uAim)) / max(dot(to, uAim), .1) * uReach / uRadius) * uLamp;
    col = vec3(.06) * light * 3. + LAMP * beam * (.05 * max(dot(n, l), 0.) + .8 * pow(max(dot(n, h), 0.), 60.));
  } else col = albedo(vP, vMat, false) * light;
  // the floor's varnish gives back a little of the room's glow, more as it is seen at a slant
  if (vMat == 1 && vP.y < 1.) col += (SKY + uGlow * LAMP * .008) * ao * (.04 + .96 * pow(1. - abs(dot(n, v)), 5.));
  o = vec4(col * OUT, 1);
}`];

// The ball under its mirrors: dark tile cement, and a steel cap where it hangs.
export const body = [`
uniform mat4 uVP; uniform vec3 uBall, uCamR, uCamU; uniform float uRadius;
out vec3 vW;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1.;
  vW = uBall + (uCamR * c.x + uCamU * c.y) * uRadius * 1.2;
  gl_Position = uVP * vec4(vW, 1);
}`, `
${COMMON}${OPTICS}
uniform mat4 uVP; uniform vec3 uEye; uniform float uLamp;
in vec3 vW;
out vec4 o;
void main() {
  vec3 rd = normalize(vW - uEye), oc = uEye - uBall;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + uRadius * uRadius * .985;
  if (h < 0.) discard;
  vec3 p = uEye + rd * (-b - sqrt(h)), n = normalize(p - uBall), l = normalize(uLampPos - p);
  vec4 clip = uVP * vec4(p, 1);
  gl_FragDepth = clip.z / clip.w * .5 + .5;
  float cap = smoothstep(.975, .985, n.y);
  vec3 col = mix(vec3(.16), vec3(.3), cap) * (SKY * 5. + LAMP * uLamp * max(dot(n, l), 0.) * .22);
  col += cap * LAMP * uLamp * pow(max(dot(reflect(rd, n), l), 0.), 30.) * .6;
  o = vec4(col * OUT, 1);
}`];

const TILE_ATTRIBS = `
layout(location = 0) in vec2 aCorner; // ±1
layout(location = 1) in vec4 aN;      // normal on the unturned ball, photo layer
layout(location = 2) in vec4 aE;      // east along the mirror's ring
layout(location = 3) in vec4 aCrop;   // its square of the photo in texture space`;

// What a mirror sees in direction r: a dark room flecked with its squares of light (crowded
// overhead, near the ball), the beam's haze converging on the lamp, and the lamp itself.
const GLASS = `
float fleck(vec3 r) {
  vec2 cell = floor(vec2(atan(r.z, r.x), r.y) * 10.);
  float many = mix(.86, .74, smoothstep(-.2, .9, r.y));
  return smoothstep(many, many + .01, hash(cell)) * (.15 + .85 * pow(hash(cell + 7.), 3.));
}
float lampIn(float c) { return exp((c - 1.) * 16.) * .22 + exp((c - 1.) * 110.) * 3. + exp((c - 1.) * 700.) * 40.; }`;

// Each mirror is flat glass silvered behind a transparency, so it is chrome: mostly dark, bright
// where it catches a square of light, hot white where it lines up the lamp; the photo shows faintly.
export const tiles = [`
${TILE_ATTRIBS}
${COMMON}${OPTICS}
uniform mat4 uVP; uniform float uRot;
out vec3 vP; out vec2 vUV; flat out vec3 vN; flat out vec4 vCrop; flat out float vLayer; flat out int vId;
void main() {
  vec3 n = rotY(aN.xyz, uRot), e = rotY(aE.xyz, uRot);
  vP = uBall + n * uRadius + (e * aCorner.x + cross(n, e) * aCorner.y) * uHalf;
  vN = n; vUV = .5 - .5 * aCorner; vCrop = aCrop; vLayer = aN.w; vId = gl_InstanceID;
  gl_Position = uVP * vec4(vP, 1);
}`, `
${COMMON}${OPTICS}${GLASS}
uniform mediump sampler2DArray uPhotos; uniform vec3 uEye; uniform float uLamp, uGlow, uHeld, uLayers; uniform int uHeldTile;
in vec3 vP; in vec2 vUV; flat in vec3 vN; flat in vec4 vCrop; flat in float vLayer; flat in int vId;
out vec4 o;
void main() {
  vec3 v = normalize(vP - uEye), r = reflect(v, vN), l = normalize(uLampPos - vP);
  vec3 film = texture(uPhotos, vec3(mix(vCrop.xy, vCrop.zw, vUV), vLayer), 1.).rgb;
  float lit = max(dot(vN, l), 0.) * uLamp * beamAt(vN), c = dot(r, l), luck = hash(vec2(float(vId), 3.7));
  // the room in the glass: its squares of light as coloured flecks (each a patch of some photo),
  // the haze round the beam, and the lamp, which a band of mirrors near its line catches hot
  vec2 cell = floor(vec2(atan(r.z, r.x), r.y) * 10.);
  vec3 seen = textureLod(uPhotos, vec3(hash(cell + 3.), hash(cell + 5.), floor(hash(cell + 9.) * uLayers)), 3.).rgb + .05;
  vec3 env = SKY * (1. + .5 * r.y) + LAMP * (max(uGlow, .6 * uLamp) * fleck(r) * seen * 1.5
    + uLamp * (lampIn(c) + exp((c - 1.) * 25.) * .9 * luck + exp((c - 1.) * 3.) * .03));
  vec3 col = env * mix(vec3(1), film, .45) + film * LAMP * lit * .06;
  // a faint cool rim where the glass turns away, on the side the lamp misses
  col += vec3(.012, .02, .036) * pow(1. - abs(dot(vN, v)), 3.) * smoothstep(.3, -.1, dot(vN, normalize(uLampPos - uBall)));
  // fine grout between the mirrors: grey cement, lit on the lamp's side, at least a hairline wide
  vec2 q = abs(vUV - .5) * 2.;
  float m = max(q.x, q.y), w = max(.07, fwidth(m) * 1.5);
  col = mix(col, vec3(.16) * (SKY * 5. + LAMP * (lit * .22 + uGlow * .012)), smoothstep(1. - w, 1., m));
  if (vId == uHeldTile) col += film * LAMP * uHeld * 2.;
  o = vec4(col * OUT, 1);
}`];

// The squares of light: each lit mirror's photo projected from its virtual source onto the room.
// Drawn once per sub-step between the last frame's turn and this one, so a fast ball smears them;
// drawn again, mirrored, blurred and faint, for their reflections in the floor's varnish.
export const spots = [`
${TILE_ATTRIBS}
${COMMON}${OPTICS}
uniform mat4 uVP; uniform float uRot0, uRot1, uSteps, uGain, uDim, uMirror; uniform ivec2 uHome; uniform int uHover;
out vec3 vUVs, vP; flat out vec4 vCrop, vMeta; flat out vec3 vTint, vV;
void main() {
  // instances: per mirror, per sub-step, the plane its centre ray meets and the next one it spills onto
  int per = int(uSteps) * 2, tile = gl_InstanceID / per, k = gl_InstanceID - tile * per;
  float rot = mix(uRot0, uRot1, (float(k >> 1) + .5) / uSteps);
  vec3 n = rotY(aN.xyz, rot), e = rotY(aE.xyz, rot), u = cross(n, e), C, V, d;
  int axis; float t, lit = throwOf(n, C, V, d, axis, t);
  if (lit <= 0. || (axis == 2 && d.z > 0.) || tile == uHome.x || tile == uHome.y) { gl_Position = vec4(2, 2, 2, 1); return; }
  float side = d[axis] > 0. ? uMax[axis] : uMin[axis];
  int plane = axis;
  if ((k & 1) == 1) { // where the square crosses a corner of the room, the rest of it lands on the next plane
    float over = 0.;
    for (int j = 0; j < 4; j++) {
      vec3 P = C + (e * (j == 1 || j == 2 ? 1. : -1.) + u * (j > 1 ? 1. : -1.)) * uHalf - V, Q = V + P * ((side - V[axis]) / P[axis]);
      for (int b = 0; b < 3; b++) if (b != axis) {
        float lo = uMin[b] - Q[b], hi = Q[b] - uMax[b];
        if (max(lo, hi) > over) { over = max(lo, hi); plane = b; }
      }
    }
    if (plane == axis) { gl_Position = vec4(2, 2, 2, 1); return; }
    side = d[plane] > 0. ? uMax[plane] : uMin[plane];
  }
  // the floor shows no reflection of what lies on it
  if (uMirror > .5 && plane == 1 && side < 1.) { gl_Position = vec4(2, 2, 2, 1); return; }
  vec3 P = C + (e * aCorner.x + u * aCorner.y) * uHalf - V;
  float s = (side - V[plane]) / P[plane];
  if (s <= 0.) { gl_Position = vec4(2, 2, 2, 1); return; }
  vP = V + P * s;
  vec3 lift = vec3(0); lift[plane] = sign(d[plane]) * .004; vP -= lift; // a few millimetres off the surface
  if (uMirror > .5) vP.y *= -1.7; // seen in the varnish: below the floor, drawn out toward the eye
  vUVs = vec3((.5 - .5 * aCorner) * s, s);
  float dv = length(C - V), m = 1. + t / dv;
  // the lamp's lens is not a point: edges soften a little with distance
  float soft = clamp(.035 * t / length(uLampPos - C) / (2. * uHalf * m), .02, .09);
  vCrop = aCrop; vMeta = vec4(aN.w, float(plane), soft, dv * dv); vV = V;
  vTint = LAMP * uGain * beamAt(n) / uSteps * uDim * (tile == uHover ? 1.4 : 1.);
  gl_Position = uVP * vec4(vP, 1);
}`, `
${COMMON}${SURFACE}
uniform mediump sampler2DArray uPhotos; uniform vec3 uMin, uMax, uEye; uniform vec4 uClear; uniform float uMirror;
in vec3 vUVs, vP; flat in vec4 vCrop, vMeta; flat in vec3 vTint, vV;
out vec4 o;
void main() {
  vec3 X = uMirror > .5 ? vec3(vP.x, vP.y / -1.7, vP.z) : vP; // where the light lands
  vec2 uv = vUVs.xy / vUVs.z, q = abs(uv - .5);
  int plane = int(vMeta.y);
  float edge = max(q.x, q.y), a = smoothstep(.5, .5 - vMeta.z - uMirror * .3 - fwidth(edge), edge);
  vec3 film = texture(uPhotos, vec3(mix(vCrop.xy, vCrop.zw, clamp(uv, 0., 1.)), vMeta.x), uMirror * 3.5 - .4).rgb * .94 + .025;
  vec3 col = vTint * film * albedo(X, plane, true);
  // as bright as the virtual source makes it here, by distance and slant; matte paint gives back
  // little of a beam that grazes it, so long smears fade to a wash
  vec3 L = X - vV, inside = step(uMin - .001, X) * step(X, uMax + .001);
  float r2 = dot(L, L), slant = abs(L[plane]) * inversesqrt(r2), E = slant * smoothstep(.04, .45, slant) * vMeta.w / r2;
  // a hot middle, as from the lamp's lens; and corners, where two planes meet, take a little less
  E *= mix(1.25, .7, smoothstep(0., 1.3, dot(q, q) * 4.));
  vec3 gap = min(X - uMin, uMax - X); gap[plane] = 9.;
  E *= mix(.7, 1., smoothstep(0., .4, min(gap.x, min(gap.y, gap.z))));
  // a caught picture keeps the wall round it clear
  vec2 frame = max(abs(vec2(X.x, X.y - uClear.z)) - uClear.xy, 0.);
  if (plane == 2 && X.z < 0.) E *= 1. - uClear.w * smoothstep(.5, 0., length(frame));
  // in the varnish: a faint smear, stronger seen at a slant, fading with height above the floor
  if (uMirror > .5) E *= (.04 + .96 * pow(1. - abs(normalize(vP - uEye).y), 5.)) * .5 * exp(-X.y * .9);
  if (a <= 0. || inside.x * inside.y * inside.z < .5) discard;
  o = vec4(col * E * a * OUT, 0);
}`];

// Every lit mirror's beam in the haze, widening as it goes and carrying its photo's colour.
export const haze = [`
${TILE_ATTRIBS}
${COMMON}${OPTICS}
uniform mediump sampler2DArray uPhotos; uniform mat4 uVP; uniform vec3 uEye; uniform float uRot, uHaze; uniform ivec2 uHome;
out float vAcross, vAlong, vW, vNear; flat out vec3 vTint;
void main() {
  vec3 n = rotY(aN.xyz, uRot), C, V, d;
  int axis; float t, lit = throwOf(n, C, V, d, axis, t);
  if (lit <= 0. || gl_InstanceID == uHome.x || gl_InstanceID == uHome.y) { gl_Position = vec4(2, 2, 2, 1); return; }
  float len = min(t, 3.), k = aCorner.y * .5 + .5, dv = length(C - V);
  vec3 P = C + d * len * k;
  vW = uHalf * (1. + len * k / dv);
  P += normalize(cross(d, P - uEye)) * vW * aCorner.x * 1.3;
  vAcross = aCorner.x * 1.3; vAlong = len * k; vNear = distance(P, uEye);
  vTint = LAMP * (textureLod(uPhotos, vec3(.5, .5, aN.w), 8.).rgb + .08) * uHaze * beamAt(n);
  gl_Position = uVP * vec4(P, 1);
}`, `
${COMMON}${OPTICS}
in float vAcross, vAlong, vW, vNear; flat in vec3 vTint;
out vec4 o;
void main() {
  float a = max(1. - vAcross * vAcross, 0.) * uHalf / vW * exp(-vAlong * .8) * smoothstep(.02, .3, vAlong) * smoothstep(.4, 1.6, vNear);
  o = vec4(vTint * a * OUT, 0);
}`];

// The pin spot's own beam in the haze, from its lens to the ball.
export const cone = [`
${COMMON}${OPTICS}
uniform mat4 uVP; uniform vec3 uEye;
out vec2 vQ; out float vW;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vec3 P = mix(uLampPos, uBall, c.y);
  vW = mix(.05, uRadius, c.y);
  P += normalize(cross(uBall - uLampPos, P - uEye)) * vW * (c.x * 2. - 1.) * 1.4;
  vQ = vec2((c.x * 2. - 1.) * 1.4, c.y);
  gl_Position = uVP * vec4(P, 1);
}`, `
${COMMON}
uniform float uLamp, uTime;
in vec2 vQ; in float vW;
out vec4 o;
void main() {
  float x = abs(vQ.x) / 1.4, drift = noise(vec2(vQ.y * 6. - uTime * .15, vQ.x * 1.5 + uTime * .05));
  float a = pow(max(1. - x * x, 0.), 3.) * (.05 / vW) * (.65 + .5 * drift) * smoothstep(0., .1, vQ.y);
  o = vec4(LAMP * a * uLamp * .2 * OUT, 0);
}`];

// The haze glowing round the ball where the beam meets it; the ball hides its middle.
export const halo = [`
${COMMON}${OPTICS}
uniform mat4 uVP; uniform vec3 uCamR, uCamU;
out vec2 vC;
void main() {
  vC = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1.;
  gl_Position = uVP * vec4(uBall + (uCamR * vC.x + uCamU * vC.y) * uRadius * 4., 1);
}`, `
${COMMON}
uniform float uLamp;
in vec2 vC;
out vec4 o;
void main() { float r2 = dot(vC, vC); o = vec4(LAMP * uLamp * (exp(-r2 * 5.) * .035 + exp(-r2 * 22.) * .08) * OUT, 0); }`];

// Sparkle: a small four-pointed star wherever a mirror lines up the lamp (or a bright square)
// between it and the eye. A few at a time travel across the ball as it turns.
export const glints = [`
${TILE_ATTRIBS}
${COMMON}${OPTICS}${GLASS}
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uRes; uniform float uRot, uLamp, uGlow, uSize;
out vec2 vC; flat out float vG;
void main() {
  vec3 n = rotY(aN.xyz, uRot), C = uBall + n * uRadius, v = normalize(C - uEye), l = normalize(uLampPos - C), r = reflect(v, n);
  float c = dot(r, l), facing = step(dot(n, v), 0.), luck = hash(vec2(float(gl_InstanceID), 3.7));
  vG = (uLamp * (exp((c - 1.) * 700.) + exp((c - 1.) * 110.) * .35 + exp((c - 1.) * 25.) * .1 * luck) * step(0., dot(n, l)) + uGlow * max(fleck(r) - .62, 0.) * .8) * facing;
  if (vG < .02) { gl_Position = vec4(2, 2, 2, 1); return; }
  vec4 p = uVP * vec4(C, 1);
  vC = aCorner;
  gl_Position = p + vec4(aCorner * uSize * (.3 + .7 * min(vG, 1.)) / uRes * 2. * p.w, 0, 0);
}`, `
${COMMON}
in vec2 vC; flat in float vG;
out vec4 o;
void main() {
  vec2 p = vC;
  float r2 = dot(p, p);
  float star = exp(-abs(p.y) * 90.) * exp(-p.x * p.x * 6.) + exp(-abs(p.x) * 90.) * exp(-p.y * p.y * 6.);
  float glow = exp(-r2 * 160.) * 14. + exp(-r2 * 18.) * .25 + star * 1.1;
  o = vec4(mix(LAMP, vec3(1), .5) * vG * glow * OUT, 0);
}`];

// A caught photo: the square of light flying to the back wall and growing into the whole picture,
// as light on the paint, hottest in the middle with a little spill round its frame; drawn again
// mirrored for its smear in the floor.
export const proj = [`
${COMMON}
uniform mat4 uVP; uniform vec3 uQ[4]; uniform vec4 uS; uniform float uGrow, uMirror;
out vec3 vUVs, vP;
void main() {
  int i = gl_VertexID, k = i == 2 ? 3 : i == 3 ? 2 : i;
  vec2 c = vec2(i & 1, i >> 1) * 2. - 1.;
  vec3 mid = (uQ[0] + uQ[1] + uQ[2] + uQ[3]) * .25;
  vP = mid + (uQ[k] - mid) * uGrow;
  vUVs = vec3((-.5 * c * uGrow + .5) * uS[k], uS[k]);
  if (uMirror > .5) vP.y *= -1.7;
  gl_Position = uVP * vec4(vP, 1);
}`, `
${COMMON}${SURFACE}
uniform mediump sampler2DArray uPhotos; uniform mediump sampler2D uFull; uniform vec4 uCrop; uniform vec3 uTint, uEye;
uniform float uLayer, uFullMix, uSoft, uAlpha, uSpill, uMirror; uniform int uAxis;
in vec3 vUVs, vP;
out vec4 o;
void main() {
  vec3 X = uMirror > .5 ? vec3(vP.x, vP.y / -1.7, vP.z) : vP;
  vec2 uv = vUVs.xy / vUVs.z, q = abs(uv - .5), tc = mix(uCrop.xy, uCrop.zw, clamp(uv, 0., 1.));
  float edge = max(q.x, q.y), a = smoothstep(.5, .5 - uSoft - uMirror * .2 - fwidth(edge), edge), blur = uMirror * 4.;
  vec3 photo = mix(texture(uPhotos, vec3(tc, uLayer), .3 + blur).rgb, texture(uFull, tc, blur).rgb, uFullMix);
  // past the edge the light falls off smoothly into the dark, in the colour of the edge it leaves
  vec3 rim = texture(uPhotos, vec3(tc, uLayer), 5.).rgb;
  vec2 qi = min(q, .5);
  float hot = mix(1.18, .74, smoothstep(0., 2., dot(qi, qi) * 4.)), fall = exp(-length(max(q - .5, 0.)) * 48.) * uSpill;
  vec3 col = uTint * albedo(X, uAxis, true) * hot * (photo * a + rim * (1. - a) * fall * .5);
  if (uMirror > .5) col *= (.04 + .96 * pow(1. - abs(normalize(vP - uEye).y), 5.)) * .5 * exp(-X.y * .9);
  o = vec4(col * uAlpha * OUT, 0);
}`];

// The light from a caught mirror to its picture, in the haze: a pyramid from the glass to the
// four corners, glowing by how much of it each line of sight crosses and carrying the photo's
// colours, brightest near the ball where it is narrow.
export const beam = [`
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }`, `
${COMMON}${OPTICS}
uniform mediump sampler2DArray uPhotos; uniform vec3 uEye, uCamF, uCamR, uCamU, uApex, uQ[4], uTint; uniform vec2 uRes; uniform vec4 uRect; uniform float uTan, uLayer;
out vec4 o;
void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2. - 1.;
  vec3 rd = normalize(uCamF + (uCamR * ndc.x * uRes.x / uRes.y + uCamU * ndc.y) * uTan), mid = (uQ[0] + uQ[1] + uQ[2] + uQ[3]) * .25;
  float t0 = 0., t1 = 99.;
  for (int k = 0; k < 4; k++) {
    vec3 n = cross(uQ[k] - uApex, uQ[(k + 1) & 3] - uApex);
    n *= sign(dot(n, mid - uApex));
    float den = dot(n, rd), t = -dot(n, uEye - uApex) / den;
    if (den > 0.) t0 = max(t0, t); else t1 = min(t1, t);
  }
  if (rd.z < 0.) t1 = min(t1, (uMin.z - uEye.z) / rd.z);
  vec3 oc = uEye - uBall;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + uRadius * uRadius;
  if (h > 0. && -b - sqrt(h) > 0.) t1 = min(t1, -b - sqrt(h)); // the ball hides what lies behind it
  if (t1 <= t0) discard;
  vec3 M = uEye + rd * (t0 + t1) * .5, at = uApex + (M - uApex) * ((uMin.z - uApex.z) / (M.z - uApex.z));
  vec3 photo = textureLod(uPhotos, vec3(clamp(vec2(.5 + (at.x - uRect.x) / uRect.z, .5 - (at.y - uRect.y) / uRect.w), 0., 1.), uLayer), 4.).rgb + .04;
  float l = distance(M, uApex);
  o = vec4(uTint * photo * (t1 - t0) / (.3 + l * l) * OUT, 0);
}`];

// Dust turning slowly in the pin spot's beam.
export const motes = [`
${COMMON}${OPTICS}
uniform mat4 uVP; uniform float uTime, uPx;
out float vB;
void main() {
  float i = float(gl_VertexID), along = hash(vec2(i, 1.)) * .92;
  vec3 a = normalize(cross(uAim, vec3(0, 1, 0))), b = cross(a, uAim);
  float r = sqrt(hash(vec2(i, 2.))) * 1.5, ang = hash(vec2(i, 3.)) * 6.283 + uTime * (.05 + .05 * hash(vec2(i, 4.)));
  float w = mix(.05, uRadius, along);
  vec3 p = mix(uLampPos, uBall, along) + (a * cos(ang) + b * sin(ang)) * w * r + vec3(0, sin(uTime * .3 + i) * .03, 0);
  vB = smoothstep(1.05, .85, r) * (.4 + .6 * hash(vec2(i, 5.))) * (.05 / w + .2);
  gl_Position = uVP * vec4(p, 1);
  gl_PointSize = uPx * (1. + hash(vec2(i, 6.)));
}`, `
${COMMON}
uniform float uLamp;
in float vB;
out vec4 o;
void main() { vec2 p = gl_PointCoord * 2. - 1.; o = vec4(LAMP * vB * uLamp * .5 * max(1. - dot(p, p), 0.) * OUT, 0); }`];

const FULL = `void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1); }`;

// Bloom: what is brighter than white, at a quarter of the size, then blurred both ways.
export const bright = [FULL, `
uniform highp sampler2D uHdr;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 4, top = textureSize(uHdr, 0) - 1;
  vec3 c = vec3(0);
  for (int j = 0; j < 4; j++) c += texelFetch(uHdr, min(p + ivec2(1 + 2 * (j & 1), 1 + (j & 2)), top), 0).rgb;
  o = vec4(max(c * .25 / OUT - 1.1, 0.) * OUT, 1);
}`];
export const blur = [FULL, `
uniform highp sampler2D uSrc; uniform vec2 uStep;
out vec4 o;
void main() {
  vec2 px = 1. / vec2(textureSize(uSrc, 0)), uv = gl_FragCoord.xy * px, d = uStep * px;
  vec3 c = texture(uSrc, uv).rgb * .227 + (texture(uSrc, uv + d * 1.385).rgb + texture(uSrc, uv - d * 1.385).rgb) * .316 + (texture(uSrc, uv + d * 3.231).rgb + texture(uSrc, uv - d * 3.231).rgb) * .07;
  o = vec4(c, 1);
}`];

// From light to screen: bloom, a lens's falloff toward the corners, a soft shoulder (1 − e^−x), dither.
export const tone = [FULL, `
${COMMON}
uniform highp sampler2D uHdr, uBloom; uniform float uExposure, uBloomK;
out vec4 o;
void main() {
  vec2 size = vec2(textureSize(uHdr, 0)), q = (gl_FragCoord.xy / size * 2. - 1.) * vec2(size.x / size.y, 1) * .6;
  vec3 c = (texelFetch(uHdr, ivec2(gl_FragCoord.xy), 0).rgb + texture(uBloom, gl_FragCoord.xy / size).rgb * uBloomK) / OUT;
  c *= uExposure * (1. - .35 * dot(q, q) / (1. + dot(q, q)));
  c = 1. - exp(-c);
  o = vec4(pow(c, vec3(1. / 2.2)) + (hash(gl_FragCoord.xy) + hash(gl_FragCoord.yx + 17.) - 1.) / 255., 1);
}`];
