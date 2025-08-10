/* global api */

const video = document.getElementById('video');
const screenCanvas = document.getElementById('screen');
const zoomCanvas = document.getElementById('zoom');
const hexEl = document.getElementById('hex');
const swatch = document.getElementById('swatch');
const mag = document.getElementById('mag');
const reticle = document.getElementById('reticle');

const zoomFactor = 8; // magnification
let stream = null;
let raf = null;
let activeDisplay = null; // {displayId, scaleFactor, bounds, sourceId}

function setHex(hex) {
  hexEl.textContent = hex;
  swatch.style.background = hex;
}

function captureToCanvas() {
  const ctx = screenCanvas.getContext('2d');
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  screenCanvas.width = w;
  screenCanvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);
}

async function startStream() {
  // Try native EyeDropper first if available
  if (window.EyeDropper) {
    try {
      const ed = new window.EyeDropper();
      const result = await ed.open();
      api.overlayDone(result.sRGBHex);
      return;
    } catch (e) {
      // fall through to manual capture if cancelled or not allowed
    }
  }

  const pt = await api.getCursorPoint();
  activeDisplay = await api.getDisplayInfoForPoint(pt);
  if (!activeDisplay || !activeDisplay.sourceId) {
    api.overlayCancel();
    return;
  }

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: activeDisplay.sourceId,
        // hide cursor from capture in Chromium
        // older Electron builds may require using top-level property instead
      },
      cursor: 'never'
    }
  };

  stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  const loop = () => {
    captureToCanvas();
    raf = requestAnimationFrame(loop);
  };
  loop();
}

function stopStream() {
  if (raf) cancelAnimationFrame(raf);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

function getHexAtPoint(globalX, globalY) {
  const ctx = screenCanvas.getContext('2d');
  const { width: w, height: h } = screenCanvas;
  if (!w || !h) return '#000000';

  // Map global coordinates -> display local -> video pixels, accounting for scaleFactor
  const { bounds, scaleFactor } = activeDisplay;
  const localX = (globalX - bounds.x) * scaleFactor;
  const localY = (globalY - bounds.y) * scaleFactor;
  const x = Math.max(0, Math.min(w - 1, Math.round(localX)));
  const y = Math.max(0, Math.min(h - 1, Math.round(localY)));
  const data = ctx.getImageData(x, y, 1, 1).data;
  return api.toHex(data[0], data[1], data[2]);
}

function drawMagnifier(globalX, globalY) {
  const size = 20; // sample square
  const ctx = zoomCanvas.getContext('2d');
  const { width: w, height: h } = screenCanvas;
  if (!w || !h) return;

  const { bounds, scaleFactor } = activeDisplay;
  const localX = (globalX - bounds.x) * scaleFactor;
  const localY = (globalY - bounds.y) * scaleFactor;
  const x = Math.max(0, Math.min(w - 1, Math.round(localX)));
  const y = Math.max(0, Math.min(h - 1, Math.round(localY)));

  const sx = Math.max(0, Math.min(w - size, x - Math.floor(size / 2)));
  const sy = Math.max(0, Math.min(h - size, y - Math.floor(size / 2)));

  zoomCanvas.width = size * zoomFactor;
  zoomCanvas.height = size * zoomFactor;
  const zctx = zoomCanvas.getContext('2d');
  zctx.imageSmoothingEnabled = false;
  zctx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
  zctx.drawImage(
    screenCanvas,
    sx, sy, size, size,
    0, 0, zoomCanvas.width, zoomCanvas.height
  );

  // crosshair
  zctx.strokeStyle = 'rgba(255,255,255,0.8)';
  zctx.lineWidth = 1;
  zctx.beginPath();
  zctx.moveTo(0, zoomCanvas.height / 2);
  zctx.lineTo(zoomCanvas.width, zoomCanvas.height / 2);
  zctx.moveTo(zoomCanvas.width / 2, 0);
  zctx.lineTo(zoomCanvas.width / 2, zoomCanvas.height);
  zctx.stroke();

  // position the magnifier relative to overlay window (CSS pixels inside overlay window)
  const cssX = globalX - bounds.x;
  const cssY = globalY - bounds.y;
  mag.style.left = `${cssX + 16}px`;
  mag.style.top = `${cssY + 16}px`;
  reticle.style.left = `${cssX}px`;
  reticle.style.top = `${cssY}px`;
}

async function onMove() {
  const pt = await api.getCursorPoint();
  const hex = getHexAtPoint(pt.x, pt.y);
  setHex(hex);
  drawMagnifier(pt.x, pt.y);
}

window.addEventListener('mousemove', onMove);

window.addEventListener('mousedown', async () => {
  const pt = await api.getCursorPoint();
  const hex = getHexAtPoint(pt.x, pt.y);
  api.overlayDone(hex);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.overlayCancel();
});

window.addEventListener('beforeunload', stopStream);

async function maybeSwitchDisplay() {
  const pt = await api.getCursorPoint();
  const info = await api.getDisplayInfoForPoint(pt);
  if (!activeDisplay || !info || info.displayId !== activeDisplay.displayId) {
    // move overlay to the new display
    if (info && info.bounds) {
      await api.setOverlayBounds(info.bounds);
    }
    activeDisplay = info;
    // restart stream with new source
    stopStream();
    await startStream();
  }
}

setInterval(maybeSwitchDisplay, 300);

startStream();

