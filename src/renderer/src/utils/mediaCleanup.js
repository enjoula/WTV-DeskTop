/** 停掉单个 media 元素及其 HLS，避免切片后旧音频继续响 */
export function stopMediaElement(el) {
  if (!el) return;
  try {
    el.pause();
  } catch (_) { /* ignore */ }
  try {
    el.muted = true;
    el.volume = 0;
  } catch (_) { /* ignore */ }
  const hls = el.hls;
  if (hls) {
    try { hls.stopLoad(); } catch (_) { /* ignore */ }
    try { hls.detachMedia(); } catch (_) { /* ignore */ }
    try { hls.destroy(); } catch (_) { /* ignore */ }
    try { el.hls = null; } catch (_) { /* ignore */ }
  }
  try {
    el.removeAttribute('src');
    el.src = '';
    el.srcObject = null;
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    el.load();
  } catch (_) { /* ignore */ }
}

export function destroyHlsInstance(hls) {
  if (!hls) return;
  try { hls.stopLoad(); } catch (_) { /* ignore */ }
  try { hls.detachMedia(); } catch (_) { /* ignore */ }
  try { hls.destroy(); } catch (_) { /* ignore */ }
}

/** 退出画中画并静音/停掉页面上所有 video/audio（含已脱离 DOM 的极少，主要扫当前 document） */
export function silenceAllPageMedia() {
  try {
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  } catch (_) { /* ignore */ }
  if (typeof document === 'undefined') return;
  document.querySelectorAll('video, audio').forEach(stopMediaElement);
}
