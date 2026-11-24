// Technique reference: Codrops Seam Transitions, Demo 07 (Bruma), MIT.
// https://github.com/codrops/SeamTransitions/blob/main/js/seams/mist.js
// This shader combines the storefront's two flat colors in a localized strip.
const vertex = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  uv = (p + 1.0) * 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 pixel;
uniform vec2 size;
uniform float below;
uniform float progress;
uniform float opacity;
uniform float turbulence;
uniform float drift;
uniform bool fineDetail;
uniform vec3 blue;
uniform vec3 coral;
uniform vec3 porcelain;

float randomCell(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 f = fract(point);
  vec2 t = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(randomCell(cell), randomCell(cell + vec2(1, 0)), t.x),
    mix(randomCell(cell + vec2(0, 1)), randomCell(cell + vec2(1, 1)), t.x), t.y
  );
}

float vapor(vec2 p) {
  float value = noise(p) * 0.65 + noise(p * 2.13 + 6.8) * 0.25;
  if (fineDetail) value += noise(p * 4.27 - 2.3) * 0.10;
  return value;
}

void main() {
  float life = smoothstep(0.0, 0.19, progress) * (1.0 - smoothstep(0.56, 0.94, progress));
  float above = size.y - below;
  vec2 px = uv * size - vec2(0.0, below);
  float height = px.y / above;

  // Two currents rise at different speeds. Taller pockets leave air between plumes.
  float span = min(190.0, size.x * 0.28);
  vec2 flow = vec2(px.x / span - progress * drift, height * 2.45 - progress * 3.1);
  float curl = noise(flow * 0.78 + vec2(3.4, 7.2)) - 0.5;
  float billow = vapor(flow + vec2(curl, -curl * 0.65) * turbulence);
  vec2 upperFlow = vec2(px.x / (span * 1.33) + progress * drift * 0.45,
    height * 2.1 - progress * 1.8);
  float wisp = vapor(upperFlow + vec2(8.6 - curl, 4.2 + curl) * 1.15);

  float wander = noise(vec2(px.x / (span * 0.8) - progress * drift, 3.2));
  float edge = (wander - 0.5) * below * 1.25 * life;
  float feather = max(0.2, below * 0.56 * life);
  float coralMix = 1.0 - smoothstep(edge - feather, edge + feather, px.y);
  bool onHero = px.y >= 0.0;
  float edgeAlpha = onHero ? coralMix : 1.0 - coralMix;
  vec3 edgeColor = onHero ? coral : blue;

  float h = max(height, 0.0);
  float rise = smoothstep(0.0, 0.44, progress);
  float reach = mix(0.32, mix(0.57, 0.99, wander), rise);
  float foreground = smoothstep(0.29, 0.66, billow + (1.0 - h) * 0.12)
    * (1.0 - smoothstep(0.11, reach, h)) * 0.82;
  float back = smoothstep(0.26, 0.69, wisp)
    * (1.0 - smoothstep(0.17, mix(0.49, 1.0, rise), h)) * 0.56;
  float bank = (1.0 - smoothstep(0.0, 0.13 + billow * 0.25, abs(height)))
    * mix(0.14, 0.35, wander);
  float volume = 1.0 - (1.0 - foreground) * (1.0 - back) * (1.0 - bank);
  float fog = volume * smoothstep(-below, 0.0, px.y) * life * opacity;

  // Premultiplied alpha matches the browser's compositing contract.
  pixel = vec4(porcelain * fog + edgeColor * edgeAlpha * (1.0 - fog),
    fog + edgeAlpha * (1.0 - fog));
}`;

type Colors = { blue: number[]; coral: number[]; porcelain: number[] };

export function createSmokeRenderer(gl: WebGL2RenderingContext, colors: Colors) {
  const program = gl.createProgram();
  if (!program) return null;

  function attach(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return false;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (compiled) gl.attachShader(program!, shader);
    gl.deleteShader(shader);
    return compiled;
  }

  if (!attach(gl.VERTEX_SHADER, vertex) || !attach(gl.FRAGMENT_SHADER, fragment)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform3fv(uniform('blue'), colors.blue);
  gl.uniform3fv(uniform('coral'), colors.coral);
  gl.uniform3fv(uniform('porcelain'), colors.porcelain);
  const size = uniform('size');
  const below = uniform('below');
  const progress = uniform('progress');
  const opacity = uniform('opacity');
  const turbulence = uniform('turbulence');
  const drift = uniform('drift');
  const fineDetail = uniform('fineDetail');

  return {
    configure(width: number, height: number, lower: number, alpha: number, detail: boolean,
      curl: number, spread: number) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(size, width, height);
      gl.uniform1f(below, lower);
      gl.uniform1f(opacity, alpha);
      gl.uniform1f(turbulence, curl);
      gl.uniform1f(drift, spread);
      gl.uniform1i(fineDetail, Number(detail));
    },
    draw(value: number) {
      gl.uniform1f(progress, value);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.useProgram(null);
      gl.deleteProgram(program);
    },
  };
}
