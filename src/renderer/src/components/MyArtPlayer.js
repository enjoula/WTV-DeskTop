import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

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
  const currentPlaybackRateRef = useRef(playbackRate);
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

  // videoId 变化时重新读取对应的跳过配置
  useEffect(() => {
    videoIdRef.current = videoId;
    skipConfigRef.current = readSkipConfig(videoId);
  }, [videoId]);

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
      if (artInstanceRef.current) {
        try { artInstanceRef.current.playbackRate = rate; } catch (_) { /* ignore */ }
        if (artInstanceRef.current.video) {
          artInstanceRef.current.video.playbackRate = rate;
        }
        currentPlaybackRateRef.current = rate;
        // 同步更新设置面板速度选择器的 tooltip
        try {
          const item = artInstanceRef.current.setting?.find?.('speed');
          if (item) item.tooltip = rate === 1 ? '正常' : `${rate}x`;
        } catch (_) { /* ignore */ }
      }
    },
    getInternalPlayer: () => artInstanceRef.current,
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

    // 销毁旧实例
    if (artInstanceRef.current) {
      try { artInstanceRef.current.destroy(); } catch (_) { /* ignore */ }
      artInstanceRef.current = null;
    }
    if (hlsInstanceRef.current) {
      try { hlsInstanceRef.current.destroy(); } catch (_) { /* ignore */ }
      hlsInstanceRef.current = null;
    }

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
      fullscreen: true,
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
            const hls = new HlsClass({
              // ─── 核心：根据 blockAdEnabled 决定是否使用过滤 Loader（与 LunaTV 完全一致）
              loader: blockAdEnabledRef.current
                ? CustomHlsJsLoader          // 开启：过滤 #EXT-X-DISCONTINUITY 广告标记
                : HlsClass.DefaultConfig.loader, // 关闭：使用默认 Loader
              enableWorker: true,
              lowLatencyMode: false,
              backBufferLength: 90,
              maxBufferLength: 600,
              maxMaxBufferLength: 600,
              maxBufferSize: 600 * 1000 * 1000,
              maxBufferHole: 1.0,
              highBufferWatchdogPeriod: 2,
              nudgeOffset: 0.1,
              nudgeMaxRetry: 3,
              maxFragLoadingTimeOut: 20000,
              fragLoadingTimeOut: 20000,
              manifestLoadingTimeOut: 10000,
              levelLoadingTimeOut: 10000,
              maxStarvationDelay: 4,
              abrEwmaDefaultEstimate: 500000,
              abrBandWidthFactor: 0.95,
              abrBandWidthUpFactor: 0.7,
            });

            hlsInstanceRef.current = hls;
            hls.loadSource(src);
            hls.attachMedia(video);

            // 将 hls 实例挂到 video 元素上，兼容 VideoDetail.js 中的检测逻辑
            video.hls = hls;

            hls.on(HlsClass.Events.ERROR, function (event, data) {
              if (data.fatal) {
                switch (data.type) {
                  case HlsClass.ErrorTypes.NETWORK_ERROR:
                    hls.startLoad();
                    break;
                  case HlsClass.ErrorTypes.MEDIA_ERROR:
                    hls.recoverMediaError();
                    break;
                  default:
                    if (onErrorRef.current) onErrorRef.current(new Error(`HLS 错误: ${data.type}`));
                    hls.destroy();
                }
              }
            });

            hls.on(HlsClass.Events.MANIFEST_PARSED, function () {
              if (onLoadedMetadataRef.current) onLoadedMetadataRef.current();
            });

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

    // ─── 在 ready 事件中统一完成视频元素事件绑定和设置面板初始化
    const handleReady = () => {
      artInstanceRef.current = art;

      if (art.video) {
        art.video.style.objectFit = videoFitMode;
        art.video.controls = false;
        art.video.removeAttribute('controls');

        // 恢复音量/静音/倍速
        art.volume = currentVolumeRef.current;
        art.muted = currentMutedRef.current;
        try { art.playbackRate = currentPlaybackRateRef.current; } catch (_) { /* ignore */ }
        // 直接设置 video.playbackRate 作为双重保险
        art.video.playbackRate = currentPlaybackRateRef.current;

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
          const newRate = art.video.playbackRate;
          if (currentPlaybackRateRef.current !== newRate) {
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
            // 直接设置速度
            try { art.playbackRate = rate; } catch (_) { /* ignore */ }
            if (art.video) art.video.playbackRate = rate;
            currentPlaybackRateRef.current = rate;
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

      // 接管 ArtPlayer 原生右下角全屏按钮点击：
      // 保留按钮外观，但统一走业务层 togglePlayerFullscreen，避免 Electron 窗口全屏状态错乱。
      try {
        const nativeFullscreenControl = art.controls?.find?.('fullscreen');
        const nativeFullscreenButton = nativeFullscreenControl?.$ref;
        if (nativeFullscreenButton) {
          const hijackNativeFullscreenClick = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
              event.stopImmediatePropagation();
            }
            if (onToggleFullscreenRef.current) {
              await onToggleFullscreenRef.current();
            }
          };
          nativeFullscreenButton.addEventListener('click', hijackNativeFullscreenClick, true);
          nativeFullscreenButton._wtvFullscreenHijack = hijackNativeFullscreenClick;
        }
      } catch (e) {
        console.error('接管原生全屏按钮失败:', e);
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
      if (artInstanceRef.current && artInstanceRef.current.video) {
        const video = artInstanceRef.current.video;
        const nativeFullscreenControl = artInstanceRef.current.controls?.find?.('fullscreen');
        const nativeFullscreenButton = nativeFullscreenControl?.$ref;
        if (nativeFullscreenButton && nativeFullscreenButton._wtvFullscreenHijack) {
          nativeFullscreenButton.removeEventListener('click', nativeFullscreenButton._wtvFullscreenHijack, true);
          delete nativeFullscreenButton._wtvFullscreenHijack;
        }
        if (video._artPlayerHandlers) {
          Object.entries(video._artPlayerHandlers).forEach(([type, handler]) => {
            video.removeEventListener(type, handler);
          });
          delete video._artPlayerHandlers;
        }
        if (video.hls) {
          try { video.hls.destroy(); } catch (_) { /* ignore */ }
          video.hls = null;
        }
      }
      if (hlsInstanceRef.current) {
        try { hlsInstanceRef.current.destroy(); } catch (_) { /* ignore */ }
        hlsInstanceRef.current = null;
      }
      if (artInstanceRef.current) {
        try { artInstanceRef.current.destroy(); } catch (_) { /* ignore */ }
        artInstanceRef.current = null;
      }
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

  // 同步倍速：直接同时设置 art.playbackRate 和 video.playbackRate，确保生效
  useEffect(() => {
    if (!artInstanceRef.current) return;
    try { artInstanceRef.current.playbackRate = playbackRate; } catch (_) { /* ignore */ }
    if (artInstanceRef.current.video) {
      artInstanceRef.current.video.playbackRate = playbackRate;
    }
    currentPlaybackRateRef.current = playbackRate;
    // 同步更新设置面板速度选择器的 tooltip 显示
    try {
      const item = artInstanceRef.current.setting?.find?.('speed');
      if (item) item.tooltip = playbackRate === 1 ? '正常' : `${playbackRate}x`;
    } catch (_) { /* ignore */ }
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

  // 同步“全屏”设置项提示
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
    if (!artInstanceRef.current) return;
    try {
      const item = artInstanceRef.current.setting?.find?.('wtv-fullscreen');
      if (item) {
        item.tooltip = isFullscreen ? '退出全屏' : '进入全屏';
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
