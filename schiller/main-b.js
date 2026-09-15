function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    throw new Error('shader compile failed');
  }
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(prog));
  throw new Error('link failed');
}
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, 'a_pos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const u = {
  res: gl.getUniformLocation(prog, 'u_res'),
  time: gl.getUniformLocation(prog, 'u_time'),
  thickness: gl.getUniformLocation(prog, 'u_thickness'),
  ior: gl.getUniformLocation(prog, 'u_ior'),
  mouse: gl.getUniformLocation(prog, 'u_mouse'),
  auto: gl.getUniformLocation(prog, 'u_auto'),
};

const thicknessEl = document.getElementById('thickness');
const iorEl = document.getElementById('ior');
const animateEl = document.getElementById('animate');
const thicknessOut = document.getElementById('thicknessOut');
const iorOut = document.getElementById('iorOut');
const animateOut = document.getElementById('animateOut');

function syncLabels() {
  thicknessOut.textContent = Math.round(+thicknessEl.value) + ' nm';
  iorOut.textContent = (+iorEl.value).toFixed(2);
  animateOut.textContent = +animateEl.value ? 'on' : 'off';
}
thicknessEl.addEventListener('input', syncLabels);
iorEl.addEventListener('input', syncLabels);
animateEl.addEventListener('input', syncLabels);
syncLabels();

let mouse = [0.35, 0.18];
let dragging = false;
let lastX = 0, lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  mouse[0] += dx * 0.005;
  mouse[1] = Math.max(-0.9, Math.min(0.9, mouse[1] + dy * 0.004));
});

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

const t0 = performance.now();
function frame(now) {
  resize();
  const t = (now - t0) / 1000;
  gl.uniform2f(u.res, canvas.width, canvas.height);
  gl.uniform1f(u.time, t);
  gl.uniform1f(u.thickness, +thicknessEl.value);
  gl.uniform1f(u.ior, +iorEl.value);
  gl.uniform2f(u.mouse, mouse[0], mouse[1]);
  gl.uniform1f(u.auto, +animateEl.value);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
