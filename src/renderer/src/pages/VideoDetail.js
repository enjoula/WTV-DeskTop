// pages/VideoDetail.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import ReactPlayer from 'react-player';
import Hls from 'hls.js';
import { 
  fetchEpisodes, 
  fetchPlayUrl,
  selectQuality,
  setPlaybackProgress,
  clearPlaybackProgress,
  setPlayUrlFromEpisode,
  clearPlayUrl,
  clearEpisodes
} from '../store/videoSlice';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';
import { fetchCurrentUser } from '../store/authSlice';
import { toggleFavorite } from '../api/user';

const VideoDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { episodes, playUrl, playbackProgress, movies, tvShows, anime, varietyShows, documentaries, searchResults, filterResults } = useSelector(state => state.video);
  // 根据API文档，episodes包含 data (剧集列表) 和 recommendations (推荐列表)
  const { isAuthenticated, user } = useSelector(state => state.auth);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [activeSeason, setActiveSeason] = useState(1);
  const [volume, setVolume] = useState(0.75); // 默认音量75%
  const [isPlaying, setIsPlaying] = useState(true); // 默认播放状态
  const [searchTerm, setSearchTerm] = useState(''); // 剧集搜索词
  const [showActorsModal, setShowActorsModal] = useState(false); // 演员弹窗显示状态
  const [isMoviePlaying, setIsMoviePlaying] = useState(false); // 电影是否正在播放
  const [playerReady, setPlayerReady] = useState(false); // 播放器是否准备好
  const [skipConfig, setSkipConfig] = useState({ enabled: false, triggerTime: 0, targetTime: 0 }); // 快进配置：触发时间和目标时间
  const [showSkipConfig, setShowSkipConfig] = useState(false); // 是否显示快进配置UI
  const playerRef = useRef(null);
  const reactPlayerRef = useRef(null); // ReactPlayer 的 ref
  const isPlayingRef = useRef(false); // 使用 ref 来跟踪实际的播放状态，避免状态冲突
  const hasSkippedRef = useRef(false); // 跟踪是否已经执行过快进，避免重复快进

  useEffect(() => {
    // 优先使用从列表页传递过来的视频信息
    if (location.state && location.state.video) {
      console.log('使用从列表页传递的视频信息:', location.state.video);
      setVideoInfo(location.state.video);
    } else {
      // 如果没有传递，尝试从 Redux store 中查找
      const allLists = [
        ...(movies.data || []),
        ...(tvShows.data || []),
        ...(anime.data || []),
        ...(varietyShows.data || []),
        ...(documentaries.data || []),
        ...(searchResults.data || []),
        ...(filterResults.data || [])
      ];
      
      const foundVideo = allLists.find(video => 
        video.id === id || 
        video.id === String(id) || 
        String(video.id) === String(id)
      );
      
      if (foundVideo) {
        console.log('从 Redux store 中找到视频信息:', foundVideo);
        setVideoInfo(foundVideo);
      } else {
        // 如果都找不到，使用模拟数据（作为后备方案）
        console.log('未找到视频信息，使用模拟数据');
    setVideoInfo({
      id: id,
      title: "视频标题",
      description: "这是一段详细的视频描述信息，介绍视频的主要内容、剧情梗概等。让用户更好地了解视频内容。",
      cover_url: "https://via.placeholder.com/300x400",
      director: "张三",
      actors: "李四, 王五, 赵六",
      year: "2023",
      rating: "8.5",
      duration: "120分钟",
      country: "中国大陆",
      genre: "剧情/喜剧"
    });
      }
    }
  }, [id, location.state, movies.data, tvShows.data, anime.data, varietyShows.data, documentaries.data, searchResults.data, filterResults.data]);

  // 当视频ID变化时，重置播放状态
  useEffect(() => {
    setIsMoviePlaying(false);
    setPlayerReady(false);
    setSelectedEpisode(null);
    setIsPlaying(false);
    hasSkippedRef.current = false; // 重置快进状态
  }, [id]);
  
  // 当剧集变化时，重置快进状态
  useEffect(() => {
    hasSkippedRef.current = false; // 切换剧集时重置快进状态
  }, [selectedEpisode]);

  // 当播放地址准备好且正在播放时，确保自动播放
  useEffect(() => {
    if (isMoviePlaying && playUrl.url && !playUrl.loading && !playUrl.error) {
      console.log('播放地址已准备好，等待播放器初始化...');
      // 确保播放状态为 true
      setIsPlaying(true);
      
      // 延迟一点时间，确保 ReactPlayer 已经渲染
      const timer1 = setTimeout(() => {
        console.log('检查播放器状态，isPlaying:', isPlaying, 'playerReady:', playerReady);
        if (!playerReady) {
          console.log('播放器还未准备好，等待 onReady 回调');
          // 即使播放器还没准备好，也尝试直接操作 video 元素
          if (playerRef.current?.wrapper) {
            const videoElement = playerRef.current.wrapper.querySelector('video');
            if (videoElement && videoElement.paused) {
              console.log('找到 video 元素，尝试直接播放');
              videoElement.play().then(() => {
                console.log('直接播放成功');
                setIsPlaying(true);
              }).catch((err) => {
                console.error('直接播放失败:', err);
              });
            }
          }
        } else {
          console.log('播放器已准备好，确保播放状态为 true');
          setIsPlaying(true);
        }
      }, 500);
      
      // 再次尝试，给更多时间让播放器初始化
      const timer2 = setTimeout(() => {
        console.log('延迟检查播放器，尝试播放');
        console.log('playerRef.current:', playerRef.current);
        if (playerRef.current?.wrapper) {
          console.log('找到 wrapper，查找 video 元素...');
          const videoElement = playerRef.current.wrapper.querySelector('video');
          console.log('video 元素:', videoElement);
          if (videoElement) {
            console.log('video 元素状态:', {
              paused: videoElement.paused,
              readyState: videoElement.readyState,
              networkState: videoElement.networkState,
              src: videoElement.src,
              currentSrc: videoElement.currentSrc,
              currentTime: videoElement.currentTime,
              duration: videoElement.duration,
              error: videoElement.error
            });
            
            // 检查是否有错误
            if (videoElement.error) {
              console.error('video 元素有错误:', {
                code: videoElement.error.code,
                message: videoElement.error.message
              });
            }
            
            // 检查 HLS 实例
            const hlsInstance = videoElement.hls;
            console.log('HLS 实例检查:', {
              hasHls: !!hlsInstance,
              url: playUrl.url,
              isM3u8: playUrl.url?.endsWith('.m3u8')
            });
            
            // 如果是 HLS 视频但 readyState 为 0，说明还没有加载
            if (playUrl.url?.endsWith('.m3u8') && videoElement.readyState === 0) {
              console.log('HLS 视频还未加载，等待加载...');
              
              // 检查是否有 HLS 实例
              if (!hlsInstance) {
                console.log('HLS 实例不存在，尝试手动初始化');
                // 检查 Hls 是否可用（已通过 import 导入）
                if (Hls && Hls.isSupported()) {
                  console.log('创建 HLS 实例');
                  const hls = new Hls({
                    enableWorker: false,
                    debug: true,
                    xhrSetup: (xhr, url) => {
                      xhr.withCredentials = false;
                      console.log('HLS XHR 请求:', url);
                    }
                  });
                  hls.loadSource(playUrl.url);
                  hls.attachMedia(videoElement);
                  hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log('HLS manifest 解析完成，尝试播放');
                    if (videoElement.paused) {
                      videoElement.play().then(() => {
                        console.log('HLS 播放成功');
                        setIsPlaying(true);
                        if (videoElement.muted) {
                          videoElement.muted = false;
                        }
                      }).catch((err) => {
                        console.error('HLS 播放失败:', err);
                      });
                    }
                  });
                  hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('HLS 错误:', event, data);
                  });
                  videoElement.hls = hls;
                } else {
                  console.error('HLS 不支持或未加载');
                }
              } else {
                console.log('HLS 实例已存在，等待 manifest 加载');
                // 监听 manifest 解析完成事件
                hlsInstance.on(hlsInstance.constructor.Events.MANIFEST_PARSED, () => {
                  console.log('HLS manifest 解析完成（已有实例），尝试播放');
                  if (videoElement.paused) {
                    videoElement.play().then(() => {
                      console.log('HLS 播放成功（已有实例）');
                      setIsPlaying(true);
                      if (videoElement.muted) {
                        videoElement.muted = false;
                      }
                    }).catch((err) => {
                      console.error('HLS 播放失败（已有实例）:', err);
                    });
                  }
                });
              }
              
              // 同时监听 video 元素的加载事件
              const onLoadedMetadata = () => {
                console.log('video 元数据已加载，readyState:', videoElement.readyState);
                if (videoElement.paused) {
                  videoElement.play().then(() => {
                    console.log('元数据加载后播放成功');
                    setIsPlaying(true);
                    if (videoElement.muted) {
                      videoElement.muted = false;
                    }
                  }).catch((err) => {
                    console.error('元数据加载后播放失败:', err);
                  });
                }
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                videoElement.removeEventListener('canplay', onCanPlay);
              };
              const onCanPlay = () => {
                console.log('video 可以播放，readyState:', videoElement.readyState);
                if (videoElement.paused) {
                  videoElement.play().then(() => {
                    console.log('canplay 事件后播放成功');
                    setIsPlaying(true);
                    if (videoElement.muted) {
                      videoElement.muted = false;
                    }
                  }).catch((err) => {
                    console.error('canplay 事件后播放失败:', err);
                  });
                }
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                videoElement.removeEventListener('canplay', onCanPlay);
              };
              videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
              videoElement.addEventListener('canplay', onCanPlay);
            } else if (videoElement.paused) {
              console.log('延迟找到 video 元素，尝试播放');
              videoElement.play().then(() => {
                console.log('延迟播放成功');
                setIsPlaying(true);
                // 播放成功后，取消静音（如果需要）
                if (videoElement.muted) {
                  console.log('取消静音');
                  videoElement.muted = false;
                }
              }).catch((err) => {
                console.error('延迟播放失败:', err);
                console.error('错误详情:', err.message, err.name);
                // 如果播放失败，尝试静音播放
                if (!videoElement.muted) {
                  console.log('尝试静音播放');
                  videoElement.muted = true;
                  videoElement.play().then(() => {
                    console.log('静音播放成功');
                    setIsPlaying(true);
                  }).catch((err2) => {
                    console.error('静音播放也失败:', err2);
                  });
                }
              });
            } else {
              console.log('video 元素已经在播放中，currentTime:', videoElement.currentTime);
              setIsPlaying(true);
              // 如果正在播放但是静音，尝试取消静音
              if (videoElement.muted && videoElement.readyState >= 2) {
                console.log('视频正在播放但静音，尝试取消静音');
                videoElement.muted = false;
              }
            }
          } else {
            console.warn('延迟检查：未找到 video 元素');
            // 尝试从 reactPlayerRef 查找
            if (reactPlayerRef.current) {
              console.log('尝试从 reactPlayerRef 查找 video 元素');
              const playerContainer = reactPlayerRef.current.wrapper || reactPlayerRef.current;
              if (playerContainer) {
                const videoFromRef = playerContainer.querySelector?.('video') || 
                                    (playerContainer.querySelectorAll && playerContainer.querySelectorAll('video')[0]);
                if (videoFromRef) {
                  console.log('从 reactPlayerRef 找到 video 元素，尝试播放');
                  if (videoFromRef.paused) {
                    videoFromRef.play().then(() => {
                      console.log('从 reactPlayerRef 播放成功');
                      setIsPlaying(true);
                    }).catch((err) => {
                      console.error('从 reactPlayerRef 播放失败:', err);
                    });
                  }
                }
              }
            }
          }
        } else {
          console.warn('延迟检查：playerRef.current.wrapper 不存在');
        }
      }, 2000);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isMoviePlaying, playUrl.url, playUrl.loading, playUrl.error, playerReady, isPlaying]);

  useEffect(() => {
    // 获取剧集信息（电影类型不需要获取剧集）
    // 只有当videoInfo存在且不是movie类型时才获取剧集
    // 如果videoInfo还没有加载，先获取一次（后续videoInfo更新时会再次检查）
    // 获取剧集信息（包括推荐列表）
    // 即使电影类型也需要获取推荐列表，所以总是调用fetchEpisodes
    // 如果videoInfo存在且是movie类型，API应该会返回空的剧集列表但可能有推荐列表
    console.log('获取剧集和推荐信息，videoId:', id, 'videoInfo.type:', videoInfo?.type);
    dispatch(fetchEpisodes(id));
    
    // 如果用户已登录，获取用户信息（包含收藏信息）
    if (isAuthenticated) {
      dispatch(fetchCurrentUser()).then((result) => {
        // 检查当前视频是否已被收藏
        // 注意：API返回的数据结构可能是 result.payload.data 或 result.payload
        // favorites可能是数组或对象，需要根据实际API响应调整
        if (result.payload) {
          const userData = result.payload.data || result.payload;
          if (userData.favorites) {
            // 如果favorites是数组
            if (Array.isArray(userData.favorites)) {
              const isFavorited = userData.favorites.includes(id) || 
                                   userData.favorites.some(fav => fav.id === id || fav === id);
              setIsFavorite(isFavorited);
            } 
            // 如果favorites是对象（如 {videoIds: [...]}）
            else if (userData.favorites.videoIds && Array.isArray(userData.favorites.videoIds)) {
              const isFavorited = userData.favorites.videoIds.includes(id);
          setIsFavorite(isFavorited);
            }
          }
        }
      }).catch((error) => {
        console.error('获取用户信息失败:', error);
      });
    }
  }, [id, dispatch, isAuthenticated, videoInfo]);

  const handlePlay = (episodeNumber) => {
    console.log('handlePlay called with episodeNumber:', episodeNumber);
    console.log('Current video id:', id);
    setSelectedEpisode(episodeNumber);
    
    // 根据API文档，episodes接口返回的是 { list: [{ episode_number, is_new, updated_at }], recommendations: [] }
    // episodes接口不包含播放地址，需要调用 /video/play 接口获取
    // 注意：API文档中episodes参数是episode_number，不是episodeId
    const playParams = { 
      type: videoInfo?.type || 'tv', // 优先使用视频详情中的type，否则默认tv
      videoid: id, 
      episodes: episodeNumber // API文档中参数名是episodes，值是episode_number
    };
    console.log('Dispatching fetchPlayUrl with params:', playParams);
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('fetchPlayUrl result:', result);
      if (result.meta.requestStatus === 'fulfilled') {
        console.log('Play URL fetched successfully');
      } else {
        console.error('Failed to fetch play URL:', result.error);
      }
    }).catch((error) => {
      console.error('Error in fetchPlayUrl:', error);
    });
  };

  // 从指定时间开始播放
  const handlePlayFromTime = (episodeNumber, startTime) => {
    console.log('handlePlayFromTime called with episodeNumber:', episodeNumber, 'startTime:', startTime);
    setSelectedEpisode(episodeNumber);
    
    // 根据API文档，episodes接口不包含播放地址，需要调用 /video/play 接口
    const playParams = { 
      type: videoInfo?.type || 'tv',
      videoid: id, 
      episodes: episodeNumber // API文档中参数名是episodes，值是episode_number
    };
    console.log('Dispatching fetchPlayUrl with params:', playParams);
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('fetchPlayUrl result for continue watching:', result);
      if (result.meta.requestStatus === 'fulfilled') {
        console.log('Play URL fetched successfully for continue watching');
        // 设置起始播放时间
        setTimeout(() => {
          if (playerRef.current && playerRef.current.wrapper) {
            const player = playerRef.current.wrapper.querySelector('video');
            if (player) {
              player.currentTime = startTime;
            }
          }
        }, 500);
      } else {
        console.error('Failed to fetch play URL for continue watching:', result.error);
      }
    }).catch((error) => {
      console.error('Error in fetchPlayUrl for continue watching:', error);
    });
  };

  const handleQualityChange = (quality) => {
    dispatch(selectQuality(quality));
  };

  const handlePlaybackRateChange = (rate) => {
    setPlaybackRate(rate);
  };

  const handleVolumeChange = (vol) => {
    setVolume(vol);
  };

  const togglePlayPause = () => {
    console.log('togglePlayPause 被调用，当前状态:', isPlaying);
    // 直接切换播放状态，让 ReactPlayer 的 playing prop 控制
    setIsPlaying(!isPlaying);
  };

  // 处理播放进度变化
  const handleProgress = (progress) => {
    const { playedSeconds } = progress;
    setPlayedSeconds(playedSeconds);
    
    // 自动快进功能：当播放到指定时间时，自动跳转到目标时间
    if (skipConfig.enabled && skipConfig.triggerTime > 0 && skipConfig.targetTime > skipConfig.triggerTime) {
      // 检查是否到达触发时间，且还没有执行过快进
      if (playedSeconds >= skipConfig.triggerTime && !hasSkippedRef.current) {
        console.log(`自动快进：从 ${playedSeconds.toFixed(2)} 秒跳转到 ${skipConfig.targetTime} 秒`);
        hasSkippedRef.current = true; // 标记已执行快进，避免重复
        
        // 获取 video 元素并设置播放时间
        const videoElement = playerRef.current?.wrapper?.querySelector('video') || 
                            reactPlayerRef.current?.wrapper?.querySelector('video');
        if (videoElement) {
          videoElement.currentTime = skipConfig.targetTime;
          console.log(`快进成功：当前时间已设置为 ${skipConfig.targetTime} 秒`);
        } else {
          // 如果找不到 video 元素，尝试使用 ReactPlayer 的 seekTo 方法
          if (reactPlayerRef.current && reactPlayerRef.current.seekTo) {
            reactPlayerRef.current.seekTo(skipConfig.targetTime);
            console.log(`快进成功（使用 seekTo）：当前时间已设置为 ${skipConfig.targetTime} 秒`);
          } else {
            console.warn('无法执行快进：找不到 video 元素或 seekTo 方法');
          }
        }
      }
    }
    
    // 每30秒保存一次播放进度
    if (selectedEpisode && Math.floor(playedSeconds) % 30 === 0) {
      dispatch(setPlaybackProgress({
        videoId: id,
        episodeId: selectedEpisode,
        progress: playedSeconds
      }));
    }
  };

  // 视频播放完成时清除播放进度
  const handleEnded = () => {
    if (selectedEpisode) {
      dispatch(clearPlaybackProgress({
        videoId: id,
        episodeId: selectedEpisode
      }));
    }
  };

  const toggleFullscreen = () => {
    const playerElement = playerRef.current?.wrapper;
    if (!playerElement) return;

    if (!document.fullscreenElement) {
      if (playerElement.requestFullscreen) {
        playerElement.requestFullscreen();
      } else if (playerElement.mozRequestFullScreen) { /* Firefox */
        playerElement.mozRequestFullScreen();
      } else if (playerElement.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
        playerElement.webkitRequestFullscreen();
      } else if (playerElement.msRequestFullscreen) { /* IE/Edge */
        playerElement.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) { /* Firefox */
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE/Edge */
        document.msExitFullscreen();
      }
    }
  };

  // 配置自动快进：设置触发时间和目标时间
  const configureSkip = (triggerTime, targetTime) => {
    if (triggerTime >= 0 && targetTime > triggerTime) {
      setSkipConfig({
        enabled: true,
        triggerTime: triggerTime,
        targetTime: targetTime
      });
      hasSkippedRef.current = false; // 重置快进状态，允许新的快进配置生效
      console.log(`快进配置已设置：播放到 ${triggerTime} 秒时自动跳转到 ${targetTime} 秒`);
    } else {
      console.warn('快进配置无效：目标时间必须大于触发时间');
    }
  };

  // 禁用自动快进
  const disableSkip = () => {
    setSkipConfig({ enabled: false, triggerTime: 0, targetTime: 0 });
    hasSkippedRef.current = false;
    console.log('自动快进已禁用');
  };

  // 手动快进到指定时间
  const seekToTime = (targetTime) => {
    const videoElement = playerRef.current?.wrapper?.querySelector('video') || 
                        reactPlayerRef.current?.wrapper?.querySelector('video');
    if (videoElement) {
      videoElement.currentTime = targetTime;
      console.log(`手动快进到 ${targetTime} 秒`);
    } else if (reactPlayerRef.current && reactPlayerRef.current.seekTo) {
      reactPlayerRef.current.seekTo(targetTime);
      console.log(`手动快进到 ${targetTime} 秒（使用 seekTo）`);
    } else {
      console.warn('无法执行快进：找不到 video 元素或 seekTo 方法');
    }
  };

  // 处理电影播放（点击海报播放按钮）
  const handleMoviePlay = () => {
    if (!videoInfo || videoInfo.type !== 'movie') return;
    
    console.log('开始播放电影，videoId:', id);
    setIsMoviePlaying(true);
    setPlayerReady(false); // 重置播放器准备状态
    setIsPlaying(true); // 设置播放状态，准备自动播放
    
    // 调用播放接口
    const playParams = {
      type: 'movie',
      videoid: id
    };
    
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('电影播放地址获取结果:', result);
      console.log('结果payload:', result.payload);
      if (result.meta.requestStatus === 'fulfilled') {
        console.log('电影播放地址获取成功');
        // 等待 Redux state 更新后再检查
        setTimeout(() => {
          console.log('检查 playUrl state 更新...');
        }, 100);
        // 等待播放器准备好后再开始播放
        // 滚动到播放器位置
        setTimeout(() => {
          const playerElement = document.querySelector('.video-player-wrapper');
          if (playerElement) {
            playerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      } else {
        console.error('获取电影播放地址失败:', result.error);
        console.error('错误详情:', result.payload);
        setIsMoviePlaying(false);
        setPlayerReady(false);
      }
    }).catch((error) => {
      console.error('获取电影播放地址错误:', error);
      setIsMoviePlaying(false);
      setPlayerReady(false);
    });
  };

  // 播放器准备就绪回调
  const handlePlayerReady = () => {
    console.log('播放器准备就绪');
    console.log('播放URL:', playUrl.url);
    console.log('播放器类型:', playUrl.url?.endsWith('.m3u8') ? 'HLS' : '其他');
    
    setPlayerReady(true);
    // 确保播放状态为 true，让 ReactPlayer 自动播放
    setIsPlaying(true);
    
    // 延迟一点时间，确保 video 元素已经创建
    setTimeout(() => {
      // 检查 HLS.js 是否可用
      if (playUrl.url?.endsWith('.m3u8')) {
        // 对于 HLS 视频，需要等待 HLS 实例初始化
        const tryPlay = () => {
          console.log('尝试播放 - 查找 video 元素...');
          if (playerRef.current?.wrapper) {
            const videoElement = playerRef.current.wrapper.querySelector('video');
            if (videoElement) {
              console.log('找到 video 元素，状态:', {
                paused: videoElement.paused,
                readyState: videoElement.readyState,
                networkState: videoElement.networkState
              });
              
              // 检查是否有 HLS 实例
              const hlsInstance = videoElement.hls;
              console.log('HLS 实例:', hlsInstance);
              
              // 如果视频已准备好且处于暂停状态，尝试播放
              if (videoElement.readyState >= 2 && videoElement.paused) {
                console.log('视频已准备好，开始自动播放');
                videoElement.play().then(() => {
                  console.log('视频自动播放成功');
                  setIsPlaying(true);
                }).catch((err) => {
                  console.error('视频自动播放失败:', err);
                  setIsPlaying(true);
                });
                return true; // 已尝试播放
              } else if (videoElement.readyState === 0 || videoElement.readyState === 1) {
                // 等待元数据加载
                console.log('视频元数据未加载完成，等待加载...');
                const onLoadedMetadata = () => {
                  console.log('视频元数据已加载，readyState:', videoElement.readyState, '尝试播放');
                  if (videoElement.paused) {
                    videoElement.play().then(() => {
                      console.log('视频自动播放成功（元数据加载后）');
                      setIsPlaying(true);
                    }).catch((err) => {
                      console.error('视频自动播放失败（元数据加载后）:', err);
                      setIsPlaying(true);
                    });
                  }
                  videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                  videoElement.removeEventListener('canplay', onCanPlay);
                };
                const onCanPlay = () => {
                  console.log('视频可以播放，readyState:', videoElement.readyState, '尝试播放');
                  if (videoElement.paused) {
                    videoElement.play().then(() => {
                      console.log('视频自动播放成功（canplay事件后）');
                      setIsPlaying(true);
                    }).catch((err) => {
                      console.error('视频自动播放失败（canplay事件后）:', err);
                      setIsPlaying(true);
                    });
                  }
                  videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                  videoElement.removeEventListener('canplay', onCanPlay);
                };
                videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
                videoElement.addEventListener('canplay', onCanPlay);
              } else {
                // readyState 是其他值，也尝试播放
                console.log('视频 readyState:', videoElement.readyState, '尝试直接播放');
                if (videoElement.paused) {
                  videoElement.play().then(() => {
                    console.log('视频自动播放成功（直接播放）');
                    setIsPlaying(true);
                  }).catch((err) => {
                    console.error('视频自动播放失败（直接播放）:', err);
                    setIsPlaying(true);
                  });
                }
              }
            } else {
              console.warn('未找到 video 元素');
            }
          } else {
            console.warn('playerRef.current.wrapper 不存在');
          }
          return false;
        };
        
        // 立即尝试一次
        if (!tryPlay()) {
          // 如果立即尝试失败，延迟再试
          console.log('立即尝试失败，延迟重试...');
          setTimeout(() => {
            console.log('延迟 500ms 后重试');
            tryPlay();
          }, 500);
          setTimeout(() => {
            console.log('延迟 1500ms 后重试');
            tryPlay();
          }, 1500);
          setTimeout(() => {
            console.log('延迟 3000ms 后重试');
            tryPlay();
          }, 3000);
        }
      } else {
        // 非 HLS 视频，直接设置播放状态，ReactPlayer 会自动播放
        console.log('非 HLS 视频，自动开始播放');
        setIsPlaying(true);
      }
    }, 100); // 延迟 100ms 确保 video 元素已创建
    
    // 延迟检查 video 元素并等待元数据加载
    const checkVideoReady = () => {
      if (playerRef.current?.wrapper) {
        const videoElement = playerRef.current.wrapper.querySelector('video');
        if (videoElement) {
          console.log('video 元素状态:', {
            paused: videoElement.paused,
            readyState: videoElement.readyState,
            networkState: videoElement.networkState,
            src: videoElement.src,
            currentSrc: videoElement.currentSrc,
            error: videoElement.error
          });
          
          // 检查是否有错误
          if (videoElement.error) {
            console.error('视频加载错误:', {
              code: videoElement.error.code,
              message: videoElement.error.message
            });
          }
          
          // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
          if (videoElement.readyState === 0) {
            console.log('视频元数据还未加载，等待加载...');
            // 监听多个事件
            const onLoadedMetadata = () => {
              console.log('视频元数据已加载，readyState:', videoElement.readyState);
              videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
              videoElement.removeEventListener('canplay', onCanPlay);
              videoElement.removeEventListener('error', onError);
            };
            const onCanPlay = () => {
              console.log('视频可以播放，readyState:', videoElement.readyState);
              videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
              videoElement.removeEventListener('canplay', onCanPlay);
              videoElement.removeEventListener('error', onError);
            };
            const onError = (e) => {
              console.error('视频加载错误事件:', e);
              console.error('错误详情:', videoElement.error);
              videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
              videoElement.removeEventListener('canplay', onCanPlay);
              videoElement.removeEventListener('error', onError);
            };
            videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
            videoElement.addEventListener('canplay', onCanPlay);
            videoElement.addEventListener('error', onError);
          }
        } else {
          console.warn('未找到 video 元素');
        }
      }
    };
    
    // 立即检查一次
    setTimeout(checkVideoReady, 500);
    // 再检查一次，确保视频元数据加载
    setTimeout(checkVideoReady, 2000);
    setTimeout(checkVideoReady, 5000);
  };

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    try {
      // 添加动画类名以触发点击效果
      const button = document.querySelector('.favorite-button');
      if (button) {
        button.classList.add('favorite-click-animation');
        // 动画结束后移除类名
        setTimeout(() => {
          button.classList.remove('favorite-click-animation');
        }, 300);
      }
      
      const response = await toggleFavorite(id);
      // 根据API响应更新收藏状态
      if (response.data && response.data.is_favorite !== undefined) {
        setIsFavorite(response.data.is_favorite);
      } else {
        // 如果API没有返回明确状态，则切换本地状态
        setIsFavorite(!isFavorite);
      }
    } catch (err) {
      console.error('切换收藏状态失败:', err);
      // 显示错误消息给用户
      alert('操作失败，请稍后重试');
    }
  };

  // 处理点击推荐视频，切换当前详情页内容
  const handleRelatedVideoClick = (e, video) => {
    e.preventDefault();
    
    // 清除播放URL和episodes数据，确保重新加载
    dispatch(clearPlayUrl());
    dispatch(clearEpisodes());
    
    // 重置相关状态
    setVideoInfo(video);
    setSelectedEpisode(null);
    setIsPlaying(false);
    setIsMoviePlaying(false); // 重置电影播放状态
    setPlayerReady(false); // 重置播放器准备状态
    setPlayedSeconds(0);
    setSearchTerm('');
    setActiveSeason(1);
    setShowActorsModal(false);
    setIsFavorite(false);
    
    // 更新URL参数（使用replace避免历史记录堆积）
    navigate(`/video/${video.id}`, { 
      replace: true,
      state: { video } 
    });
    
    // 滚动到页面顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 获取用户的观看历史
  const getUserWatchHistory = () => {
    // 从播放进度中查找当前视频的观看历史
    if (!episodes.data || episodes.data.length === 0) return null;
    
    // 查找有播放进度的剧集
    // 根据API文档，episode对象包含 episode_number, is_new, updated_at
    for (let episode of episodes.data) {
      const episodeNumber = episode.episode_number || episode.id;
      const key = `${id}-${episodeNumber}`;
      if (playbackProgress[key] && playbackProgress[key] > 0) {
        return {
          episodeId: episodeNumber,
          episodeTitle: episode.title,
          episodeNumber: episode.episode_number || episodeNumber,
          progress: playbackProgress[key],
          totalDuration: episode.total_duration || 3600 // 默认1小时，API文档中没有此字段
        };
      }
    }
    
    return null;
  };

  const renderVideoHeader = () => {
    if (!videoInfo) return null;
    
    return (
      <div className="video-detail-header">
        <h1>{videoInfo.title}</h1>
        {(videoInfo.score || videoInfo.rating) && (
          <StarRating score={parseFloat(videoInfo.score || videoInfo.rating || 0)} />
        )}
      </div>
    );
  };

  const renderVideoContent = () => {
    if (!videoInfo) return null;
    
    // 如果是电影且正在播放，显示播放器和信息在下方
    // 即使 playUrl.url 还没有，也要显示加载状态
    if (videoInfo.type === 'movie' && isMoviePlaying) {
      // 如果正在加载播放地址
      if (playUrl.loading) {
        return (
          <div className="video-detail-content video-detail-playing">
            <div className="video-player-wrapper">
              <div className="loading-container">
                <div className="loading">获取播放地址中...</div>
              </div>
            </div>
          </div>
        );
      }
      
      // 如果获取播放地址失败
      if (playUrl.error) {
    return (
          <div className="video-detail-content video-detail-playing">
            <div className="video-player-wrapper">
              <div className="error-container">
                <div className="error-message">播放错误: {playUrl.error}</div>
                <button className="control-button" onClick={handleMoviePlay}>
                  重试
                </button>
        </div>
            </div>
          </div>
        );
      }
      
      // 如果没有播放地址，不显示播放器
      if (!playUrl.url) {
        console.log('没有播放地址，playUrl状态:', playUrl);
        return null;
      }
      
      console.log('准备渲染播放器，URL:', playUrl.url);
      console.log('URL类型:', playUrl.url.endsWith('.m3u8') ? 'HLS (.m3u8)' : '其他');
      console.log('播放状态 - isPlaying:', isPlaying, 'playerReady:', playerReady);
      
      return (
        <div className="video-detail-content video-detail-playing">
          <div className="video-player-wrapper">
            <div className="video-player-container" ref={el => {
              if (el) {
                playerRef.current = {wrapper: el};
              }
            }}>
              <ReactPlayer
                ref={reactPlayerRef}
                key={`movie-player-${id}-${playUrl.url}`}
                url={playUrl.url}
                controls
                playing={isPlaying}
                muted={true}
                light={false}
                volume={volume}
                width="100%"
                height="100%"
                playbackRate={playbackRate}
                onReady={() => {
                  console.log('ReactPlayer onReady 被调用');
                  handlePlayerReady();
                }}
                onProgress={handleProgress}
                onEnded={handleEnded}
                onError={(error, data) => {
                  console.error('播放器错误:', error);
                  console.error('播放URL:', playUrl.url);
                  console.error('错误数据:', data);
                  console.error('错误详情:', error?.target?.error);
                  if (error?.target?.error) {
                    const mediaError = error.target.error;
                    console.error('错误代码:', mediaError.code);
                    console.error('错误消息:', mediaError.message);
                  }
                  setPlayerReady(false);
                }}
                onStart={() => {
                  console.log('视频开始播放，URL:', playUrl.url);
                  setIsPlaying(true);
                  setPlayerReady(true);
                }}
                onPlay={() => {
                  console.log('视频开始播放（onPlay 事件）');
                  setIsPlaying(true);
                  setPlayerReady(true);
                }}
                onPause={() => {
                  console.log('视频暂停');
                  setIsPlaying(false);
                }}
                config={{
                  file: {
                    attributes: {
                      controlsList: 'nodownload',
                      crossOrigin: 'anonymous',
                      preload: 'auto',
                      playsInline: true
                    },
                    // 对于 .m3u8 文件，强制使用 HLS
                    forceHLS: playUrl.url?.endsWith('.m3u8') || false,
                    hlsOptions: {
                      // HLS 配置选项
                      enableWorker: false, // 禁用 Worker 可能更稳定
                      lowLatencyMode: false,
                      backBufferLength: 90,
                      maxBufferLength: 30,
                      maxMaxBufferLength: 60,
                      debug: true, // 启用调试模式以便查看详细日志
                      xhrSetup: (xhr, url) => {
                        // 允许跨域请求
                        xhr.withCredentials = false;
                        console.log('HLS XHR 请求:', url);
                        // 监听 XHR 状态
                        xhr.addEventListener('loadstart', () => {
                          console.log('HLS XHR 开始加载:', url);
                        });
                        xhr.addEventListener('load', () => {
                          console.log('HLS XHR 加载完成:', url, 'status:', xhr.status);
                        });
                        xhr.addEventListener('error', () => {
                          console.error('HLS XHR 加载失败:', url, 'status:', xhr.status);
                        });
                      },
                      // 添加错误处理
                      manifestLoadingTimeOut: 10000,
                      manifestLoadingMaxRetry: 3,
                      levelLoadingTimeOut: 10000,
                      levelLoadingMaxRetry: 3,
                      fragLoadingTimeOut: 20000,
                      fragLoadingMaxRetry: 3,
                      // 添加错误回调
                      onError: (error, data) => {
                        console.error('HLS 内部错误:', error, data);
                        console.error('错误类型:', error.type);
                        console.error('错误详情:', error.details);
                        console.error('错误致命性:', error.fatal);
                      },
                      // 添加事件监听
                      onManifestParsed: (event, data) => {
                        console.log('HLS manifest 解析完成:', data);
                      },
                      onLevelLoaded: (event, data) => {
                        console.log('HLS level 加载完成:', data);
                      },
                      onFragLoaded: (event, data) => {
                        console.log('HLS fragment 加载完成:', data.frag.url);
                      }
                    }
                  }
                }}
              />
            </div>
            {/* 快进配置面板 */}
            {(isMoviePlaying || selectedEpisode) && (
              <div className="skip-config-panel" style={{ 
                marginTop: '10px', 
                padding: '10px', 
                background: 'rgba(0, 0, 0, 0.7)', 
                borderRadius: '8px',
                color: '#fff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <button 
                    onClick={() => setShowSkipConfig(!showSkipConfig)}
                    style={{
                      padding: '6px 12px',
                      background: '#6366f1',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    {showSkipConfig ? '隐藏' : '显示'}快进配置
                  </button>
                  {skipConfig.enabled && (
                    <span style={{ fontSize: '14px' }}>
                      已配置：{skipConfig.triggerTime}秒 → {skipConfig.targetTime}秒
                    </span>
                  )}
                </div>
                {showSkipConfig && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <label style={{ fontSize: '14px', minWidth: '80px' }}>触发时间（秒）:</label>
                      <input
                        type="number"
                        id="triggerTime"
                        min="0"
                        step="1"
                        placeholder="例如：30"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          width: '100px'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <label style={{ fontSize: '14px', minWidth: '80px' }}>目标时间（秒）:</label>
                      <input
                        type="number"
                        id="targetTime"
                        min="0"
                        step="1"
                        placeholder="例如：60"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          width: '100px'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => {
                          const triggerInput = document.getElementById('triggerTime');
                          const targetInput = document.getElementById('targetTime');
                          const triggerTime = parseFloat(triggerInput?.value || 0);
                          const targetTime = parseFloat(targetInput?.value || 0);
                          if (triggerTime >= 0 && targetTime > triggerTime) {
                            configureSkip(triggerTime, targetTime);
                          } else {
                            alert('目标时间必须大于触发时间');
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        启用快进
                      </button>
                      {skipConfig.enabled && (
                        <button
                          onClick={disableSkip}
                          style={{
                            padding: '6px 12px',
                            background: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          禁用快进
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const targetInput = document.getElementById('targetTime');
                          const targetTime = parseFloat(targetInput?.value || 0);
                          if (targetTime > 0) {
                            seekToTime(targetTime);
                          } else {
                            alert('请输入目标时间');
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: '#6366f1',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        立即跳转
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="video-info-below-player">
            <h1 className="video-title-main">
              {videoInfo.title}
              <span 
                className={`title-favorite-icon ${isFavorite ? 'favorited' : ''}`}
                onClick={handleToggleFavorite}
                title={isFavorite ? '取消收藏' : '收藏'}
              >
                {isFavorite ? '❤️' : '🤍'}
              </span>
            </h1>
            
            <div className="video-meta">
              {(videoInfo.tags || videoInfo.release_date || videoInfo.year) && (
                <div className="meta-item">
                  <span className="meta-label">标签:</span>
                  <div className="meta-value tags-with-year">
                    {videoInfo.tags && (
                      <span className="tags-container">
                        {Array.isArray(videoInfo.tags) 
                          ? videoInfo.tags.map((tag, idx) => (
                              <span key={idx} className="tag">{tag}</span>
                            ))
                          : <span className="tag">{videoInfo.tags}</span>}
                      </span>
                    )}
                    {(videoInfo.release_date || videoInfo.year) && (
                      <span className="year-info">
                        {videoInfo.release_date ? videoInfo.release_date.split('-')[0] : videoInfo.year}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {videoInfo.director && (
                <div className="meta-item">
                  <span className="meta-label">导演:</span>
                  <span className="meta-value">
                    {Array.isArray(videoInfo.director) 
                      ? videoInfo.director.join(', ') 
                      : videoInfo.director}
                  </span>
                </div>
              )}
              {videoInfo.actors && (() => {
                const actorsList = Array.isArray(videoInfo.actors) 
                  ? videoInfo.actors 
                  : (typeof videoInfo.actors === 'string' ? videoInfo.actors.split(',').map(a => a.trim()) : []);
                
                const displayedActors = actorsList.slice(0, 6);
                const hasMore = actorsList.length > 6;
                
                return (
                  <div className="meta-item">
                    <span className="meta-label">演员:</span>
                    <span className="meta-value">
                      {displayedActors.join(', ')}
                      {hasMore && (
                        <>
                          <span className="more-actors-link" onClick={() => setShowActorsModal(true)}>
                            更多
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                );
              })()}
              {videoInfo.country && (
                <div className="meta-item">
                  <span className="meta-label">地区:</span>
                  <span className="meta-value">
                    {Array.isArray(videoInfo.country) 
                      ? videoInfo.country.join(', ') 
                      : videoInfo.country}
                  </span>
                </div>
              )}
            </div>
            
            <div className="video-actions">
              <button 
                className={`action-button favorite-button ${isFavorite ? 'favorited' : ''}`}
                onClick={handleToggleFavorite}
              >
                <span className="heart-icon">{isFavorite ? '❤' : '♡'}</span>
                <span className="favorite-text">{isFavorite ? '已收藏' : '收藏'}</span>
              </button>
            </div>
            
            <div className="video-description">
              <h3>剧情简介</h3>
              <p>{videoInfo.description}</p>
            </div>
          </div>
        </div>
      );
    }
    
    // 正常显示模式（未播放或非电影类型）
    return (
      <div className="video-detail-content">
        <div className="video-detail-top">
          <div className="video-poster">
            <VideoImage src={videoInfo.cover_url} alt={videoInfo.title} className="video-poster-image" />
            {(videoInfo.score || videoInfo.rating) && (
              <div className="video-rating-overlay">
                <StarRating score={parseFloat(videoInfo.score || videoInfo.rating || 0)} />
              </div>
            )}
            {/* 电影类型且未播放时显示播放按钮 */}
            {videoInfo.type === 'movie' && !isMoviePlaying && (
              <div className="video-poster-play-button" onClick={handleMoviePlay}>
                <div className="play-button-icon">▶</div>
                <div className="play-button-text">播放</div>
              </div>
            )}
          </div>
          <div className="video-info">
            <h1 className="video-title-main">
              {videoInfo.title}
              <span 
                className={`title-favorite-icon ${isFavorite ? 'favorited' : ''}`}
                onClick={handleToggleFavorite}
                title={isFavorite ? '取消收藏' : '收藏'}
              >
                {isFavorite ? '❤️' : '🤍'}
              </span>
            </h1>
            
            <div className="video-meta">
            {(videoInfo.tags || videoInfo.release_date || videoInfo.year) && (
              <div className="meta-item">
                <span className="meta-label">标签:</span>
                <div className="meta-value tags-with-year">
                  {videoInfo.tags && (
                    <span className="tags-container">
                      {Array.isArray(videoInfo.tags) 
                        ? videoInfo.tags.map((tag, idx) => (
                            <span key={idx} className="tag">{tag}</span>
                          ))
                        : <span className="tag">{videoInfo.tags}</span>}
                    </span>
                  )}
                  {(videoInfo.release_date || videoInfo.year) && (
                    <span className="year-info">
                      {videoInfo.release_date ? videoInfo.release_date.split('-')[0] : videoInfo.year}
                    </span>
                  )}
                </div>
              </div>
            )}
            {videoInfo.director && (
              <div className="meta-item">
                <span className="meta-label">导演:</span>
                <span className="meta-value">
                  {Array.isArray(videoInfo.director) 
                    ? videoInfo.director.join(', ') 
                    : videoInfo.director}
                </span>
              </div>
            )}
            {videoInfo.actors && (() => {
              // 处理演员数据：转换为数组格式
              const actorsList = Array.isArray(videoInfo.actors) 
                ? videoInfo.actors 
                : (typeof videoInfo.actors === 'string' ? videoInfo.actors.split(',').map(a => a.trim()) : []);
              
              const displayedActors = actorsList.slice(0, 6); // 只显示前6个
              const hasMore = actorsList.length > 6;
              
              return (
                <div className="meta-item">
                  <span className="meta-label">演员:</span>
                  <span className="meta-value">
                    {displayedActors.join(', ')}
                    {hasMore && (
                      <>
                        <span className="more-actors-link" onClick={() => setShowActorsModal(true)}>
                          更多
                        </span>
                      </>
                    )}
                  </span>
                </div>
              );
            })()}
            {videoInfo.country && (
              <div className="meta-item">
                <span className="meta-label">地区:</span>
                <span className="meta-value">
                  {Array.isArray(videoInfo.country) 
                    ? videoInfo.country.join(', ') 
                    : videoInfo.country}
                </span>
              </div>
            )}
            </div>
          </div>
          
          <div className="video-actions">
            <button 
              className={`action-button favorite-button ${isFavorite ? 'favorited' : ''}`}
              onClick={handleToggleFavorite}
            >
              <span className="heart-icon">{isFavorite ? '❤' : '♡'}</span>
              <span className="favorite-text">{isFavorite ? '已收藏' : '收藏'}</span>
            </button>
          </div>
        </div>
        
        <div className="video-description">
          <h3>剧情简介</h3>
          <p>{videoInfo.description}</p>
        </div>
      </div>
    );
  };

  const renderWatchHistory = () => {
    const watchHistory = getUserWatchHistory();
    
    // 只有当存在观看历史时才显示
    if (!watchHistory) return null;
    
    const progressPercentage = (watchHistory.progress / watchHistory.totalDuration) * 100;
    const watchedMinutes = (watchHistory.progress / 60).toFixed(0);
    const totalMinutes = (watchHistory.totalDuration / 60).toFixed(0);
    
    return (
      <div className="watch-history-section">
        <h2>继续观看</h2>
        <div className="continue-watching">
          <div className="continue-info">
            <div className="continue-episode">
              第{watchHistory.episodeNumber || 1}集：{watchHistory.episodeTitle || '未命名剧集'}
            </div>
            <div className="progress-details">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <div className="progress-text">
                已观看 {watchedMinutes} 分钟 / 共 {totalMinutes} 分钟
              </div>
            </div>
          </div>
          <button 
            className="action-button continue-button"
            onClick={() => handlePlayFromTime(watchHistory.episodeId, watchHistory.progress)}
          >
            继续播放
          </button>
        </div>
      </div>
    );
  };

  const renderEpisodes = () => {
    // 电影类型不显示剧集列表
    if (videoInfo && videoInfo.type === 'movie') {
      return null;
    }
    
    if (episodes.loading) return <div className="loading">加载剧集中...</div>;
    if (episodes.error) return <div className="error-message">{episodes.error}</div>;
    
    // 检查episodes.data是否存在且为数组
    if (!episodes.data || !Array.isArray(episodes.data)) {
      return <div className="error-message">暂无剧集信息</div>;
    }
    
    // 根据API文档，episode对象包含 episode_number, is_new, updated_at
    // 如果没有season字段，所有剧集都归为第1季
    const episodesBySeason = {};
    episodes.data.forEach(episode => {
      const season = episode.season || 1; // API文档中没有season字段，默认为1
      if (!episodesBySeason[season]) {
        episodesBySeason[season] = [];
      }
      episodesBySeason[season].push(episode);
    });
    
    const seasons = Object.keys(episodesBySeason).sort((a, b) => parseInt(a) - parseInt(b));
    
    // 获取当前季节的剧集并按集数排序
    const currentSeasonEpisodes = (episodesBySeason[activeSeason] || []).sort((a, b) => {
      return (a.episode_number || 0) - (b.episode_number || 0);
    });
    
    // 过滤剧集（如果需要的话）
    // 根据API文档，episode对象可能没有title字段，只有episode_number, is_new, updated_at
    const filteredEpisodes = currentSeasonEpisodes.filter(episode => {
      if (!searchTerm) return true;
      const episodeNum = episode.episode_number?.toString() || '';
      return episodeNum.includes(searchTerm);
    });
    
    return (
      <div className="episodes-section">
        <div className="section-header">
          <h2>
            剧集列表
            <span>共 {episodes.data.length} 集</span>
          </h2>
        </div>
        
        {/* 季节筛选和搜索框 */}
        <div className="episodes-controls">
          {seasons.length > 1 && (
            <div className="episode-filters">
              {seasons.map(season => (
                <button
                  key={season}
                  className={`filter-button ${activeSeason === parseInt(season) ? 'active' : ''}`}
                  onClick={() => setActiveSeason(season)}
                >
                  第{season}季
                </button>
              ))}
            </div>
          )}
          
          <div className="episode-search">
            <input
              type="text"
              placeholder="搜索剧集..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        
        <div className="episodes-container">
          {filteredEpisodes.map(episode => {
            // 根据API文档，episode对象包含 episode_number, is_new, updated_at
            const episodeNumber = episode.episode_number || episode.id;
            return (
            <div 
              key={episodeNumber} 
              className={`episode-item ${selectedEpisode === episodeNumber ? 'selected' : ''}`}
              onClick={() => handlePlay(episodeNumber)}
            >
              <div className="episode-number">第 {episode.episode_number || episodeNumber} 集</div>
              {episode.title && (
                <div className="episode-title" title={episode.title}>
                  {episode.title}
                </div>
              )}
              {episode.duration && (
                <div className="episode-duration">{episode.duration}</div>
              )}
              {episode.is_new === 1 && <span className="new-tag">新</span>}
              <span className="update-time">{episode.updated_at || episode.update_time}</span>
              
              {/* 播放进度条 */}
              {(() => {
                const progressKey = `${id}-${episodeNumber}`;
                const progress = playbackProgress[progressKey];
                // 注意：API文档中episode对象没有total_duration字段，如果需要显示进度，需要从其他地方获取
                return progress && progress > 0 && (
                <div className="episode-playback-progress">
                  <div 
                    className="episode-progress-fill" 
                      style={{ width: `${Math.min((progress / 3600) * 100, 100)}%` }}
                  ></div>
                </div>
                );
              })()}
            </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPlayer = () => {
    // video-player-section 已移除，不再渲染
      return null;
  };

  // 渲染相关推荐视频
  // 根据API文档，推荐列表从 episodes.recommendations 获取
  const renderRelatedVideos = () => {
    // 从episodes数据中获取推荐列表
    const recommendations = episodes.recommendations || [];
    
    // 调试信息
    console.log('为你推荐 - episodes:', episodes);
    console.log('为你推荐 - recommendations:', recommendations);
    console.log('为你推荐 - recommendations.length:', recommendations.length);
    console.log('为你推荐 - episodes.loading:', episodes.loading);
    
    // 如果正在加载，显示加载状态
    if (episodes.loading) {
    return (
        <div className="related-videos-section">
          <h2>为你推荐</h2>
          <div className="loading">加载推荐中...</div>
        </div>
      );
    }
    
    // 如果没有推荐数据，不显示（避免显示空内容）
    if (!recommendations || recommendations.length === 0) {
      console.warn('为你推荐 - 没有推荐数据，episodes:', episodes);
      return null;
    }
    
    return (
      <div className="related-videos-section">
        <h2>为你推荐</h2>
        <div className="related-videos-grid">
          {recommendations.map(video => (
            <div key={video.id} className="related-video-card">
              <div 
                className="related-video-link" 
                onClick={(e) => handleRelatedVideoClick(e, video)}
                style={{ cursor: 'pointer' }}
              >
              <div className="related-video-thumb">
                  <VideoImage src={video.cover_url} alt={video.title} />
                  {(video.is_update === 1 || video.is_update === true || video.is_new === 1 || video.is_new === true) && <span className="new-badge">新</span>}
                  {(video.score || video.rating) && (
                    <div className="video-rating-overlay">
                      <StarRating score={parseFloat(video.score || video.rating || 0)} />
                    </div>
            )}
          </div>
              <div className="related-video-info">
                <h3 className="related-video-title">{video.title}</h3>
                <div className="related-video-meta">
                  {video.release_date && (
                    <div className="video-release-date">
                      <span className="meta-label">上映:</span>
                      <span className="meta-value">{video.release_date}</span>
          </div>
                  )}
          </div>
          </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 渲染演员弹窗
  const renderActorsModal = () => {
    if (!videoInfo || !videoInfo.actors) return null;
    
    const actorsList = Array.isArray(videoInfo.actors) 
      ? videoInfo.actors 
      : (typeof videoInfo.actors === 'string' ? videoInfo.actors.split(',').map(a => a.trim()) : []);
    
    if (!showActorsModal) return null;
    
    return (
      <div className="actors-modal-overlay" onClick={() => setShowActorsModal(false)}>
        <div className="actors-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="actors-modal-header">
            <h3>全部演员</h3>
            <button className="actors-modal-close" onClick={() => setShowActorsModal(false)}>×</button>
              </div>
          <div className="actors-modal-body">
            <div className="actors-list-full">
              {actorsList.map((actor, index) => (
                <span key={index} className="actor-item">
                  {typeof actor === 'string' ? actor.trim() : actor}
                </span>
              ))}
                </div>
              </div>
        </div>
      </div>
    );
  };

  return (
    <div className="video-detail-page">
      {renderVideoHeader()}
      {renderVideoContent()}
      {renderWatchHistory()}
      {renderEpisodes()}
      {renderPlayer()}
      {renderRelatedVideos()}
      {renderActorsModal()}
    </div>
  );
};

export default VideoDetail;