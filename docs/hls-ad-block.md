# DeskTop HLS 去广告

> 与 Android 端 [`Phone/WTV-Android/docs/hls-ad-block.md`](../../../Phone/WTV-Android/docs/hls-ad-block.md) **规则对齐**  
> 实现：`src/renderer/src/utils/m3u8AdFilter.js`（移植 `M3u8Filter` + `DefaultAdRule`）  
> 接入：`MyArtPlayer.js` → HLS.js `CustomHlsJsLoader`（manifest / level）

---

## 1. 修复了什么

旧桌面逻辑（`MyArtPlayer.filterAdsFromM3U8`）的问题：

| 旧行为 | 后果 |
|---|---|
| 只删 `#EXT-X-DISCONTINUITY` 行 | 广告 TS 仍在清单里，仍会下载/播放 |
| 密铺 DISC（≥8 处或占比 >8%）整单跳过 | dytt / 切流源广告完全不过滤，且 seek 仍可能错乱 |
| 无 URI / CUE / 极短垫片启发 | 片头 `ad1.ts`、0.033s 垫片等漏网 |

现与 Android **STRONG** 一致：从清单**剔除广告分片**，密铺源用 shortUri / sandwiched / 30fps midroll 等启发式，找不到广告特征时才退化为只剥断点。

---

## 2. 播放链路

```
CDN m3u8
  → HLS.js CustomHlsJsLoader（manifest / level）
  → filterM3u8Ads(raw, STRONG, playlistUrl)
  → HLS.js 解析过滤后清单
  → 只拉正片分片 → ArtPlayer
```

默认常开 STRONG（与 Android `bindPlayerConfig` 行为一致）。

---

## 3. 规则摘要（与 Android 同源）

| 能力 | 说明 |
|---|---|
| FilterLevel | OFF / BASIC / STRONG（默认 STRONG） |
| DISC 短 pod | 成对 DISCONTINUITY、总时长 ≤ 120s |
| 密铺保护 | 多闭合短区间时不按时长整段删正片 |
| URI 关键词 | `/ad/`、`/preroll`、`/vast`…；文件名 `ad.ts` / `ads1.ts`；**不**用裸 `ad.ts` 子串 |
| 极短垫片 | EXTINF \< 0.15s |
| 短文件名 outlier | 中位 ≥ 80 时，长度 \< 中位 × 0.65 |
| 夹心 DISC | `DISC → EXTINF → DISC → URI` |
| 密铺 30fps midroll | 25fps 正片中夹入的短 30fps 闭合块 |
| CUE-OUT/IN | 区间内分片整段丢弃 |
| VOD ENDLIST | `PLAYLIST-TYPE:VOD` 且无 ENDLIST 时补上 |

未整段剔除的闭合区间会**保留两侧 DISCONTINUITY**，避免时间轴/解码切换异常。

---

## 4. 关键文件

```
src/renderer/src/utils/m3u8AdFilter.js       # 过滤核心
src/renderer/src/utils/m3u8AdFilter.test.js  # 单测（对齐 Android 用例）
src/renderer/src/components/MyArtPlayer.js   # CustomHlsJsLoader 接入
```

跑测：

```bash
cd src/renderer && CI=true npm test -- --watchAll=false m3u8AdFilter.test.js
```

---

## 5. 与 Android 的差异（有意保留）

| 项 | Android | DeskTop |
|---|---|---|
| 播放器 | Media3 + `AdSkippingHlsPlaylistParser` | HLS.js Loader 改写文本 |
| 规则引擎层 | `AdFilterEngine` + `M3u8Filter` 双层 | 文本层 `m3u8AdFilter`（覆盖同等启发式） |
| 会话 fallback | Phone 起播失败可关 host 过滤 | 暂无（Hls.js 容错更好） |
| 预取 | `HlsStartupPrefetcher` | 无对应 |
| UI 开关 | MMKV，暂无面板 | 常开 STRONG |

过滤**判定规则与常量**与 Android `M3u8Filter` / `DefaultAdRule` 保持一致；后续改 Android 规则时应同步改本模块。
