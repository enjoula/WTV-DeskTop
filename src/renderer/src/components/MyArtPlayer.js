import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { destroyHlsInstance, silenceAllPageMedia, stopMediaElement } from '../utils/mediaCleanup';
import { HLS_LOCK_HIGHEST_CONFIG, lockHlsHighestLevel } from '../utils/hlsQuality';

/** 全局只允许一路 HLS/ArtPlayer，防止切片后旧实例继续出声 */
let liveArtPlayer = null;
let liveHlsPlayer = null;

if (typeof window !== 'undefined') {
  window.Hls = Hls;
}

if (typeof Artplayer !== 'undefined') {
  Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
}

// ─── 去广告：过滤 M3U8 中的 #EXT-X-DISCONTINUITY 标记（广告分段分界点）
// 与 LunaTV 逻辑完全一致：只删除标记行本身，HLS.js 会将相邻片段视为连续流
function filterAdsFromM3U8(m3u8Content) {
  if (!m3u8Content) return '';
  return m3u8Content
    .split('\n')
    .filter(line => !line.includes('#EXT-X-DISCONTINUITY'))
    .join('\n');
}

// ─── 自定义 HLS.js Loader（参考 LunaTV play/page.tsx）
// 在 manifest/level 请求成功后，Hook onSuccess 回调，过滤广告分段标记
class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    const load = this.load.bind(this);
    this.load = function (context, hlsConfig, callbacks) {
      if (context.type === 'manifest' || context.type === 'level') {
        const onSuccess = callbacks.onSuccess;
        callbacks.onSuccess = function (response, stats, ctx, networkDetails) {
          if (response.data && typeof response.data === 'string') {
            response.data = filterAdsFromM3U8(response.data);
          }
          return onSuccess(response, stats, ctx, networkDetails);
        };
      }
      load(context, hlsConfig, callbacks);
    };
  }
}

// ─── 从 localStorage 读取去广告开关，默认开启
function readBlockAdSetting() {
  try {
    const v = localStorage.getItem('enable_blockad');
    return v !== null ? v === 'true' : true;
  } catch (_) {
    return true;
  }
}

// ─── 片头/片尾跳过配置（参考 LunaTV SkipConfig）
// 存储在 localStorage 的 wtv_skip_configs 键，key 为 videoId
// { enable: bool, intro_time: number（秒，正数）, outro_time: number（秒，负数表示距末尾） }
const SKIP_CONFIGS_KEY = 'wtv_skip_configs';

function readSkipConfig(videoId) {
  const defaultCfg = { enable: false, intro_time: 0, outro_time: 0 };
  if (!videoId) return defaultCfg;
  try {
    const all = JSON.parse(localStorage.getItem(SKIP_CONFIGS_KEY) || '{}');
    return all[String(videoId)] || defaultCfg;
  } catch (_) {
    return defaultCfg;
  }
}

// 格式化秒数为 m:ss，用于 ArtPlayer notice 提示
function formatSkipTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 变速播放缓冲门控
// 高倍速会按倍速消耗缓冲；连播下一集时若立刻 1.5x/2x，HLS 常缓冲不足导致卡死。
// 策略：目标倍速 > 1 时先以 1x 起播，前方缓冲够了再升速；缓冲吃紧或 stalled 时临时降回 1x。
const RATE_GATE = {
  applyMinBuffer: 8,     // 起播后至少攒够这么多秒再应用 >1x
  keepMinBuffer: 2.5,    // 低于此值则临时降到 1x
  restoreMinBuffer: 10,  // 恢复目标倍速所需前方缓冲
  monitorMs: 800,
};

function getForwardBufferSeconds(video) {
  if (!video || !video.buffered || video.buffered.length === 0) return 0;
  const t = video.currentTime || 0;
  try {
    for (let i = 0; i < video.buffered.length; i += 1) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      if (t >= start - 0.35 && t <= end + 0.35) {
        return Math.max(0, end - t);
      }
    }
    // 当前时间不在任一 buffered 区间内时，取最近的后方区间
    for (let i = 0; i < video.buffered.length; i += 1) {
      const end = video.buffered.end(i);
      if (end > t) return Math.max(0, end - t);
    }
  } catch (_) { /* ignore */ }
  return 0;
}

const MyArtPlayer = forwardRef(({
  url,
  playing = false,
  volume = 1,
  muted = false,
  playbackRate = 1,
  autoNextEpisode = true,
  onToggleAutoNextEpisode,
  isFullscreen = false,
  onToggleFullscreen,
  isPictureInPicture = false,
  pictureInPictureEnabled = true,
  onTogglePictureInPicture,
  showNextEpisodeButton = false,
  canNextEpisode = false,
  onNextEpisodeClick,
  videoId,          // 用于读取/保存片头片尾配置
  onReady,
  onPlay,
  onPause,
  onProgress,
  onEnded,
  onNextEpisode,    // 跳过片尾时调用（切下一集），未提供则回退到 onEnded
  onError,
  onLoadedMetadata,
  onTimeUpdate,
  onVolumeChange,
  onRateChange,
  onSeek,
  className = '',
  style = {},
  containerRef,
  videoFitMode = 'contain',
  onVideoFitModeChange,
}, ref) => {
  const artInstanceRef = useRef(null);
  const containerRefInternal = useRef(null);
  const hlsInstanceRef = useRef(null);
  const isPlayingRef = useRef(playing);
  const currentVolumeRef = useRef(volume);
  const currentMutedRef = useRef(muted);
  const currentPlaybackRateRef = useRef(playbackRate); // 用户目标倍速（UI / 设置）
  const hasActivatedSpeedIndicatorRef = useRef(playbackRate !== 1);
  const syncSpeedIndicatorRef = useRef(null);
  const isRateGatingRef = useRef(false); // 门控改倍速时忽略 ratechange，避免写回 1x
  const rateGateControllerRef = useRef(null); // { setTarget, destroy, onStall }
  const autoNextEpisodeRef = useRef(autoNextEpisode);
  const onToggleAutoNextEpisodeRef = useRef(onToggleAutoNextEpisode);
  const isFullscreenRef = useRef(isFullscreen);
  const onToggleFullscreenRef = useRef(onToggleFullscreen);
  const isPictureInPictureRef = useRef(isPictureInPicture);
  const pictureInPictureEnabledRef = useRef(pictureInPictureEnabled);
  const onTogglePictureInPictureRef = useRef(onTogglePictureInPicture);
  const videoFitModeRef = useRef(videoFitMode);
  const onVideoFitModeChangeRef = useRef(null);
  const showNextEpisodeButtonRef = useRef(showNextEpisodeButton);
  const canNextEpisodeRef = useRef(canNextEpisode);
  const onNextEpisodeClickRef = useRef(onNextEpisodeClick);
  const onReadyRef = useRef(onReady);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const onNextEpisodeRef = useRef(onNextEpisode);
  const onErrorRef = useRef(onError);
  const onLoadedMetadataRef = useRef(onLoadedMetadata);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onVolumeChangeRef = useRef(onVolumeChange);
  const onRateChangeRef = useRef(onRateChange);
  const onSeekRef = useRef(onSeek);
  /** 合并 ArtPlayer ended 与 <video ended>，并防抖，避免连播逻辑不触发或触发两次 */
  const lastPlaybackEndedAtRef = useRef(0);

  // ─── 去广告开关（参考 LunaTV blockAdEnabled）
  // 存储在 localStorage 的 enable_blockad 键，默认 true
  const [blockAdEnabled, setBlockAdEnabled] = useState(readBlockAdSetting);
  const blockAdEnabledRef = useRef(blockAdEnabled);
  // 该 effect 仅在 url 或去广告开关变化时重建播放器，其余参数由后续同步 effect 处理
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);

  useEffect(() => {
    autoNextEpisodeRef.current = autoNextEpisode;
  }, [autoNextEpisode]);

  useEffect(() => {
    onToggleAutoNextEpisodeRef.current = onToggleAutoNextEpisode;
  }, [onToggleAutoNextEpisode]);

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  useEffect(() => {
    onToggleFullscreenRef.current = onToggleFullscreen;
  }, [onToggleFullscreen]);

  useEffect(() => {
    isPictureInPictureRef.current = isPictureInPicture;
  }, [isPictureInPicture]);

  useEffect(() => {
    pictureInPictureEnabledRef.current = pictureInPictureEnabled;
  }, [pictureInPictureEnabled]);

  useEffect(() => {
    onTogglePictureInPictureRef.current = onTogglePictureInPicture;
  }, [onTogglePictureInPicture]);

  useEffect(() => {
    videoFitModeRef.current = videoFitMode;
  }, [videoFitMode]);

  useEffect(() => {
    onVideoFitModeChangeRef.current = onVideoFitModeChange;
  }, [onVideoFitModeChange]);

  useEffect(() => {
    showNextEpisodeButtonRef.current = showNextEpisodeButton;
  }, [showNextEpisodeButton]);

  useEffect(() => {
    canNextEpisodeRef.current = canNextEpisode;
  }, [canNextEpisode]);

  useEffect(() => {
    onNextEpisodeClickRef.current = onNextEpisodeClick;
  }, [onNextEpisodeClick]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onPlayRef.current = onPlay;
  }, [onPlay]);

  useEffect(() => {
    onPauseRef.current = onPause;
  }, [onPause]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    onNextEpisodeRef.current = onNextEpisode;
  }, [onNextEpisode]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onLoadedMetadataRef.current = onLoadedMetadata;
  }, [onLoadedMetadata]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    onVolumeChangeRef.current = onVolumeChange;
  }, [onVolumeChange]);

  useEffect(() => {
    onRateChangeRef.current = onRateChange;
  }, [onRateChange]);

  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  // 切换广告过滤时保存当前播放位置，重建后恢复（LunaTV 不做此处理，这里体验更好）
  const pendingResumeRef = useRef(null);

  // ─── 片头/片尾跳过（参考 LunaTV SkipConfig + timeupdate 逻辑）
  const skipConfigRef = useRef(readSkipConfig(videoId));
  const lastSkipCheckRef = useRef(0); // 节流：1.5s 检测一次
  const videoIdRef = useRef(videoId); // 始终保持最新 videoId，供回调使用

  // videoId 变化时重新读取对应的跳过配置；倍速按片子重置（由父组件传 1x）
  useEffect(() => {
    videoIdRef.current = videoId;
    skipConfigRef.current = readSkipConfig(videoId);
    hasActivatedSpeedIndicatorRef.current = (Number(playbackRate) || 1) !== 1;
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const container = containerRef?.current ? containerRef : (containerRef || containerRefInternal);

  useImperativeHandle(ref, () => ({
    play: () => {
      if (artInstanceRef.current) artInstanceRef.current.play();
    },
    pause: () => {
      if (artInstanceRef.current) artInstanceRef.current.pause();
    },
    seek: (seconds) => {
      if (artInstanceRef.current) artInstanceRef.current.seek = seconds;
    },
    getCurrentTime: () => {
      if (artInstanceRef.current) return artInstanceRef.current.currentTime;
      return 0;
    },
    getDuration: () => {
      if (artInstanceRef.current) return artInstanceRef.current.duration;
      return 0;
    },
    setPlaybackRate: (rate) => {
      const numericRate = Number(rate) || 1;
      currentPlaybackRateRef.current = numericRate;
      if (syncSpeedIndicatorRef.current) {
        syncSpeedIndicatorRef.current(numericRate);
      }
      try {
        const item = artInstanceRef.current?.setting?.find?.('speed');
        if (item) item.tooltip = numericRate === 1 ? '正常' : `${numericRate}x`;
      } catch (_) { /* ignore */ }
      // 走缓冲门控：切集/高倍速时不会立刻把缓冲抽干
      if (rateGateControllerRef.current?.setTarget) {
        rateGateControllerRef.current.setTarget(numericRate);
        return;
      }
      if (artInstanceRef.current) {
        try { artInstanceRef.current.playbackRate = numericRate; } catch (_) { /* ignore */ }
        if (artInstanceRef.current.video) {
          artInstanceRef.current.video.playbackRate = numericRate;
        }
      }
    },
    getInternalPlayer: () => artInstanceRef.current,
    resize: () => {
      try {
        artInstanceRef.current?.resize?.();
      } catch (_) {
        // ignore
      }
    },
    getVideoElement: () => {
      if (artInstanceRef.current && artInstanceRef.current.video) {
        return artInstanceRef.current.video;
      }
      return null;
    },
  }), []);

  // ─── 主 Effect：url 变化或 blockAdEnabled 切换时重建播放器
  // LunaTV 同样在切换 blockAdEnabled 时销毁并重建播放器以使新 loader 生效
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!container.current) return;
    if (!url || typeof url !== 'string' || url.trim() === '') return;

    const teardownPlayer = (art, hls) => {
      try {
        if (typeof document !== 'undefined' && document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        }
      } catch (_) { /* ignore */ }
      const video = art?.video;
      if (video) {
        if (video._artPlayerHandlers) {
          Object.entries(video._artPlayerHandlers).forEach(([type, handler]) => {
            video.removeEventListener(type, handler);
          });
          delete video._artPlayerHandlers;
        }
        if (video._wtvStallRecovery?.teardown) {
          try { video._wtvStallRecovery.teardown(); } catch (_) { /* ignore */ }
          delete video._wtvStallRecovery;
        }
        destroyHlsInstance(video.hls);
        try { video.hls = null; } catch (_) { /* ignore */ }
        stopMediaElement(video);
      }
      destroyHlsInstance(hls);
      if (art) {
        try { art.pause(); } catch (_) { /* ignore */ }
        try { art.destroy(); } catch (_) { /* ignore */ }
      }
      if (liveArtPlayer === art) liveArtPlayer = null;
      if (liveHlsPlayer === hls) liveHlsPlayer = null;
    };

    // 先停掉页面上可能残留的旧媒体（切视频/复用播放窗时尤其关键）
    silenceAllPageMedia();
    teardownPlayer(artInstanceRef.current, hlsInstanceRef.current);
    artInstanceRef.current = null;
    hlsInstanceRef.current = null;

    lastPlaybackEndedAtRef.current = 0;

    const emitPlaybackEnded = (source) => {
      const now = Date.now();
      if (now - lastPlaybackEndedAtRef.current < 800) return;
      lastPlaybackEndedAtRef.current = now;
      isPlayingRef.current = false;
      try {
        console.log('WTV_PLAY_LOG', 'player.ended', { source });
        if (typeof window !== 'undefined' && window.electronAPI?.wtvRendererLog) {
          window.electronAPI.wtvRendererLog('player.ended', { source });
        }
      } catch (_) { /* ignore */ }
      if (onEndedRef.current) {
        onEndedRef.current();
      }
    };

    const isHLS = url.toLowerCase().includes('.m3u8') || url.toLowerCase().includes('hls');
    const HlsClass = Hls || (typeof window !== 'undefined' && window.Hls);

    // 只有在 HLS 流时才强制依赖 Hls.js，普通 MP4 等不受影响
    if (isHLS && !HlsClass) {
      console.error('Hls 未定义，无法播放 HLS 视频');
      if (onErrorRef.current) onErrorRef.current(new Error('HLS 库未加载'));
      return;
    }

    const art = new Artplayer({
      container: container.current,
      url,
      // 代理地址形如 /api/proxy-m3u8/s/tv?url=...index.m3u8，路径本身无 .m3u8 后缀。
      // ArtPlayer 默认用 getExt(url)（会先去掉 query）推断类型，会误判并直接把 m3u8 赋给
      // video.src，Chromium 无法原生播放 → "The element has no supported sources"。
      // 显式 type 才能命中下方 customType.m3u8，走 Hls.js。
      type: isHLS ? 'm3u8' : undefined,
      autoplay: playing,
      volume,
      muted,
      // 使用自定义设置面板里的「播放速度」selector，而不是内置内联文字
      playbackRate: false,
      theme: '#7f5af0',
      autoSize: true,
      autoMini: true,
      screenshot: true,
      setting: true,
      hotkey: true,
      pip: true,
      mutex: true,
      // 关闭 ArtPlayer 内置原生全屏（会走 HTML Fullscreen / 窗口全屏）。
      // 全屏由业务层 CSS 全屏 + 下方自定义按钮接管。
      fullscreen: false,
      fullscreenWeb: false,
      // 只保留底部主进度条，关闭顶部迷你进度条，避免出现两个进度条
      miniProgressBar: false,
      backdrop: true,
      playsInline: true,
      whitelist: ['*'],
      moreVideoAttr: {
        'webkit-playsinline': true,
        'playsinline': true,
      },
      // ─── HLS 自定义类型处理
      customType: isHLS ? {
        m3u8: function (video, src) {
          if (HlsClass.isSupported && HlsClass.isSupported()) {
            let fatalNetRetries = 0;
            let fatalMediaRetries = 0;
            let hardRecoverCount = 0;
            let lastFragAt = Date.now();
            let lastMediaTime = 0;
            let lastMediaAdvanceAt = Date.now();
            let recovering = false;
            let hls = null;
            let freezeWatchTimer = null;

            const resetFatalCounters = () => {
              fatalNetRetries = 0;
              fatalMediaRetries = 0;
            };

            const buildHlsConfig = () => {
              return {
                // ─── 核心：根据 blockAdEnabled 决定是否使用过滤 Loader（与 LunaTV 完全一致）
                loader: blockAdEnabledRef.current
                  ? CustomHlsJsLoader
                  : HlsClass.DefaultConfig.loader,
                // Electron 下 Worker 偶发静默停住后不再拉分片，主线程更稳
                enableWorker: false,
                lowLatencyMode: false,
                backBufferLength: 30,
                // 600s 缓冲过大，容易占满 MSE / 状态机异常后长期不再请求分片
                maxBufferLength: 120,
                maxMaxBufferLength: 180,
                maxBufferSize: 120 * 1000 * 1000,
                maxBufferHole: 1.5,
                highBufferWatchdogPeriod: 2,
                nudgeOffset: 0.1,
                nudgeMaxRetry: 8,
                maxFragLoadingTimeOut: 20000,
                fragLoadingTimeOut: 20000,
                manifestLoadingTimeOut: 15000,
                levelLoadingTimeOut: 15000,
                maxStarvationDelay: 4,
                // 拉流锁定最高清，不再按带宽自动降档
                ...HLS_LOCK_HIGHEST_CONFIG,
              };
            };

            const bindHlsEvents = (instance) => {
              instance.on(HlsClass.Events.FRAG_LOADING, () => {
                lastFragAt = Date.now();
              });
              instance.on(HlsClass.Events.FRAG_LOADED, () => {
                lastFragAt = Date.now();
                resetFatalCounters();
              });
              instance.on(HlsClass.Events.LEVEL_LOADED, () => {
                lastFragAt = Date.now();
              });
              instance.on(HlsClass.Events.MANIFEST_PARSED, () => {
                lockHlsHighestLevel(instance);
                resetFatalCounters();
                if (onLoadedMetadataRef.current) onLoadedMetadataRef.current();
              });
              instance.on(HlsClass.Events.LEVELS_UPDATED, () => {
                lockHlsHighestLevel(instance);
              });

              instance.on(HlsClass.Events.ERROR, (_event, data) => {
                if (!data || hlsInstanceRef.current !== instance) return;
                const ED = HlsClass.ErrorDetails;

                if (!data.fatal) {
                  if (ED) {
                    const d = data.details;
                    if (
                      d === ED.BUFFER_STALLED_ERROR ||
                      d === ED.BUFFER_SEEK_OVER_HOLE ||
                      d === ED.FRAG_LOAD_ERROR ||
                      d === ED.FRAG_LOAD_TIMEOUT ||
                      d === ED.LEVEL_LOAD_ERROR ||
                      d === ED.LEVEL_LOAD_TIMEOUT
                    ) {
                      console.warn('WTV HLS non-fatal → softRecover', d);
                      softRecover(instance, d === ED.BUFFER_STALLED_ERROR);
                    }
                  }
                  return;
                }

                switch (data.type) {
                  case HlsClass.ErrorTypes.NETWORK_ERROR:
                    fatalNetRetries += 1;
                    if (fatalNetRetries <= 3) {
                      console.warn('WTV HLS fatal network → startLoad', fatalNetRetries, data.details);
                      try { instance.startLoad(); } catch (_) { /* ignore */ }
                    } else if (fatalNetRetries <= 5) {
                      console.warn('WTV HLS fatal network → reloadSource', fatalNetRetries);
                      try {
                        const t = video.currentTime || 0;
                        instance.loadSource(src);
                        instance.startLoad(t > 1 ? t - 0.3 : -1);
                      } catch (_) { /* ignore */ }
                    } else {
                      // 旧逻辑这里 destroy 后不再拉流，必须重启 App；改为硬恢复重建实例
                      console.error('WTV HLS fatal network → hardRecover', data.details);
                      hardRecover('fatal-network');
                    }
                    break;
                  case HlsClass.ErrorTypes.MEDIA_ERROR:
                    fatalMediaRetries += 1;
                    if (fatalMediaRetries <= 3) {
                      console.warn('WTV HLS fatal media → recoverMediaError', fatalMediaRetries);
                      try { instance.recoverMediaError(); } catch (_) { /* ignore */ }
                    } else {
                      console.error('WTV HLS fatal media → hardRecover', data.details);
                      hardRecover('fatal-media');
                    }
                    break;
                  default:
                    console.error('WTV HLS fatal other → hardRecover', data.type, data.details);
                    hardRecover('fatal-other');
                }
              });
            };

            const softRecover = (instance, withRateGate = true) => {
              if (!instance || hlsInstanceRef.current !== instance) return;
              try {
                instance.stopLoad();
              } catch (_) { /* ignore */ }
              try {
                instance.startLoad();
              } catch (_) { /* ignore */ }
              if (withRateGate) {
                try { rateGateControllerRef.current?.onStall?.(); } catch (_) { /* ignore */ }
              }
            };

            // 硬恢复：销毁并重建 HLS（保留当前进度）。解决「无拉流、只有重启 App 才好」的卡死态
            const hardRecover = (reason) => {
              if (recovering) return;
              if (hlsInstanceRef.current && hls && hlsInstanceRef.current !== hls) return;
              hardRecoverCount += 1;
              if (hardRecoverCount > 4) {
                console.error('WTV HLS hardRecover 次数过多，上报错误', reason);
                resetFatalCounters();
                if (onErrorRef.current) {
                  onErrorRef.current(new Error(`HLS 播放中断，请重试 (${reason})`));
                }
                return;
              }
              recovering = true;
              const resumeAt = Math.max(0, (video.currentTime || 0) - 0.5);
              const shouldPlay = !video.paused && isPlayingRef.current;
              console.warn('WTV HLS hardRecover', { reason, resumeAt, hardRecoverCount });

              try {
                if (hls) {
                  destroyHlsInstance(hls);
                  if (liveHlsPlayer === hls) liveHlsPlayer = null;
                }
              } catch (_) { /* ignore */ }

              try {
                hls = new HlsClass(buildHlsConfig());
                hlsInstanceRef.current = hls;
                liveHlsPlayer = hls;
                video.hls = hls;
                bindHlsEvents(hls);
                hls.loadSource(src);
                hls.attachMedia(video);
                hls.once(HlsClass.Events.MANIFEST_PARSED, () => {
                  lockHlsHighestLevel(hls);
                  try {
                    if (resumeAt > 1) video.currentTime = resumeAt;
                  } catch (_) { /* ignore */ }
                  try { hls.startLoad(resumeAt > 1 ? resumeAt : -1); } catch (_) { /* ignore */ }
                  lockHlsHighestLevel(hls);
                  if (shouldPlay) {
                    video.play().catch(() => { /* ignore */ });
                  }
                  lastFragAt = Date.now();
                  lastMediaAdvanceAt = Date.now();
                  lastMediaTime = video.currentTime || resumeAt;
                  resetFatalCounters();
                  recovering = false;
                });
                // 兜底：manifest 回调异常时也解除 recovering
                setTimeout(() => { recovering = false; }, 8000);
              } catch (err) {
                console.error('WTV HLS hardRecover 失败', err);
                recovering = false;
                if (onErrorRef.current) {
                  onErrorRef.current(new Error('HLS 恢复失败，请重试'));
                }
              }
            };

            // 冻结看门狗：应在播放但进度不动、且长时间无分片加载 → 分级恢复
            const startFreezeWatchdog = () => {
              if (freezeWatchTimer) clearInterval(freezeWatchTimer);
              freezeWatchTimer = setInterval(() => {
                if (recovering) return;
                if (!hls || hlsInstanceRef.current !== hls) return;
                if (video.error) return;
                // 用户暂停 / 未处于播放意图时不干预
                if (video.paused || !isPlayingRef.current) {
                  lastMediaAdvanceAt = Date.now();
                  lastMediaTime = video.currentTime || 0;
                  return;
                }

                const now = Date.now();
                const t = video.currentTime || 0;
                if (Math.abs(t - lastMediaTime) > 0.15) {
                  lastMediaTime = t;
                  lastMediaAdvanceAt = now;
                  // 正常推进时缓慢衰减硬恢复计数，避免偶发错误后永久敏感
                  if (hardRecoverCount > 0 && now - lastFragAt < 5000) {
                    hardRecoverCount = Math.max(0, hardRecoverCount - 1);
                  }
                  return;
                }

                const frozenFor = now - lastMediaAdvanceAt;
                const noFragFor = now - lastFragAt;
                const ahead = getForwardBufferSeconds(video);

                // 已有足够前方缓冲但仍不动：优先 media 恢复（可能是解码/卡洞）
                if (frozenFor >= 2500 && ahead >= 2) {
                  console.warn('WTV HLS freeze(with buffer) → recoverMediaError', { frozenFor, ahead });
                  try { rateGateControllerRef.current?.onStall?.(); } catch (_) { /* ignore */ }
                  try { hls.recoverMediaError(); } catch (_) { /* ignore */ }
                  try { video.currentTime = t + 0.05; } catch (_) { /* ignore */ }
                  lastMediaAdvanceAt = now;
                  return;
                }

                // 无缓冲 + 无分片：典型「卡住且没有拉流」
                if (frozenFor >= 2200 && ahead < 1.2) {
                  try { rateGateControllerRef.current?.onStall?.(); } catch (_) { /* ignore */ }
                  if (noFragFor >= 6000 || frozenFor >= 8000) {
                    hardRecover(noFragFor >= 6000 ? 'watchdog-no-frag' : 'watchdog-frozen');
                    return;
                  }
                  if (frozenFor >= 4000) {
                    console.warn('WTV HLS freeze → reloadSource', { frozenFor, noFragFor, ahead });
                    try {
                      hls.loadSource(src);
                      hls.startLoad(t > 1 ? t - 0.3 : -1);
                    } catch (_) {
                      softRecover(hls, false);
                    }
                    lastFragAt = now;
                    return;
                  }
                  console.warn('WTV HLS freeze → softRecover', { frozenFor, noFragFor, ahead });
                  softRecover(hls, true);
                }
              }, 1000);
            };

            hls = new HlsClass(buildHlsConfig());
            hlsInstanceRef.current = hls;
            liveHlsPlayer = hls;
            hls.loadSource(src);
            hls.attachMedia(video);
            // 将 hls 实例挂到 video 元素上，兼容 VideoDetail.js 中的检测逻辑
            video.hls = hls;
            bindHlsEvents(hls);
            startFreezeWatchdog();

            // 播放中途缓冲跟不上：stalled / waiting 时续拉，并通知倍速门控临时降速
            const stallState = { waitingTimer: null };
            const recoverFromBufferStall = () => {
              if (video.error) return;
              if (!hls || hlsInstanceRef.current !== hls) return;
              console.warn('WTV HLS video stalled/waiting → softRecover');
              softRecover(hls, true);
            };
            const onStalled = () => recoverFromBufferStall();
            const onWaiting = () => {
              if ((Number(currentPlaybackRateRef.current) || 1) > 1.01) {
                try { rateGateControllerRef.current?.onStall?.(); } catch (_) { /* ignore */ }
              }
              if (stallState.waitingTimer) clearTimeout(stallState.waitingTimer);
              stallState.waitingTimer = setTimeout(() => {
                stallState.waitingTimer = null;
                if (video.error) return;
                if (video.readyState < 3) recoverFromBufferStall();
              }, 1200);
            };
            video.addEventListener('stalled', onStalled);
            video.addEventListener('waiting', onWaiting);
            video._wtvStallRecovery = {
              teardown: () => {
                if (freezeWatchTimer) {
                  clearInterval(freezeWatchTimer);
                  freezeWatchTimer = null;
                }
                if (stallState.waitingTimer) {
                  clearTimeout(stallState.waitingTimer);
                  stallState.waitingTimer = null;
                }
                video.removeEventListener('stalled', onStalled);
                video.removeEventListener('waiting', onWaiting);
              },
            };

          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari 原生 HLS
            video.src = src;
            if (onLoadedMetadataRef.current) {
              video.addEventListener('loadedmetadata', onLoadedMetadataRef.current, { once: true });
            }
          } else {
            if (onErrorRef.current) onErrorRef.current(new Error('浏览器不支持 HLS 播放'));
          }
        },
      } : undefined,
      play: () => {
        isPlayingRef.current = true;
        if (onPlayRef.current) onPlayRef.current();
      },
      pause: () => {
        isPlayingRef.current = false;
        if (onPauseRef.current) onPauseRef.current();
      },
      ended: () => {
        emitPlaybackEnded('artplayer');
      },
      error: (err) => {
        console.error('ArtPlayer 错误:', err);
        if (onErrorRef.current) onErrorRef.current(err);
      },
    });

    if (liveArtPlayer && liveArtPlayer !== art) {
      try { liveArtPlayer.pause(); } catch (_) { /* ignore */ }
      try { liveArtPlayer.destroy(); } catch (_) { /* ignore */ }
    }
    liveArtPlayer = art;

    // ─── 在 ready 事件中统一完成视频元素事件绑定和设置面板初始化
    const handleReady = () => {
      artInstanceRef.current = art;

      if (art.video) {
        art.video.style.objectFit = videoFitMode;
        art.video.controls = false;
        art.video.removeAttribute('controls');

        // 恢复音量/静音；倍速走下方缓冲门控（避免连播下一集立刻高倍速把缓冲抽干）
        art.volume = currentVolumeRef.current;
        art.muted = currentMutedRef.current;

        const ensureSpeedIndicator = () => {
          if (!art.container) return null;
          let indicator = art.container.querySelector('.wtv-speed-indicator');
          if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'wtv-speed-indicator';
            art.container.appendChild(indicator);
          }
          return indicator;
        };

        const syncSpeedIndicator = (rate) => {
          const indicator = ensureSpeedIndicator();
          if (!indicator) return;
          const numericRate = Number(rate) || 1;
          if (numericRate !== 1) {
            hasActivatedSpeedIndicatorRef.current = true;
          }
          if (hasActivatedSpeedIndicatorRef.current) {
            indicator.textContent = `${numericRate}x`;
            indicator.classList.add('is-visible');
          } else {
            indicator.textContent = '';
            indicator.classList.remove('is-visible');
          }
        };
        syncSpeedIndicatorRef.current = syncSpeedIndicator;
        syncSpeedIndicator(currentPlaybackRateRef.current);

        // 缓冲感知倍速控制器
        if (rateGateControllerRef.current?.destroy) {
          try { rateGateControllerRef.current.destroy(); } catch (_) { /* ignore */ }
        }
        const createRateGateController = (videoEl) => {
          let monitorTimer = null;
          let destroyed = false;
          let throttled = false;

          const setEffectiveRate = (rate) => {
            if (destroyed || !videoEl) return;
            const next = Number(rate) || 1;
            if (Math.abs((videoEl.playbackRate || 1) - next) < 0.01) return;
            isRateGatingRef.current = true;
            try { art.playbackRate = next; } catch (_) { /* ignore */ }
            try { videoEl.playbackRate = next; } catch (_) { /* ignore */ }
            // ratechange 可能同步触发，下一 macrotask 再清标志更稳
            setTimeout(() => {
              isRateGatingRef.current = false;
            }, 0);
          };

          const evaluate = () => {
            if (destroyed || !videoEl || !document.contains(videoEl)) return;
            const target = Number(currentPlaybackRateRef.current) || 1;
            // ≤1x 不需要门控，直接应用（含 0.5 / 0.75）
            if (target <= 1.01) {
              throttled = false;
              setEffectiveRate(target);
              return;
            }
            const ahead = getForwardBufferSeconds(videoEl);
            const applyMin = RATE_GATE.applyMinBuffer * Math.min(1.5, target);
            const keepMin = RATE_GATE.keepMinBuffer * Math.min(1.25, target);
            const restoreMin = RATE_GATE.restoreMinBuffer * Math.min(1.5, target);

            if (!throttled) {
              // 起播阶段：缓冲不够先保持 1x
              if ((videoEl.playbackRate || 1) <= 1.01 && ahead < applyMin) {
                setEffectiveRate(1);
                return;
              }
              if (ahead < keepMin) {
                throttled = true;
                console.warn('WTV rateGate → throttle to 1x', { ahead, target });
                setEffectiveRate(1);
                return;
              }
              setEffectiveRate(target);
              return;
            }

            // 已降速：缓冲恢复后再拉回目标倍速
            if (ahead >= restoreMin && videoEl.readyState >= 3) {
              throttled = false;
              console.warn('WTV rateGate → restore', { ahead, target });
              setEffectiveRate(target);
            } else {
              setEffectiveRate(1);
            }
          };

          const startMonitor = () => {
            if (monitorTimer || destroyed) return;
            monitorTimer = setInterval(evaluate, RATE_GATE.monitorMs);
          };

          const stopMonitor = () => {
            if (monitorTimer) {
              clearInterval(monitorTimer);
              monitorTimer = null;
            }
          };

          return {
            setTarget: (rate) => {
              currentPlaybackRateRef.current = Number(rate) || 1;
              throttled = false;
              evaluate();
              startMonitor();
            },
            onStall: () => {
              const target = Number(currentPlaybackRateRef.current) || 1;
              if (target <= 1.01) return;
              throttled = true;
              setEffectiveRate(1);
              startMonitor();
            },
            destroy: () => {
              destroyed = true;
              stopMonitor();
            },
          };
        };

        const rateGate = createRateGateController(art.video);
        rateGateControllerRef.current = rateGate;
        // 目标 >1x 时先 1x 起播，等缓冲；=1x 则直接应用
        const initialTarget = Number(currentPlaybackRateRef.current) || 1;
        if (initialTarget > 1.01) {
          isRateGatingRef.current = true;
          try { art.playbackRate = 1; } catch (_) { /* ignore */ }
          art.video.playbackRate = 1;
          setTimeout(() => { isRateGatingRef.current = false; }, 0);
        }
        rateGate.setTarget(initialTarget);

        // 恢复切换去广告前的播放进度
        if (pendingResumeRef.current !== null) {
          const t = pendingResumeRef.current;
          pendingResumeRef.current = null;
          art.video.addEventListener('canplay', function seekOnce() {
            if (t > 0) art.seek = t;
            art.video.removeEventListener('canplay', seekOnce);
          }, { once: true });
        }

        // ─── 时间更新：同时触发 onTimeUpdate 和 onProgress（保证进度保存频率）
        // 同时执行片头/片尾跳过检测（与 LunaTV video:timeupdate 逻辑一致）
        const handleTimeUpdate = () => {
          const currentTime = art.video.currentTime;
          const dur = art.video.duration;

          // ── 片头/片尾跳过检测（1.5s 节流，与 LunaTV 一致）
          const cfg = skipConfigRef.current;
          if (cfg.enable) {
            const now = Date.now();
            if (now - lastSkipCheckRef.current >= 1500) {
              lastSkipCheckRef.current = now;

              // 跳过片头：当前播放时间在片头范围内 → seek 到片头结束点
              if (cfg.intro_time > 0 && currentTime < cfg.intro_time) {
                art.seek = cfg.intro_time;
                art.notice.show = `已跳过片头 (${formatSkipTime(cfg.intro_time)})`;
              }

              // 跳过片尾：当前时间超过片尾触发点 → 切下一集或触发 onEnded
              if (
                cfg.outro_time < 0 &&
                dur > 0 &&
                currentTime > dur + cfg.outro_time
              ) {
                art.notice.show = `已跳过片尾`;
                if (onNextEpisodeRef.current) {
                  onNextEpisodeRef.current();
                } else if (onEndedRef.current) {
                  onEndedRef.current();
                }
              }
            }
          }

          if (onTimeUpdateRef.current) onTimeUpdateRef.current({ currentTime, duration: dur });
          if (onProgressRef.current) {
            onProgressRef.current({
              playedSeconds: currentTime,
              played: currentTime,
              loaded: art.video.buffered.length > 0 ? art.video.buffered.end(0) : 0,
              loadedSeconds: art.video.buffered.length > 0 ? art.video.buffered.end(0) : 0,
            });
          }
        };

        const handleProgress = () => {
          if (onProgressRef.current) {
            onProgressRef.current({
              playedSeconds: art.video.currentTime,
              played: art.video.currentTime,
              loaded: art.video.buffered.length > 0 ? art.video.buffered.end(0) : 0,
              loadedSeconds: art.video.buffered.length > 0 ? art.video.buffered.end(0) : 0,
            });
          }
        };

        const handleVolumeChange = () => {
          currentVolumeRef.current = art.video.volume;
          currentMutedRef.current = art.video.muted;
          if (onVolumeChangeRef.current) onVolumeChangeRef.current(art.video.volume, art.video.muted);
        };

        const handleRateChange = () => {
          // 门控临时降速/升速不写回父组件，避免把用户目标倍速覆盖成 1x
          if (isRateGatingRef.current) {
            if (syncSpeedIndicatorRef.current) {
              syncSpeedIndicatorRef.current(currentPlaybackRateRef.current);
            }
            return;
          }
          const newRate = art.video.playbackRate;
          if (syncSpeedIndicatorRef.current) {
            syncSpeedIndicatorRef.current(newRate);
          }
          if (Math.abs((currentPlaybackRateRef.current || 1) - newRate) > 0.01) {
            currentPlaybackRateRef.current = newRate;
            if (onRateChangeRef.current) onRateChangeRef.current(newRate);
          }
        };

        const handleSeeked = () => {
          if (onSeekRef.current) onSeekRef.current(art.video.currentTime);
        };

        const handleVideoEnded = () => {
          emitPlaybackEnded('video');
        };

        art.video.addEventListener('timeupdate', handleTimeUpdate);
        art.video.addEventListener('progress', handleProgress);
        art.video.addEventListener('volumechange', handleVolumeChange);
        art.video.addEventListener('ratechange', handleRateChange);
        art.video.addEventListener('seeked', handleSeeked);
        art.video.addEventListener('ended', handleVideoEnded);

        art.video._artPlayerHandlers = {
          timeupdate: handleTimeUpdate,
          progress: handleProgress,
          volumechange: handleVolumeChange,
          ratechange: handleRateChange,
          seeked: handleSeeked,
          ended: handleVideoEnded,
        };
      }

      // ─── 播放速度选择器（selector 下拉菜单，比内置行内文字更直观）
      try {
        const speedList = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        art.setting.add({
          name: 'speed',
          html: '播放速度',
          tooltip: `${currentPlaybackRateRef.current === 1 ? '正常' : currentPlaybackRateRef.current + 'x'}`,
          selector: speedList.map(v => ({
            html: v === 1 ? '正常' : `${v}x`,
            value: v,
            default: v === currentPlaybackRateRef.current,
          })),
          onSelect: function (item) {
            const rate = item.value;
            currentPlaybackRateRef.current = rate;
            if (syncSpeedIndicatorRef.current) {
              syncSpeedIndicatorRef.current(rate);
            }
            if (rateGateControllerRef.current?.setTarget) {
              rateGateControllerRef.current.setTarget(rate);
            } else {
              try { art.playbackRate = rate; } catch (_) { /* ignore */ }
              if (art.video) art.video.playbackRate = rate;
            }
            if (onRateChangeRef.current) onRateChangeRef.current(rate);
            return item.html;
          },
        });
      } catch (e) {
        console.error('ArtPlayer 播放速度设置项初始化失败:', e);
      }

      // ─── 在 ArtPlayer 设置菜单中添加"去广告"开关（参考 LunaTV 设置菜单逻辑）
      // 用户可在播放器内随时切换；切换后销毁并重建播放器以使新 loader 生效
      try {
        art.setting.add({
          name: '去广告',
          html: '去广告',
          tooltip: blockAdEnabledRef.current ? '已开启' : '已关闭',
          switch: blockAdEnabledRef.current,
          onSwitch: function (item) {
            const newVal = !item.switch;
            // 保存当前播放进度，重建后恢复
            pendingResumeRef.current = art.currentTime || 0;
            // 持久化到 localStorage（与 LunaTV enable_blockad 键名一致）
            try { localStorage.setItem('enable_blockad', String(newVal)); } catch (_) { /* ignore */ }
            // 更新 ref（立即生效，避免闭包读旧值）
            blockAdEnabledRef.current = newVal;
            // 更新 state → 触发 useEffect([url, blockAdEnabled]) → 重建播放器
            setBlockAdEnabled(newVal);
            return newVal;
          },
        });
      } catch (e) {
        console.error('ArtPlayer 去广告设置项初始化失败:', e);
      }

      // ─── 原生设置面板：全屏
      try {
        art.setting.add({
          name: 'wtv-fullscreen',
          html: '全屏',
          tooltip: isFullscreenRef.current ? '退出全屏' : '进入全屏',
          onClick: async function () {
            if (onToggleFullscreenRef.current) {
              await onToggleFullscreenRef.current();
            }
            return isFullscreenRef.current ? '退出全屏' : '进入全屏';
          },
        });
      } catch (e) {
        console.error('ArtPlayer 全屏设置项初始化失败:', e);
      }

      // ─── 原生设置面板：画中画
      try {
        art.setting.add({
          name: 'wtv-pip',
          html: '画中画',
          tooltip: pictureInPictureEnabledRef.current
            ? (isPictureInPictureRef.current ? '退出画中画' : '进入画中画')
            : '当前环境不支持',
          onClick: async function () {
            if (!pictureInPictureEnabledRef.current) {
              art.notice.show = '当前环境不支持画中画';
              return '不可用';
            }
            if (onTogglePictureInPictureRef.current) {
              await onTogglePictureInPictureRef.current();
            }
            return isPictureInPictureRef.current ? '退出画中画' : '进入画中画';
          },
        });
      } catch (e) {
        console.error('ArtPlayer 画中画设置项初始化失败:', e);
      }

      // ─── 原生设置面板：自动连播
      try {
        art.setting.add({
          name: 'wtv-auto-next',
          html: '自动连播',
          tooltip: autoNextEpisodeRef.current ? '已开启' : '已关闭',
          switch: autoNextEpisodeRef.current,
          onSwitch: function (item) {
            const newVal = !item.switch;
            autoNextEpisodeRef.current = newVal;
            if (onToggleAutoNextEpisodeRef.current) {
              onToggleAutoNextEpisodeRef.current(newVal);
            }
            return newVal;
          },
        });
      } catch (e) {
        console.error('ArtPlayer 自动连播设置项初始化失败:', e);
      }

      // ─── 原生设置面板：画面显示模式
      try {
        const fitModeOptions = [
          { value: 'contain', label: '16:9' },
          { value: 'cover', label: '裁剪' },
          { value: 'fill', label: '填充' },
          { value: 'none', label: '原比例' },
        ];
        const currentFitMode = fitModeOptions.find((opt) => opt.value === videoFitModeRef.current) || fitModeOptions[0];
        art.setting.add({
          name: 'wtv-video-fit',
          html: '画面显示',
          tooltip: currentFitMode.label,
          selector: fitModeOptions.map((opt) => ({
            html: opt.label,
            value: opt.value,
            default: opt.value === videoFitModeRef.current,
          })),
          onSelect: function (item) {
            videoFitModeRef.current = item.value;
            if (onVideoFitModeChangeRef.current) {
              onVideoFitModeChangeRef.current(item.value);
            }
            return item.html;
          },
        });
      } catch (e) {
        console.error('ArtPlayer 画面显示设置项初始化失败:', e);
      }

      // ─── 非电影时，在播放按钮右侧提供“下一集”快捷按钮
      try {
        art.controls.add({
          name: 'wtv-next-episode',
          position: 'left',
          index: 11,
          html: '<span class="wtv-next-episode-btn">下一集</span>',
          tooltip: canNextEpisodeRef.current ? '播放下一集' : '已是最后一集',
          click: () => {
            if (!canNextEpisodeRef.current) {
              art.notice.show = '已经是最后一集';
              return false;
            }
            if (onNextEpisodeClickRef.current) {
              onNextEpisodeClickRef.current();
            }
            return false;
          },
          mounted: ($control) => {
            if (!$control) return;
            $control.style.display = showNextEpisodeButtonRef.current ? '' : 'none';
            if (!canNextEpisodeRef.current) {
              $control.classList.add('is-disabled');
            } else {
              $control.classList.remove('is-disabled');
            }
          },
        });
      } catch (e) {
        console.error('ArtPlayer 下一集按钮初始化失败:', e);
      }

      if (onLoadedMetadataRef.current && art.video) {
        setTimeout(() => {
          if (art.video && art.video.readyState >= 1 && onLoadedMetadataRef.current) {
            onLoadedMetadataRef.current();
          }
        }, 100);
      }

      // 自定义全屏按钮：只走业务层 CSS 全屏，绝不触发 ArtPlayer/HTML 原生全屏
      try {
        art.controls.add({
          name: 'wtv-css-fullscreen',
          position: 'right',
          index: 80,
          html: `<span class="wtv-css-fs-btn">${isFullscreenRef.current ? '退出' : '全屏'}</span>`,
          tooltip: isFullscreenRef.current ? '退出全屏' : '全屏',
          click: () => {
            if (onToggleFullscreenRef.current) {
              onToggleFullscreenRef.current();
            }
            return false;
          },
        });
      } catch (e) {
        console.error('添加 CSS 全屏按钮失败:', e);
      }

      if (onReadyRef.current) onReadyRef.current();
    };

    // 有些情况下 ready 事件可能已经触发，先检查一次
    if (art.isReady) {
      handleReady();
    } else {
      art.on('ready', handleReady);
    }

    artInstanceRef.current = art;

    return () => {
      if (rateGateControllerRef.current?.destroy) {
        try { rateGateControllerRef.current.destroy(); } catch (_) { /* ignore */ }
        rateGateControllerRef.current = null;
      }
      teardownPlayer(artInstanceRef.current, hlsInstanceRef.current);
      artInstanceRef.current = null;
      hlsInstanceRef.current = null;
      silenceAllPageMedia();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, blockAdEnabled]); // ← blockAdEnabled 变化时重建播放器（与 LunaTV 一致）

  // 同步播放状态
  useEffect(() => {
    if (!artInstanceRef.current) return;
    if (playing && artInstanceRef.current.paused) {
      artInstanceRef.current.play().catch(err => console.warn('播放失败:', err));
    } else if (!playing && !artInstanceRef.current.paused) {
      artInstanceRef.current.pause();
    }
  }, [playing]);

  // 同步音量
  useEffect(() => {
    if (artInstanceRef.current && currentVolumeRef.current !== volume) {
      artInstanceRef.current.volume = volume;
      currentVolumeRef.current = volume;
    }
  }, [volume]);

  // 同步静音
  useEffect(() => {
    if (artInstanceRef.current && currentMutedRef.current !== muted) {
      artInstanceRef.current.muted = muted;
      currentMutedRef.current = muted;
    }
  }, [muted]);

  // 同步倍速：更新目标倍速，由缓冲门控决定何时真正写到 video
  useEffect(() => {
    currentPlaybackRateRef.current = playbackRate;
    if (syncSpeedIndicatorRef.current) {
      syncSpeedIndicatorRef.current(playbackRate);
    }
    try {
      const item = artInstanceRef.current?.setting?.find?.('speed');
      if (item) item.tooltip = playbackRate === 1 ? '正常' : `${playbackRate}x`;
    } catch (_) { /* ignore */ }
    if (!artInstanceRef.current) return;
    if (rateGateControllerRef.current?.setTarget) {
      rateGateControllerRef.current.setTarget(playbackRate);
      return;
    }
    try { artInstanceRef.current.playbackRate = playbackRate; } catch (_) { /* ignore */ }
    if (artInstanceRef.current.video) {
      artInstanceRef.current.video.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // 同步“自动连播”设置项状态
  useEffect(() => {
    autoNextEpisodeRef.current = autoNextEpisode;
    if (!artInstanceRef.current) return;
    try {
      const item = artInstanceRef.current.setting?.find?.('wtv-auto-next');
      if (item) {
        item.switch = autoNextEpisode;
        item.tooltip = autoNextEpisode ? '已开启' : '已关闭';
      }
    } catch (_) { /* ignore */ }
  }, [autoNextEpisode]);

  // 同步“全屏”设置项提示与控制栏图标
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
    if (!artInstanceRef.current) return;
    try {
      const item = artInstanceRef.current.setting?.find?.('wtv-fullscreen');
      if (item) {
        item.tooltip = isFullscreen ? '退出全屏' : '进入全屏';
      }
      const control = artInstanceRef.current.controls?.find?.('wtv-css-fullscreen');
      if (control?.$ref) {
        control.$ref.innerHTML = `<span class="wtv-css-fs-btn">${isFullscreen ? '退出' : '全屏'}</span>`;
      }
      if (control) {
        control.tooltip = isFullscreen ? '退出全屏' : '全屏';
      }
    } catch (_) { /* ignore */ }
  }, [isFullscreen]);

  // 同步“画中画”设置项提示
  useEffect(() => {
    isPictureInPictureRef.current = isPictureInPicture;
    pictureInPictureEnabledRef.current = pictureInPictureEnabled;
    if (!artInstanceRef.current) return;
    try {
      const item = artInstanceRef.current.setting?.find?.('wtv-pip');
      if (item) {
        item.tooltip = pictureInPictureEnabled
          ? (isPictureInPicture ? '退出画中画' : '进入画中画')
          : '当前环境不支持';
      }
    } catch (_) { /* ignore */ }
  }, [isPictureInPicture, pictureInPictureEnabled]);

  // 同步“画面显示”设置项提示
  useEffect(() => {
    videoFitModeRef.current = videoFitMode;
    if (!artInstanceRef.current) return;
    try {
      const item = artInstanceRef.current.setting?.find?.('wtv-video-fit');
      if (item) {
        const fitModeLabelMap = {
          contain: '16:9',
          cover: '裁剪',
          fill: '填充',
          none: '原比例',
        };
        item.tooltip = fitModeLabelMap[videoFitMode] || '16:9';
      }
    } catch (_) { /* ignore */ }
  }, [videoFitMode]);

  // 同步“下一集”按钮可见性和可点击状态
  useEffect(() => {
    if (!artInstanceRef.current) return;
    const control = artInstanceRef.current.controls?.find?.('wtv-next-episode');
    if (!control || !control.$ref) return;
    control.$ref.style.display = showNextEpisodeButton ? '' : 'none';
    if (canNextEpisode) {
      control.$ref.classList.remove('is-disabled');
      control.tooltip = '播放下一集';
    } else {
      control.$ref.classList.add('is-disabled');
      control.tooltip = '已是最后一集';
    }
  }, [showNextEpisodeButton, canNextEpisode]);

  // 同步视频显示模式
  useEffect(() => {
    if (artInstanceRef.current && artInstanceRef.current.video) {
      artInstanceRef.current.video.style.objectFit = videoFitMode;
    }
  }, [videoFitMode]);

  return (
    <div
      ref={container}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );
});

MyArtPlayer.displayName = 'MyArtPlayer';
export default MyArtPlayer;
