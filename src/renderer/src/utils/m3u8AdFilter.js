/**
 * HLS 去广告（对齐 Android `M3u8Filter` + `DefaultAdRule`）。
 *
 * 三档强度：
 * - OFF：不过滤
 * - BASIC：仅删 `#EXT-X-DISCONTINUITY` 行
 * - STRONG（默认）：剔除广告 TS 分片 + 广告标记
 *
 * 旧桌面逻辑只剥 DISCONTINUITY，且密铺源整单跳过 → 广告仍播 / seek 异常。
 * 现与 Android 一致：密铺保护 + shortUri / sandwiched / 30fps midroll 等启发式。
 */

export const FilterLevel = Object.freeze({
  OFF: 'OFF',
  BASIC: 'BASIC',
  STRONG: 'STRONG',
});

/** 成对 DISCONTINUITY 之间总时长不超过该值才视为广告 pod */
export const MAX_AD_POD_DURATION_SEC = 120.0;
/** 极短分片（广告垫片） */
export const MICRO_SEGMENT_SEC = 0.15;
/** 文件名长度 < 中位 × 该比例视为广告 URI */
export const SHORT_URI_RATIO = 0.65;
/** 中位文件名过短时不做 outlier 判定 */
export const MIN_MEDIAN_URI_LEN_FOR_OUTLIER = 80;

const DISCONTINUITY = '#EXT-X-DISCONTINUITY';

/** 对齐 Android DefaultAdRule.URL_KEYWORDS；禁止裸 ad.ts 子串误伤 …aad.ts */
export const URL_KEYWORDS = [
  '/ad/', '/ads/', 'advert', 'advertisement', 'sponsor', 'adjump', 'redtraffic',
  '/advert', '/promo/', '/preroll', '/midroll', '/postroll',
  '/pre-roll', '/mid-roll', '/post-roll',
  '/ad_', '/ads_', '_ad.', '-ad.',
  '/vast', '/vpaid', '/ssai',
  '/adj/', '/commercial', '/break/',
  '/adsegment', '/ad_seg', '/spot/',
  '/ad.ts', '/ads.ts',
];

const AD_FILE_RE = /^ads?\d*\.(ts|m4s|mp4)$/i;
const AD_FILE_BOUND_RE = /(^|[^a-z0-9])ads?\d*\.(ts|m4s|mp4)$/i;

/**
 * @param {string} raw
 * @param {'OFF'|'BASIC'|'STRONG'} [level]
 * @param {string|null} [playlistUrl]
 */
export function filterM3u8Ads(raw, level = FilterLevel.STRONG, playlistUrl = null) {
  if (!raw || level === FilterLevel.OFF) return raw || '';
  let filtered;
  if (level === FilterLevel.BASIC) {
    filtered = filterAdsFromM3U8(raw, true);
  } else {
    filtered = filterForPlayback(raw, true, playlistUrl);
  }
  return ensureVodEndList(filtered);
}

/** BASIC：只删 DISCONTINUITY 行 */
export function filterAdsFromM3U8(m3u8Content, enabled = true) {
  if (!enabled || !m3u8Content) return m3u8Content || '';
  return m3u8Content
    .split('\n')
    .filter((line) => !isDiscontinuityLine(line))
    .join('\n');
}

/** STRONG：媒体清单剔除广告分片；主清单仅剥断点 */
export function filterForPlayback(m3u8Content, enabled = true, playlistUrl = null) {
  if (!enabled || !m3u8Content) return m3u8Content || '';
  const lines = m3u8Content.split('\n');
  if (!isMediaPlaylist(lines)) {
    return filterAdsFromM3U8(m3u8Content, enabled);
  }
  if (shouldStripDiscontinuityOnly(lines, playlistUrl)) {
    return filterAdsFromM3U8(m3u8Content, enabled);
  }
  return filterMediaPlaylist(lines, playlistUrl);
}

export function looksLikeAdUri(uri, playlistUrl = null) {
  if (!uri) return false;
  const path = uri.toLowerCase();
  if (URL_KEYWORDS.some((k) => path.includes(k))) return true;
  const file = uriFileToken(uri);
  if (AD_FILE_RE.test(file)) return true;
  if (playlistUrl) {
    const hint = playlistUrl.toLowerCase();
    if (URL_KEYWORDS.some((k) => hint.includes(k)) && AD_FILE_BOUND_RE.test(file)) {
      return true;
    }
  }
  return false;
}

export function uriFileToken(uri) {
  const noQuery = String(uri).split('?')[0];
  const slash = noQuery.lastIndexOf('/');
  return slash >= 0 ? noQuery.slice(slash + 1) : noQuery;
}

export function parseExtInfDuration(line) {
  const t = String(line).trim();
  if (!t.toUpperCase().startsWith('#EXTINF')) return null;
  const afterColon = t.includes(':') ? t.slice(t.indexOf(':') + 1) : '';
  const payload = afterColon.split(',')[0];
  const n = Number.parseFloat(payload);
  return Number.isFinite(n) ? n : null;
}

function isMediaPlaylist(lines) {
  return lines.some((l) => l.trim().toUpperCase().startsWith('#EXTINF'));
}

function isDiscontinuityLine(line) {
  const u = String(line).trim().toUpperCase();
  // 不能用 includes：#EXT-X-DISCONTINUITY-SEQUENCE 带这个前缀。
  // 误当成断点后，序号到第一处真断点之间的片头（≤120s）会被当成广告删掉，起播被推后。
  if (!u.startsWith(DISCONTINUITY)) return false;
  return !u.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE');
}

function isCueOutLine(line) {
  return String(line).toUpperCase().includes('#EXT-X-CUE-OUT');
}

function isCueInLine(line) {
  return String(line).toUpperCase().includes('#EXT-X-CUE-IN');
}

function isSkippableAdTag(line) {
  const t = String(line).trim();
  const u = t.toUpperCase();
  return (
    isDiscontinuityLine(t) ||
    isCueOutLine(t) ||
    isCueInLine(t) ||
    u.includes('#EXT-X-AD') ||
    u.startsWith('#EXT-X-ASSET') ||
    (u.startsWith('#EXT-X-DATERANGE') && u.includes('SCTE35'))
  );
}

function isLiveOnlyPlaylistSignal(trimmed) {
  if (!trimmed || !trimmed.startsWith('#')) return false;
  const u = trimmed.toUpperCase();
  return (
    u.includes('#EXT-X-PLAYLIST-TYPE:EVENT') ||
    u.startsWith('#EXT-X-SERVER-CONTROL') ||
    u.startsWith('#EXT-X-PART:') ||
    u.startsWith('#EXT-X-PRELOAD-HINT') ||
    u.startsWith('#EXT-X-RENDITION-REPORT')
  );
}

/** VOD 缺 ENDLIST 时补上，避免 HLS.js 当直播轮询 */
export function ensureVodEndList(content) {
  if (!content) return content || '';
  const lines = content.split('\n');
  if (!isMediaPlaylist(lines)) return content;
  if (lines.some((l) => l.trim().toUpperCase() === '#EXT-X-ENDLIST')) return content;
  if (lines.some((l) => isLiveOnlyPlaylistSignal(l.trim()))) return content;
  const vodType = lines.some((l) =>
    l.trim().toUpperCase().includes('#EXT-X-PLAYLIST-TYPE:VOD'),
  );
  if (!vodType) return content;
  return `${content.replace(/\s+$/, '')}\n#EXT-X-ENDLIST\n`;
}

function medianOf(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function medianOfInt(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.floor((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * @returns {{ uriIndices: number[], durationSec: number, openDiscIndex: number, closeDiscIndex: number }[]}
 */
function collectClosedDiscIntervals(lines) {
  const intervals = [];
  let openAt = null;
  let carryDuration = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (!isDiscontinuityLine(lines[i])) continue;
    if (openAt != null) {
      const uriIndices = [];
      let duration = 0;
      let pendingDuration = carryDuration;
      carryDuration = null;
      for (let j = openAt + 1; j < i; j += 1) {
        const t = lines[j].trim();
        if (!t) continue;
        const ext = parseExtInfDuration(t);
        if (ext != null) {
          pendingDuration = ext;
          continue;
        }
        if (!t.startsWith('#') && pendingDuration != null) {
          uriIndices.push(j);
          duration += pendingDuration;
          pendingDuration = null;
        }
      }
      carryDuration = pendingDuration;
      if (duration > 0 && uriIndices.length) {
        intervals.push({
          uriIndices,
          durationSec: duration,
          openDiscIndex: openAt,
          closeDiscIndex: i,
        });
      }
    } else {
      carryDuration = null;
    }
    openAt = i;
  }
  return intervals;
}

function durationOutsideClosedIntervals(lines, intervals) {
  const adUriLines = new Set(intervals.flatMap((it) => it.uriIndices));
  let total = 0;
  let pendingDuration = null;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    const ext = parseExtInfDuration(t);
    if (ext != null) {
      pendingDuration = ext;
      continue;
    }
    if (isDiscontinuityLine(t)) continue;
    if (!t.startsWith('#') && pendingDuration != null) {
      if (!adUriLines.has(i)) total += pendingDuration;
      pendingDuration = null;
    }
  }
  return total;
}

function isDenseShortDiscontinuityPlaylist(intervals, outsideSec, median) {
  if (intervals.length < 3) return false;
  const med =
    median != null ? median : medianOf(intervals.map((it) => it.durationSec));
  const totalClosedSec = intervals.reduce((s, it) => s + it.durationSec, 0);
  return (
    med <= MAX_AD_POD_DURATION_SEC &&
    outsideSec <= MAX_AD_POD_DURATION_SEC &&
    totalClosedSec >= outsideSec
  );
}

/** 密铺短 DISC 且启发式找不到广告 → 只剥断点 */
export function shouldStripDiscontinuityOnly(lines, playlistUrl) {
  const intervals = collectClosedDiscIntervals(lines);
  if (!intervals.length) return false;
  const outsideSec = durationOutsideClosedIntervals(lines, intervals);
  if (!isDenseShortDiscontinuityPlaylist(intervals, outsideSec)) return false;
  const named = lines.some((line, i) => {
    const t = line.trim();
    return t && !t.startsWith('#') && looksLikeAdUri(t, playlistUrl);
  });
  if (named) return false;
  if (microDurationUriIndices(lines).size) return false;
  if (shortUriAdIndices(lines).size) return false;
  if (sandwichedDiscontinuityAdUriIndices(lines).size) return false;
  if (denseFpsMismatchAdUriIndices(lines).size) return false;
  return true;
}

export function discontinuityAdUriIndices(lines) {
  const intervals = collectClosedDiscIntervals(lines);
  if (!intervals.length) return new Set();
  const median = medianOf(intervals.map((it) => it.durationSec));
  const outsideSec = durationOutsideClosedIntervals(lines, intervals);
  const maxInterval = Math.max(...intervals.map((it) => it.durationSec));
  if (isDenseShortDiscontinuityPlaylist(intervals, outsideSec, median)) {
    return new Set();
  }
  const useDurationHeuristic =
    median > MAX_AD_POD_DURATION_SEC ||
    outsideSec > 1.0 ||
    maxInterval > MAX_AD_POD_DURATION_SEC;
  if (!useDurationHeuristic) return new Set();

  const result = new Set();
  for (const interval of intervals) {
    if (interval.durationSec > MAX_AD_POD_DURATION_SEC) continue;
    if (
      outsideSec > 1.0 &&
      outsideSec <= MAX_AD_POD_DURATION_SEC &&
      maxInterval <= MAX_AD_POD_DURATION_SEC &&
      interval.durationSec >= maxInterval &&
      interval.durationSec > outsideSec * 2
    ) {
      continue;
    }
    interval.uriIndices.forEach((idx) => result.add(idx));
  }
  return result;
}

export function microDurationUriIndices(lines) {
  const result = new Set();
  let pendingDuration = null;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    const ext = parseExtInfDuration(t);
    if (ext != null) {
      pendingDuration = ext;
      continue;
    }
    if (isDiscontinuityLine(t)) continue;
    if (!t.startsWith('#') && pendingDuration != null) {
      if (pendingDuration < MICRO_SEGMENT_SEC) result.add(i);
      pendingDuration = null;
    }
  }
  return result;
}

export function shortUriAdIndices(lines) {
  const samples = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t || t.startsWith('#')) continue;
    samples.push([i, uriFileToken(t).length]);
  }
  if (samples.length < 8) return new Set();
  const median = medianOfInt(samples.map((s) => s[1]));
  if (median < MIN_MEDIAN_URI_LEN_FOR_OUTLIER) return new Set();
  const threshold = median * SHORT_URI_RATIO;
  return new Set(samples.filter((s) => s[1] < threshold).map((s) => s[0]));
}

export function looksLike30FpsExtInf(line) {
  const t = String(line).trim();
  const afterColon = t.includes(':') ? t.slice(t.indexOf(':') + 1) : '';
  const payload = afterColon.split(',')[0].trim();
  const frac = payload.includes('.') ? payload.slice(payload.indexOf('.') + 1) : '';
  if (!frac) return false;
  return '1379'.includes(frac[frac.length - 1]);
}

export function isHighPrecisionExtInf(line) {
  const t = String(line).trim();
  const afterColon = t.includes(':') ? t.slice(t.indexOf(':') + 1) : '';
  const payload = afterColon.split(',')[0].trim();
  const frac = payload.includes('.') ? payload.slice(payload.indexOf('.') + 1) : '';
  return frac.length >= 5;
}

function intervalHas30FpsLikeDuration(lines, interval) {
  let pending = null;
  for (let j = interval.openDiscIndex + 1; j < interval.closeDiscIndex; j += 1) {
    const t = lines[j].trim();
    if (t.toUpperCase().startsWith('#EXTINF')) {
      pending = t;
      continue;
    }
    if (t && !t.startsWith('#') && pending != null) {
      if (looksLike30FpsExtInf(pending)) return true;
      pending = null;
    }
  }
  return false;
}

export function denseFpsMismatchAdUriIndices(lines) {
  const intervals = collectClosedDiscIntervals(lines);
  if (!intervals.length) return new Set();
  const outsideSec = durationOutsideClosedIntervals(lines, intervals);
  if (!isDenseShortDiscontinuityPlaylist(intervals, outsideSec)) return new Set();
  const medianDur = medianOf(intervals.map((it) => it.durationSec));
  const candidates = intervals.filter(
    (interval) =>
      interval.durationSec <= MAX_AD_POD_DURATION_SEC &&
      intervalHas30FpsLikeDuration(lines, interval) &&
      (interval.uriIndices.length <= 3 || interval.durationSec < medianDur * 0.8),
  );
  if (!candidates.length) return new Set();
  if (candidates.length * 2 >= intervals.length) return new Set();
  const result = new Set();
  candidates.forEach((c) => c.uriIndices.forEach((i) => result.add(i)));
  return result;
}

export function sandwichedDiscontinuityAdUriIndices(lines) {
  const result = new Set();
  let discSinceLastUri = 0;
  let pendingExtInf = false;
  let discAfterExtInf = false;
  let pendingDuration = 0;
  let pendingHighPrecision = false;
  let inAdPod = false;
  let adPodDuration = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isDiscontinuityLine(t)) {
      if (pendingExtInf) discAfterExtInf = true;
      else discSinceLastUri += 1;
      continue;
    }
    const ext = parseExtInfDuration(t);
    if (ext != null) {
      pendingExtInf = true;
      pendingDuration = ext;
      pendingHighPrecision = isHighPrecisionExtInf(t);
      discAfterExtInf = false;
      continue;
    }
    if (!t.startsWith('#')) {
      const sandwiched = discSinceLastUri >= 1 && discAfterExtInf;
      const micro = pendingDuration > 0 && pendingDuration < MICRO_SEGMENT_SEC;
      if (!inAdPod && (sandwiched || micro)) {
        inAdPod = true;
        adPodDuration = 0;
      }
      if (inAdPod) {
        const looksLikeContent = !sandwiched && !micro && !pendingHighPrecision;
        if (looksLikeContent && adPodDuration > 0) {
          inAdPod = false;
        } else {
          result.add(i);
          adPodDuration += pendingDuration;
          if (adPodDuration >= MAX_AD_POD_DURATION_SEC) inAdPod = false;
        }
      }
      discSinceLastUri = 0;
      pendingExtInf = false;
      discAfterExtInf = false;
      pendingDuration = 0;
      pendingHighPrecision = false;
    }
  }
  return result;
}

function discontinuityLinesToPreserve(lines, adUriIndices) {
  const intervals = collectClosedDiscIntervals(lines);
  if (!intervals.length) return new Set();
  const outsideSec = durationOutsideClosedIntervals(lines, intervals);
  if (isDenseShortDiscontinuityPlaylist(intervals, outsideSec)) return new Set();

  const preserve = new Set();
  for (const interval of intervals) {
    if (!interval.uriIndices.length) continue;
    const allRemoved = interval.uriIndices.every((idx) => adUriIndices.has(idx));
    if (!allRemoved) {
      preserve.add(interval.openDiscIndex);
      preserve.add(interval.closeDiscIndex);
    }
  }
  return preserve;
}

function filterMediaPlaylist(lines, playlistUrl) {
  const heuristicAdUris = new Set([
    ...discontinuityAdUriIndices(lines),
    ...microDurationUriIndices(lines),
    ...shortUriAdIndices(lines),
    ...sandwichedDiscontinuityAdUriIndices(lines),
    ...denseFpsMismatchAdUriIndices(lines),
  ]);
  const namedAdUris = new Set();
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t && !t.startsWith('#') && looksLikeAdUri(t, playlistUrl)) {
      namedAdUris.add(i);
    }
  });
  const adUriIndices = new Set([...heuristicAdUris, ...namedAdUris]);
  const preserveDisc = discontinuityLinesToPreserve(lines, adUriIndices);

  const output = [];
  let pendingTags = [];
  let inCueAdBreak = false;

  const clearPendingSegment = () => {
    pendingTags = [];
  };

  const shouldDropSegment = (uri, uriLineIndex) => {
    if (looksLikeAdUri(uri, playlistUrl)) return true;
    if (inCueAdBreak) return true;
    if (adUriIndices.has(uriLineIndex)) return true;
    return false;
  };

  const flushSegment = (uri, uriLineIndex) => {
    if (!shouldDropSegment(uri, uriLineIndex)) {
      output.push(...pendingTags);
      output.push(uri);
    }
    clearPendingSegment();
  };

  const handleTagLine = (line, lineIndex) => {
    const trimmed = line.trim();
    if (isDiscontinuityLine(trimmed)) {
      if (preserveDisc.has(lineIndex)) {
        if (!pendingTags.length) output.push(line);
      } else if (!pendingTags.length) {
        clearPendingSegment();
      }
      return;
    }
    if (isCueOutLine(trimmed)) {
      inCueAdBreak = true;
      clearPendingSegment();
      return;
    }
    if (isCueInLine(trimmed)) {
      inCueAdBreak = false;
      clearPendingSegment();
      return;
    }
    if (isSkippableAdTag(trimmed)) {
      clearPendingSegment();
      return;
    }
    if (trimmed.toUpperCase().startsWith('#EXTINF')) {
      pendingTags.push(line);
      return;
    }
    if (pendingTags.length) {
      pendingTags.push(line);
      return;
    }
    output.push(line);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (!pendingTags.length) output.push(line);
    } else if (trimmed.startsWith('#')) {
      handleTagLine(line, i);
    } else {
      flushSegment(line, i);
    }
  }

  return output.join('\n');
}

export default filterM3u8Ads;
