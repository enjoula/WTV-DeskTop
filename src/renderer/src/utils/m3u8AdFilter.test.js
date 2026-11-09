/**
 * 对齐 Android M3u8FilterTest 关键用例。
 * 运行：cd src/renderer && npm test -- --watchAll=false m3u8AdFilter.test.js
 */

import {
  FilterLevel,
  filterForPlayback,
  filterM3u8Ads,
  looksLikeAdUri,
} from './m3u8AdFilter';

describe('m3u8AdFilter (align Android M3u8Filter)', () => {
  test('removes ad pod between discontinuity pair', () => {
    const raw = `#EXTM3U
#EXTINF:6.0,
seg0.ts
#EXT-X-DISCONTINUITY
#EXTINF:15.0,
ad.ts
#EXTINF:15.0,
ad2.ts
#EXT-X-DISCONTINUITY
#EXTINF:6.0,
seg1.ts`;
    const filtered = filterForPlayback(raw);
    expect(filtered.includes('ad.ts')).toBe(false);
    expect(filtered.includes('ad2.ts')).toBe(false);
    expect(filtered.includes('seg0.ts')).toBe(true);
    expect(filtered.includes('seg1.ts')).toBe(true);
  });

  test('removes preroll before long unclosed content', () => {
    const contentSegs = Array.from(
      { length: 30 },
      (_, i) => `#EXTINF:10.0,\nepisode_${i + 1}.ts`,
    ).join('\n');
    const raw = `#EXTM3U
#EXT-X-DISCONTINUITY
#EXTINF:5.0,
https://cdn.example.com/hls/preroll_01.ts
#EXTINF:5.0,
https://cdn.example.com/hls/preroll_02.ts
#EXTINF:5.0,
https://cdn.example.com/hls/preroll_03.ts
#EXT-X-DISCONTINUITY
${contentSegs}`;
    const filtered = filterForPlayback(raw);
    expect(filtered.includes('preroll_')).toBe(false);
    expect(filtered.includes('episode_1.ts')).toBe(true);
    expect(filtered.includes('episode_30.ts')).toBe(true);
  });

  test('keeps dense discontinuity content (strip markers only)', () => {
    const blocks = Array.from({ length: 10 }, (_, b) => {
      const i = b + 1;
      return `#EXT-X-DISCONTINUITY
#EXTINF:4.0,
dense_${i}_a.ts
#EXTINF:4.0,
dense_${i}_b.ts
#EXTINF:4.0,
dense_${i}_c.ts
#EXTINF:4.0,
dense_${i}_d.ts
#EXTINF:4.0,
dense_${i}_e.ts`;
    }).join('\n');
    const raw = `#EXTM3U\n${blocks}`;
    const filtered = filterForPlayback(raw);
    expect(filtered.includes('dense_1_a.ts')).toBe(true);
    expect(filtered.includes('dense_10_e.ts')).toBe(true);
    expect(filtered.includes('DISCONTINUITY')).toBe(false);
    const kept = filtered.split('\n').filter((l) => l.endsWith('.ts')).length;
    expect(kept).toBe(50);
  });

  test('drops ad filename without path marker', () => {
    const raw = `#EXTM3U
#EXTINF:6.0,
main0.ts
#EXTINF:15.0,
ad1.ts
#EXTINF:6.0,
main1.ts`;
    const filtered = filterForPlayback(raw);
    expect(filtered.includes('ad1.ts')).toBe(false);
    expect(filtered.includes('main0.ts')).toBe(true);
    expect(filtered.includes('main1.ts')).toBe(true);
  });

  test('removes micro duration segment', () => {
    const raw = `#EXTM3U
#EXTINF:4.0,
main0.ts
#EXTINF:0.033333,
pad.ts
#EXTINF:4.0,
main1.ts`;
    const filtered = filterForPlayback(raw);
    expect(filtered.includes('pad.ts')).toBe(false);
    expect(filtered.includes('main0.ts')).toBe(true);
  });

  test('does not treat hash ending with aad.ts as ad', () => {
    expect(looksLikeAdUri('https://cdn.example.com/hls/xxxxaad.ts')).toBe(false);
    expect(looksLikeAdUri('https://cdn.example.com/hls/ad.ts')).toBe(true);
    expect(looksLikeAdUri('ad1.ts')).toBe(true);
  });

  test('STRONG via filterM3u8Ads + VOD ENDLIST', () => {
    const raw = `#EXTM3U
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:6.0,
main0.ts
#EXTINF:15.0,
ad1.ts
#EXTINF:6.0,
main1.ts`;
    const filtered = filterM3u8Ads(raw, FilterLevel.STRONG);
    expect(filtered.includes('ad1.ts')).toBe(false);
    expect(filtered.includes('#EXT-X-ENDLIST')).toBe(true);
  });

  test('DISCONTINUITY-SEQUENCE is not an ad boundary', () => {
    const tail = Array.from({ length: 20 }, (_, i) => `#EXTINF:10.0,\nmain_${i}.ts`).join('\n');
    const raw = `#EXTM3U
#EXT-X-DISCONTINUITY-SEQUENCE:0
#EXTINF:10.0,
open0.ts
#EXTINF:10.0,
open1.ts
#EXT-X-DISCONTINUITY
#EXTINF:15.0,
ad.ts
#EXT-X-DISCONTINUITY
${tail}`;
    const filtered = filterForPlayback(raw);
    expect(filtered.includes('open0.ts')).toBe(true);
    expect(filtered.includes('open1.ts')).toBe(true);
    expect(filtered.includes('ad.ts')).toBe(false);
    expect(filtered.includes('#EXT-X-DISCONTINUITY-SEQUENCE:0')).toBe(true);
    expect(filtered.includes('main_0.ts')).toBe(true);
  });

  test('OFF passthrough', () => {
    const raw = `#EXTM3U
#EXTINF:6.0,
ad1.ts`;
    expect(filterM3u8Ads(raw, FilterLevel.OFF)).toBe(raw);
  });
});
