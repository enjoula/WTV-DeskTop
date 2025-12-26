// pages/VideoDetail.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  clearEpisodes,
  setCurrentCategory
} from '../store/videoSlice';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';
import { toggleFavorite } from '../api/user';
import { fetchFavorites } from '../store/favoriteSlice';
import { logoutUser } from '../store/authSlice';
import { showTip, showCenterTip } from '../utils/tips';
import { savePlayHistory, getVideoPlayHistory, updatePlayProgress } from '../utils/playHistory';

const VideoDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { episodes, playUrl, playbackProgress, movies, tvShows, anime, varietyShows, documentaries, searchResults, filterResults, currentCategory } = useSelector(state => state.video);
  const { favorites } = useSelector(state => state.favorite || {});
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
  const [episodeOrder, setEpisodeOrder] = useState('asc'); // 正序/倒序：'asc' 正序, 'desc' 倒序
  const [activeEpisodeGroup, setActiveEpisodeGroup] = useState(0); // 当前显示的分段索引
  const [showActorsModal, setShowActorsModal] = useState(false); // 演员弹窗显示状态
  const [isMoviePlaying, setIsMoviePlaying] = useState(false); // 电影是否正在播放
  const [isEpisodePlaying, setIsEpisodePlaying] = useState(false); // 电视剧/动漫/综艺/纪录片是否正在播放
  const [playerReady, setPlayerReady] = useState(false); // 播放器是否准备好
  const [networkSpeed, setNetworkSpeed] = useState(null); // 当前网络速度（MB/s）
  const isSeekingRef = useRef(false); // 是否正在拖动播放进度
  const playerRef = useRef(null);
  const reactPlayerRef = useRef(null); // ReactPlayer 的 ref
  const isPlayingRef = useRef(false); // 使用 ref 来跟踪实际的播放状态，避免状态冲突
  const hasSkippedRef = useRef(false); // 跟踪是否已经执行过快进，避免重复快进
  const hasAutoPlayFromHistoryRef = useRef(false); // 跟踪是否已经从播放记录自动播放
  const lastSavedProgressRef = useRef(0); // 上次保存的进度（秒）

  useEffect(() => {
    // 检查是否从播放记录跳转过来
    const playHistory = location.state?.playHistory;
    const basicVideo = location.state?.video;
    
    // 合并所有视频列表（包括收藏列表）
      const allLists = [
        ...(movies.data || []),
        ...(tvShows.data || []),
        ...(anime.data || []),
        ...(varietyShows.data || []),
        ...(documentaries.data || []),
        ...(searchResults.data || []),
      ...(filterResults.data || []),
      ...(favorites.data || [])
      ];
      
    // 查找完整的视频信息
      const foundVideo = allLists.find(video => 
        video.id === id || 
        video.id === String(id) || 
        String(video.id) === String(id)
      );
      
    // 如果从播放记录跳转且只有基本信息，尝试查找完整信息
    if (playHistory && basicVideo && !foundVideo) {
      // 根据播放记录中的videoType，从对应的列表查找
      const typeMap = {
        'movies': movies.data || [],
        'tv': tvShows.data || [],
        'anime': anime.data || [],
        'tvshow': varietyShows.data || [],
        'documentary': documentaries.data || [],
        'doc': documentaries.data || []
      };
      
      const typeList = typeMap[playHistory.videoType] || [];
      const typeVideo = typeList.find(video => 
        video.id === id || 
        video.id === String(id) || 
        String(video.id) === String(id)
      );
      
      if (typeVideo) {
        console.log('从类型列表中找到视频信息:', typeVideo);
        setVideoInfo(typeVideo);
        return;
      }
      
      // 不再自动加载列表，避免不必要的接口调用
      // 如果找不到视频信息，会在后续逻辑中使用基本信息或模拟数据
    }
    
    // 优先使用从 Electron API 获取的视频数据（新窗口打开时）
    // 然后使用从列表页传递过来的视频信息，最后从 Redux store 中查找
    const loadVideoData = async () => {
      let electronVideoData = null;
      
      // 尝试从 Electron API 获取视频数据
      if (window.electronAPI && window.electronAPI.getVideoData) {
        try {
          const data = await window.electronAPI.getVideoData();
          if (data) {
            electronVideoData = data;
            console.log('从 Electron API 读取视频数据:', electronVideoData);
          }
        } catch (err) {
          console.error('从 Electron API 读取视频数据失败:', err);
        }
      }
      
      let finalVideoInfo = null;
      if (electronVideoData) {
        console.log('使用从 Electron API 读取的视频信息:', electronVideoData);
        finalVideoInfo = electronVideoData;
      } else if (basicVideo && foundVideo) {
        console.log('使用从列表页传递的完整视频信息:', foundVideo);
        finalVideoInfo = foundVideo;
      } else if (basicVideo && !foundVideo) {
        // 如果只有基本信息，先使用基本信息，但会尝试从Redux store中查找
        console.log('使用从列表页传递的基本视频信息:', basicVideo);
        finalVideoInfo = basicVideo;
      } else if (foundVideo) {
        console.log('从 Redux store 中找到视频信息:', foundVideo);
        finalVideoInfo = foundVideo;
      } else {
        // 如果都找不到，使用模拟数据（作为后备方案）
        console.log('未找到视频信息，使用模拟数据');
        finalVideoInfo = {
      id: id,
          title: basicVideo?.title || electronVideoData?.title || "视频标题",
      description: "这是一段详细的视频描述信息，介绍视频的主要内容、剧情梗概等。让用户更好地了解视频内容。",
          cover_url: basicVideo?.cover_url || basicVideo?.pic || electronVideoData?.cover_url || "https://via.placeholder.com/300x400",
      director: "张三",
      actors: "李四, 王五, 赵六",
      year: "2023",
      rating: "8.5",
      duration: "120分钟",
      country: "中国大陆",
          genre: "剧情/喜剧",
          type: playHistory?.videoType || electronVideoData?.type || 'movie'
        };
      }
    
      // 设置视频信息
      if (finalVideoInfo) {
        setVideoInfo(finalVideoInfo);
        
        // 如果从搜索页面跳转过来且没有 currentCategory，尝试从视频信息中提取
        if (!currentCategory && finalVideoInfo) {
          // 尝试从 videoInfo 中获取 type 或 category
          const videoType = finalVideoInfo.type || finalVideoInfo.category;
          if (videoType) {
            // 映射可能的类型值到标准格式
            const typeMap = {
              'movie': 'movies',
              'movies': 'movies',
              'tv': 'tv',
              'tvshow': 'tvshow',
              'anime': 'anime',
              'documentary': 'documentary',
              'doc': 'documentary'
            };
            const mappedType = typeMap[videoType.toLowerCase()] || videoType;
            console.log('从 videoInfo 设置 currentCategory:', mappedType, '原始类型:', videoType);
            dispatch(setCurrentCategory(mappedType));
          } else {
            // 如果视频信息中没有 type，尝试从搜索结果的视频中推断
            // 检查视频是否在某个分类列表中
            if (movies.data?.some(v => String(v.id) === String(id))) {
              dispatch(setCurrentCategory('movies'));
            } else if (tvShows.data?.some(v => String(v.id) === String(id))) {
              dispatch(setCurrentCategory('tv'));
            } else if (anime.data?.some(v => String(v.id) === String(id))) {
              dispatch(setCurrentCategory('anime'));
            } else if (varietyShows.data?.some(v => String(v.id) === String(id))) {
              dispatch(setCurrentCategory('tvshow'));
            } else if (documentaries.data?.some(v => String(v.id) === String(id))) {
              dispatch(setCurrentCategory('documentary'));
            }
          }
        }
      }
    };
    
    // 执行异步加载
    loadVideoData();
  }, [id, location.state, movies.data, tvShows.data, anime.data, varietyShows.data, documentaries.data, searchResults.data, filterResults.data, favorites.data, currentCategory, dispatch]);

  // 在新窗口中打开时，当视频信息加载完成后更新窗口标题
  useEffect(() => {
    if (videoInfo && videoInfo.title) {
      const searchParams = new URLSearchParams(location.search);
      const isNewWindow = searchParams.get('newWindow') === 'true';
      if (isNewWindow && window.electronAPI && window.electronAPI.updateVideoWindowTitle) {
        window.electronAPI.updateVideoWindowTitle(videoInfo.title);
      }
    }
  }, [videoInfo, location.search]);

  // 根据收藏列表设置当前视频的收藏状态
  useEffect(() => {
    if (!isAuthenticated) {
      setIsFavorite(false);
      return;
    }
    const list = favorites?.data || [];
    const inFav = list.some((v) => String(v.id) === String(id));
    setIsFavorite(inFav);
  }, [isAuthenticated, favorites, id]);

  // 当视频ID变化时，重置播放状态
  useEffect(() => {
    setIsMoviePlaying(false);
    setPlayerReady(false);
    setSelectedEpisode(null);
    setIsPlaying(false);
    hasSkippedRef.current = false; // 重置快进状态
  }, [id]);

  // 当电影播放时，锁定主内容区域滚动，避免播放过程中页面滑动
  useEffect(() => {
    const mainEl = document.querySelector('.main-content');
    if (!mainEl) return;

    const previousOverflow = mainEl.style.overflowY;

    if (isMoviePlaying) {
      mainEl.style.overflowY = 'hidden';
    } else {
      mainEl.style.overflowY = previousOverflow || '';
    }

    return () => {
      // 离开详情页或播放结束时恢复滚动
      if (mainEl) {
        mainEl.style.overflowY = previousOverflow || '';
      }
    };
  }, [isMoviePlaying]);

  // 页面卸载或离开播放页时，停止播放器并清理资源
  useEffect(() => {
    return () => {
      try {
        // 停止播放
        setIsPlaying(false);
        isPlayingRef.current = false;

        // 销毁 HLS 实例、暂停 video
        const videoElement = playerRef.current?.wrapper?.querySelector('video');
        if (videoElement) {
          if (videoElement.hls && typeof videoElement.hls.destroy === 'function') {
            videoElement.hls.destroy();
            videoElement.hls = null;
          }
          if (!videoElement.paused) {
            videoElement.pause();
          }
        }
      } catch (e) {
        console.warn('清理播放器资源时出错:', e);
      }

      // 清理播放地址与剧集缓存，避免残留状态
      dispatch(clearPlayUrl());
      dispatch(clearEpisodes());
    };
  }, [dispatch]);

  // 当电影真正开始播放且播放器就绪时，将滚动容器平滑滚动到播放器上方 10px 处
  useEffect(() => {
    if (!isMoviePlaying || !playUrl.url || playUrl.loading || playUrl.error || !playerReady) {
      return;
    }

    const mainEl = document.querySelector('.main-content');
    const playerEl = document.querySelector('.video-player-wrapper');
    if (!mainEl || !playerEl) return;

    const mainRect = mainEl.getBoundingClientRect();
    const playerRect = playerEl.getBoundingClientRect();
    const currentScrollTop = mainEl.scrollTop || 0;
    const offsetTop = playerRect.top - mainRect.top; // 播放器相对于滚动容器顶部的偏移
    const targetScrollTop = Math.max(currentScrollTop + offsetTop - 10, 0);

    mainEl.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth',
    });
  }, [isMoviePlaying, playUrl.url, playUrl.loading, playUrl.error, playerReady]);
  
  // 当剧集变化时，重置快进状态
  useEffect(() => {
    hasSkippedRef.current = false; // 切换剧集时重置快进状态
  }, [selectedEpisode]);

  // 当选中集数变化时，自动切换到对应的episode-group-tab
  useEffect(() => {
    if (selectedEpisode !== null && selectedEpisode !== undefined && episodes.data && episodes.data.length > 0) {
      // 获取当前季节的剧集并按集数排序
      const episodesBySeason = {};
      episodes.data.forEach(episode => {
        const season = episode.season || 1;
        if (!episodesBySeason[season]) {
          episodesBySeason[season] = [];
        }
        episodesBySeason[season].push(episode);
      });
      
      let currentSeasonEpisodes = (episodesBySeason[activeSeason] || []).sort((a, b) => {
        return (a.episode_number || 0) - (b.episode_number || 0);
      });
      
      // 判断是否超过20集
      const totalEpisodes = currentSeasonEpisodes.length;
      if (totalEpisodes > 20) {
        // 每20集为一组
        const episodeGroups = [];
        for (let i = 0; i < currentSeasonEpisodes.length; i += 20) {
          episodeGroups.push(currentSeasonEpisodes.slice(i, i + 20));
        }
        
        // 找到selectedEpisode所在的组
        const selectedGroupIndex = episodeGroups.findIndex(group => 
          group.some(ep => {
            const episodeNumber = ep.episode_number || ep.id;
            return episodeNumber === selectedEpisode;
          })
        );
        
        // 如果找到了对应的组，自动切换到该组
        if (selectedGroupIndex >= 0 && activeEpisodeGroup !== selectedGroupIndex) {
          setActiveEpisodeGroup(selectedGroupIndex);
        }
      }
    }
  }, [selectedEpisode, episodes.data, activeSeason]);

  // 当播放地址准备好且正在播放时，确保自动播放
  // 注意：这里刻意不依赖 isPlaying（否则用户手动暂停会被重新置为播放）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ((isMoviePlaying || isEpisodePlaying) && playUrl.url && !playUrl.loading && !playUrl.error) {
      console.log('播放地址已准备好，等待播放器初始化...');
      // 确保播放状态为 true
      setIsPlaying(true);
      
      // 延迟一点时间，确保 ReactPlayer 已经渲染
      const timer1 = setTimeout(() => {
        console.log('检查播放器状态，isPlaying:', isPlaying, 'playerReady:', playerReady);
        if (!playerReady) {
          console.log('播放器还未准备好，等待 onReady 回调');
          // 即使播放器还没准备好，也尝试直接操作 video 元素
          // 只有在不是拖动状态时才自动播放
          if (playerRef.current?.wrapper && !isSeekingRef.current) {
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
                    if (videoElement.paused && !isSeekingRef.current) {
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
                  if (videoElement.paused && !isSeekingRef.current) {
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
                if (videoElement.paused && !isSeekingRef.current) {
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
                if (videoElement.paused && !isSeekingRef.current) {
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
            } else if (videoElement.paused && !isSeekingRef.current) {
              // 只有在不是拖动状态时才自动播放
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
                if (videoFromRef && !isSeekingRef.current) {
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
  }, [isMoviePlaying, isEpisodePlaying, playUrl.url, playUrl.loading, playUrl.error, playerReady]);

  useEffect(() => {
    // 如果从搜索页面跳转过来，需要根据视频信息设置 currentCategory
    if (videoInfo && !currentCategory) {
      // 尝试从 videoInfo 中获取 type 或 category
      const videoType = videoInfo.type || videoInfo.category;
      if (videoType) {
        // 映射可能的类型值到标准格式
        const typeMap = {
          'movie': 'movies',
          'movies': 'movies',
          'tv': 'tv',
          'tvshow': 'tvshow',
          'anime': 'anime',
          'documentary': 'documentary',
          'doc': 'documentary'
        };
        const mappedType = typeMap[videoType.toLowerCase()] || videoType;
        console.log('从 videoInfo 设置 currentCategory:', mappedType);
        dispatch(setCurrentCategory(mappedType));
      }
    }
  }, [videoInfo, currentCategory, dispatch]);

  useEffect(() => {
    // 获取剧集和推荐信息
    // 只在 id 变化时调用，避免 videoInfo 变化时重复调用
    if (!id) return;
    console.log('获取剧集和推荐信息，videoId:', id);
    dispatch(fetchEpisodes(id));
  }, [id, dispatch]);

  // 从播放记录跳转时，自动选择对应的集数并开始播放
  useEffect(() => {
    const playHistory = location.state?.playHistory;
    
    // 如果已经处理过，或者没有播放记录，直接返回
    if (!playHistory || !videoInfo || hasAutoPlayFromHistoryRef.current) {
      return;
    }
    
    // 判断是否为剧集类型
    const isEpisodeType = ['tv', 'anime', 'tvshow', 'documentary', 'doc'].includes(
      playHistory.videoType || videoInfo.type
    );
    
    if (isEpisodeType && playHistory.episode !== null && playHistory.episode !== undefined) {
      // 等待episodes数据加载
      if (episodes.data && episodes.data.length > 0) {
        // 检查该集数是否存在
        const episodeExists = episodes.data.some(ep => {
          const episodeNumber = ep.episode_number || ep.id;
          return episodeNumber === playHistory.episode;
        });
        
        if (episodeExists && !selectedEpisode && !isEpisodePlaying) {
          console.log('从播放记录自动选择集数:', playHistory.episode);
          hasAutoPlayFromHistoryRef.current = true;
          // 延迟一点时间，确保组件已完全渲染
          setTimeout(() => {
            handlePlay(playHistory.episode);
          }, 300);
          }
        }
    } else if (!isEpisodeType && playHistory.episode === null && !isMoviePlaying) {
      // 电影类型，自动开始播放
      console.log('从播放记录自动播放电影');
      hasAutoPlayFromHistoryRef.current = true;
      setTimeout(() => {
        handleMoviePlay();
      }, 300);
    }
  }, [location.state, videoInfo, episodes.data, selectedEpisode, isMoviePlaying, isEpisodePlaying]);

  const handlePlay = (episodeNumber) => {
    console.log('handlePlay called with episodeNumber:', episodeNumber);
    console.log('Current video id:', id);
    setSelectedEpisode(episodeNumber);
    
    // 设置播放状态，参考电影播放逻辑
    setIsEpisodePlaying(true);
    setPlayerReady(false); // 重置播放器准备状态
    setIsPlaying(true); // 设置播放状态，准备自动播放
    // 进入播放流程时重置网速为 0，确保加载阶段有初始显示
    setNetworkSpeed(0);
    
    // 重置进度保存跟踪
    lastSavedProgressRef.current = 0;
    
    // 保存播放记录
    if (videoInfo) {
      const videoType = currentCategory || videoInfo.type || 'tv';
      savePlayHistory({
        videoId: id,
        videoTitle: videoInfo.title || videoInfo.name || '未知视频',
        videoCover: videoInfo.cover_url || videoInfo.pic || '',
        videoType: videoType,
        episode: episodeNumber,
        progress: 0,
        duration: 0
      });
    }
    
    // 根据API文档，episodes接口返回的是 { list: [{ episode_number, is_new, updated_at }], recommendations: [] }
    // episodes接口不包含播放地址，需要调用 /video/play 接口获取
    // 注意：API文档中episodes参数是episode_number，不是episodeId
    // 使用当前所在type页的类型（currentCategory），如果没有则使用videoInfo?.type，最后默认tv
    const playParams = { 
      type: currentCategory || videoInfo?.type || 'tv', // 优先使用当前页面的类型，否则使用视频详情中的type，最后默认tv
      videoid: id, 
      episodes: episodeNumber // API文档中参数名是episodes，值是episode_number
    };
    console.log('Dispatching fetchPlayUrl with params:', playParams);
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('fetchPlayUrl result:', result);
      if (result.meta.requestStatus === 'fulfilled') {
        console.log('Play URL fetched successfully');
        // 检查是否有播放记录需要续播
        const playHistory = location.state?.playHistory;
        if (playHistory && playHistory.episode === episodeNumber && playHistory.progress > 0) {
          // 延迟设置播放时间，等待播放器准备好
          setTimeout(() => {
            if (playerRef.current?.wrapper) {
              const videoElement = playerRef.current.wrapper.querySelector('video');
              if (videoElement) {
                videoElement.currentTime = playHistory.progress;
                console.log('续播到:', playHistory.progress);
              }
            }
          }, 2000);
        }
        // 等待 Redux state 更新后再检查（参考电影播放逻辑）
        setTimeout(() => {
          console.log('检查 playUrl state 更新...');
        }, 100);
      } else {
        console.error('Failed to fetch play URL:', result.error);
        setIsEpisodePlaying(false);
        setPlayerReady(false);
      }
    }).catch((error) => {
      console.error('Error in fetchPlayUrl:', error);
      setIsEpisodePlaying(false);
      setPlayerReady(false);
    });
  };

  // 切换收藏状态
  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // 记录操作前的收藏状态
    const wasFavorite = isFavorite;

    try {
      const response = await toggleFavorite(id);
      const resData = response?.data || {};
      const code = resData.code;

      if (code === 0) {
        // 成功：根据状态提示用户，并更新收藏按钮状态
        const isFavFromData =
          resData?.data?.is_favorite ??
          resData?.is_favorite;

        // 更新收藏状态
        if (typeof isFavFromData === 'boolean') {
          setIsFavorite(isFavFromData);
          // 根据状态显示相应提示
          if (isFavFromData) {
            showCenterTip('收藏成功', 1500);
          } else {
            showCenterTip('取消收藏成功', 1500);
          }
        } else {
          // 如果接口没有返回明确状态，则根据操作前状态推断
          setIsFavorite(!wasFavorite);
          if (!wasFavorite) {
            showCenterTip('收藏成功', 1500);
          } else {
            showCenterTip('取消收藏成功', 1500);
          }
        }
        // 成功后刷新收藏列表，保持"我的收藏"页同步
        // 只在非收藏页面时刷新，避免在收藏页面时重复调用
        const currentPath = window.location.hash || window.location.pathname || '';
        if (!currentPath.includes('/favorites')) {
          dispatch(fetchFavorites({ page: 1, size: 20 }));
        }
      } else if (code === 401) {
        // 401：账号在其他设备登录
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        // 延迟跳转，让用户看到提示
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        // 400：视频ID不能为空
        showCenterTip('视频ID不能为空！', 1500);
        // 页面不做任何变更
      } else if (code === 500) {
        // 500：操作过快
        showCenterTip('操作过快，请稍后重试！', 1500);
      } else {
        // 其他错误
        const errorMsg = resData.message || '操作失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
      }
    } catch (err) {
      console.error('切换收藏状态失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('视频ID不能为空！', 1500);
      } else if (code === 500) {
        showCenterTip('操作过快，请稍后重试！', 1500);
      } else {
        const errorMsg = resData.message || err?.message || '操作失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
      }
    }
  };

  // 从指定时间开始播放
  const handlePlayFromTime = (episodeNumber, startTime) => {
    console.log('handlePlayFromTime called with episodeNumber:', episodeNumber, 'startTime:', startTime);
    setSelectedEpisode(episodeNumber);
    
    // 根据API文档，episodes接口不包含播放地址，需要调用 /video/play 接口
    // 使用当前所在type页的类型（currentCategory），如果没有则使用videoInfo?.type，最后默认tv
    const playParams = { 
      type: currentCategory || videoInfo?.type || 'tv',
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
    
    // 如果正在播放，切换到暂停时，保存当前进度
    if (isPlaying && videoInfo && reactPlayerRef.current) {
      // 统一使用 currentCategory 或 videoInfo.type，根据实际视频类型判断
      // 如果都没有，根据是否有 selectedEpisode 判断：有集数的是剧集，没有的是电影
      const videoType = currentCategory || videoInfo.type || (selectedEpisode ? 'tv' : 'movie');
      // 判断是否为电影类型（movies 或 movie）
      const isMovie = videoType === 'movies' || videoType === 'movie';
      const episode = isMovie ? null : selectedEpisode;
      const duration = reactPlayerRef.current.getDuration ? reactPlayerRef.current.getDuration() : 0;
      const currentTime = reactPlayerRef.current.getCurrentTime ? reactPlayerRef.current.getCurrentTime() : playedSeconds;
      
      if (duration > 0 && currentTime > 0) {
        console.log('手动暂停时保存播放进度:', { id, episode, currentTime, duration });
        updatePlayProgress(
          id,
          episode,
          currentTime,
          duration,
          videoInfo.title || videoInfo.name || '未知视频',
          videoInfo.cover_url || videoInfo.pic || '',
          videoType
        );
      }
    }
    
    // 直接切换播放状态，让 ReactPlayer 的 playing prop 控制
    setIsPlaying(!isPlaying);
  };

  // 处理播放进度变化（当前已移除快进配置逻辑，仅保存进度）
  const handleProgress = (progress) => {
    const { playedSeconds, played } = progress;
    setPlayedSeconds(playedSeconds);
    
    // 每30秒保存一次播放进度到 Redux
    if (selectedEpisode && Math.floor(playedSeconds) % 30 === 0) {
      dispatch(setPlaybackProgress({
        videoId: id,
        episodeId: selectedEpisode,
        progress: playedSeconds
      }));
    }
    
    // 保存播放记录到本地存储
    if (videoInfo) {
      // 统一使用 currentCategory 或 videoInfo.type，根据实际视频类型判断
      // 如果都没有，根据是否有 selectedEpisode 判断：有集数的是剧集，没有的是电影
      const videoType = currentCategory || videoInfo.type || (selectedEpisode ? 'tv' : 'movie');
      // 判断是否为电影类型（movies 或 movie）
      const isMovie = videoType === 'movies' || videoType === 'movie';
      const episode = isMovie ? null : selectedEpisode;
      
      // 获取视频总时长
      let duration = 0;
      if (reactPlayerRef.current && reactPlayerRef.current.getDuration) {
        duration = reactPlayerRef.current.getDuration() || 0;
      }
      
      // 更新播放进度（每5秒保存一次，避免频繁写入）
      // 使用 ref 跟踪上次保存的进度，确保至少间隔5秒才保存
      const progressDiff = Math.abs(playedSeconds - lastSavedProgressRef.current);
      // 只要有播放进度就保存（即使 duration 暂时为 0，后续会更新）
      if (playedSeconds > 0 && (progressDiff >= 5 || lastSavedProgressRef.current === 0)) {
        lastSavedProgressRef.current = playedSeconds;
        console.log('保存播放进度:', { id, episode, playedSeconds, duration, videoType });
        updatePlayProgress(
          id, 
          episode, 
          playedSeconds, 
          duration || 0, // 如果 duration 还没有，先保存为 0，后续会更新
          videoInfo.title || videoInfo.name || '未知视频',
          videoInfo.cover_url || videoInfo.pic || '',
          videoType
        );
      }
    }
  };

  // 视频播放完成时清除播放进度，并自动播放下一集（仅限电视剧/动漫/综艺/纪录片）
  const handleEnded = () => {
    // 保存播放记录，标记为播放完成（进度设为0，从头开始）
    if (videoInfo) {
      // 统一使用 currentCategory 或 videoInfo.type，根据实际视频类型判断
      // 如果都没有，根据是否有 selectedEpisode 判断：有集数的是剧集，没有的是电影
      const videoType = currentCategory || videoInfo.type || (selectedEpisode ? 'tv' : 'movie');
      // 判断是否为电影类型（movies 或 movie）
      const isMovie = videoType === 'movies' || videoType === 'movie';
      const episode = isMovie ? null : selectedEpisode;
      
      // 获取视频总时长
      let duration = 0;
      if (reactPlayerRef.current && reactPlayerRef.current.getDuration) {
        duration = reactPlayerRef.current.getDuration() || 0;
      }
      
      // 播放完成，从头开始（进度设为0）
      savePlayHistory({
        videoId: id,
        videoTitle: videoInfo.title || videoInfo.name || '未知视频',
        videoCover: videoInfo.cover_url || videoInfo.pic || '',
        videoType: videoType,
        episode: episode,
        progress: 0, // 播放完成，从头开始
        duration: duration
      });
    }
    
    if (selectedEpisode) {
      dispatch(clearPlaybackProgress({
        videoId: id,
        episodeId: selectedEpisode
      }));
    }

    // 如果是电视剧/动漫/综艺/纪录片，自动播放下一集
    // 支持多种类型值：'documentary' 和 'doc' 都表示纪录片
    const isEpisodeType = videoInfo && (
      ['tv', 'anime', 'tvshow', 'documentary'].includes(videoInfo.type) || 
      videoInfo.type === 'doc'
    );
    if (isEpisodeType && selectedEpisode && episodes.data && episodes.data.length > 0) {
      // 获取当前季节的剧集并按集数排序
      const episodesBySeason = {};
      episodes.data.forEach(episode => {
        const season = episode.season || 1;
        if (!episodesBySeason[season]) {
          episodesBySeason[season] = [];
        }
        episodesBySeason[season].push(episode);
      });
      
      let currentSeasonEpisodes = (episodesBySeason[activeSeason] || []).sort((a, b) => {
        return (a.episode_number || 0) - (b.episode_number || 0);
      });
      
      // 根据正序/倒序调整
      if (episodeOrder === 'desc') {
        currentSeasonEpisodes = [...currentSeasonEpisodes].reverse();
      }
      
      // 找到当前集数在列表中的位置
      const currentIndex = currentSeasonEpisodes.findIndex(ep => {
        const episodeNumber = ep.episode_number || ep.id;
        return episodeNumber === selectedEpisode;
      });
      
      // 如果有下一集，自动播放
      if (currentIndex >= 0 && currentIndex < currentSeasonEpisodes.length - 1) {
        const nextEpisode = currentSeasonEpisodes[currentIndex + 1];
        const nextEpisodeNumber = nextEpisode.episode_number || nextEpisode.id;
        console.log('当前集播放完成，自动播放下一集:', nextEpisodeNumber);
        
        // 显示提示信息，告知用户正在播放下一集
        showCenterTip(`正在播放第${nextEpisodeNumber}集`, 1500);
        
        // 延迟一点时间再播放下一集，给用户一个缓冲
        setTimeout(() => {
          handlePlay(nextEpisodeNumber);
        }, 500);
      } else {
        console.log('已经是最后一集，不自动播放');
      }
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

  // 处理电影播放（点击海报播放按钮）
  const handleMoviePlay = () => {
    // 统一判断电影类型：支持 'movie' 和 'movies'
    const isMovie = videoInfo && (videoInfo.type === 'movie' || videoInfo.type === 'movies');
    if (!videoInfo || !isMovie) return;
    
    console.log('开始播放电影，videoId:', id);
    setIsMoviePlaying(true);
    setPlayerReady(false); // 重置播放器准备状态
    setIsPlaying(true); // 设置播放状态，准备自动播放
    // 进入播放流程时重置网速为 0，确保加载阶段有初始显示
    setNetworkSpeed(0);
    
    // 重置进度保存跟踪
    lastSavedProgressRef.current = 0;
    
    // 统一使用 currentCategory 或 videoInfo.type，对于电影类型使用 'movie'（API 期望的格式）
    const videoType = currentCategory || videoInfo.type;
    // 将 'movies' 转换为 'movie'（API 期望的格式）
    const apiType = videoType === 'movies' ? 'movie' : (videoType || 'movie');
    
    // 保存播放记录
    savePlayHistory({
      videoId: id,
      videoTitle: videoInfo.title || videoInfo.name || '未知视频',
      videoCover: videoInfo.cover_url || videoInfo.pic || '',
      videoType: apiType,
      episode: null,
      progress: 0,
      duration: 0
    });
    
    // 调用播放接口
    const playParams = {
      type: apiType,
      videoid: id
    };
    
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('电影播放地址获取结果:', result);
      console.log('结果payload:', result.payload);
      
      // 检查是否有播放记录需要续播
      const playHistory = location.state?.playHistory;
      if (playHistory && playHistory.episode === null && playHistory.progress > 0) {
        // 延迟设置播放时间，等待播放器准备好
        setTimeout(() => {
          if (playerRef.current?.wrapper) {
            const videoElement = playerRef.current.wrapper.querySelector('video');
            if (videoElement) {
              videoElement.currentTime = playHistory.progress;
              console.log('续播到:', playHistory.progress);
            }
          }
        }, 2000);
      }
      if (result.meta.requestStatus === 'fulfilled') {
        console.log('电影播放地址获取成功');
        // 等待 Redux state 更新后再检查（保留日志，取消自动滚动）
        setTimeout(() => {
          console.log('检查 playUrl state 更新...');
        }, 100);
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
              if (videoElement.readyState >= 2 && videoElement.paused && !isSeekingRef.current) {
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
                  if (videoElement.paused && !isSeekingRef.current) {
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
                  if (videoElement.paused && !isSeekingRef.current) {
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
                if (videoElement.paused && !isSeekingRef.current) {
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

  // 处理点击推荐视频，在新窗口打开视频详情页
  const handleRelatedVideoClick = (e, video) => {
    e.preventDefault();
    
    // 使用 Electron API 在新窗口打开视频详情页（如果窗口已存在则更新内容）
    if (window.electronAPI && window.electronAPI.openVideoWindow) {
      window.electronAPI.openVideoWindow(video.id, video);
    } else {
      // 降级处理：如果没有 Electron API，使用 navigate（开发环境可能用到）
    dispatch(clearPlayUrl());
    dispatch(clearEpisodes());
    setVideoInfo(video);
    setSelectedEpisode(null);
    setIsPlaying(false);
      setIsMoviePlaying(false);
      setPlayerReady(false);
    setPlayedSeconds(0);
    setSearchTerm('');
    setActiveSeason(1);
    setShowActorsModal(false);
    navigate(`/video/${video.id}`, { 
      replace: true,
      state: { video } 
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  // 渲染集数列表的函数
  const renderEpisodeList = () => {
    // 支持多种类型值：'documentary' 和 'doc' 都表示纪录片
    const isEpisodeType = videoInfo && (
      ['tv', 'anime', 'tvshow', 'documentary'].includes(videoInfo.type) || 
      videoInfo.type === 'doc'
    );
    
    if (!isEpisodeType || !episodes.data || episodes.data.length === 0) {
      return null;
    }

    // 获取当前季节的剧集并按集数排序
    const episodesBySeason = {};
    episodes.data.forEach(episode => {
      const season = episode.season || 1;
      if (!episodesBySeason[season]) {
        episodesBySeason[season] = [];
      }
      episodesBySeason[season].push(episode);
    });
    
    let currentSeasonEpisodes = (episodesBySeason[activeSeason] || []).sort((a, b) => {
      return (a.episode_number || 0) - (b.episode_number || 0);
    });
    
    // 根据正序/倒序调整
    if (episodeOrder === 'desc') {
      currentSeasonEpisodes = [...currentSeasonEpisodes].reverse();
    }
    
    // 判断是否超过20集
    const totalEpisodes = currentSeasonEpisodes.length;
    const shouldShowGroupTabs = totalEpisodes > 20;
    
    // 每20集为一组（仅在超过20集时使用）
    const episodeGroups = [];
    let currentGroup = [];
    
    if (shouldShowGroupTabs) {
      for (let i = 0; i < currentSeasonEpisodes.length; i += 20) {
        episodeGroups.push(currentSeasonEpisodes.slice(i, i + 20));
      }
      // 确保activeEpisodeGroup在有效范围内
      const validGroupIndex = Math.min(activeEpisodeGroup, episodeGroups.length - 1);
      currentGroup = episodeGroups[validGroupIndex] || [];
    } else {
      // 不超过20集，直接显示所有集数
      currentGroup = currentSeasonEpisodes;
    }
    
    return (
      <div className="episode-list-sidebar">
        {/* 顶部标题栏 */}
        <div className="episode-list-header">
          <h3 className="episode-list-title">选集</h3>
          <button
            className="episode-order-toggle"
            onClick={() => setEpisodeOrder(episodeOrder === 'asc' ? 'desc' : 'asc')}
            title={episodeOrder === 'asc' ? '切换为倒序' : '切换为正序'}
          >
            {episodeOrder === 'asc' ? '正序' : '倒序'} ⇄
          </button>
        </div>
        
        {/* 分段切换栏 - 仅在超过20集时显示 */}
        {shouldShowGroupTabs && (
          <div className="episode-group-tabs">
            <div className="episode-group-tabs-scroll">
              {episodeGroups.map((group, groupIndex) => {
                const startNum = group[0]?.episode_number || (groupIndex * 20 + 1);
                const endNum = group[group.length - 1]?.episode_number || (groupIndex * 20 + group.length);
                
                // 计算当前应该激活的组：如果selectedEpisode存在，找到它所在的组；否则使用activeEpisodeGroup
                let activeGroupIndex = activeEpisodeGroup;
                if (selectedEpisode !== null && selectedEpisode !== undefined) {
                  const selectedGroupIndex = episodeGroups.findIndex(group => 
                    group.some(ep => {
                      const episodeNumber = ep.episode_number || ep.id;
                      return episodeNumber === selectedEpisode;
                    })
                  );
                  if (selectedGroupIndex >= 0) {
                    activeGroupIndex = selectedGroupIndex;
                  }
                }
                
                const isActive = groupIndex === activeGroupIndex;
                // 检查该组内是否有新集数
                const hasNewEpisode = group.some(episode => 
                  episode.is_new === 1 || episode.is_new === true || 
                  episode.is_update === 1 || episode.is_update === true
                );
                
                return (
                  <button
                    key={groupIndex}
                    className={`episode-group-tab ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveEpisodeGroup(groupIndex)}
                    style={{ position: 'relative' }}
                  >
                    {startNum} - {endNum} 集
                    {hasNewEpisode && <span className="episode-group-tab-new-badge">新</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* 集数网格 */}
        <div className="episode-grid-container">
          <div className="episode-grid">
            {currentGroup.map(episode => {
              const episodeNumber = episode.episode_number || episode.id;
              const isSelected = selectedEpisode === episodeNumber;
              const episodeNumStr = String(episodeNumber).padStart(2, '0');
              const isNew = episode.is_new === 1 || episode.is_new === true || episode.is_update === 1 || episode.is_update === true;
              
              return (
                <div
                  key={episodeNumber}
                  className={`episode-list-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handlePlay(episodeNumber)}
                  title={`第${episodeNumber}集${isNew ? ' (新)' : ''}`}
                  style={{ position: 'relative' }}
                >
                  {episodeNumStr}{isSelected ? '*' : ''}
                  {isNew && <span className="episode-new-badge">新</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderVideoContent = () => {
    // 如果 videoInfo 为 null，显示加载状态而不是返回 null，避免闪烁
    if (!videoInfo) {
      return (
        <div className="video-detail-content">
          <div className="loading" style={{ padding: '40px', textAlign: 'center' }}>加载视频信息...</div>
        </div>
      );
    }
    
    // 判断是否正在播放（电影或电视剧/动漫/综艺/纪录片）
    // 支持多种类型值：'documentary' 和 'doc' 都表示纪录片
    // 统一判断电影类型：支持 'movie' 和 'movies'
    const isMovieType = videoInfo.type === 'movie' || videoInfo.type === 'movies';
    const isEpisodeType = ['tv', 'anime', 'tvshow', 'documentary'].includes(videoInfo.type) || videoInfo.type === 'doc';
    const isVideoPlaying = (isMovieType && isMoviePlaying) || 
                          (isEpisodeType && isEpisodePlaying);
    
    // 如果正在播放，显示播放器和信息在下方
    // 即使 playUrl.url 还没有，也要显示加载状态
    if (isVideoPlaying) {
      // 如果正在加载播放地址：使用与播放器相同的幕布尺寸（16:9），中间显示灰色转圈+网速
      if (playUrl.loading) {
        return (
          <div className="video-detail-content video-detail-playing">
            <div className="video-player-wrapper">
              <div className="video-player-container">
              <div className="loading-container">
                  <div className="loading">
                    {networkSpeed != null
                      ? `${networkSpeed.toFixed(2)} MB/s`
                      : '加载中...'}
                  </div>
                  <div className="network-speed">
                    {networkSpeed != null && `${networkSpeed.toFixed(2)} MB/s`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      
      // 如果获取播放地址失败：同样使用与播放器一致的幕布尺寸
      if (playUrl.error) {
    return (
          <div className="video-detail-content video-detail-playing">
            <div className="video-player-wrapper">
              <div className="video-player-container">
              <div className="error-container">
                <div className="error-message">播放错误: {playUrl.error}</div>
                  <button className="control-button" onClick={() => {
                    // 统一判断电影类型：支持 'movie' 和 'movies'
                    const isMovieType = videoInfo.type === 'movie' || videoInfo.type === 'movies';
                    if (isMovieType) {
                      handleMoviePlay();
                    } else if (selectedEpisode) {
                      handlePlay(selectedEpisode);
                    }
                  }}>
                  重试
                </button>
                </div>
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
                key={`player-${id}-${selectedEpisode || 'movie'}-${playUrl.url}`}
                url={playUrl.url}
                controls
                playing={isPlaying}
                muted={false}
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
                onSeek={(seconds) => {
                  console.log('用户开始拖动到:', seconds);
                  // 拖动时设置标志，防止自动播放逻辑干扰
                  isSeekingRef.current = true;
                }}
                onSeeked={(seconds) => {
                  console.log('用户拖动完成到:', seconds);
                  // 拖动完成后，延迟重置标志，给播放器一些时间稳定
                  setTimeout(() => {
                    isSeekingRef.current = false;
                    console.log('拖动标志已重置');
                  }, 2000); // 增加到2秒，确保播放器稳定
                }}
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
                  
                  // 暂停时保存当前播放进度
                  if (videoInfo && reactPlayerRef.current) {
                    // 统一使用 currentCategory 或 videoInfo.type，根据实际视频类型判断
                    // 如果都没有，根据是否有 selectedEpisode 判断：有集数的是剧集，没有的是电影
                    const videoType = currentCategory || videoInfo.type || (selectedEpisode ? 'tv' : 'movie');
                    // 判断是否为电影类型（movies 或 movie）
                    const isMovie = videoType === 'movies' || videoType === 'movie';
                    const episode = isMovie ? null : selectedEpisode;
                    const duration = reactPlayerRef.current.getDuration ? reactPlayerRef.current.getDuration() : 0;
                    const currentTime = reactPlayerRef.current.getCurrentTime ? reactPlayerRef.current.getCurrentTime() : playedSeconds;
                    
                    if (duration > 0 && currentTime > 0) {
                      console.log('暂停时保存播放进度:', { id, episode, currentTime, duration });
                      updatePlayProgress(
                        id,
                        episode,
                        currentTime,
                        duration,
                        videoInfo.title || videoInfo.name || '未知视频',
                        videoInfo.cover_url || videoInfo.pic || '',
                        videoType
                      );
                    }
                  }
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

                        // 网络速度统计：基于单个请求的 progress 事件估算 MB/s
                        let lastLoaded = 0;
                        let lastTime = Date.now();

                        xhr.addEventListener('progress', (event) => {
                          const now = Date.now();
                          const loaded = event.loaded || 0;
                          const deltaBytes = loaded - lastLoaded;
                          const deltaTime = (now - lastTime) / 1000; // 秒

                          if (deltaBytes > 0 && deltaTime > 0) {
                            const mbPerSec = (deltaBytes / (1024 * 1024)) / deltaTime;
                            // 简单过滤异常值
                            if (mbPerSec > 0 && mbPerSec < 200) {
                              setNetworkSpeed(mbPerSec);
                            }
                          }

                          lastLoaded = loaded;
                          lastTime = now;
                        });

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
          </div>
          <div className="video-info-below-player">
            <h1 className="video-title-main">
              {videoInfo.title}
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
            
            {/* 集数列表 - 在播放时显示在剧情简介上方 */}
            {renderEpisodeList()}
            
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
              {/* 缩略图下方收藏爱心 */}
              <div 
                className="video-poster-favorite" 
                onClick={handleToggleFavorite}
                title={isFavorite ? '取消收藏' : '收藏'}
              >
                <span className={`video-poster-favorite-icon ${isFavorite ? 'favorited' : ''}`}>
                  {isFavorite ? '❤️' : '🤍'}
                </span>
              </div>
            {/* 电影类型且未播放时显示播放按钮 */}
              {/* 统一判断电影类型：支持 'movie' 和 'movies' */}
              {(videoInfo.type === 'movie' || videoInfo.type === 'movies') && !isMoviePlaying && (
              <div className="video-poster-play-button" onClick={handleMoviePlay}>
                <div className="play-button-icon">▶</div>
              </div>
            )}
          </div>
          <div className="video-info">
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
        </div>
          
          {/* 集数列表 - 仅显示在电视剧、动漫、综艺、纪录片页面，放在缩略图和视频信息下方 */}
          {renderEpisodeList()}
        
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
      {renderPlayer()}
      {renderRelatedVideos()}
      {renderActorsModal()}
    </div>
  );
};

export default VideoDetail;