
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
if (!gl) {
  document.body.innerHTML = '<p style="padding:2rem;color:#fff">WebGL required.</p>';
  throw new Error('no webgl');
}

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_thickness; // nm base
uniform float u_ior;
uniform vec2 u_mouse;      // orbit yaw/pitch
uniform float u_auto;

// --- hash / noise ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Approximate CIE XYZ spectral matching → linear sRGB (coarse but pretty)
vec3 wavelengthToRGB(float nm) {
  // piecewise approx of CIE curves (normalized for display)
  float r = 0.0, g = 0.0, b = 0.0;
  if (nm >= 380.0 && nm < 440.0) {
    r = -(nm - 440.0) / (440.0 - 380.0);
    b = 1.0;
  } else if (nm >= 440.0 && nm < 490.0) {
    g = (nm - 440.0) / (490.0 - 440.0);
    b = 1.0;
  } else if (nm >= 490.0 && nm < 510.0) {
    g = 1.0;
    b = -(nm - 510.0) / (510.0 - 490.0);
  } else if (nm >= 510.0 && nm < 580.0) {
    r = (nm - 510.0) / (580.0 - 510.0);
    g = 1.0;
  } else if (nm >= 580.0 && nm < 645.0) {
    r = 1.0;
    g = -(nm - 645.0) / (645.0 - 580.0);
  } else if (nm >= 645.0 && nm <= 780.0) {
    r = 1.0;
  }
  // intensity falloff at spectrum ends
  float factor = 1.0;
  if (nm >= 380.0 && nm < 420.0) factor = 0.3 + 0.7 * (nm - 380.0) / 40.0;
  else if (nm >= 700.0 && nm <= 780.0) factor = 0.3 + 0.7 * (780.0 - nm) / 80.0;
  return vec3(r, g, b) * factor;
}

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}
mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

// Soft sphere SDF + heightfield bump for labradorite / oil film
float sphere(vec3 p, float r) { return length(p) - r; }

vec3 filmNormal(vec3 p, vec3 n0) {
  // procedural thickness variation along the surface
  vec2 uv = p.xz * 2.4 + p.y * 0.8;
  float h = fbm(uv * 1.6 + u_time * 0.03);
  float hx = fbm(uv * 1.6 + vec2(0.02, 0.0) + u_time * 0.03);
  float hy = fbm(uv * 1.6 + vec2(0.0, 0.02) + u_time * 0.03);
  vec3 t1 = normalize(cross(n0, vec3(0.0, 1.0, 0.02)));
  vec3 t2 = normalize(cross(n0, t1));
  vec3 n = normalize(n0 + t1 * (hx - h) * 2.8 + t2 * (hy - h) * 2.8);
  return n;
}

float localThickness(vec3 p) {
  vec2 uv = p.xz * 2.2 + p.y * 0.9;
  float w = fbm(uv + u_time * 0.04);
  float bands = 0.5 + 0.5 * sin(uv.x * 6.0 + w * 8.0 + u_time * 0.15);
  // thickness in nm: base + spatial modulation
  float breathe = 1.0 + 0.12 * u_auto * sin(u_time * 0.35);
  return u_thickness * breathe * (0.55 + 0.9 * w + 0.35 * bands);
}

// Thin-film reflectance spectrum → RGB
vec3 thinFilm(vec3 V, vec3 N, float dNm, float ior) {
  float cosI = clamp(dot(V, N), 0.0, 1.0);
  // Snell: cos of transmitted angle
  float eta = 1.0 / ior;
  float sinT2 = eta * eta * (1.0 - cosI * cosI);
  float cosT = sqrt(max(0.0, 1.0 - sinT2));

  // Fresnel-ish amplitude (Schlick + film boost)
  float F0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosI, 5.0);
  // air→film phase shift of π on one reflection → constructive when 2 n d cosT = m λ
  // Intensity ~ cos²(δ/2) with δ = 4π n d cosT / λ + π
  vec3 rgb = vec3(0.0);
  const int SAMPLES = 24;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float nm = mix(400.0, 700.0, t);
    float opd = 2.0 * ior * dNm * cosT; // nm
    float phase = 6.28318530718 * opd / nm + 3.14159265; // +π phase flip
    float interf = 0.5 + 0.5 * cos(phase);
    // soft spectral weight
    float w = 1.0 - abs(t - 0.5) * 0.35;
    rgb += wavelengthToRGB(nm) * interf * w;
  }
  rgb /= float(SAMPLES);
  // Mix interference with Fresnel rim; keep some soft substrate
  vec3 substrate = vec3(0.02, 0.025, 0.04);
  float gloss = mix(0.35, 1.35, F);
  return substrate + rgb * gloss * (0.55 + 0.9 * F);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_time;

  // Camera orbit
  float yaw = u_mouse.x + u_auto * t * 0.12;
  float pitch = u_mouse.y + u_auto * 0.08 * sin(t * 0.2);
  mat3 camR = rotY(yaw) * rotX(pitch);

  vec3 ro = camR * vec3(0.0, 0.15, 2.55);
  vec3 rd = normalize(camR * vec3(uv, -1.35));

  // Raymarch soft stone / droplet
  float hit = -1.0;
  vec3 p = ro;
  for (int i = 0; i < 64; i++) {
    float d = sphere(p, 0.92);
    // slight blob warping
    d += 0.04 * sin(p.x * 3.0 + t * 0.2) * sin(p.z * 2.5);
    if (d < 0.001) { hit = 1.0; break; }
    if (d > 4.0) break;
    p += rd * d;
  }

  // Background: deep velvet + faint vignette caustic hints
  float vign = smoothstep(1.4, 0.2, length(uv));
  vec3 bg = mix(vec3(0.01, 0.012, 0.02), vec3(0.04, 0.03, 0.06), vign);
  bg += 0.015 * vec3(0.4, 0.7, 1.0) * pow(fbm(uv * 3.0 + t * 0.02), 3.0);

  if (hit < 0.0) {
    gl_FragColor = vec4(pow(bg, vec3(0.95)), 1.0);
    return;
  }

  vec3 N0 = normalize(p + vec3(0.0, 0.02 * sin(p.x * 4.0), 0.0));
  vec3 N = filmNormal(p, N0);
  vec3 V = normalize(-rd);

  float dNm = localThickness(p);
  vec3 col = thinFilm(V, N, dNm, u_ior);

  // Soft key light rim
  vec3 L = normalize(camR * vec3(0.4, 0.7, 0.5));
  float rim = pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 3.0);
  col += rim * vec3(0.35, 0.55, 0.85) * 0.25;
  float diff = max(dot(N, L), 0.0);
  col += diff * vec3(0.08, 0.07, 0.1);

  // Contact shadow toward bg
  float ao = clamp(0.55 + 0.45 * N.y, 0.0, 1.0);
  col *= ao;

  // Mild bloom-ish highlight from interference peaks
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col += col * smoothstep(0.45, 0.9, luma) * 0.35;

  // Soft composite toward background
  col = mix(bg, col, 0.92);

  // Tonemap / gamma
  col = col / (1.0 + col * 0.35);
  col = pow(max(col, 0.0), vec3(0.9));

  gl_FragColor = vec4(col, 1.0);
}
`;
