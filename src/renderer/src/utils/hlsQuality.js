/** 从清晰度（分辨率）再比码率，选出最高一档 */
function levelHeight(level) {
  if (level?.height) return level.height;
  const res = level?.attrs?.RESOLUTION;
  if (typeof res === 'string' && res.includes('x')) {
    const height = parseInt(res.split('x')[1], 10);
    if (height) return height;
  }
  return 0;
}

function levelWidth(level) {
  if (level?.width) return level.width;
  const res = level?.attrs?.RESOLUTION;
  if (typeof res === 'string' && res.includes('x')) {
    const width = parseInt(res.split('x')[0], 10);
    if (width) return width;
  }
  return 0;
}

function isHigherQuality(candidate, current) {
  const heightDiff = levelHeight(candidate) - levelHeight(current);
  if (heightDiff) return heightDiff > 0;
  const widthDiff = levelWidth(candidate) - levelWidth(current);
  if (widthDiff) return widthDiff > 0;
  return (candidate?.bitrate || 0) > (current?.bitrate || 0);
}

/**
 * 关掉 ABR，把后续分片锁在最高清晰度。
 * 用 loadLevel 而不是 currentLevel，避免立刻清空缓冲。
 */
export function lockHlsHighestLevel(hls) {
  if (!hls) return -1;
  try {
    const levels = hls.levels;
    if (!levels || levels.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < levels.length; i += 1) {
      if (isHigherQuality(levels[i], levels[best])) best = i;
    }
    if (hls.autoLevelEnabled || hls.loadLevel !== best) {
      hls.loadLevel = best;
    }
    return best;
  } catch (_) {
    return -1;
  }
}

/** 起播就走最高档：不做最低档带宽探测，带宽估算拉满 */
export const HLS_LOCK_HIGHEST_CONFIG = {
  capLevelToPlayerSize: false,
  capLevelOnFPSDrop: false,
  testBandwidth: false,
  abrEwmaDefaultEstimate: 100000000,
};
