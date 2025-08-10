/* global api */

const paletteCanvas = document.getElementById('palette');
const hueCanvas = document.getElementById('hue');
const pickBtn = document.getElementById('pick');
const hexEl = document.getElementById('hex');
const copyBtn = document.getElementById('copy');
const swatchesEl = document.getElementById('swatches');
const currentSwatch = document.getElementById('current');

let currentHue = 0; // 0..360
let currentHex = '#ffffff';
let selectedS = 0; // 0..1
let selectedV = 1; // 0..1
let recent = [];

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return [h, s, v];
}

function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function drawHueBar() {
  const ctx = hueCanvas.getContext('2d');
  const w = hueCanvas.width;
  const h = hueCanvas.height;
  const grd = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 360; i += 10) {
    const [r, g, b] = hsvToRgb(i, 1, 1);
    grd.addColorStop(i / 360, `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // marker for current hue
  const x = Math.round((currentHue / 360) * (w - 1));
  ctx.strokeStyle = 'white';
  ctx.lineWidth = Math.max(1, Math.round(h * 0.15));
  ctx.beginPath();
  ctx.moveTo(x + 0.5, 0);
  ctx.lineTo(x + 0.5, h);
  ctx.stroke();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = Math.max(1, Math.round(h * 0.05));
  ctx.beginPath();
  ctx.moveTo(x + 0.5, 0);
  ctx.lineTo(x + 0.5, h);
  ctx.stroke();
}

function drawPalette() {
  const ctx = paletteCanvas.getContext('2d');
  const w = paletteCanvas.width;
  const h = paletteCanvas.height;

  // base hue gradient horizontally saturation 0..1 vertically value 1..0
  const img = ctx.createImageData(w, h);
  let i = 0;
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1);
    for (let x = 0; x < w; x++) {
      const s = x / (w - 1);
      const [r, g, b] = hsvToRgb(currentHue, s, v);
      img.data[i++] = r;
      img.data[i++] = g;
      img.data[i++] = b;
      img.data[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // marker
  const mx = Math.round(selectedS * (w - 1));
  const my = Math.round((1 - selectedV) * (h - 1));
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx + 0.5, my + 0.5, Math.max(4, Math.min(w, h) * 0.012), 0, Math.PI * 2);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function setHex(hex) {
  currentHex = hex;
  hexEl.value = hex.toLowerCase();
  if (currentSwatch) currentSwatch.style.background = hex;
}

function setColorFromHex(hex) {
  const [r, g, b] = hexToRgb(hex);
  let [h, s, v] = rgbToHsv(r, g, b);
  if (s === 0 && v > 0) {
    // preserve previous hue for greys
    h = currentHue;
  }
  currentHue = Math.round(h % 360);
  selectedS = s;
  selectedV = v;
  setHex(hex);
  drawHueBar();
  drawPalette();
}

function updateRecent(hex) {
  recent = [hex, ...recent.filter((c) => c !== hex)].slice(0, 12);
  swatchesEl.innerHTML = '';
  for (const c of recent) {
    const d = document.createElement('div');
    d.className = 'swatch';
    d.style.background = c;
    d.title = c + ' (click to copy)';
    d.onclick = () => {
      setColorFromHex(c);
      api.copyText(c);
    };
    swatchesEl.appendChild(d);
  }
}

function handlePalettePick(e) {
  const rect = paletteCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(paletteCanvas.width - 1, Math.floor((e.clientX - rect.left) * (paletteCanvas.width / rect.width))));
  const y = Math.max(0, Math.min(paletteCanvas.height - 1, Math.floor((e.clientY - rect.top) * (paletteCanvas.height / rect.height))));
  const ctx = paletteCanvas.getContext('2d');
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  const hex = api.toHex(pixel[0], pixel[1], pixel[2]);
  setHex(hex);
  selectedS = x / (paletteCanvas.width - 1);
  selectedV = 1 - (y / (paletteCanvas.height - 1));
  drawPalette();
}

function resizeCanvases() {
  const ratio = Math.min(1.4, Math.max(1.2, paletteCanvas.clientWidth / 360));
  paletteCanvas.width = Math.floor(paletteCanvas.clientWidth);
  paletteCanvas.height = Math.floor(paletteCanvas.clientWidth / 1.4);
  hueCanvas.width = paletteCanvas.width;
  hueCanvas.height = 16 * window.devicePixelRatio;
  drawPalette();
  drawHueBar();
}

window.addEventListener('resize', resizeCanvases);

// events
pickBtn.addEventListener('click', async () => {
  await api.startEyedropper();
});

copyBtn.addEventListener('click', async () => { await api.copyText(currentHex); });

function normalizeHexInput(value) {
  let v = value.trim().replace(/^#/,'').toLowerCase();
  if (v.length === 3) {
    v = v.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(v)) return null;
  return `#${v}`;
}

hexEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const norm = normalizeHexInput(hexEl.value);
    if (norm) {
      setColorFromHex(norm);
      updateRecent(norm);
      hexEl.blur();
    }
    e.preventDefault();
  }
});

hexEl.addEventListener('blur', () => {
  const norm = normalizeHexInput(hexEl.value);
  if (norm) {
    setColorFromHex(norm);
    updateRecent(norm);
  } else {
    hexEl.value = currentHex;
  }
});

api.onEyedropperColor((hex) => {
  setColorFromHex(hex);
  updateRecent(hex);
});

let isHuePicking = false;
hueCanvas.addEventListener('pointerdown', (e) => {
  isHuePicking = true;
  const rect = hueCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(hueCanvas.width - 1, Math.floor((e.clientX - rect.left) * (hueCanvas.width / rect.width))));
  currentHue = Math.round((x / (hueCanvas.width - 1)) * 360);
  drawHueBar();
  drawPalette();
  const [r, g, b] = hsvToRgb(currentHue, selectedS, selectedV);
  setHex(api.toHex(r, g, b));
});
window.addEventListener('pointermove', (e) => {
  if (!isHuePicking) return;
  const rect = hueCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(hueCanvas.width - 1, Math.floor((e.clientX - rect.left) * (hueCanvas.width / rect.width))));
  currentHue = Math.round((x / (hueCanvas.width - 1)) * 360);
  drawHueBar();
  drawPalette();
  const [r, g, b] = hsvToRgb(currentHue, selectedS, selectedV);
  setHex(api.toHex(r, g, b));
});
window.addEventListener('pointerup', () => { isHuePicking = false; });

let isPicking = false;
let rafId = null;
let pendingHex = null;
paletteCanvas.addEventListener('pointerdown', (e) => {
  isPicking = true; handlePalettePick(e);
});
window.addEventListener('pointermove', (e) => {
  if (!isPicking) return;
  // throttle UI updates to animation frames to avoid flicker
  if (rafId) return;
  const ev = e;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    handlePalettePick(ev);
  });
});
window.addEventListener('pointerup', () => { isPicking = false; });

// init
requestAnimationFrame(() => {
  resizeCanvases();
  setColorFromHex('#ffffff');
});

