// pages/VideoDetail.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import MyArtPlayer from '../components/MyArtPlayer';
import Hls from 'hls.js';
import { 
  fetchEpisodes, 
  fetchPlayUrl,
  selectQuality,
  setPlaybackProgress,
  clearPlaybackProgress,
  clearPlayUrl,
  clearEpisodes,
  setCurrentCategory,
  searchVideoList,
  addToPlaylist
} from '../store/videoSlice';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';
import { toggleFavorite } from '../api/user';
import { logoutUser } from '../store/authSlice';
import { showCenterTip } from '../utils/tips';
import { getVideoPlayHistory, updatePlayProgress } from '../utils/playHistory';
import { getPlayerSettings, updatePlayerSetting } from '../utils/playerSettings';
import { PlaybackController } from '../utils/playbackController';
import { fetchFavorites } from '../store/favoriteSlice';

/** 播放/连播调试：控制台搜 WTV_PLAY_LOG；主进程终端也会打印（需 Electron + preload） */
function wtvPlayLog(tag, payload) {
  console.log('WTV_PLAY_LOG', tag, payload);
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.wtvRendererLog) {
      window.electronAPI.wtvRendererLog(tag, payload);
    }
  } catch (_) {
    /* ignore */
  }
}

const VideoDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const searchParams = new URLSearchParams(location.search);
  const isNewWindow = searchParams.get('newWindow') === 'true';
  // Electron 播放窗口历史上使用过两种参数：
  // - newWindow=true（当前主路径）
  // - playerWindow=true（兼容旧逻辑）
  // 统一按“任一命中即为播放器窗口”处理，避免在播放窗口内再次 openPlayerWindow 导致多开。
  const isPlayerWindow = isNewWindow || searchParams.get('playerWindow') === 'true';
  
  // 🎮 初始化播放控制器（使用 useRef 确保实例稳定）
  const playbackControllerRef = useRef(null);
  if (!playbackControllerRef.current) {
    playbackControllerRef.current = new PlaybackController();
  }
  const controller = playbackControllerRef.current;
  const { episodes, playUrl, playbackProgress, movies, tvShows, anime, varietyShows, documentaries, searchResults, filterResults, currentCategory } = useSelector(state => state.video);
  const { favorites } = useSelector(state => state.favorite || {});
  // 根据API文档，episodes包含 data (剧集列表) 和 recommendations (推荐列表)
  const { isAuthenticated } = useSelector(state => state.auth);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  // 从用户设置中初始化播放器状态
  const playerSettings = getPlayerSettings();
  const [playbackRate, setPlaybackRate] = useState(playerSettings.playbackRate);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [duration, setDuration] = useState(0); // 视频总时长（秒）
  const [activeSeason, setActiveSeason] = useState(1);
  const [volume, setVolume] = useState(playerSettings.volume);
  const [muted, setMuted] = useState(playerSettings.muted);
  const [isPlaying, setIsPlaying] = useState(playerSettings.autoplay); // 使用用户设置的自动播放偏好
  const [autoNextEpisode, setAutoNextEpisode] = useState(
    playerSettings.autoNextEpisode !== false
  );
  const [searchTerm, setSearchTerm] = useState(''); // 剧集搜索词
  const [episodeOrder, setEpisodeOrder] = useState('asc'); // 正序/倒序：'asc' 正序, 'desc' 倒序
  const [activeEpisodeGroup, setActiveEpisodeGroup] = useState(0); // 当前显示的分段索引
  const [showActorsModal, setShowActorsModal] = useState(false); // 演员弹窗显示状态
  const [isMoviePlaying, setIsMoviePlaying] = useState(false); // 电影是否正在播放
  const [isEpisodePlaying, setIsEpisodePlaying] = useState(false); // 电视剧/动漫/综艺/纪录片是否正在播放
  const [playerReady, setPlayerReady] = useState(false); // 播放器是否准备好
  const [showFullDescription, setShowFullDescription] = useState(false); // 简介展开状态
  const [isDescriptionOverflow, setIsDescriptionOverflow] = useState(false); // 简介是否超过3行
  const [videoLoadError, setVideoLoadError] = useState(null); // 视频加载错误
  const [videoLoadTimeout, setVideoLoadTimeout] = useState(false); // 视频加载超时
  const [videoFitMode, setVideoFitMode] = useState(() => {
    // 优先从统一播放器设置读取，兼容旧版本单独存储键
    const fromSettings = playerSettings.videoFitMode;
    const savedLegacy = localStorage.getItem('wtv_video_fit_mode');
    return fromSettings || savedLegacy || 'contain'; // contain: 16:9, cover: 裁剪, fill: 填充, none: 原比例
  }); // 视频显示模式：contain(16:9), cover(裁剪), fill(填充), none(原比例)
  const [isPictureInPicture, setIsPictureInPicture] = useState(false); // 画中画状态
  const [isFullscreen, setIsFullscreen] = useState(false); // 全屏状态
  const isSeekingRef = useRef(false); // 是否正在拖动播放进度
  const seekProtectionEndTimeRef = useRef(0); // 🔧 拖动保护期结束时间（毫秒），在此时间之前忽略所有播放/暂停事件
  const playerRef = useRef(null);
  const playerRefInternal = useRef(null); // ReactPlayer 的 ref
  const descriptionRef = useRef(null); // 简介文本的 ref
  const isPlayingRef = useRef(false); // 使用 ref 来跟踪实际的播放状态，避免状态冲突
  const hasSkippedRef = useRef(false); // 跟踪是否已经执行过快进，避免重复快进
  const hasAutoPlayFromHistoryRef = useRef(false); // 跟踪是否已经从播放记录自动播放
  const autoNextInFlightRef = useRef(false); // 防止自动连播重复触发
  const handleEndedDedupeRef = useRef(0); // 防止 ended 双通道重复进入 handleEnded
  const userPausedRef = useRef(false); // 标记用户是否手动暂停，避免缓冲完成后自动恢复播放
  const lastSavedProgressRef = useRef(0); // 上次保存的进度（秒）
  const lastSavedTimeRef = useRef(0); // 上次保存的时间戳（毫秒）
  
  // 辅助函数：安全地获取 video 元素
  const getVideoElement = useCallback(() => {
    try {
      // 方法1: 通过 ReactPlayer 的 getInternalPlayer 获取
      const internalPlayer = playerRefInternal.current?.getInternalPlayer?.();
      if (internalPlayer) {
        // getInternalPlayer 可能返回 video 元素本身，或者包含 video 元素的容器
        if (internalPlayer.tagName === 'VIDEO') {
          return internalPlayer;
        }
        const video = internalPlayer.querySelector?.('video');
        if (video) return video;
      }
    } catch (e) {
      console.warn('通过 getInternalPlayer 获取 video 元素失败:', e);
    }
    
    // 方法2: 从 playerRef 的 wrapper 中查找
    try {
      const video = playerRef.current?.wrapper?.querySelector?.('video');
      if (video) return video;
    } catch (e) {
      console.warn('从 playerRef wrapper 获取 video 元素失败:', e);
    }
    
    return null;
  }, []);
  const justSwitchedEpisodeRef = useRef(false); // 是否刚刚切换了集数（用于避免拖动后循环暂停播放）
  const videoLoadTimeoutRef = useRef(null); // 视频加载超时定时器
  const errorRetryRef = useRef(0); // 错误重试次数
  const formatErrorRetryTimerRef = useRef(null); // 格式错误重试定时器
  const resumeTimeRef = useRef(null); // 续播时间（秒），在播放器准备好后设置
  const seekTimeoutRef = useRef(null); // 拖动进度条的延迟定时器
  const pendingAutoPlayEpisodeRef = useRef(null); // 播放窗口待自动播放的集数
  const hasAutoPlayFromPlayerWindowRef = useRef(false); // 播放窗口是否已自动触发播放
  const handlePlayRef = useRef(null);
  const handleMoviePlayRef = useRef(null);
  const relatedVideosGridRef = useRef(null);
  const [canScrollRelatedLeft, setCanScrollRelatedLeft] = useState(false);
  const [canScrollRelatedRight, setCanScrollRelatedRight] = useState(false);

  // 规范化视频信息，确保 cover_url 和 pic 字段一致
  // 规范化视频数据，确保封面图字段一致
  const normalizeVideoInfo = (video) => {
    if (!video) return null;
    // 优先使用已有的规范化字段，如果没有，尝试各种可能的原始字段名
    let cover = video.cover_url || 
                  video.pic || 
                  video.vod_pic || 
                  video.vod_cover || 
                  video.img || 
                  video.cover || 
                  video.thumb;
                  
    // 确保 URL 协议完整且使用 https
    if (cover && typeof cover === 'string') {
      if (cover.startsWith('//')) {
        cover = 'https:' + cover;
      } else if (cover.startsWith('http:')) {
        cover = cover.replace('http:', 'https:');
      }
    }
                            
    return {
      ...video,
      // 确保 id 为字符串
      id: video.id ? String(video.id) : video.videoid || video.vod_id,
      title: video.title || video.name || video.vod_name || '未知视频',
      cover_url: cover,
      pic: cover
    };
  };

  useEffect(() => {
    if (!isPlayerWindow) {
      pendingAutoPlayEpisodeRef.current = null;
      hasAutoPlayFromPlayerWindowRef.current = false;
      return;
    }
    hasAutoPlayFromPlayerWindowRef.current = false;
    const params = new URLSearchParams(location.search);
    pendingAutoPlayEpisodeRef.current = params.get('autoplayEpisode');
  }, [id, isPlayerWindow, location.search]);

  // 统一类型映射
  const mapVideoType = (type) => {
    if (!type) return null;
    const lower = String(type).toLowerCase();
    const typeMap = {
      'movie': 'movie',
      'movies': 'movie',
      '电影': 'movie',
      'tv': 'tv',
      '电视剧': 'tv',
      'tvshow': 'tvshow',
      'variety': 'tvshow',
      '综艺': 'tvshow',
      'anime': 'anime',
      '动漫': 'anime',
      'documentary': 'doc',
      'doc': 'doc',
      '纪录片': 'doc'
    };
    return typeMap[lower] || lower;
  };

  useEffect(() => {
    // 检查是否从播放记录跳转过来
    let playHistory = location.state?.playHistory;
    const basicVideo = location.state?.video;
    
    // 如果没有通过 state 传递 playHistory，尝试从 Electron API 获取的 videoData 中读取
    if (!playHistory && basicVideo?.playHistory) {
      playHistory = basicVideo.playHistory;
      console.log('从 videoData 中获取播放记录:', playHistory);
    }
    
    // 如果还是没有，尝试从 localStorage 中读取（仅用于从播放记录页面进入的情况）
    if (!playHistory && id && location.state?.fromPlayHistory) {
      try {
        const storedHistory = getVideoPlayHistory(id);
        if (storedHistory) {
          playHistory = {
            videoId: storedHistory.videoId,
            videoTitle: storedHistory.videoTitle,
            videoCover: storedHistory.videoCover,
            videoType: storedHistory.videoType,
            episode: storedHistory.episode,
            progress: storedHistory.progress,
            duration: storedHistory.duration
          };
          console.log('从 localStorage 读取播放记录（从播放记录页面进入）:', playHistory);
        }
      } catch (error) {
        console.error('从 localStorage 读取播放记录失败:', error);
      }
    }
    
    // 合并所有视频列表（包括收藏列表），用于从 Redux store 中查找
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
      
    // 查找完整的视频信息（从 Redux store）
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
        setVideoInfo(normalizeVideoInfo(typeVideo));
        return;
      }
    }
    
    // 同步设置视频信息（优先使用可立即获取的数据）
    // 优先级：列表页传递的数据 > Redux store 中的数据
    let immediateVideoInfo = null;
    if (basicVideo) {
      // 优先使用完整的 foundVideo（如果存在），否则使用 basicVideo
      if (foundVideo && String(foundVideo.id) === String(basicVideo.id)) {
        console.log('立即使用从列表页传递的完整视频信息（从 Redux store 匹配）:', foundVideo);
        immediateVideoInfo = foundVideo;
      } else {
        console.log('立即使用从列表页传递的视频信息:', basicVideo);
        immediateVideoInfo = basicVideo;
      }
    } else if (foundVideo) {
      console.log('立即使用从 Redux store 中找到的视频信息:', foundVideo);
      immediateVideoInfo = foundVideo;
    }
    
    // 如果有可立即使用的视频信息，先设置它（避免页面空白）
    if (immediateVideoInfo) {
      setVideoInfo(normalizeVideoInfo(immediateVideoInfo));
      
      // 设置 currentCategory
      if (!currentCategory && immediateVideoInfo) {
        const videoType = immediateVideoInfo.type || immediateVideoInfo.category;
        if (videoType) {
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
    
    // 异步获取 Electron API 数据（如果存在则更新，优先级最高）
    const loadVideoDataFromElectron = async () => {
      let electronData = null;
      
      // 优先尝试从 Electron API 获取数据（从列表页新窗口打开时传递）
      if (window.electronAPI && window.electronAPI.getVideoData) {
        try {
          const data = await window.electronAPI.getVideoData();
          if (data) {
            console.log('从 Electron API 读取视频数据:', data);
            electronData = data;
            if (isPlayerWindow && data.autoPlayEpisode) {
              pendingAutoPlayEpisodeRef.current = data.autoPlayEpisode;
            }
            
            // 如果 Electron API 数据中包含 playHistory，更新 playHistory 变量
            if (data.playHistory && !playHistory) {
              playHistory = data.playHistory;
              console.log('从 Electron API 数据中获取播放记录:', playHistory);
            }
          } else {
            console.log('从 Electron API 读取的数据为空，使用之前找到的视频信息或 Redux store 中的数据');
            // 如果 Electron API 数据为空，使用之前找到的 foundVideo（已经在外部计算好了）
      if (foundVideo) {
              electronData = foundVideo;
            }
          }
        } catch (err) {
          console.error('从 Electron API 读取视频数据失败:', err);
          // 如果 Electron API 调用失败，使用之前找到的 foundVideo
          if (foundVideo) {
            electronData = foundVideo;
          }
        }
      }
      
      // 确定最终使用的视频信息
      let finalVideoInfo = null;
      
      if (electronData) {
        // 最高优先级：从 Electron API 获取的数据（或从 Redux store 中找到的数据）
        console.log('使用从 Electron API 读取的视频信息（或 Redux store 备用）:', electronData);
        finalVideoInfo = electronData;
      } else if (immediateVideoInfo) {
        // 第二优先级：同步获取的数据（列表页传递或 Redux store）
        console.log('使用同步获取的视频信息:', immediateVideoInfo);
        finalVideoInfo = immediateVideoInfo;
      } else {
        // 最后：如果都找不到，使用播放记录中的基本信息（而不是模拟数据）
        console.log('未找到完整视频信息，使用播放记录中的基本信息');
        const videoType = playHistory?.videoType || basicVideo?.type || 'movie';
        finalVideoInfo = {
      id: id,
          title: playHistory?.videoTitle || basicVideo?.title || "视频标题",
          description: "暂无简介", // 暂时显示"暂无简介"，后续可以通过搜索获取
          cover_url: playHistory?.videoCover || basicVideo?.cover_url || basicVideo?.pic || "https://via.placeholder.com/300x400",
          pic: playHistory?.videoCover || basicVideo?.cover_url || basicVideo?.pic || "https://via.placeholder.com/300x400",
          type: videoType
        };
        
        // 如果是从播放记录跳转且只有基本信息，尝试通过搜索获取完整信息
        if (playHistory && playHistory.videoTitle) {
          console.log('尝试通过搜索获取完整视频信息:', playHistory.videoTitle);
          // 使用视频标题搜索，尝试找到完整的视频信息
          dispatch(searchVideoList({ keyword: playHistory.videoTitle, page: 1, size: 10 }))
            .then((result) => {
              if (result.meta.requestStatus === 'fulfilled' && result.payload?.data) {
                // 在搜索结果中查找匹配的视频（通过ID匹配）
                const matchedVideo = result.payload.data.find(video => 
                  String(video.id) === String(id)
                );
                if (matchedVideo) {
                  console.log('通过搜索找到完整视频信息:', matchedVideo);
                  setVideoInfo(normalizeVideoInfo(matchedVideo));
                  // 更新 currentCategory
                  const mappedType = mapVideoType(matchedVideo.type || matchedVideo.category);
                  if (mappedType) {
                    dispatch(setCurrentCategory(mappedType));
                  }
                }
              }
            })
            .catch((error) => {
              console.error('搜索视频信息失败:', error);
            });
        }
      }
      
      // 设置视频信息
      if (finalVideoInfo) {
        const normalizedInfo = normalizeVideoInfo(finalVideoInfo);
        setVideoInfo(normalizedInfo);
        
        // 更新 currentCategory，覆盖旧值以避免跨视频残留
        const mappedType = mapVideoType(normalizedInfo.type || normalizedInfo.category);
        if (mappedType) {
          console.log('从 videoInfo 设置 currentCategory:', mappedType, '原始类型:', finalVideoInfo.type || finalVideoInfo.category);
            dispatch(setCurrentCategory(mappedType));
        }
      }
    };
    
    // 执行异步加载
    loadVideoDataFromElectron();
  }, [id, isPlayerWindow, location.state, movies.data, tvShows.data, anime.data, varietyShows.data, documentaries.data, searchResults.data, filterResults.data, favorites.data, currentCategory, dispatch]);

  // 动态更新浏览器页面标题（document.title）
  useEffect(() => {
    if (!videoInfo) {
      return;
    }

    // 判断是否为电影类型
    const videoType = mapVideoType(videoInfo?.type || currentCategory || 'tv');
    const isMovie = videoType === 'movies' || videoType === 'movie';
    
    const videoTitle = videoInfo.title || videoInfo.name || '视频详情';
    
    // 如果是非电影类型且有选中的集数，显示"视频名称 第X集"
    if (!isMovie && selectedEpisode) {
      document.title = `${videoTitle} 第${selectedEpisode}集`;
    } else {
      // 电影类型或没有选中集数，只显示视频名称
      document.title = videoTitle;
    }

    // 组件卸载时恢复默认标题
    return () => {
      document.title = 'WTV';
    };
  }, [videoInfo, selectedEpisode, currentCategory]);

  // 监听登录状态变化，登录成功后刷新数据
  useEffect(() => {
    if (isAuthenticated && id) {
      console.log('用户已登录，刷新视频详情页数据');
      // 重新获取剧集和推荐信息
      dispatch(fetchEpisodes(id));
      // 不再自动获取收藏列表，只在用户进入收藏列表页面时获取
    }
  }, [isAuthenticated, id, dispatch]);

  // 🔧 根据收藏列表实时更新当前视频的红心状态
  useEffect(() => {
    if (!isAuthenticated) {
      setIsFavorite(false);
      return;
    }
    
    const list = favorites?.data || [];
    const favoritesLoaded = favorites?.pagination !== undefined && Object.keys(favorites.pagination).length > 0;
    
    // 🔧 如果收藏列表还没有加载，先获取收藏列表（只获取第一页，用于判断收藏状态）
    if (!favoritesLoaded && !favorites?.loading) {
      console.log('收藏列表未加载，主动获取收藏列表以判断收藏状态');
      dispatch(fetchFavorites({ page: 1, size: 20 })).then((result) => {
        // 获取成功后，再次检查收藏状态
        if (result.meta.requestStatus === 'fulfilled') {
          const updatedList = result.payload?.data?.list || [];
          const inFav = updatedList.some((v) => String(v.id) === String(id));
          setIsFavorite(inFav);
          console.log('收藏列表加载完成，当前视频收藏状态:', inFav);
        }
      }).catch((error) => {
        console.error('获取收藏列表失败:', error);
        // 获取失败时，设置为未收藏
        setIsFavorite(false);
      });
      return;
    }
    
    // 🔧 如果收藏列表已加载，直接检查收藏状态
    const inFav = list.some((v) => String(v.id) === String(id));
    setIsFavorite(inFav);
    console.log('根据收藏列表更新收藏状态:', { videoId: id, isFavorite: inFav, favoritesCount: list.length });
  }, [isAuthenticated, favorites?.data, favorites?.pagination, favorites?.loading, id, dispatch]);

  // 当视频ID变化时，重置播放状态（但保留用户设置）
  useEffect(() => {
    // 🎮 重置控制器状态
    controller.reset();
    
    setIsMoviePlaying(false);
    setPlayerReady(false);
    setSelectedEpisode(null);
    // 使用用户设置的自动播放偏好，而不是硬编码 false
    setIsPlaying(playerSettings.autoplay);
    hasSkippedRef.current = false; // 重置快进状态
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听视频显示模式变化，应用到视频元素
  useEffect(() => {
    if (!playerReady) return;
    
    const applyVideoFitMode = () => {
      try {
        const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                           (playerRef.current?.wrapper?.querySelector?.('video'));
        if (videoElement && document.contains(videoElement)) {
          if (videoElement.style) {
            videoElement.style.objectFit = videoFitMode;
          }
        }
      } catch (err) {
        console.error('应用视频显示模式失败:', err);
      }
    };
    
    // 立即应用
    applyVideoFitMode();
    
    // 延迟应用，确保视频元素已渲染
    const timer = setTimeout(applyVideoFitMode, 100);
    return () => clearTimeout(timer);
  }, [videoFitMode, playerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听画中画状态变化
  useEffect(() => {
    const handleEnterPictureInPicture = () => {
      setIsPictureInPicture(true);
    };
    
    const handleLeavePictureInPicture = () => {
      setIsPictureInPicture(false);
    };
    
    document.addEventListener('enterpictureinpicture', handleEnterPictureInPicture);
    document.addEventListener('leavepictureinpicture', handleLeavePictureInPicture);
    
    // 检查当前是否已在画中画模式
    setIsPictureInPicture(!!document.pictureInPictureElement);
    
    return () => {
      document.removeEventListener('enterpictureinpicture', handleEnterPictureInPicture);
      document.removeEventListener('leavepictureinpicture', handleLeavePictureInPicture);
    };
  }, []);

  // 使用 ref 标记是否已经应用过初始设置，避免重复应用
  const hasAppliedInitialSettingsRef = useRef(false);
  // 使用 ref 标记是否由用户手动调整，避免被重置
  const isUserAdjustingRef = useRef(false);
  // 使用 ref 存储当前播放器设置值，用于事件监听中比较，避免读取过时的 state
  const currentVolumeRef = useRef(volume);
  const currentMutedRef = useRef(muted);
  const currentPlaybackRateRef = useRef(playbackRate);
  // 使用 ref 标记是否正在同步设置到视频元素，避免循环触发
  const isSyncingSettingsRef = useRef(false);
  
  // 同步 ref 值到 state（当 state 从外部更新时）
  useEffect(() => {
    currentVolumeRef.current = volume;
    currentMutedRef.current = muted;
    currentPlaybackRateRef.current = playbackRate;
  }, [volume, muted, playbackRate]);

  // 注意：这个 useEffect 已被禁用，因为会导致用户调整后被重置的问题
  // 现在完全依赖事件监听器（volumechange/ratechange）来更新 state
  // 只在视频加载时（onReady）同步一次初始设置，之后不再从 state 同步回视频元素
  // 这样可以避免用户通过原生控制栏调整后立即被重置的问题
  // 
  // 如果需要从外部更新（比如从设置页面），应该直接操作视频元素，而不是更新 state
  // useEffect(() => {
  //   // 已禁用自动同步
  // }, [volume, muted, playbackRate, playerReady]);
  
  // 在播放器准备好时应用用户设置（仅在首次准备好时应用，避免覆盖用户调整）
  // 注意：这个 useEffect 已经被 onReady 回调中的逻辑替代，保留它作为备用
  // 但实际上，onReady 回调中的逻辑更可靠，因为它能确保视频元素已经准备好
  // 所以这个 useEffect 可以移除或保留作为备用
  useEffect(() => {
    if (playerReady && playerRefInternal.current && !hasAppliedInitialSettingsRef.current) {
      try {
        const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                           (playerRefInternal.current.wrapper?.querySelector?.('video'));
        if (videoElement && document.contains(videoElement)) {
          // 设置同步标志，避免事件监听器触发
          isSyncingSettingsRef.current = true;
          
          // 使用当前的 state 值，这些值已经包含了用户的调整
          videoElement.volume = volume;
          videoElement.muted = muted;
          videoElement.playbackRate = playbackRate;
          
          // 同步更新 ref
          currentVolumeRef.current = volume;
          currentMutedRef.current = muted;
          currentPlaybackRateRef.current = playbackRate;
          
          hasAppliedInitialSettingsRef.current = true;
          console.log('应用用户播放器设置（useEffect）:', { volume, muted, playbackRate });
          
          // 清除同步标志
          setTimeout(() => {
            isSyncingSettingsRef.current = false;
          }, 200);
        }
      } catch (error) {
        console.error('应用播放器设置失败:', error);
        isSyncingSettingsRef.current = false;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady]); // 只依赖 playerReady，移除 volume/muted/playbackRate 依赖，避免覆盖用户调整

  // 当视频ID或播放URL变化时，重置标记（新视频需要重新应用初始设置）
  useEffect(() => {
    hasAppliedInitialSettingsRef.current = false;
    isUserAdjustingRef.current = false;
  }, [id, playUrl.url]);

  // 恢复用户保存的画质设置
  useEffect(() => {
    if (playUrl.qualityOptions && playUrl.qualityOptions.length > 0 && playerSettings.selectedQuality) {
      const savedQuality = playerSettings.selectedQuality;
      // 检查保存的画质是否在可用选项中
      const qualityExists = playUrl.qualityOptions.some(opt => opt.quality === savedQuality);
      if (qualityExists && playUrl.selectedQuality !== savedQuality) {
        console.log('恢复用户保存的画质设置:', savedQuality);
        dispatch(selectQuality(savedQuality));
      }
    }
  }, [playUrl.qualityOptions, playUrl.selectedQuality, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // 🔧 清除拖动定时器
        if (seekTimeoutRef.current) {
          clearTimeout(seekTimeoutRef.current);
          seekTimeoutRef.current = null;
        }
        
        // 🎮 销毁控制器
        if (controller) {
          controller.destroy();
        }
        
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
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

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
            return String(episodeNumber) === String(selectedEpisode);
          })
        );
        
        // 如果找到了对应的组，自动切换到该组
        if (selectedGroupIndex >= 0 && activeEpisodeGroup !== selectedGroupIndex) {
          setActiveEpisodeGroup(selectedGroupIndex);
        }
      }
    }
  }, [selectedEpisode, episodes.data, activeSeason]); // eslint-disable-line react-hooks/exhaustive-deps

  // MyArtPlayer 已内置 HLS 处理，以下手动注入逻辑已禁用
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (false && (isMoviePlaying || isEpisodePlaying) && playUrl.url && !playUrl.loading && !playUrl.error) {
      console.log('播放地址已准备好，等待播放器初始化...');
      // 不立即设置 isPlaying，等待 onReady 回调中视频元素真正准备好后再设置
      // 这样可以避免在视频元素还没准备好时就尝试播放，导致格式错误
      
      // 延迟一点时间，确保 ReactPlayer 已经渲染
      const timer1 = setTimeout(() => {
        console.log('检查播放器状态，isPlaying:', isPlaying, 'playerReady:', playerReady);
        if (!playerReady) {
          console.log('播放器还未准备好，等待 onReady 回调');
          // 不在这里尝试播放，等待 onReady 回调处理
        } else {
          console.log('播放器已准备好，等待 onReady 回调设置播放状态');
          // 不在这里设置 isPlaying，等待 onReady 回调中视频元素真正准备好后再设置
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
            // 使用 ArtPlayer 自带控件：关闭原生 controls，避免重复控制条
            videoElement.removeAttribute('controls');
            videoElement.controls = false;

            // 应用视频显示模式
            if (videoElement.style) {
              videoElement.style.objectFit = videoFitMode;
            }
            
            // 检查视频元素的可见性和尺寸
            const rect = videoElement.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(videoElement);
            const parentRect = videoElement.parentElement?.getBoundingClientRect();
            const containerRect = playerRef.current?.wrapper?.getBoundingClientRect();
            console.log('video 元素状态:', {
              paused: videoElement.paused,
              readyState: videoElement.readyState,
              networkState: videoElement.networkState,
              src: videoElement.src,
              currentSrc: videoElement.currentSrc,
              currentTime: videoElement.currentTime,
              duration: videoElement.duration,
              error: videoElement.error,
              // 添加可见性检查
              width: rect.width,
              height: rect.height,
              display: computedStyle.display,
              visibility: computedStyle.visibility,
              opacity: computedStyle.opacity,
              zIndex: computedStyle.zIndex,
              position: computedStyle.position,
              // 添加父容器和容器信息
              parentWidth: parentRect?.width,
              parentHeight: parentRect?.height,
              containerWidth: containerRect?.width,
              containerHeight: containerRect?.height
            });
            
            // 如果视频元素尺寸为 0，输出警告
            if (rect.width === 0 || rect.height === 0) {
              console.error('❌ 视频元素尺寸为 0！', {
                videoWidth: rect.width,
                videoHeight: rect.height,
                parentWidth: parentRect?.width,
                parentHeight: parentRect?.height,
                containerWidth: containerRect?.width,
                containerHeight: containerRect?.height,
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity
              });
            }
            
            // 检查是否有错误
            if (videoElement.error) {
              console.error('video 元素有错误:', {
                code: videoElement.error.code,
                message: videoElement.error.message
              });
            }
            
            // 检查 HLS 实例
            const hlsInstance = videoElement.hls;
            const isM3u8 = playUrl.url?.toLowerCase().endsWith('.m3u8') || 
                         playUrl.url?.toLowerCase().includes('m3u8');
            console.log('HLS 实例检查:', {
              hasHls: !!hlsInstance,
              url: playUrl.url,
              isM3u8: isM3u8,
              hlsSupported: Hls.isSupported()
            });
            
            // 如果是 HLS 视频但没有 HLS 实例，尝试手动创建
            if (isM3u8 && !hlsInstance && Hls.isSupported()) {
              console.log('检测到 HLS 视频但缺少 HLS 实例，尝试手动创建...');
              try {
                // 启用原生控件
                if (videoElement) {
                  if (!videoElement.hasAttribute('controls')) {
                    videoElement.setAttribute('controls', '');
                  }
                  videoElement.controls = true;
                }
                
                const hls = new Hls({
                  enableWorker: true,
                  lowLatencyMode: false, // 禁用低延迟模式，避免缓冲不足导致音频卡顿
                  backBufferLength: 90,
                  maxBufferLength: 600, // 增加最大缓冲长度到600秒，确保音频流畅
                  maxMaxBufferLength: 600, // 增加最大缓冲长度上限到600秒
                  startLevel: -1, // 自动选择最佳质量
                  maxBufferSize: 600 * 1000 * 1000, // 最大缓冲大小 600MB（对应600秒视频）
                  maxBufferHole: 0.5, // 允许的最大缓冲间隙（秒）
                  highBufferWatchdogPeriod: 2, // 高缓冲监控周期（秒）
                  nudgeOffset: 0.1, // 缓冲调整偏移量（秒）
                  nudgeMaxRetry: 3, // 最大重试次数
                  maxFragLoadingTimeOut: 20000, // 片段加载超时时间（毫秒）
                  fragLoadingTimeOut: 20000, // 片段加载超时时间（毫秒）
                  manifestLoadingTimeOut: 10000, // 清单加载超时时间（毫秒）
                  debug: false
                });
                
                hls.loadSource(playUrl.url);
                hls.attachMedia(videoElement);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  console.log('HLS manifest 解析完成，可以播放');
                  if (videoElement.paused && !isSeekingRef.current && document.contains(videoElement) && !userPausedRef.current && (isPlaying || isPlayingRef.current)) {
                    videoElement.play().catch(err => {
                      if (err.name === 'AbortError' && err.message?.includes('removed from the document')) {
                        console.warn('播放请求被中断（媒体元素可能被移除）:', err.message);
                      } else {
                        console.error('HLS 播放失败:', err);
                      }
                    });
                  }
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                  // 只处理致命错误，忽略非致命错误（如 bufferSeekOverHole、bufferStalledError）
                  if (data.fatal) {
                    console.error('HLS 致命错误:', data);
                    switch (data.type) {
                      case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error('HLS 网络错误，尝试恢复...');
                        hls.startLoad();
                        break;
                      case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error('HLS 媒体错误，尝试恢复...');
                        hls.recoverMediaError();
                        break;
                      default:
                        console.error('HLS 致命错误，无法恢复');
                        hls.destroy();
                        break;
                    }
                  }
                });
                
                // 将 HLS 实例保存到 video 元素
                videoElement.hls = hls;
                console.log('HLS 实例创建成功');
              } catch (error) {
                console.error('创建 HLS 实例失败:', error);
              }
            }
            
            // 如果是 HLS 视频但 readyState 为 0，仅监听加载事件，避免重复实例
            if (isM3u8 && videoElement.readyState === 0) {
              console.log('HLS 视频还未加载，等待加载事件触发...');
              
              const onLoadedMetadata = () => {
                console.log('video 元数据已加载，readyState:', videoElement.readyState);
                if (videoElement.paused && !isSeekingRef.current && document.contains(videoElement) && !userPausedRef.current && (isPlaying || isPlayingRef.current)) {
                  videoElement.play().then(() => {
                    console.log('元数据加载后播放成功');
                    setIsPlaying(true);
                    if (videoElement.muted) {
                      videoElement.muted = false;
                    }
                  }).catch((err) => {
                    // 忽略"媒体被移除"的错误
                    if (err.name === 'AbortError' && err.message?.includes('removed from the document')) {
                      console.warn('播放请求被中断（媒体元素可能被移除）:', err.message);
                    } else {
                    console.error('元数据加载后播放失败:', err);
                    }
                  });
                }
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                videoElement.removeEventListener('canplay', onCanPlay);
              };
              const onCanPlay = () => {
                console.log('video 可以播放，readyState:', videoElement.readyState);
                if (videoElement.paused && !isSeekingRef.current && document.contains(videoElement) && !userPausedRef.current && (isPlaying || isPlayingRef.current)) {
                  videoElement.play().then(() => {
                    console.log('canplay 事件后播放成功');
                    setIsPlaying(true);
                    if (videoElement.muted) {
                      videoElement.muted = false;
                    }
                  }).catch((err) => {
                    // 忽略"媒体被移除"的错误
                    if (err.name === 'AbortError' && err.message?.includes('removed from the document')) {
                      console.warn('播放请求被中断（媒体元素可能被移除）:', err.message);
                    } else {
                    console.error('canplay 事件后播放失败:', err);
                    }
                  });
                }
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                videoElement.removeEventListener('canplay', onCanPlay);
              };
              videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
              videoElement.addEventListener('canplay', onCanPlay);
              return;
            } else if (videoElement.paused && !isSeekingRef.current && document.contains(videoElement) && !userPausedRef.current && (isPlaying || isPlayingRef.current)) {
              // 只有在不是拖动状态时才自动播放，且元素仍在 DOM 中
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
                // 忽略"媒体被移除"的错误
                if (err.name === 'AbortError' && err.message?.includes('removed from the document')) {
                  console.warn('播放请求被中断（媒体元素可能被移除）:', err.message);
                  return;
                }
                console.error('延迟播放失败:', err);
                console.error('错误详情:', err.message, err.name);
                // 如果播放失败且元素仍在 DOM 中，尝试静音播放
                if (!videoElement.muted && document.contains(videoElement) && !userPausedRef.current && (isPlaying || isPlayingRef.current)) {
                  console.log('尝试静音播放');
                  videoElement.muted = true;
                  videoElement.play().then(() => {
                    console.log('静音播放成功');
                    setIsPlaying(true);
                  }).catch((err2) => {
                    // 忽略"媒体被移除"的错误
                    if (err2.name === 'AbortError' && err2.message?.includes('removed from the document')) {
                      console.warn('静音播放请求被中断（媒体元素可能被移除）:', err2.message);
                    } else {
                    console.error('静音播放也失败:', err2);
                    }
                  });
                }
              });
            } else {
              console.log('video 元素已经在播放中，currentTime:', videoElement.currentTime);
              // 只有在用户没有暂停时才设置播放状态
              if (!userPausedRef.current) {
              setIsPlaying(true);
                isPlayingRef.current = true;
              } else {
                console.log('用户已暂停，不设置播放状态');
                // 如果用户已暂停，强制暂停视频
                videoElement.pause().catch(() => {});
              }
              // 如果正在播放但是静音，尝试取消静音
              // 应用用户设置的静音状态
              if (videoElement.muted !== muted && videoElement.readyState >= 2) {
                videoElement.muted = muted;
              }
            }
          } else {
            console.warn('延迟检查：未找到 video 元素');
            // 尝试从 playerRefInternal 查找
            if (playerRefInternal.current) {
              console.log('尝试从 playerRefInternal 查找 video 元素');
              const playerContainer = playerRefInternal.current.wrapper || playerRefInternal.current;
              if (playerContainer) {
                const videoFromRef = playerContainer.querySelector?.('video') || 
                                    (playerContainer.querySelectorAll && playerContainer.querySelectorAll('video')[0]);
                if (videoFromRef && !isSeekingRef.current && !userPausedRef.current && (isPlaying || isPlayingRef.current)) {
                  console.log('从 playerRefInternal 找到 video 元素，尝试播放');
                  if (videoFromRef.paused) {
                    videoFromRef.play().then(() => {
                      console.log('从 playerRefInternal 播放成功');
                      setIsPlaying(true);
                    }).catch((err) => {
                      console.error('从 playerRefInternal 播放失败:', err);
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
  }, [isMoviePlaying, isEpisodePlaying, playUrl.url, playUrl.loading, playUrl.error, playerReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // 检查简介是否超过3行
    const checkOverflow = () => {
      if (descriptionRef.current) {
        const element = descriptionRef.current;
        // 计算是否溢出：scrollHeight 是内容总高度，offsetHeight 是可见高度（被限制在3行）
        // 增加一点缓冲 2px
        const isOverflow = element.scrollHeight > element.offsetHeight + 2;
        console.log('简介溢出检查:', {
          scrollHeight: element.scrollHeight,
          offsetHeight: element.offsetHeight,
          isOverflow
        });
        setIsDescriptionOverflow(isOverflow);
      }
    };

    // 初始检查
    checkOverflow();

    // 在窗口大小变化时重新检查
    window.addEventListener('resize', checkOverflow);
    
    // 如果是剧集，在切换集数或获取新数据后也检查
    const timer = setTimeout(checkOverflow, 100);

    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timer);
    };
  }, [videoInfo?.description, id]);

  useEffect(() => {
    // 进入详情页或切换视频时，强制滚动到顶部
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    // 获取剧集和推荐信息
    // 只在 id 变化时调用，避免 videoInfo 变化时重复调用
    if (!id) return;
    console.log('获取剧集和推荐信息，videoId:', id);
    dispatch(fetchEpisodes(id));
  }, [id, dispatch]);

  // 当播放URL变化时，重置错误状态
  useEffect(() => {
    if (playUrl.url) {
      setVideoLoadError(null);
      setVideoLoadTimeout(false);
      errorRetryRef.current = 0; // 重置错误重试计数
      // 清除格式错误重试定时器
      if (formatErrorRetryTimerRef.current) {
        clearTimeout(formatErrorRetryTimerRef.current);
        formatErrorRetryTimerRef.current = null;
      }
    }
  }, [playUrl.url]);

  // 组件卸载时清理超时定时器和事件监听器
  useEffect(() => {
    return () => {
      if (videoLoadTimeoutRef.current) {
        clearTimeout(videoLoadTimeoutRef.current);
        videoLoadTimeoutRef.current = null;
      }
      
      // 清理视频元素的事件监听器
      try {
        const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                           (playerRef.current?.wrapper?.querySelector?.('video'));
        if (videoElement && videoElement._eventListeners) {
          videoElement._eventListeners.forEach(({ type, handler }) => {
            videoElement.removeEventListener(type, handler);
          });
          videoElement._eventListeners = [];
        }
      } catch (err) {
        console.error('清理视频元素事件监听器失败:', err);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 注意：executeAutoPlayFromHistory 函数已移到 handleMoviePlay 之后，以避免变量初始化顺序问题
  // 使用 executeAutoPlayFromHistory 的 useEffect 也移到该函数定义之后

  // 更新视频窗口标题（仅在新窗口中）
  const updateVideoWindowTitle = useCallback((episodeNumber = null) => {
    if (!isNewWindow || !window.electronAPI) {
      return;
    }
    
    // 判断是否为电影类型
    const videoType = mapVideoType(videoInfo?.type || currentCategory || 'tv');
    const isMovie = videoType === 'movies' || videoType === 'movie';
    
    // 如果不是电影类型，显示视频名称和集数信息
    if (!isMovie && videoInfo) {
      const videoTitle = videoInfo.title || videoInfo.name || '未知视频';
      const episodeInfo = episodeNumber ? `第${episodeNumber}集` : '';
      const title = episodeInfo ? `${videoTitle} - ${episodeInfo}` : videoTitle;
      
      // 更新窗口标题
      window.electronAPI.updateVideoWindowTitle(title).catch(err => {
        console.warn('更新视频窗口标题失败:', err);
      });
    }
  }, [currentCategory, isNewWindow, videoInfo]);

  // 在新窗口中打开时，当视频信息加载完成后更新窗口标题
  useEffect(() => {
    if (videoInfo && videoInfo.title && isNewWindow) {
      updateVideoWindowTitle(selectedEpisode);
    }
  }, [videoInfo, isNewWindow, selectedEpisode, updateVideoWindowTitle]);

  const buildLoginRedirectState = useCallback((reason = 'auth') => ({
    from: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    },
    reason,
  }), [location.pathname, location.search, location.hash]);

  const promptLoginBeforePlayback = useCallback(async () => {
    if (isAuthenticated) {
      return true;
    }

    navigate('/login', { state: buildLoginRedirectState('playback') });
    return false;
  }, [buildLoginRedirectState, isAuthenticated, navigate]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePlay = async (episodeNumber, options = {}) => {
    const { skipLoginCheck = false, fromAutoNext = false } = options;
    wtvPlayLog('play.request', {
      videoId: id,
      episodeNumber,
      fromAutoNext,
      skipLoginCheck,
      currentSelectedEpisode: selectedEpisode
    });
    if (!skipLoginCheck) {
      const canPlay = await promptLoginBeforePlayback();
      if (!canPlay) {
        return;
      }
    }

    if (!isPlayerWindow && window.electronAPI?.openPlayerWindow) {
      const playbackVideoId = videoInfo?.videoid || videoInfo?.vod_id || id;
      const normalizedVideo = normalizeVideoInfo({
        ...(videoInfo || {}),
        id: playbackVideoId,
      });
      window.electronAPI.openPlayerWindow(playbackVideoId, normalizedVideo, episodeNumber)
        .then(() => {
          showCenterTip('已切换到播放窗口');
        })
        .catch((err) => {
          console.error('打开播放窗口失败:', err);
          showCenterTip('打开播放窗口失败');
        });
      return;
    }

    // 🔧 清除拖动定时器（切换视频时清除之前的拖动状态）
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
    }
    
    // 🎯 检测播放记录：如果有播放记录且不是从播放记录页面进入，直接续播
    if (!location.state?.fromPlayHistory && !fromAutoNext) {
      const storedHistory = getVideoPlayHistory(id);
      if (storedHistory && storedHistory.progress > 5 && storedHistory.episode === episodeNumber) {
        console.log('检测到播放记录，自动续播到上次进度');
        showCenterTip('已继续上次进度播放');
        handlePlayFromTime(episodeNumber, storedHistory.progress);
        return;
      }
    }
    
    // 🎮 使用控制器处理用户播放操作
    controller.userPlay();
    setIsPlaying(true);
    isPlayingRef.current = true;
    
    // 优先使用 videoInfo 中的真实 ID，如果没有则使用 URL 中的 id
    const videoId = videoInfo?.videoid || videoInfo?.vod_id || id;
    console.log('Using videoId for play:', videoId);
    setSelectedEpisode(episodeNumber);
    wtvPlayLog('play.selectedEpisode', {
      videoId,
      selectedEpisode: episodeNumber
    });
    
    // 更新窗口标题（如果在新窗口中播放）
    updateVideoWindowTitle(episodeNumber);
    
    // 切换集数前，清空旧的播放地址
    dispatch(clearPlayUrl());
    
    // 重置错误状态
    setVideoLoadError(null);
    setVideoLoadTimeout(false);
    errorRetryRef.current = 0; // 重置错误重试计数
    if (formatErrorRetryTimerRef.current) {
      clearTimeout(formatErrorRetryTimerRef.current);
      formatErrorRetryTimerRef.current = null;
    }
    
    // 设置播放状态（但不立即设置 isPlaying，等待播放器准备好）
    setIsEpisodePlaying(true);
    setIsMoviePlaying(false);
    setPlayerReady(false);
    // 不立即设置 isPlaying，等待 onReady 回调中视频元素真正准备好后再设置
    setIsPlaying(false);
    
    // 重置进度保存跟踪
    lastSavedProgressRef.current = 0;
    lastSavedTimeRef.current = 0;
    
    // 清除续播时间（因为这是从头播放）
    resumeTimeRef.current = null;
    
    justSwitchedEpisodeRef.current = true;
    setTimeout(() => {
      justSwitchedEpisodeRef.current = false;
    }, 3000);
    
    // 获取类型
    const videoType = mapVideoType(videoInfo?.type || currentCategory || 'tv');
    
    // 保存播放记录（逻辑保持不变...）
    if (videoInfo) {
      const existingRecord = getVideoPlayHistory(videoId);
      if (existingRecord && (existingRecord.progress > 0 || existingRecord.duration > 0)) {
        updatePlayProgress(
          videoId,
          episodeNumber,
          existingRecord.progress || 0,
          existingRecord.duration || 0,
          videoInfo.title || videoInfo.name || '未知视频',
          videoInfo.cover_url || videoInfo.pic || '',
          videoType
        );
      }
    }
    
    // 构造请求参数
    const playParams = { 
      type: videoType,
      videoid: videoId, 
      episodes: episodeNumber
    };
    
    console.log('Dispatching fetchPlayUrl with params:', playParams);
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('fetchPlayUrl result:', result);
      if (result.meta.requestStatus === 'fulfilled') {
        console.log('Play URL fetched successfully');
        // 注意：续播逻辑已在 handlePlayFromTime 中处理，这里不再重复处理
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
      navigate('/login', { state: buildLoginRedirectState('favorite') });
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
            showCenterTip('收藏成功');
          } else {
            showCenterTip('取消收藏');
          }
        } else {
          // 如果接口没有返回明确状态，则根据操作前状态推断
          setIsFavorite(!wasFavorite);
          if (!wasFavorite) {
            showCenterTip('收藏成功');
          } else {
            showCenterTip('取消收藏');
          }
        }
        // 不再自动刷新收藏列表，只在用户进入收藏列表页面时获取
        // 收藏状态已通过 API 返回的 is_favorite 字段更新
      } else if (code === 401) {
        // 401：账号在其他设备登录
        showCenterTip('账号在其它设备登录，当前设备已下线');
        // 延迟跳转，让用户看到提示
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login', { state: buildLoginRedirectState('session_conflict') });
          });
        }, 1000);
      } else if (code === 400) {
        // 400：视频ID不能为空
        showCenterTip('视频ID不能为空！');
        // 页面不做任何变更
      } else if (code === 500) {
        // 500：操作过快
        showCenterTip('操作过快，请稍后重试！');
      } else {
        // 其他错误
        const errorMsg = resData.message || '操作失败，请稍后重试';
        showCenterTip(errorMsg);
      }
    } catch (err) {
      console.error('切换收藏状态失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线');
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login', { state: buildLoginRedirectState('session_conflict') });
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('视频ID不能为空！');
      } else if (code === 500) {
        showCenterTip('操作过快，请稍后重试！');
      } else {
        const errorMsg = resData.message || err?.message || '操作失败，请稍后重试';
        showCenterTip(errorMsg);
      }
    }
  };

  // 从指定时间开始播放
  const handlePlayFromTime = (episodeNumber, startTime) => {
    // 🔧 清除拖动定时器（切换视频时清除之前的拖动状态）
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
    }
    
    // 🎮 使用控制器处理用户续播操作
    controller.userPlay();
    setIsPlaying(true);
    isPlayingRef.current = true;
    
    setSelectedEpisode(episodeNumber);
    
    // 更新窗口标题（如果在新窗口中播放）
    updateVideoWindowTitle(episodeNumber);
    
    // 存储续播时间，等待播放器准备好后设置
    resumeTimeRef.current = startTime;
    console.log('✅ 设置续播时间到 ref:', startTime);
    
    // 设置播放状态，参考 handlePlay 逻辑
    setIsEpisodePlaying(true);
    setPlayerReady(false); // 重置播放器准备状态
    // 不立即设置 isPlaying，等待 onReady 回调中视频元素真正准备好后再设置
    setIsPlaying(false);
    
    // 重置进度保存跟踪
    lastSavedProgressRef.current = 0;
    lastSavedTimeRef.current = 0; // 重置时间戳，确保下次立即保存
    
    // 标记刚刚切换了集数，用于避免拖动后循环暂停播放
    justSwitchedEpisodeRef.current = true;
    // 当播放器准备好后，清除这个标志
    setTimeout(() => {
      justSwitchedEpisodeRef.current = false;
    }, 3000); // 3秒后清除标志，给播放器足够的时间初始化
    
    // 根据API文档，episodes接口不包含播放地址，需要调用 /video/play 接口
    // 优先使用视频本身携带的 type，确保类型准确
    const playParams = { 
      type: mapVideoType(videoInfo?.type || currentCategory || 'tv'),
      videoid: id, 
      episodes: episodeNumber
    };
    console.log('Dispatching fetchPlayUrl with params:', playParams);
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('fetchPlayUrl result for continue watching:', result);
      if (result.meta.requestStatus === 'fulfilled') {
        console.log('Play URL fetched successfully for continue watching, 续播时间将在 onReady 中设置');
        // 续播时间将在 handlePlayerReady 中设置，这里不需要立即设置
      } else {
        console.error('Failed to fetch play URL for continue watching:', result.error);
        resumeTimeRef.current = null; // 清除续播时间
        setIsEpisodePlaying(false);
        setPlayerReady(false);
      }
    }).catch((error) => {
      console.error('Error in fetchPlayUrl for continue watching:', error);
      resumeTimeRef.current = null; // 清除续播时间
      setIsEpisodePlaying(false);
      setPlayerReady(false);
    });
  };

  // 处理播放进度变化（当前已移除快进配置逻辑，仅保存进度）
  // 使用 useRef 来限制警告日志的频率
  const lastProgressWarningTimeRef = useRef(0);
  
  const handleProgress = (progress) => {
    const { playedSeconds } = progress;
    
    // 验证 playedSeconds 是否有效，并获取有效的播放时间
    let validPlayedSeconds = null;
    
    if (playedSeconds != null && !isNaN(playedSeconds) && isFinite(playedSeconds) && playedSeconds >= 0) {
      validPlayedSeconds = Number(playedSeconds);
      setPlayedSeconds(validPlayedSeconds);
    } else {
      // 🔇 限制警告频率：每5秒最多打印一次
      const now = Date.now();
      const shouldWarn = (now - lastProgressWarningTimeRef.current) > 5000;
      if (shouldWarn) {
        console.warn('⚠️ handleProgress 收到无效的 playedSeconds:', playedSeconds);
        lastProgressWarningTimeRef.current = now;
      }
      
      // 如果无效，尝试从视频元素获取
      try {
        const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                           (playerRef.current?.wrapper?.querySelector?.('video'));
        if (videoElement && videoElement.currentTime != null && 
            !isNaN(videoElement.currentTime) && isFinite(videoElement.currentTime) && 
            videoElement.currentTime >= 0) {
          validPlayedSeconds = Number(videoElement.currentTime);
          // 🔇 也限制成功获取的日志频率
          if (shouldWarn) {
            console.log('从视频元素获取到播放进度:', validPlayedSeconds);
          }
          setPlayedSeconds(validPlayedSeconds);
        } else {
          // 如果都获取不到，使用当前 state 中的值（如果有）
          validPlayedSeconds = playedSeconds; // 保持原值，后续代码会检查
          if (shouldWarn) {
            console.warn('无法获取有效的播放进度，跳过本次更新');
          }
          return; // 如果无法获取有效值，直接返回，不执行后续逻辑
        }
      } catch (err) {
        console.error('从视频元素获取播放进度失败:', err);
        return; // 出错时也直接返回
      }
    }
    
    // 如果视频正在播放，清除加载超时定时器（说明视频已经成功加载并开始播放）
    if (validPlayedSeconds != null && validPlayedSeconds > 0 && videoLoadTimeoutRef.current) {
      console.log('视频正在播放，清除加载超时定时器');
      clearTimeout(videoLoadTimeoutRef.current);
      videoLoadTimeoutRef.current = null;
      // 清除超时错误状态
      if (videoLoadTimeout) {
        setVideoLoadTimeout(false);
      }
      if (videoLoadError) {
        setVideoLoadError(null);
      }
    }
    
    // 确保 validPlayedSeconds 是有效值
    if (validPlayedSeconds == null || isNaN(validPlayedSeconds) || !isFinite(validPlayedSeconds)) {
      console.warn('⚠️ handleProgress: 无法获取有效的播放进度，跳过保存');
      return;
    }
    
    // 每30秒保存一次播放进度到 Redux
    if (selectedEpisode && Math.floor(validPlayedSeconds) % 30 === 0) {
      dispatch(setPlaybackProgress({
        videoId: id,
        episodeId: selectedEpisode,
        progress: validPlayedSeconds
      }));
    }
    
    // 保存播放记录到本地存储
    // 添加调试信息
    if (!videoInfo) {
      console.warn('⚠️ handleProgress: videoInfo 不存在，无法保存播放记录', { id, playedSeconds: validPlayedSeconds });
      return;
    }
    
    if (videoInfo) {
      // 统一使用 currentCategory 或 videoInfo.type，根据实际视频类型判断
      // 如果都没有，根据是否有 selectedEpisode 判断：有集数的是剧集，没有的是电影
      const videoType = currentCategory || videoInfo.type || (selectedEpisode ? 'tv' : 'movie');
      // 判断是否为电影类型（movies 或 movie）
      const isMovie = videoType === 'movies' || videoType === 'movie';
      const episode = isMovie ? null : selectedEpisode;
      
      // 使用 state 中的 duration（通过 onDuration 回调获取）
      // 如果 state 中的 duration 为 0，尝试从 ref 获取（作为后备方案）
      let currentDuration = duration;
      if ((currentDuration === 0 || !currentDuration) && playerRefInternal.current && playerRefInternal.current.getDuration) {
        try {
          const refDuration = playerRefInternal.current.getDuration();
          if (refDuration && refDuration > 0 && !isNaN(refDuration) && isFinite(refDuration)) {
            currentDuration = Number(refDuration);
            console.log('从 ReactPlayer ref 获取到时长:', currentDuration);
            // 同时更新 state，以便下次使用
            if (currentDuration !== duration) {
              setDuration(currentDuration);
            }
          }
        } catch (err) {
          console.warn('从 ReactPlayer ref 获取时长失败:', err);
        }
      }
      
      // 如果还是 0，尝试从视频元素直接获取
      if ((currentDuration === 0 || !currentDuration) && playerRefInternal.current) {
        try {
          const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                             (playerRef.current?.wrapper?.querySelector?.('video'));
          if (videoElement && videoElement.duration && 
              !isNaN(videoElement.duration) && isFinite(videoElement.duration) && 
              videoElement.duration > 0) {
            currentDuration = Number(videoElement.duration);
            console.log('从视频元素获取到时长:', currentDuration);
            // 同时更新 state，以便下次使用
            if (currentDuration !== duration) {
              setDuration(currentDuration);
            }
          }
        } catch (err) {
          console.warn('从视频元素获取时长失败:', err);
        }
      }
      
      // 更新播放进度（每5秒保存一次）
      // 使用时间戳判断是否应该保存，确保每5秒更新一次
      const now = Date.now();
      const timeSinceLastSave = now - lastSavedTimeRef.current;
      const SAVE_INTERVAL = 5000; // 5秒（毫秒）
      
      // 判断是否应该保存：每5秒保存一次，或者首次保存（lastSavedTimeRef.current === 0）
      // 或者进度变化超过1秒（确保重要进度变化被保存）
      const progressChanged = Math.abs(validPlayedSeconds - lastSavedProgressRef.current) >= 1;
      const shouldSave = (
        timeSinceLastSave >= SAVE_INTERVAL || 
        lastSavedTimeRef.current === 0 ||
        progressChanged
      ) && (
        validPlayedSeconds >= 0 // 包括刚开始播放时（progress = 0）也保存
      );
      
      // 添加调试信息（仅在需要保存时输出，减少日志）
      if (shouldSave) {
        console.log('✅ 准备保存播放记录（5秒更新）:', {
          timeSinceLastSave: Math.round(timeSinceLastSave / 1000) + '秒',
          playedSeconds: Math.round(validPlayedSeconds),
          progressChanged,
          lastSavedProgress: Math.round(lastSavedProgressRef.current)
        });
      }
      
      if (shouldSave) {
        console.log('✅ 开始保存播放记录:', { id, episode, playedSeconds: validPlayedSeconds, videoType });
        lastSavedProgressRef.current = validPlayedSeconds;
        lastSavedTimeRef.current = now;
        
        // 确保 finalDuration 是有效数字
        // 优先使用 state 中的 duration，如果为 0 则尝试从 ref 获取
        let finalDurationValue = currentDuration > 0 && !isNaN(currentDuration) && isFinite(currentDuration) ? Number(currentDuration) : 0;
        
        // 如果还是 0，尝试从 ref 获取（作为后备方案）
        if (finalDurationValue === 0 && playerRefInternal.current && playerRefInternal.current.getDuration) {
          const refDuration = playerRefInternal.current.getDuration();
          if (refDuration > 0 && !isNaN(refDuration) && isFinite(refDuration)) {
            finalDurationValue = Number(refDuration);
            console.log('从 ref 获取到有效时长:', finalDurationValue);
            // 同时更新 state，以便下次使用
            setDuration(finalDurationValue);
          }
        }
        const finalProgressValue = validPlayedSeconds >= 0 && !isNaN(validPlayedSeconds) && isFinite(validPlayedSeconds) ? Number(validPlayedSeconds) : 0;
        
        // 如果 finalDurationValue 还是 0，检查是否有已保存的记录，如果有，保留原有的 duration
        if (finalDurationValue === 0) {
          const existingRecord = getVideoPlayHistory(id);
          if (existingRecord && existingRecord.duration && existingRecord.duration > 0) {
            finalDurationValue = Number(existingRecord.duration);
            console.log('使用已保存记录中的 duration:', finalDurationValue);
          }
        }
        
        console.log('保存播放进度（5秒更新）:', { 
          id, 
          episode, 
          playedSeconds: finalProgressValue, 
          duration: finalDurationValue, 
          videoType, 
          timeSinceLastSave,
          originalDuration: currentDuration,
          originalPlayedSeconds: playedSeconds,
          progressType: typeof finalProgressValue,
          durationType: typeof finalDurationValue,
          hasExistingRecord: !!getVideoPlayHistory(id)
        });
        
        // 只要 progress >= 0 就保存（包括刚开始播放时 progress = 0）
        // 这样可以确保视频一开始播放就立即创建记录
        const existingRecord = getVideoPlayHistory(id);
        console.log('保存前检查:', {
          finalProgressValue,
          finalDurationValue,
          hasExistingRecord: !!existingRecord,
          willSave: finalProgressValue >= 0 || existingRecord
        });
        
        // 无论进度和时长是否为 0，都保存记录
        // 这样可以确保视频一开始播放就立即创建记录
          // updatePlayProgress 会自动处理：如果存在则更新，不存在则插入
          console.log('📝 调用 updatePlayProgress:', {
            id,
            episode,
            progress: finalProgressValue,
            duration: finalDurationValue,
            title: videoInfo.title || videoInfo.name || '未知视频',
            cover: videoInfo.cover_url || videoInfo.pic || '',
            videoType
          });
          
        updatePlayProgress(
          id, 
          episode, 
            finalProgressValue, 
            finalDurationValue,
          videoInfo.title || videoInfo.name || '未知视频',
          videoInfo.cover_url || videoInfo.pic || '',
          videoType
        );
        
        // 验证保存是否成功
        setTimeout(() => {
          const savedRecord = getVideoPlayHistory(id);
          if (savedRecord) {
            // 确保数据类型正确
            const savedProgress = Number(savedRecord.progress) || 0;
            const savedDuration = Number(savedRecord.duration) || 0;
            console.log('保存后的记录验证:', {
              videoId: savedRecord.videoId,
              progress: savedProgress,
              duration: savedDuration,
              progressType: typeof savedRecord.progress,
              durationType: typeof savedRecord.duration,
              rawProgress: savedRecord.progress,
              rawDuration: savedRecord.duration
            });
            
            // 如果保存后仍然是 0，输出详细警告
            if (savedProgress === 0 && savedDuration === 0) {
              console.error('❌ 严重警告：保存后的记录 progress 和 duration 都为 0！', {
                videoId: savedRecord.videoId,
                传入的progress: finalProgressValue,
                传入的duration: finalDurationValue,
                保存的progress: savedProgress,
                保存的duration: savedDuration,
                原始localStorage: localStorage.getItem('wtv_play_history')
              });
            }
          } else {
            console.warn('保存后未找到记录，可能保存失败');
          }
        }, 100);
      }
    }
  };

  // 视频播放完成时清除播放进度，并自动播放下一集（仅限有选集语义的视频）
  const getNextEpisodeNumber = useCallback(() => {
    const hasSelectedEpisode = selectedEpisode !== null && selectedEpisode !== undefined;
    const hasEpisodeList = !!(episodes.data && episodes.data.length > 0);
    if (!hasSelectedEpisode || !hasEpisodeList) {
      return null;
    }

    const normalizeEpisodeKey = (value) => {
      if (value === null || value === undefined) return null;
      const str = String(value).trim();
      if (/^\d+$/.test(str)) {
        return String(Number(str));
      }
      return str;
    };

    const getEpisodeOrderValue = (episode) => {
      const raw = episode?.episode_number ?? episode?.id ?? 0;
      const num = Number(raw);
      return Number.isFinite(num) ? num : 0;
    };

    const selectedEpisodeKey = normalizeEpisodeKey(selectedEpisode);
    const currentEpisodeItem = episodes.data.find((episode) => {
      const episodeNumber = episode.episode_number || episode.id;
      return normalizeEpisodeKey(episodeNumber) === selectedEpisodeKey;
    });

    const currentSeason = String(currentEpisodeItem?.season || activeSeason || 1);
    const currentSeasonEpisodes = episodes.data
      .filter((episode) => String(episode.season || 1) === currentSeason)
      .sort((a, b) => getEpisodeOrderValue(a) - getEpisodeOrderValue(b));

    // 自动连播固定按集数正序推进，不受选集列表 UI 的正序/倒序切换影响
    const currentIndex = currentSeasonEpisodes.findIndex((episode) => {
      const episodeNumber = episode.episode_number || episode.id;
      return normalizeEpisodeKey(episodeNumber) === selectedEpisodeKey;
    });

    if (currentIndex >= 0 && currentIndex < currentSeasonEpisodes.length - 1) {
      const nextEpisode = currentSeasonEpisodes[currentIndex + 1];
      return nextEpisode.episode_number || nextEpisode.id;
    }
    return null;
  }, [selectedEpisode, episodes.data, activeSeason]);

  const handleEnded = () => {
    const endedNow = Date.now();
    if (endedNow - handleEndedDedupeRef.current < 700) {
      wtvPlayLog('ended.deduped', { videoId: id, episode: selectedEpisode });
      return;
    }
    handleEndedDedupeRef.current = endedNow;
    wtvPlayLog('ended.enter', { videoId: id, episode: selectedEpisode });

    if (autoNextInFlightRef.current) {
      wtvPlayLog('autonext.skip.inflight', { videoId: id, episode: selectedEpisode });
      return;
    }
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
      if (playerRefInternal.current && playerRefInternal.current.getDuration) {
        duration = playerRefInternal.current.getDuration() || 0;
      }
      
      // 播放完成，从头开始（进度设为0，但保留时长）
      updatePlayProgress(
        id,
        episode,
        0, // 播放完成，从头开始
        duration > 0 && !isNaN(duration) && isFinite(duration) ? duration : 0,
        videoInfo.title || videoInfo.name || '未知视频',
        videoInfo.cover_url || videoInfo.pic || '',
        videoType
      );
    }
    
    if (selectedEpisode) {
      dispatch(clearPlaybackProgress({
        videoId: id,
        episodeId: selectedEpisode
      }));
    }

    // 如果是电视剧/动漫/综艺/纪录片，自动播放下一集（电影不连播）
    const mappedType = mapVideoType(videoInfo?.type || currentCategory || 'tv');
    const hasEpisodeContext = selectedEpisode !== null && selectedEpisode !== undefined && !!(episodes.data && episodes.data.length > 0);
    const isEpisodeType = ['tv', 'anime', 'tvshow', 'doc'].includes(mappedType) || hasEpisodeContext;
    if (autoNextEpisode && isEpisodeType) {
      const nextEpisodeNumber = getNextEpisodeNumber();
      wtvPlayLog('autonext.check', {
        videoId: id,
        currentEpisode: selectedEpisode,
        nextEpisodeNumber,
        autoNextEpisode,
        isEpisodeType
      });
      if (nextEpisodeNumber !== null && nextEpisodeNumber !== undefined) {
        autoNextInFlightRef.current = true;
        // 关键：结束触发的 pause 不能被识别成“用户手动暂停”，否则下一集会卡在暂停态
        controller.state.userPaused = false;
        userPausedRef.current = false;
        controller.state.isPlaying = true;
        setIsPlaying(true);
        isPlayingRef.current = true;

        wtvPlayLog('autonext.goto', { videoId: id, from: selectedEpisode, to: nextEpisodeNumber });
        showCenterTip(`正在播放第${nextEpisodeNumber}集`);
        setTimeout(() => {
          handlePlay(nextEpisodeNumber, { skipLoginCheck: true, fromAutoNext: true })
            .finally(() => {
              setTimeout(() => {
                autoNextInFlightRef.current = false;
                wtvPlayLog('autonext.unlocked', { videoId: id });
              }, 1200);
            });
        }, 500);
      } else {
        wtvPlayLog('autonext.lastEpisode', { videoId: id, episode: selectedEpisode });
      }
    } else if (!autoNextEpisode && isEpisodeType) {
      wtvPlayLog('autonext.disabled', { videoId: id, episode: selectedEpisode });
    }
  };

  const handlePlayNextEpisode = useCallback(() => {
    const nextEpisodeNumber = getNextEpisodeNumber();
    if (nextEpisodeNumber === null || nextEpisodeNumber === undefined) {
      showCenterTip('已经是最后一集');
      return;
    }
    showCenterTip(`正在播放第${nextEpisodeNumber}集`);
    handlePlay(nextEpisodeNumber, { skipLoginCheck: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getNextEpisodeNumber, handlePlay]);

  const toggleAutoNextEpisode = useCallback((options = {}) => {
    const { showTip = true, nextValue: forcedValue } = options;
    const nextValue = typeof forcedValue === 'boolean' ? forcedValue : !autoNextEpisode;
    setAutoNextEpisode(nextValue);
    updatePlayerSetting('autoNextEpisode', nextValue);
    if (showTip) {
      showCenterTip(nextValue ? '已开启自动连播' : '已关闭自动连播');
    }
  }, [autoNextEpisode]);

  // 处理电影播放（点击海报播放按钮）
  const handleMoviePlay = async () => {
    const canPlay = await promptLoginBeforePlayback();
    if (!canPlay) {
      return;
    }

    if (!isPlayerWindow && window.electronAPI?.openPlayerWindow) {
      const playbackVideoId = videoInfo?.videoid || videoInfo?.vod_id || id;
      const normalizedVideo = normalizeVideoInfo({
        ...(videoInfo || {}),
        id: playbackVideoId,
      });
      window.electronAPI.openPlayerWindow(playbackVideoId, normalizedVideo, null)
        .then(() => {
          showCenterTip('已切换到播放窗口');
        })
        .catch((err) => {
          console.error('打开播放窗口失败:', err);
          showCenterTip('打开播放窗口失败');
        });
      return;
    }

    // 🔧 清除拖动定时器（切换视频时清除之前的拖动状态）
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = null;
    }
    
    // 🎮 使用控制器处理用户播放电影操作
    controller.userPlay();
    setIsPlaying(true);
    isPlayingRef.current = true;
    
    // 使用 mapVideoType 统一判断类型
    const apiType = mapVideoType(videoInfo?.type || currentCategory);
    const isMovie = apiType === 'movie';
    if (!videoInfo || !isMovie) {
      console.warn('handleMoviePlay: 视频信息不存在或非电影类型', { videoInfo, apiType });
      return;
    }
    
    // 优先使用 videoInfo 中的真实 ID
    const videoId = videoInfo.videoid || videoInfo.vod_id || id;
    console.log('开始播放电影，videoId:', videoId);
    
    // 播放前，清空旧的播放地址
    dispatch(clearPlayUrl());
    
    // 重置错误状态
    setVideoLoadError(null);
    setVideoLoadTimeout(false);
    errorRetryRef.current = 0; // 重置错误重试计数
    if (formatErrorRetryTimerRef.current) {
      clearTimeout(formatErrorRetryTimerRef.current);
      formatErrorRetryTimerRef.current = null;
    }
    
    setIsMoviePlaying(true);
    setIsEpisodePlaying(false);
    setPlayerReady(false);
    // 不立即设置 isPlaying，等待 onReady 回调中视频元素真正准备好后再设置
    setIsPlaying(false);
    
    // 重置进度保存跟踪
    lastSavedProgressRef.current = 0;
    lastSavedTimeRef.current = 0;
    
    // 检查是否有播放记录需要续播（从 state 或 localStorage 读取）
    let playHistory = location.state?.playHistory;
    const fromPlayHistory = !!playHistory; // 标记是否从播放记录页面进入
    
    if (!playHistory && id) {
      try {
        const storedHistory = getVideoPlayHistory(id);
        if (storedHistory && storedHistory.episode === null && storedHistory.progress > 5) {
          playHistory = storedHistory;
        }
      } catch (error) {
        console.error('从 localStorage 读取播放记录失败:', error);
      }
    }
    
    // 如果有续播记录，存储续播时间到 ref，等待播放器准备好后设置
    if (playHistory && playHistory.episode === null && playHistory.progress > 5) {
      resumeTimeRef.current = playHistory.progress;
      console.log('✅ 设置电影续播时间到 ref:', playHistory.progress);
      
      // 🎯 如果不是从播放记录页面进入，显示提示
      if (!fromPlayHistory) {
        showCenterTip('已继续上次进度播放');
      }
    } else {
      // 从头播放，清除续播时间
      resumeTimeRef.current = null;
    }
    
    // 保存播放记录（逻辑保持不变...）
    const existingRecord = getVideoPlayHistory(videoId);
    if (existingRecord && (existingRecord.progress > 0 || existingRecord.duration > 0)) {
      updatePlayProgress(
        videoId,
        null,
        existingRecord.progress || 0,
        existingRecord.duration || 0,
        videoInfo.title || videoInfo.name || '未知视频',
        videoInfo.cover_url || videoInfo.pic || '',
        apiType
      );
    }
    
    // 调用播放接口
    const playParams = {
      type: apiType,
      videoid: videoId
    };
    
    console.log('Dispatching fetchPlayUrl (movie) with params:', playParams);
    dispatch(fetchPlayUrl(playParams)).then((result) => {
      console.log('电影播放地址获取结果:', result);
      console.log('结果payload:', result.payload);
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

  handlePlayRef.current = handlePlay;
  handleMoviePlayRef.current = handleMoviePlay;

  const updateRelatedScrollState = useCallback(() => {
    const grid = relatedVideosGridRef.current;
    if (!grid) {
      setCanScrollRelatedLeft(false);
      setCanScrollRelatedRight(false);
      return;
    }

    const maxScrollLeft = grid.scrollWidth - grid.clientWidth;
    const threshold = 4;
    setCanScrollRelatedLeft(grid.scrollLeft > threshold);
    setCanScrollRelatedRight(maxScrollLeft - grid.scrollLeft > threshold);
  }, []);

  useEffect(() => {
    updateRelatedScrollState();
  }, [episodes.recommendations, updateRelatedScrollState]);

  useEffect(() => {
    const handleResize = () => updateRelatedScrollState();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateRelatedScrollState]);

  useEffect(() => {
    if (!isPlayerWindow || !videoInfo || hasAutoPlayFromPlayerWindowRef.current) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const targetEpisode = pendingAutoPlayEpisodeRef.current || params.get('autoplayEpisode');
    const videoType = mapVideoType(videoInfo?.type || currentCategory || 'tv');
    const isMovie = videoType === 'movie';

    if (!isMovie) {
      if (!targetEpisode || !episodes.data || episodes.data.length === 0) {
        return;
      }
      const hasTargetEpisode = episodes.data.some((episode) => {
        const episodeNumber = episode.episode_number || episode.id;
        return String(episodeNumber) === String(targetEpisode);
      });
      if (!hasTargetEpisode) {
        return;
      }
      hasAutoPlayFromPlayerWindowRef.current = true;
      handlePlayRef.current?.(targetEpisode);
      return;
    }

    if (params.get('autoplay') === 'true') {
      hasAutoPlayFromPlayerWindowRef.current = true;
      handleMoviePlayRef.current?.();
    }
  }, [isPlayerWindow, videoInfo, episodes.data, currentCategory, location.search]);

  // 播放器准备就绪回调
  const handlePlayerReady = () => {
    console.log('播放器准备就绪');
    console.log('播放URL:', playUrl.url);
    const isHLS = playUrl.url?.includes('m3u8');
    console.log('播放器类型:', isHLS ? 'HLS' : '其他');
    
    setPlayerReady(true);
    // 清除刚刚切换集数的标志，因为播放器已经准备好了
    justSwitchedEpisodeRef.current = false;
    
    // 检查是否有续播时间需要设置
    const resumeTime = resumeTimeRef.current;
    if (resumeTime !== null && resumeTime !== undefined) {
      console.log('✅ 检测到续播时间，将在视频准备好后设置:', resumeTime);
    }
    
    // 不立即设置播放状态，等待视频元素真正准备好
    // 对于 HLS 视频，需要等待 manifest 解析完成
    // 对于普通视频，需要等待 readyState >= 2
    
    // 延迟检查视频元素状态，确保视频真正准备好
    setTimeout(() => {
      try {
        const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                           (playerRef.current?.wrapper?.querySelector?.('video'));
        
        if (!videoElement || !document.contains(videoElement)) {
          console.warn('视频元素不存在或已被移除');
          return;
        }
        
        // 使用 ArtPlayer 自带控件：关闭原生 controls，避免重复控制条
        videoElement.removeAttribute('controls');
        videoElement.controls = false;
        
        // 如果有续播时间，先设置续播时间
        if (resumeTime !== null && resumeTime !== undefined) {
          const setResumeTime = () => {
            try {
              if (videoElement.readyState >= 1) {
                // 视频元数据已加载，可以设置时间
                videoElement.currentTime = resumeTime;
                console.log('✅ 续播时间设置成功:', resumeTime, '秒');
                resumeTimeRef.current = null; // 清除续播时间，避免重复设置
              } else {
                // 视频元数据未加载，等待加载完成
                const onLoadedMetadata = () => {
                  if (document.contains(videoElement)) {
                    videoElement.currentTime = resumeTime;
                    console.log('✅ 续播时间设置成功（元数据加载后）:', resumeTime, '秒');
                    resumeTimeRef.current = null; // 清除续播时间
                    videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                  }
                };
                videoElement.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
              }
            } catch (error) {
              console.error('设置续播时间时出错:', error);
            }
          };
          setResumeTime();
        }
        
        const isHLSVideo = playUrl.url?.includes('m3u8');
        
        // 检查 HLS 实例状态
        if (isHLSVideo) {
          // 检查是否已有 HLS 实例附加到 video 元素
          const hlsInstance = videoElement.hls;
          
          if (hlsInstance && hlsInstance.media === videoElement) {
            // HLS 实例已附加，等待 manifest 解析完成
            console.log('检测到 HLS 实例，等待 manifest 解析完成...');
            
            // 如果 manifest 已经解析完成，直接播放
            if (hlsInstance.levels && hlsInstance.levels.length > 0) {
              console.log('HLS manifest 已解析，等待视频元素准备好');
              // 等待视频元素准备好
              const checkAndPlay = () => {
                if (document.contains(videoElement) && videoElement.readyState >= 1) {
                  // 如果有续播时间，先设置续播时间
                  if (resumeTime !== null && resumeTime !== undefined && resumeTimeRef.current !== null) {
                    try {
                      videoElement.currentTime = resumeTime;
                      console.log('✅ HLS 续播时间设置成功:', resumeTime, '秒');
                      resumeTimeRef.current = null; // 清除续播时间
                    } catch (error) {
                      console.error('设置 HLS 续播时间时出错:', error);
                    }
                  }
                  console.log('HLS 视频已准备好，检查是否可以播放');
                  console.log('🔍 状态检查:', {
                    'userPausedRef.current': userPausedRef.current,
                    'controller.state.userPaused': controller.state.userPaused,
                    'isPlaying': isPlaying,
                    'isPlayingRef.current': isPlayingRef.current,
                    'canPlay': controller.canPlay()
                  });
                  
                  // 🎮 使用控制器判断是否可以播放
                  if (controller.canPlay()) {
                    console.log('✅ 可以播放，开始播放');
    setIsPlaying(true);
                  if (videoElement.paused && !isSeekingRef.current) {
                    videoElement.play().catch(err => {
                      if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                        console.warn('HLS 播放失败:', err);
                      }
                    });
                    }
                  } else {
                    console.log('❌ 不能播放（userPaused =', controller.state.userPaused, '）');
                  }
                } else {
                  // 如果还没准备好，等待 canplay 事件
                  const onCanPlay = () => {
                    if (document.contains(videoElement)) {
                      // 如果有续播时间，先设置续播时间
                      if (resumeTime !== null && resumeTime !== undefined && resumeTimeRef.current !== null) {
                        try {
                          videoElement.currentTime = resumeTime;
                          console.log('✅ HLS 续播时间设置成功（canplay）:', resumeTime, '秒');
                          resumeTimeRef.current = null; // 清除续播时间
                        } catch (error) {
                          console.error('设置 HLS 续播时间时出错:', error);
                        }
                      }
                      console.log('HLS 视频可以播放，检查是否可以播放');
                      // 🎮 使用控制器判断是否可以播放
                      if (controller.canPlay()) {
                        console.log('✅ 可以播放，开始播放');
                      setIsPlaying(true);
                      if (videoElement.paused && !isSeekingRef.current) {
                        videoElement.play().catch(err => {
                          if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                            console.warn('HLS 播放失败:', err);
                          }
                        });
                        }
                      } else {
                        console.log('❌ 不能播放（userPaused =', controller.state.userPaused, '）');
                      }
                    }
                    videoElement.removeEventListener('canplay', onCanPlay);
                  };
                  videoElement.addEventListener('canplay', onCanPlay, { once: true });
                }
              };
              
              // 延迟一点检查，给视频元素时间初始化
              setTimeout(checkAndPlay, 200);
            } else {
              // manifest 还没解析完成，等待 MANIFEST_PARSED 事件
              console.log('等待 HLS manifest 解析...');
              const onManifestParsed = () => {
                console.log('HLS manifest 解析完成，等待视频元素准备好');
                const waitForReady = () => {
                  if (document.contains(videoElement) && videoElement.readyState >= 1) {
                    console.log('HLS 视频已准备好，设置播放状态');
                    // 只有在用户没有手动暂停时才自动播放
                    if (!userPausedRef.current) {
                    setIsPlaying(true);
                    if (videoElement.paused && !isSeekingRef.current) {
                      videoElement.play().catch(err => {
                        if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                          console.warn('HLS 播放失败:', err);
                        }
                      });
                      }
                    } else {
                      console.log('用户已手动暂停，不自动播放');
                    }
                  } else {
                    // 等待 canplay 事件
                    const onCanPlay = () => {
                      if (document.contains(videoElement)) {
                        console.log('HLS 视频可以播放，设置播放状态');
                        // 只有在用户没有手动暂停时才自动播放
                        if (!userPausedRef.current) {
                        setIsPlaying(true);
                        if (videoElement.paused && !isSeekingRef.current) {
                          videoElement.play().catch(err => {
                            if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                              console.warn('HLS 播放失败:', err);
                            }
                          });
                          }
                        } else {
                          console.log('用户已手动暂停，不自动播放');
                        }
                      }
                      videoElement.removeEventListener('canplay', onCanPlay);
                    };
                    videoElement.addEventListener('canplay', onCanPlay, { once: true });
                  }
                };
                setTimeout(waitForReady, 500);
                hlsInstance.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
              };
              hlsInstance.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
              
              // 设置超时，如果 5 秒后还没有解析完成，也尝试播放（可能是网络慢）
    setTimeout(() => {
                if (document.contains(videoElement) && videoElement.readyState >= 1) {
                  console.log('HLS manifest 解析超时，尝试播放');
                  // 只有在用户没有手动暂停时才自动播放
                  if (!userPausedRef.current) {
                  setIsPlaying(true);
                  if (videoElement.paused && !isSeekingRef.current) {
                    videoElement.play().catch(err => {
                      if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                        console.warn('HLS 播放失败:', err);
                      }
                    });
                    }
                  } else {
                    console.log('用户已手动暂停，不自动播放');
                  }
                }
              }, 5000);
            }
            
            return; // HLS 视频已处理，不需要继续普通视频的逻辑
          } else {
            // HLS 实例还没创建（可能在 onStart 中延迟创建），等待一下
            console.log('HLS 实例还未创建，等待 onStart 回调创建...');
            // 不立即返回，让普通视频的逻辑处理（但 HLS 视频的 readyState 可能一直是 0）
            // 实际上，对于 HLS 视频，我们应该等待 onStart 中创建的实例
            // 所以这里先不设置播放状态，等待 onStart 中的 MANIFEST_PARSED 事件
            return;
          }
        }
        
        // 对于普通视频，检查 readyState
        // 需要等待 readyState >= 3 (HAVE_FUTURE_DATA) 或至少 >= 2 (HAVE_CURRENT_DATA) 才能安全播放
        if (videoElement.readyState >= 3) {
          // 视频已加载足够数据，可以安全播放
          // 如果有续播时间，先设置续播时间
          if (resumeTime !== null && resumeTime !== undefined && resumeTimeRef.current !== null) {
            try {
              videoElement.currentTime = resumeTime;
              console.log('✅ 续播时间设置成功 (readyState >= 3):', resumeTime, '秒');
              resumeTimeRef.current = null; // 清除续播时间
            } catch (error) {
              console.error('设置续播时间时出错:', error);
            }
          }
          console.log('视频元素已准备好 (readyState >= 3)，检查是否可以播放');
          // 🎮 使用控制器判断是否可以播放
          if (controller.canPlay()) {
            console.log('✅ 可以播放，开始播放');
          setIsPlaying(true);
          if (videoElement.paused && !isSeekingRef.current) {
            videoElement.play().catch(err => {
              if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                console.warn('播放失败:', err);
              }
            });
            }
          } else {
            console.log('❌ 不能播放（userPaused =', controller.state.userPaused, '）');
          }
        } else if (videoElement.readyState >= 2) {
          // readyState >= 2，等待 canplaythrough 事件（表示可以流畅播放）
          console.log('视频元素 readyState >= 2，等待 canplaythrough...');
          const onCanPlayThrough = () => {
            if (document.contains(videoElement)) {
              // 如果有续播时间，先设置续播时间
              if (resumeTime !== null && resumeTime !== undefined && resumeTimeRef.current !== null) {
                try {
                  videoElement.currentTime = resumeTime;
                  console.log('✅ 续播时间设置成功 (canplaythrough):', resumeTime, '秒');
                  resumeTimeRef.current = null; // 清除续播时间
                } catch (error) {
                  console.error('设置续播时间时出错:', error);
                }
              }
              console.log('视频可以流畅播放，检查是否可以播放');
              // 🎮 使用控制器判断是否可以播放
              if (controller.canPlay()) {
                console.log('✅ 可以播放，开始播放');
              setIsPlaying(true);
              if (videoElement.paused && !isSeekingRef.current) {
                videoElement.play().catch(err => {
                  if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                    console.warn('播放失败:', err);
                  }
                });
                }
              } else {
                console.log('❌ 不能播放（userPaused =', controller.state.userPaused, '）');
                // 确保视频元素处于暂停状态
                if (!videoElement.paused) {
                  videoElement.pause().catch(() => {});
                }
                setIsPlaying(false);
                isPlayingRef.current = false;
              }
            }
            videoElement.removeEventListener('canplaythrough', onCanPlayThrough);
          };
          videoElement.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
          
          // 也监听 canplay 事件作为后备
        } else {
          // readyState < 2，等待 canplay 事件
          console.log('视频元素 readyState < 2，等待 canplay...');
          const onCanPlay = () => {
            if (document.contains(videoElement)) {
              // 如果有续播时间，先设置续播时间
              if (resumeTime !== null && resumeTime !== undefined && resumeTimeRef.current !== null) {
                try {
                  videoElement.currentTime = resumeTime;
                  console.log('✅ 续播时间设置成功 (canplay):', resumeTime, '秒');
                  resumeTimeRef.current = null; // 清除续播时间
                } catch (error) {
                  console.error('设置续播时间时出错:', error);
                }
              }
              console.log('视频可以播放，检查是否可以播放');
              // 🎮 使用控制器判断是否可以播放
              if (controller.canPlay()) {
                console.log('✅ 可以播放，开始播放');
              setIsPlaying(true);
              if (videoElement.paused && !isSeekingRef.current) {
                videoElement.play().catch(err => {
                  if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                    console.warn('播放失败:', err);
                  }
                });
                }
              } else {
                console.log('❌ 不能播放（userPaused =', controller.state.userPaused, '）');
                // 确保视频元素处于暂停状态
                if (!videoElement.paused) {
                  videoElement.pause().catch(() => {});
                }
                setIsPlaying(false);
                isPlayingRef.current = false;
              }
            }
            videoElement.removeEventListener('canplay', onCanPlay);
          };
          videoElement.addEventListener('canplay', onCanPlay, { once: true });
        }
      } catch (error) {
        console.error('检查视频元素状态时出错:', error);
      }
    }, 500);
  };

  // 提取续播逻辑为独立函数（使用 useCallback 确保函数引用稳定）
  // 注意：此函数必须在 handlePlay、handlePlayFromTime 和 handleMoviePlay 之后定义
  const executeAutoPlayFromHistory = useCallback((playHistory) => {
    console.log('executeAutoPlayFromHistory 被调用:', {
      playHistory,
      hasVideoInfo: !!videoInfo,
      hasAutoPlayed: hasAutoPlayFromHistoryRef.current,
      selectedEpisode,
      isEpisodePlaying
    });
    
    if (!playHistory) {
      console.warn('executeAutoPlayFromHistory: 没有播放记录数据');
      return;
    }
    
    if (!videoInfo) {
      console.warn('executeAutoPlayFromHistory: videoInfo 未加载，等待加载完成');
      return;
    }
    
    if (hasAutoPlayFromHistoryRef.current) {
      console.warn('executeAutoPlayFromHistory: 已经处理过续播，跳过');
      return;
    }
    
    // 判断是否为剧集类型
    const isEpisodeType = ['tv', 'anime', 'tvshow', 'documentary', 'doc'].includes(
      playHistory.videoType || videoInfo.type
    );
    
    console.log('executeAutoPlayFromHistory: 判断视频类型', {
      videoType: playHistory.videoType || videoInfo.type,
      isEpisodeType,
      episode: playHistory.episode
    });
    
    if (isEpisodeType && playHistory.episode !== null && playHistory.episode !== undefined) {
      // 等待episodes数据加载
      if (episodes.data && episodes.data.length > 0) {
        // 检查该集数是否存在
        const episodeExists = episodes.data.some(ep => {
          const episodeNumber = ep.episode_number || ep.id;
          return episodeNumber === playHistory.episode;
        });
        
        console.log('executeAutoPlayFromHistory: 检查集数', {
          episodeExists,
          targetEpisode: playHistory.episode,
          selectedEpisode,
          isEpisodePlaying
        });
        
        // 放宽条件：即使 selectedEpisode 已设置，如果集数匹配，也允许续播
        if (episodeExists && (selectedEpisode === null || selectedEpisode === undefined || selectedEpisode === playHistory.episode)) {
          if (hasAutoPlayFromHistoryRef.current) {
            wtvPlayLog('history.autoplay.skipDuplicate', { videoId: id, episode: playHistory.episode });
            return;
          }
          hasAutoPlayFromHistoryRef.current = true;
          console.log('✅ 从播放记录自动选择集数:', playHistory.episode, '续播进度:', playHistory.progress);
          setTimeout(() => {
            const progress = Number(playHistory.progress) || 0;
            const duration = Number(playHistory.duration) || 0;
            console.log('准备续播，进度:', progress, '总时长:', duration);
            if (progress > 0 && (duration === 0 || progress < duration)) {
              console.log('✅ 从播放记录续播，进度:', progress, '总时长:', duration);
              handlePlayFromTime(playHistory.episode, progress);
            } else {
              console.log('从播放记录从头播放（进度为0或已播放完成）');
              handlePlay(playHistory.episode);
            }
          }, 300);
        } else {
          console.warn('executeAutoPlayFromHistory: 集数不存在或条件不满足', {
            episodeExists,
            selectedEpisode,
            isEpisodePlaying,
            targetEpisode: playHistory.episode
          });
        }
      } else {
        console.warn('executeAutoPlayFromHistory: episodes 数据未加载');
      }
    } else if (!isEpisodeType && playHistory.episode === null) {
      // 电影类型，自动开始播放
      const progress = Number(playHistory.progress) || 0;
      const duration = Number(playHistory.duration) || 0;
      console.log('✅ 从播放记录自动播放电影，续播进度:', progress, '总时长:', duration);
      hasAutoPlayFromHistoryRef.current = true;
      setTimeout(() => {
        if (progress > 0 && (duration === 0 || progress < duration)) {
          console.log('从播放记录续播电影，进度:', progress);
          // 存储续播时间，等待播放器准备好后设置
          resumeTimeRef.current = progress;
          console.log('✅ 设置电影续播时间到 ref:', progress);
          handleMoviePlay();
        } else {
          // 从头播放，清除续播时间
          resumeTimeRef.current = null;
          handleMoviePlay();
        }
      }, 300);
    }
  }, [videoInfo, episodes.data, selectedEpisode, isMoviePlaying, isEpisodePlaying, handlePlay, handlePlayFromTime, handleMoviePlay, playerRefInternal, playerRef, setIsPlaying]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // 从播放记录跳转时，自动选择对应的集数并开始播放
  // 注意：此 useEffect 必须在 executeAutoPlayFromHistory 定义之后
  // 重要：只有从播放记录列表进入时才续播（通过 location.state?.playHistory 判断）
  // 从其他列表进入时，即使有播放记录，也不续播，但播放时会更新播放记录
  useEffect(() => {
    // 优先从 location.state 获取播放记录（只有从播放记录列表进入时才会传递）
    let playHistory = location.state?.playHistory;
    
    // 如果没有从 state 获取到，尝试从 Electron API 获取的 videoData 中读取
    // 这是为了支持 Electron 窗口打开的情况（从播放记录列表打开时）
    if (!playHistory && window.electronAPI && window.electronAPI.getVideoData) {
      window.electronAPI.getVideoData().then((data) => {
        if (data?.playHistory) {
          const electronPlayHistory = data.playHistory;
          console.log('✅ 从 Electron API 获取播放记录（从播放记录列表进入）:', electronPlayHistory);
          // 如果 videoInfo 已加载，立即执行续播逻辑
          if (videoInfo && !hasAutoPlayFromHistoryRef.current) {
            console.log('videoInfo 已加载，立即执行续播逻辑（Electron API）');
            executeAutoPlayFromHistory(electronPlayHistory);
          } else {
            console.log('等待 videoInfo 加载完成（Electron API）...', { hasVideoInfo: !!videoInfo, hasAutoPlayed: hasAutoPlayFromHistoryRef.current });
          }
        } else {
          console.log('Electron API 数据中没有 playHistory');
        }
      }).catch(err => {
        console.error('从 Electron API 获取播放记录失败:', err);
      });
      return; // 等待 Electron API 回调
    }
    
    // 如果没有从 state 或 Electron API 获取到 playHistory，说明不是从播放记录列表进入
    // 不执行续播，但播放时会正常更新播放记录
    if (!playHistory) {
      console.log('不是从播放记录列表进入，跳过续播（但播放时会更新播放记录）');
      return;
    }
    
    if (!videoInfo) {
      console.log('videoInfo 未加载，等待加载完成后再续播');
      return;
    }
    
    if (hasAutoPlayFromHistoryRef.current) {
      console.log('已经处理过续播，跳过');
      return;
    }
    
    // 执行续播逻辑（只有从播放记录列表进入时才会执行到这里）
    console.log('✅ 从播放记录列表进入，准备执行续播逻辑，播放记录:', playHistory);
    executeAutoPlayFromHistory(playHistory);
  }, [location.state, videoInfo, episodes.data, selectedEpisode, isMoviePlaying, isEpisodePlaying, executeAutoPlayFromHistory]);
  
  // 当 videoInfo 加载完成后，如果之前从 Electron API 获取到了 playHistory，也触发续播
  // 注意：只有从播放记录列表进入时才会执行续播
  useEffect(() => {
    if (videoInfo && window.electronAPI && window.electronAPI.getVideoData && !hasAutoPlayFromHistoryRef.current) {
      window.electronAPI.getVideoData().then((data) => {
        // 只有从播放记录列表进入时（通过 location.state 或 Electron API 传递 playHistory）才续播
        if (data?.playHistory && (location.state?.playHistory || data.playHistory)) {
          console.log('videoInfo 加载完成，从 Electron API 获取播放记录并续播（从播放记录列表进入）:', data.playHistory);
          executeAutoPlayFromHistory(data.playHistory);
        }
      }).catch(err => {
        // 忽略错误，可能已经处理过了
      });
    }
  }, [videoInfo, executeAutoPlayFromHistory, location.state]);

  // 初始化全屏状态
  useEffect(() => {
    const checkFullscreen = () => {
      const currentlyFullscreen = !!(document.fullscreenElement || 
                                     document.webkitFullscreenElement || 
                                     document.mozFullScreenElement || 
                                     document.msFullscreenElement);
      setIsFullscreen(currentlyFullscreen);
    };
    
    checkFullscreen();
    
    // 监听全屏变化
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);
    
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      document.removeEventListener('mozfullscreenchange', checkFullscreen);
      document.removeEventListener('MSFullscreenChange', checkFullscreen);
    };
  }, []);

  // 播放器就绪后，持续同步“文档全屏状态”与“Electron 窗口全屏状态”
  // 避免出现“窗口全屏残留，导致后续无法正常退出”的情况
  useEffect(() => {
    if (!playerReady) return;

    const syncFullscreenState = () => {
      const currentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(currentlyFullscreen);

      if (!currentlyFullscreen && window.electronAPI?.isFullScreen && window.electronAPI?.setFullScreen) {
        window.electronAPI.isFullScreen()
          .then((isWindowFullscreen) => {
            if (isWindowFullscreen) {
              window.electronAPI.setFullScreen(false).catch(() => {});
            }
          })
          .catch(() => {});
      }
    };

    const handleEscSync = (event) => {
      if (event.key !== 'Escape') return;
      syncFullscreenState();
    };

    const syncTimer = window.setInterval(syncFullscreenState, 1200);

    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    document.addEventListener('mozfullscreenchange', syncFullscreenState);
    document.addEventListener('MSFullscreenChange', syncFullscreenState);
    document.addEventListener('keydown', handleEscSync);

    return () => {
      window.clearInterval(syncTimer);
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
      document.removeEventListener('mozfullscreenchange', syncFullscreenState);
      document.removeEventListener('MSFullscreenChange', syncFullscreenState);
      document.removeEventListener('keydown', handleEscSync);
    };
  }, [playerReady]);

  const togglePlayerFullscreen = useCallback(async () => {
    const getDocFullscreenElement = () => (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );

    const exitDocFullscreen = async () => {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
      if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
      if (document.msExitFullscreen) return document.msExitFullscreen();
      return Promise.resolve();
    };

    const requestDocFullscreen = async (element) => {
      if (!element) return Promise.reject(new Error('no-fullscreen-element'));
      if (element.requestFullscreen) return element.requestFullscreen();
      if (element.webkitRequestFullscreen) return element.webkitRequestFullscreen();
      if (element.mozRequestFullScreen) return element.mozRequestFullScreen();
      if (element.msRequestFullscreen) return element.msRequestFullscreen();
      return Promise.reject(new Error('fullscreen-not-supported'));
    };

    try {
      const isDocFullscreen = !!getDocFullscreenElement();
      if (isDocFullscreen) {
        await exitDocFullscreen();
        setIsFullscreen(false);
        if (window.electronAPI?.setFullScreen) {
          window.electronAPI.setFullScreen(false).catch(() => {});
        }
        return;
      }

      if (window.electronAPI?.isFullScreen && window.electronAPI?.setFullScreen) {
        try {
          const isWindowFullscreen = await window.electronAPI.isFullScreen();
          if (isWindowFullscreen) {
            await window.electronAPI.setFullScreen(false);
            // 处于“窗口全屏但文档未全屏”的异常状态时，
            // 本次点击仅用于退出窗口全屏，避免立即再次进入全屏导致无法退出。
            setIsFullscreen(false);
            return;
          }
        } catch (_) {
          // ignore
        }
      }

      const videoElement = (() => {
        try {
          return getVideoElement();
        } catch (e) {
          return null;
        }
      })() || playerRef.current?.wrapper?.querySelector?.('video');

      const fullscreenTarget = playerRef.current?.wrapper || videoElement?.parentElement || videoElement;
      await requestDocFullscreen(fullscreenTarget);
      setIsFullscreen(true);
    } catch (err) {
      console.error('切换全屏失败:', err);
    }
  }, [getVideoElement]);

  const togglePictureInPicture = useCallback(async () => {
    try {
      const videoElement = (() => {
        try {
          return getVideoElement();
        } catch (e) {
          return null;
        }
      })() || (playerRef.current?.wrapper?.querySelector?.('video'));

      if (!videoElement || !document.pictureInPictureEnabled) {
        console.warn('画中画功能不可用');
        return;
      }

      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPictureInPicture(false);
      } else {
        await videoElement.requestPictureInPicture();
        setIsPictureInPicture(true);
      }
    } catch (err) {
      console.error('画中画操作失败:', err);
    }
  }, [getVideoElement]);

  const handleVideoFitModeChange = useCallback((mode) => {
    setVideoFitMode(mode);
    localStorage.setItem('wtv_video_fit_mode', mode);
    updatePlayerSetting('videoFitMode', mode);
  }, []);

  // 统一持久化播放设置：确保关闭前最后状态可恢复
  useEffect(() => {
    const persistSettings = () => {
      updatePlayerSetting('volume', volume);
      updatePlayerSetting('muted', muted);
      updatePlayerSetting('playbackRate', playbackRate);
      updatePlayerSetting('videoFitMode', videoFitMode);
      updatePlayerSetting('autoNextEpisode', autoNextEpisode);
    };

    // 状态变化时持久化一份，避免异常退出丢失设置
    persistSettings();

    // 关闭窗口/刷新时再落盘一次，保证“最后一次”设置生效
    window.addEventListener('beforeunload', persistSettings);
    window.addEventListener('pagehide', persistSettings);
    return () => {
      window.removeEventListener('beforeunload', persistSettings);
      window.removeEventListener('pagehide', persistSettings);
      persistSettings();
    };
  }, [volume, muted, playbackRate, videoFitMode, autoNextEpisode]);

  // 处理点击推荐视频，在新窗口打开视频详情页
  const handleRelatedVideoClick = async (e, video) => {
    e.preventDefault();
    
    // 规范化视频数据，确保封面图字段一致
    const normalizedVideo = normalizeVideoInfo(video);
    
    console.log('点击推荐视频:', normalizedVideo);
    
    // 使用 Electron API 在新窗口打开视频详情页（如果窗口已存在则更新内容）
    if (window.electronAPI && window.electronAPI.openVideoWindow) {
      try {
        await window.electronAPI.openVideoWindow(normalizedVideo.id, normalizedVideo);
      } catch (err) {
        console.error('打开视频详情窗口失败:', err);
        showCenterTip('打开视频详情窗口失败');
      }
      return;
    }

    // 在播放窗口中不允许回退为当前窗口内跳转，避免把播放页切成详情页
    if (isPlayerWindow) {
      showCenterTip('当前环境不支持打开视频详情窗口');
      return;
    }

    {
      // 降级处理：如果没有 Electron API，使用 navigate（开发环境可能用到）
    dispatch(clearPlayUrl());
    dispatch(clearEpisodes());
      setVideoInfo(normalizedVideo);
    setSelectedEpisode(null);
    setIsPlaying(false);
      setIsMoviePlaying(false);
      setIsEpisodePlaying(false);
      setPlayerReady(false);
    setPlayedSeconds(0);
    setSearchTerm('');
    setActiveSeason(1);
    setShowActorsModal(false);
      
      // 更新当前分类（如果推荐视频有分类信息）
      const mappedType = mapVideoType(normalizedVideo.type || normalizedVideo.category);
      if (mappedType) {
        dispatch(setCurrentCategory(mappedType));
      }
      
      navigate(`/video/${normalizedVideo.id}`, { 
      replace: true,
        state: { video: normalizedVideo } 
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
    // 视频标题和评分已删除，此函数不再需要返回任何内容
    return null;
  };

  const renderEpisodeList = () => {
    const type = mapVideoType(videoInfo?.type);
    const hasEpisodes = episodes.data && episodes.data.length > 0;
    const isEpisodeType = ['tv', 'tvshow', 'anime', 'doc'].includes(type);
    
    console.log('renderEpisodeList:', { type, isEpisodeType, hasEpisodes, length: episodes.data?.length });
    
    if (episodes.loading) {
      return (
        <div className="episode-list-sidebar">
          <div className="loading" style={{ padding: '20px', textAlign: 'center' }}>加载剧集列表中...</div>
        </div>
      );
    }
    
    // 如果既没有数据也不是剧集类型，则不渲染
    if (!hasEpisodes && !isEpisodeType) {
      return null;
    }

    // 如果是剧集类型但没有数据，显示提示
    if (isEpisodeType && !hasEpisodes) {
      return (
        <div className="episode-list-sidebar">
          <div className="no-data" style={{ padding: '20px', textAlign: 'center' }}>暂无剧集信息</div>
        </div>
      );
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

    // 剧集搜索过滤
    if (searchTerm.trim()) {
      const term = searchTerm.trim();
      currentSeasonEpisodes = currentSeasonEpisodes.filter(ep => {
        const title = ep.title || ep.name || '';
        const number = String(ep.episode_number || ep.id || '');
        return number.includes(term) || title.includes(term);
      });
    }
    
    // 判断是否超过20集
    const totalEpisodes = currentSeasonEpisodes.length;
    const shouldShowGroupTabs = totalEpisodes > 20;
    
    // 每20集为一组（仅在超过20集时使用）
    const episodeGroups = [];
    let currentGroup = [];
    let validGroupIndex = 0;
    
    if (shouldShowGroupTabs) {
      for (let i = 0; i < currentSeasonEpisodes.length; i += 20) {
        episodeGroups.push(currentSeasonEpisodes.slice(i, i + 20));
      }
      // 确保activeEpisodeGroup在有效范围内
      validGroupIndex = Math.min(activeEpisodeGroup, episodeGroups.length - 1);
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
          <input
            className="episode-search-input"
            placeholder="搜索剧集"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
                      return String(episodeNumber) === String(selectedEpisode);
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
              const progressKey = `${id}-${episodeNumber}`;
              const progressSeconds = playbackProgress[progressKey] || 0;
              const totalDuration = episode.total_duration || episode.duration || episode.length || 0;
              const progressPercent = totalDuration > 0 ? Math.min(100, (progressSeconds / totalDuration) * 100) : 0;
              
              return (
                <div
                  key={episodeNumber}
                  className={`episode-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handlePlay(episodeNumber)}
                  title={`第${episodeNumber}集${isNew ? ' (新)' : ''}`}
                >
                  <span className="episode-number">{episodeNumStr}</span>
                  {isNew && <span className="episode-new-badge">新</span>}
                  {progressPercent > 0 && (
                    <div className="episode-progress">
                      <div
                        className="episode-progress-bar"
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                  )}
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
    
    // 判断是否正在播放
    const type = mapVideoType(videoInfo.type);
    const isMovieType = type === 'movie';
    const isEpisodeType = ['tv', 'tvshow', 'anime', 'doc'].includes(type) || 
                         (episodes.data && episodes.data.length > 0);
    const isVideoPlaying = isMoviePlaying || isEpisodePlaying;
    
    // 如果正在播放，显示播放器
    if (isEpisodePlaying && isEpisodeType) {
      console.log('正在播放剧集:', videoInfo.title, '第', selectedEpisode, '集');
    }
    
    // 正常显示模式（未播放或非电影类型）
    // 根据新的设计要求：顶部16:9播放器区域（无播放时使用海报背景+高斯模糊）+ 新布局
    // isMovieType 已在上面声明，这里直接使用
    const actorsList = videoInfo.actors 
      ? (Array.isArray(videoInfo.actors) 
          ? videoInfo.actors 
          : (typeof videoInfo.actors === 'string' ? videoInfo.actors.split(',').map(a => a.trim()) : []))
      : [];
    
    // 格式化标签
    const tagsArray = videoInfo.tags 
      ? (Array.isArray(videoInfo.tags) ? videoInfo.tags : [videoInfo.tags])
      : [];
    
    // 格式化时长（如果有）
    const formatDuration = (duration) => {
      if (!duration) return null;
      if (typeof duration === 'string') {
        if (duration.includes('分钟') || duration.includes('分')) return duration;
        const num = parseInt(duration);
        if (!isNaN(num)) return `${num}分钟`;
      }
      if (typeof duration === 'number') {
        const minutes = Math.floor(duration / 60);
        return `${minutes}分钟`;
      }
      return duration;
    };
    const durationText = formatDuration(videoInfo.duration);
    
    // 获取年份
    const year = videoInfo.release_date ? videoInfo.release_date.split('-')[0] : (videoInfo.year || '');
    const country = videoInfo.country 
      ? (Array.isArray(videoInfo.country) ? videoInfo.country.join('、') : videoInfo.country)
      : '';
    
    return (
      <div className={`video-detail-content-new ${isVideoPlaying ? 'playing-mode' : ''}`}>
        {/* 顶部：16:9播放器区域（无播放时使用海报背景+高斯模糊） */}
        <div className={`video-detail-player-section ${isVideoPlaying ? 'player-expanded' : ''} ${showFullDescription ? 'desc-expanded' : ''}`}>
          {/* 背景层 - 只在未播放时显示 */}
          {!isVideoPlaying && (
            <div 
              className="video-detail-player-bg" 
              style={{ 
                backgroundImage: (videoInfo.cover_url || videoInfo.pic) ? `url(${videoInfo.cover_url || videoInfo.pic})` : 'none',
                backgroundColor: '#0f0f0f' 
              }}
            >
              {/* 高斯模糊遮罩 */}
              <div 
                className="video-detail-player-blur"
                style={{ 
                  backgroundImage: (videoInfo.cover_url || videoInfo.pic) ? `url(${videoInfo.cover_url || videoInfo.pic})` : 'none'
                }}
              ></div>
              {/* 底部渐变遮罩 */}
              <div className="video-detail-player-gradient"></div>
              </div>
            )}
          
          {/* 信息内容区域 - 磨砂透明，播放时隐藏 */}
          <div className={`video-detail-info-section-overlay ${isVideoPlaying ? 'info-section-hidden' : ''}`}>
              <div className="video-detail-info-container">
              <div className="video-detail-top">
                {!isVideoPlaying && (
                  <div className="video-cover">
                    <VideoImage
                      src={videoInfo.cover_url || videoInfo.pic}
                      alt={videoInfo.title || videoInfo.name || '封面'}
                    />
                    {/* 评分覆盖层 */}
                    {(videoInfo.score || videoInfo.rating) && (
                      <div className="video-rating-overlay">
                        <StarRating score={parseFloat(videoInfo.score || videoInfo.rating || 0)} />
                      </div>
                    )}
                    {/* 电影播放按钮 - 移至海报上 */}
                    {isMovieType && !isMoviePlaying && (
                      <div 
                        className="video-detail-play-button-on-poster" 
                        onClick={handleMoviePlay}
                      >
                        <div className="play-button-icon-poster"></div>
                      </div>
                    )}
                  </div>
                )}

                <div className="video-detail-main-info">
                  {/* 标题、评分与收藏 */}
                  <div className="video-detail-title-wrapper">
                    <button
                      className={`title-favorite-icon ${isFavorite ? 'favorited' : ''}`}
                      onClick={handleToggleFavorite}
                      title={isFavorite ? '取消收藏' : '收藏'}
                    >
                      {isFavorite ? '❤️' : '🤍'}
                    </button>
                    <div 
                      className={`video-detail-title-container ${videoInfo.title && videoInfo.title.length > 15 ? 'scrollable' : ''}`}
                    >
                      <h1 
                        className="video-detail-title"
                        onMouseEnter={(e) => {
                          if (videoInfo.title && videoInfo.title.length > 15) {
                            const tooltip = e.currentTarget.querySelector('.title-tooltip');
                            if (tooltip) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              tooltip.style.left = rect.left + 'px';
                              tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
                              tooltip.style.display = 'block';
                              requestAnimationFrame(() => {
                                tooltip.style.opacity = '1';
                              });
                            }
                          }
                        }}
                        onMouseLeave={(e) => {
                          const tooltip = e.currentTarget.querySelector('.title-tooltip');
                          if (tooltip) {
                            tooltip.style.opacity = '0';
                            setTimeout(() => {
                              if (tooltip.style.opacity === '0') {
                                tooltip.style.display = 'none';
                              }
                            }, 100);
                          }
                        }}
                      >
                        {videoInfo.title} {isEpisodePlaying && `(第${selectedEpisode}集)`}
                        {videoInfo.title && videoInfo.title.length > 15 && (
                          <span className="title-tooltip">{videoInfo.title}</span>
                        )}
                      </h1>
                    </div>
                  </div>
            
            {/* 标签组：胶囊状按钮 */}
            {!isVideoPlaying && (
            <div className="video-detail-tags-row">
              {tagsArray.map((tag, idx) => (
                <span key={idx} className="video-tag-pill">{tag}</span>
              ))}
              {durationText && (
                <span className="video-tag-pill">{durationText}</span>
            )}
          </div>
            )}
            
            {/* 评分、年份、地区（一行显示） */}
            {!isVideoPlaying && (
            <div className="video-detail-meta-row">
              {(videoInfo.score || videoInfo.rating) && (
                <span className="meta-item-inline">
                  <span className="meta-label-text">评分：</span>
                  <span className="meta-value-text">
                    {parseFloat(videoInfo.score || videoInfo.rating || 0).toFixed(1)}
                  </span>
                    </span>
                  )}
              {year && (
                <span className="meta-item-inline">
                  <span className="meta-separator">|</span>
                  <span className="meta-value-text">{year}</span>
                    </span>
                  )}
              {country && (
                <span className="meta-item-inline">
                  <span className="meta-separator">|</span>
                  <span className="meta-value-text">{country}</span>
                </span>
              )}
            </div>
            )}
            
            {/* 导演：顿号分隔 */}
            {!isVideoPlaying && videoInfo.director && (
              <div className="video-detail-info-row">
                <span className="info-label-dark">导演：</span>
                <span className="info-value-directors">
                  {(Array.isArray(videoInfo.director) ? videoInfo.director : [videoInfo.director]).map((director, idx, arr) => (
                    <span key={idx}>
                      {director}
                      {idx < arr.length - 1 && '、'}
                    </span>
                  ))}
                </span>
              </div>
            )}
            
            {/* 演员：顿号分隔 */}
            {!isVideoPlaying && actorsList.length > 0 && (
              <div className="video-detail-info-row">
                <span className="info-label-dark">演员：</span>
                <span className="info-value-actors">
                  {actorsList.slice(0, 6).map((actor, idx) => (
                    <span key={idx}>
                      {typeof actor === 'string' ? actor.trim() : actor}
                      {idx < Math.min(actorsList.length, 6) - 1 && '、'}
                    </span>
                  ))}
                  {actorsList.length > 6 && (
                    <>
                      <span>、</span>
                      <button 
                        className="more-actors-link"
                        onClick={() => setShowActorsModal(true)}
                      >
                          更多
                      </button>
                      </>
                    )}
                  </span>
                </div>
            )}
            
            {/* 简介折叠 */}
            {videoInfo.description && (
              <div className="video-detail-description">
                <p 
                  className={`description-text ${showFullDescription ? 'expanded' : ''}`}
                  ref={descriptionRef}
                >
                  {videoInfo.description}
                </p>
                {(isDescriptionOverflow || showFullDescription) && (
                  <button
                    className="description-toggle"
                    onClick={() => setShowFullDescription(!showFullDescription)}
                  >
                    {showFullDescription ? '收起' : '更多'}
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
          
              {/* 集数列表 - 移出 video-detail-top，独立于基本信息下方显示，防止长列表推高标题 */}
              {!isMovieType && (
                <div className="video-episodes-section">
                  {renderEpisodeList()}
          </div>
          )}
          
              {/* 继续观看（播放页面不显示） */}
              {!isVideoPlaying && renderWatchHistory()}

              {/* 为你推荐 */}
              {renderRelatedVideos()}
            </div>
        </div>
        
          
          {/* 播放器区域 - 当播放时显示 */}
          {isVideoPlaying && renderPlayer()}
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
    // 判断是否正在播放任何类型
    const type = mapVideoType(videoInfo?.type);
    const isMovieType = type === 'movie';
    // 使用播放状态作为主判定，避免 videoInfo.type 尚未就绪时控制栏按钮延迟出现
    const isEpisodeType = !isMovieType && isEpisodePlaying;
    // 只要 isMoviePlaying 或 isEpisodePlaying 为真，就应该渲染播放器
    const isVideoPlaying = isMoviePlaying || isEpisodePlaying;
    const nextEpisodeNumber = isEpisodeType ? getNextEpisodeNumber() : null;
    const canNextEpisode = nextEpisodeNumber !== null && nextEpisodeNumber !== undefined;
    
    console.log('renderPlayer called:', { 
      type, 
      isMovieType, 
      isMoviePlaying, 
      isEpisodePlaying, 
      isVideoPlaying,
      hasUrl: !!playUrl.url,
      loading: playUrl.loading,
      error: playUrl.error
    });
    
    if (!isVideoPlaying) return null;
    
    // 如果正在加载播放地址
    if (playUrl.loading) {
    return (
        <div className="video-detail-player-overlay">
          <div className="loading-container">
            <div className="loading">
              加载中...
            </div>
            {isEpisodeType && (
              <div className="player-loading-actions">
                <button
                  className={`player-loading-action-btn ${!canNextEpisode ? 'is-disabled' : ''}`}
                  disabled={!canNextEpisode}
                  onClick={() => {
                    if (canNextEpisode) {
                      handlePlayNextEpisode();
                    }
                  }}
                >
                  下一集
                </button>
                <button
                  className={`player-loading-action-btn ${autoNextEpisode ? 'is-active' : ''}`}
                  onClick={() => toggleAutoNextEpisode({ showTip: true })}
                >
                  连播：{autoNextEpisode ? '开' : '关'}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
    
    // 如果获取播放地址失败
    if (playUrl.error) {
      // 格式化错误信息，确保显示有意义的字符串
      const formatError = (error) => {
        if (!error) return '未知错误';
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (error.toString && error.toString() !== '[object Object]') return error.toString();
        if (error.error) return formatError(error.error);
        if (error.data?.message) return error.data.message;
        if (error.response?.data?.message) return error.response.data.message;
        // 尝试 JSON 序列化
        try {
          const jsonStr = JSON.stringify(error);
          if (jsonStr !== '{}') return jsonStr;
        } catch (e) {}
        return '播放错误，请重试';
      };
      
      const errorMessage = formatError(playUrl.error);
      
      return (
        <div className="video-detail-player-overlay">
          <div className="error-container">
            <div className="error-message">播放错误: {errorMessage}</div>
            <button className="control-button" onClick={() => {
              if (isMovieType) {
                handleMoviePlay();
              } else {
                handlePlay(selectedEpisode || 1);
              }
            }}>
              重试
                </button>
            </div>
          </div>
      );
    }
    
    // 如果没有播放地址，且不在加载中，显示提示
    if (!playUrl.url && !playUrl.loading) {
      return (
        <div className="video-detail-player-overlay">
          <div className="error-container">
            <div className="error-message">未获取到播放地址</div>
            <div className="error-detail" style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
              类型: {type}, ID: {id}
            </div>
            <button className="control-button" onClick={() => {
              if (isMovieType) {
                handleMoviePlay();
              } else {
                handlePlay(selectedEpisode || 1);
              }
            }}>
              重新获取
                </button>
            </div>
          </div>
      );
    }
    
    // 如果没有播放地址，不显示播放器
    if (!playUrl.url) {
      return null;
    }
    
    // 渲染播放器
    // 如果有加载错误或超时，显示错误信息
    if (videoLoadError || videoLoadTimeout) {
      const isHLS = playUrl.url?.toLowerCase().includes('.m3u8') || 
                   playUrl.url?.toLowerCase().includes('hls');
      const errorMessage = videoLoadTimeout 
        ? `视频加载超时${isHLS ? '（HLS视频可能需要更长时间）' : '，请检查网络连接'}` 
        : (videoLoadError || '视频加载失败');
      
      return (
        <div className="video-detail-player-overlay">
          <div className="error-container">
            <div className="error-message">{errorMessage}</div>
            <div className="error-detail" style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
              URL: {playUrl.url ? (playUrl.url.length > 60 ? playUrl.url.substring(0, 60) + '...' : playUrl.url) : '无'}
            </div>
            {isHLS && videoLoadTimeout && (
              <div className="error-detail" style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
                提示：HLS视频流加载可能需要更长时间，请确保网络连接稳定
              </div>
            )}
            <button className="control-button" onClick={() => {
              setVideoLoadError(null);
              setVideoLoadTimeout(false);
              errorRetryRef.current = 0; // 重置错误重试计数
              // 清除超时定时器
              if (videoLoadTimeoutRef.current) {
                clearTimeout(videoLoadTimeoutRef.current);
                videoLoadTimeoutRef.current = null;
              }
              // 清除格式错误重试定时器
              if (formatErrorRetryTimerRef.current) {
                clearTimeout(formatErrorRetryTimerRef.current);
                formatErrorRetryTimerRef.current = null;
              }
              if (isMovieType) {
                handleMoviePlay();
              } else {
                handlePlay(selectedEpisode || 1);
              }
            }}>
              重试
            </button>
          </div>
        </div>
      );
    }

            return (
      <div className="video-detail-player-overlay">
        <div className="player-ui-shell">
        <div className="video-player-container-inline" ref={el => {
          if (el) {
            playerRef.current = {wrapper: el};
          }
        }}>
          <MyArtPlayer
            ref={playerRefInternal}
            key={`player-${id}-${selectedEpisode || 'movie'}-${playUrl.url}`}
            url={playUrl.url}
            videoId={id}
            playing={controller.canPlay()}
            volume={volume}
            muted={muted}
            playbackRate={playbackRate}
            videoFitMode={videoFitMode}
            onVideoFitModeChange={handleVideoFitModeChange}
            autoNextEpisode={autoNextEpisode}
            onToggleAutoNextEpisode={(nextValue) => toggleAutoNextEpisode({ showTip: true, nextValue })}
            isFullscreen={isFullscreen}
            onToggleFullscreen={togglePlayerFullscreen}
            isPictureInPicture={isPictureInPicture}
            pictureInPictureEnabled={document.pictureInPictureEnabled}
            onTogglePictureInPicture={togglePictureInPicture}
            showNextEpisodeButton={isEpisodeType}
            canNextEpisode={canNextEpisode}
            onNextEpisodeClick={handlePlayNextEpisode}
            onNextEpisode={handleEnded}
            onVolumeChange={(newVolume, newMuted) => {
              if (Math.abs(currentVolumeRef.current - newVolume) > 0.01 || currentMutedRef.current !== newMuted) {
                currentVolumeRef.current = newVolume;
                currentMutedRef.current = newMuted;
                setVolume(newVolume);
                setMuted(newMuted);
                updatePlayerSetting('volume', newVolume);
                updatePlayerSetting('muted', newMuted);
              }
            }}
            onRateChange={(newRate) => {
              if (Math.abs(currentPlaybackRateRef.current - newRate) > 0.01) {
                currentPlaybackRateRef.current = newRate;
                setPlaybackRate(newRate);
                updatePlayerSetting('playbackRate', newRate);
              }
            }}
            onReady={() => {
              console.log('ReactPlayer onReady 被调用，准备开始播放');
              // 🎮 设置播放器准备状态
              controller.setPlayerReady(true);
              setPlayerReady(true);
              
              // 清除加载超时
              if (videoLoadTimeoutRef.current) {
                clearTimeout(videoLoadTimeoutRef.current);
                videoLoadTimeoutRef.current = null;
              }
              setVideoLoadError(null);
              setVideoLoadTimeout(false);
              handlePlayerReady();
              
              // 使用 ArtPlayer 自带控件：确保原生 controls 关闭，避免重复控制条
              setTimeout(() => {
                try {
                  const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() ||
                                     (playerRef.current?.wrapper?.querySelector?.('video'));
                  if (videoElement && document.contains(videoElement)) {
                    videoElement.removeAttribute('controls');
                    videoElement.controls = false;
                    
                    // 应用视频显示模式
                    if (videoElement.style) {
                      videoElement.style.objectFit = videoFitMode;
                    }
                    
                    // 清理之前的事件监听器（如果存在）
                    if (videoElement._eventListeners) {
                      videoElement._eventListeners.forEach(({ type, handler }) => {
                        videoElement.removeEventListener(type, handler);
                      });
                    }
                    
                    // 设置初始音量、静音和播放速度（仅在首次准备好时）
                    // 注意：这里使用当前的 state 值（volume, muted, playbackRate），这些值已经包含了用户的调整
                    if (!hasAppliedInitialSettingsRef.current) {
                      // 延迟设置，确保视频元素完全准备好
                      setTimeout(() => {
                        if (videoElement && document.contains(videoElement)) {
                          // 设置同步标志，避免事件监听器触发
                          isSyncingSettingsRef.current = true;
                          
                          // 使用当前的 state 值，这些值已经包含了用户的调整
                          videoElement.volume = volume;
                          videoElement.muted = muted;
                          videoElement.playbackRate = playbackRate;
                          
                          // 同步更新 ref，避免事件监听误判
                          currentVolumeRef.current = volume;
                          currentMutedRef.current = muted;
                          currentPlaybackRateRef.current = playbackRate;
                          hasAppliedInitialSettingsRef.current = true;
                          
                          console.log('在onReady中应用播放器设置:', { volume, muted, playbackRate });
                          
                          // 清除同步标志
                          setTimeout(() => {
                            isSyncingSettingsRef.current = false;
                          }, 200);
                        }
                      }, 100);
                    } else {
                      // 如果已经应用过初始设置，但视频元素的值与 state 不同，也需要同步
                      // 这通常发生在视频重新加载时（比如切换集数）
                      setTimeout(() => {
                        if (videoElement && document.contains(videoElement)) {
                          const volumeDiff = Math.abs(videoElement.volume - volume);
                          const rateDiff = Math.abs(videoElement.playbackRate - playbackRate);
                          
                          // 如果值不同，同步到视频元素（使用当前的 state 值）
                          if (volumeDiff > 0.01 || videoElement.muted !== muted || rateDiff > 0.01) {
                            console.log('视频重新加载，同步播放器设置到视频元素:', { 
                              volume, 
                              muted, 
                              playbackRate,
                              currentVolume: videoElement.volume,
                              currentMuted: videoElement.muted,
                              currentRate: videoElement.playbackRate
                            });
                            
                            isSyncingSettingsRef.current = true;
                            videoElement.volume = volume;
                            videoElement.muted = muted;
                            videoElement.playbackRate = playbackRate;
                            currentVolumeRef.current = volume;
                            currentMutedRef.current = muted;
                            currentPlaybackRateRef.current = playbackRate;
                            
                            setTimeout(() => {
                              isSyncingSettingsRef.current = false;
                            }, 200);
                          }
                        }
                      }, 100);
                    }
                    
                    // 监听音量变化（添加防抖处理，避免频繁触发导致音频卡顿）
                    let volumeChangeTimeout = null;
                    const onVolumeChange = () => {
                      // 如果正在同步设置，忽略事件（避免循环）
                      if (isSyncingSettingsRef.current) {
                        return;
                      }

                      const newVolume = videoElement.volume;
                      const newMuted = videoElement.muted;
                      
                      // 如果值没有变化，忽略（可能是我们刚刚设置的）
                      if (Math.abs(currentVolumeRef.current - newVolume) < 0.01 && 
                          currentMutedRef.current === newMuted) {
                        return;
                      }
                      
                      console.log('检测到音量变化:', { 
                        newVolume, 
                        newMuted,
                        prevVolume: currentVolumeRef.current, 
                        prevMuted: currentMutedRef.current 
                      });
                      
                      // 立即更新 ref，避免重复触发
                      currentVolumeRef.current = newVolume;
                      currentMutedRef.current = newMuted;
                      
                      // 立即更新 state，确保 UI 同步（不延迟）
                      setVolume(newVolume);
                      setMuted(newMuted);
                      
                      // 清除之前的定时器
                      if (volumeChangeTimeout) {
                        clearTimeout(volumeChangeTimeout);
                      }
                      
                      // 防抖处理：延迟保存设置，避免频繁保存
                      volumeChangeTimeout = setTimeout(() => {
                      updatePlayerSetting('volume', newVolume);
                      updatePlayerSetting('muted', newMuted);
                        volumeChangeTimeout = null;
                      }, 300); // 300ms 防抖延迟，只用于保存设置
                    };
                    
                    // 监听播放速度变化
                    const onRateChange = () => {
                      // 如果正在同步设置，忽略事件（避免循环）
                      if (isSyncingSettingsRef.current) {
                        return;
                      }

                      const newRate = videoElement.playbackRate;
                      
                      // 如果值没有变化，忽略（可能是我们刚刚设置的）
                      if (Math.abs(currentPlaybackRateRef.current - newRate) < 0.01) {
                        return;
                      }
                      
                      console.log('检测到播放速度变化:', { rate: newRate, prevRate: currentPlaybackRateRef.current });
                      
                      // 更新 ref（先更新 ref，再更新 state，避免循环）
                      currentPlaybackRateRef.current = newRate;
                      
                      // 立即更新 state，确保 UI 同步
                      setPlaybackRate(newRate);
                      
                      // 延迟保存设置，避免频繁保存
                      setTimeout(() => {
                      updatePlayerSetting('playbackRate', newRate);
                      }, 300);
                    };
                    
                    videoElement.addEventListener('volumechange', onVolumeChange);
                    videoElement.addEventListener('ratechange', onRateChange);
                    
                    // 保存事件监听器引用
                    if (!videoElement._eventListeners) {
                      videoElement._eventListeners = [];
                    }
                    videoElement._eventListeners.push(
                      { type: 'volumechange', handler: onVolumeChange },
                      { type: 'ratechange', handler: onRateChange }
                    );
                    
                    // 监听 playing 事件（视频开始播放）
                    const onPlaying = () => {
                      // 🎮 使用控制器处理 onPlaying 事件
                      let videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })();
                      if (!videoElement && playerRef.current?.wrapper) {
                        videoElement = playerRef.current.wrapper.querySelector('video');
                      }
                      if (!videoElement) {
                        console.log('onPlaying: 未找到 video 元素', {
                          hasArtPlayerRef: !!playerRefInternal.current,
                          hasWrapper: !!playerRefInternal.current?.wrapper,
                          hasPlayerRef: !!playerRef.current?.wrapper
                        });
                        return;
                      }
                      
                      // 检查视频元素是否可见
                      const rect = videoElement.getBoundingClientRect();
                      const computedStyle = window.getComputedStyle(videoElement);
                      if (rect.width === 0 || rect.height === 0) {
                        console.warn('⚠️ 视频元素尺寸为 0:', {
                          width: rect.width,
                          height: rect.height,
                          display: computedStyle.display,
                          visibility: computedStyle.visibility,
                          opacity: computedStyle.opacity
                        });
                      }
                      
                      // 🔧 拖动保护期：在拖动期间或拖动刚结束后，忽略 onPlaying 事件
                      const now = Date.now();
                      const inSeeking = isSeekingRef.current || controller.state.isSeeking;
                      const inProtectionPeriod = now < seekProtectionEndTimeRef.current;
                      
                      if (inSeeking || inProtectionPeriod) {
                        console.log('🔧 onPlaying: 拖动中或保护期内，忽略此次播放事件', {
                          isSeekingRef: isSeekingRef.current,
                          controllerIsSeeking: controller.state.isSeeking,
                          inProtectionPeriod,
                          protectionEndTime: seekProtectionEndTimeRef.current ? new Date(seekProtectionEndTimeRef.current).toLocaleTimeString() : 'N/A'
                        });
                        return; // 🔧 直接返回，不处理任何逻辑
                      }
                      
                      const shouldContinue = controller.handleOnPlaying(videoElement);
                      
                      if (!shouldContinue) {
                        // 用户已暂停，不继续播放逻辑
                        setIsPlaying(false);
                        isPlayingRef.current = false;
                        return;
                      }
                      
                      // 正常播放逻辑：清除超时和错误状态
                      if (videoElement._isBuffering) {
                        videoElement._isBuffering = false;
                      }
                      if (videoLoadTimeoutRef.current) {
                        clearTimeout(videoLoadTimeoutRef.current);
                        videoLoadTimeoutRef.current = null;
                      }
                      setVideoLoadError(null);
                      setVideoLoadTimeout(false);
                      
                      // 更新播放状态
                      if (!videoElement.paused) {
                        setIsPlaying(true);
                        isPlayingRef.current = true;
                      }
                    };
                    videoElement.addEventListener('playing', onPlaying);
                    
                    // 监听 waiting 事件（视频缓冲不足）
                    // 优化：减少日志输出，避免频繁操作影响性能
                    let waitingTimeout = null;
                    const onWaiting = () => {
                      // 标记正在缓冲，避免 onPause 误判为用户手动暂停
                      videoElement._isBuffering = true;
                      // 保持播放状态，不要设置为 false
                      isPlayingRef.current = isPlaying || isPlayingRef.current;
                      
                      // 防抖处理：延迟日志输出，避免频繁触发
                      if (waitingTimeout) {
                        clearTimeout(waitingTimeout);
                      }
                      waitingTimeout = setTimeout(() => {
                        console.log('视频缓冲不足，等待数据加载...');
                        waitingTimeout = null;
                      }, 500); // 500ms 防抖延迟
                    };
                    videoElement.addEventListener('waiting', onWaiting);
                    
                    // 监听 canplay 事件（缓冲完成，可以播放）
                    // 优化：添加防抖处理，避免频繁的播放/暂停切换导致音频卡顿
                    let canPlayTimeout = null;
                    const onCanPlayAfterWaiting = () => {
                      // 如果用户手动暂停了，无论什么情况都不自动恢复播放（最优先检查）
                      if (userPausedRef.current) {
                        console.log('用户已手动暂停，不自动恢复播放（canplay）');
                        // 清除 waiting 的防抖定时器
                        if (waitingTimeout) {
                          clearTimeout(waitingTimeout);
                          waitingTimeout = null;
                        }
                        // 清除 canPlayTimeout（如果存在）
                        if (canPlayTimeout) {
                          clearTimeout(canPlayTimeout);
                          canPlayTimeout = null;
                        }
                        // 清除缓冲标志，防止后续自动播放
                      if (videoElement._isBuffering) {
                        videoElement._isBuffering = false;
                        }
                        // 确保视频元素处于暂停状态
                        if (!videoElement.paused) {
                          videoElement.pause().catch(() => {});
                        }
                        return;
                      }
                      
                      // 如果 isPlaying 状态为 false，说明用户希望暂停，不应该自动播放
                      if (!isPlaying && !isPlayingRef.current) {
                        console.log('isPlaying 为 false，不自动恢复播放（canplay）');
                        // 清除 waiting 的防抖定时器
                        if (waitingTimeout) {
                          clearTimeout(waitingTimeout);
                          waitingTimeout = null;
                        }
                        // 清除 canPlayTimeout（如果存在）
                        if (canPlayTimeout) {
                          clearTimeout(canPlayTimeout);
                          canPlayTimeout = null;
                        }
                        // 清除缓冲标志
                        if (videoElement._isBuffering) {
                          videoElement._isBuffering = false;
                        }
                        // 确保视频元素处于暂停状态
                        if (!videoElement.paused) {
                          videoElement.pause().catch(() => {});
                        }
                        return;
                      }
                      
                      // 清除 waiting 的防抖定时器
                      if (waitingTimeout) {
                        clearTimeout(waitingTimeout);
                        waitingTimeout = null;
                      }
                      
                      // 如果之前是因为缓冲不足而暂停，且用户希望播放，则自动恢复播放
                      // 但是，如果用户已经手动暂停，绝对不应该自动恢复播放
                      if (videoElement._isBuffering && !userPausedRef.current) {
                        videoElement._isBuffering = false;
                        
                        // 防抖处理：延迟恢复播放，避免频繁切换导致音频卡顿
                        if (canPlayTimeout) {
                          clearTimeout(canPlayTimeout);
                        }
                        
                        canPlayTimeout = setTimeout(() => {
                          // 再次检查用户暂停状态（可能在延迟期间用户暂停了）
                          // 这是最优先的检查：如果用户暂停了，无论什么状态都不应该自动播放
                          if (userPausedRef.current) {
                            console.log('用户已手动暂停，不自动恢复播放（延迟检查）');
                            canPlayTimeout = null;
                            return;
                          }
                          
                          // 如果视频元素不在暂停状态，说明已经在播放，不需要自动播放
                          if (!videoElement.paused) {
                            console.log('视频已在播放，不需要自动恢复播放');
                            canPlayTimeout = null;
                            return;
                          }
                          
                          // 如果 isPlaying 状态为 false，说明用户希望暂停，不应该自动播放
                          if (!isPlaying && !isPlayingRef.current) {
                            console.log('isPlaying 为 false，不自动恢复播放（延迟检查）');
                            canPlayTimeout = null;
                            return;
                          }
                          
                          // 如果视频应该播放但处于暂停状态，且用户没有手动暂停，则自动恢复播放
                          // 注意：必须同时检查 isPlayingRef.current 和 isPlaying，确保状态一致
                          // 但是，如果用户已经手动暂停，则不自动播放（双重检查）
                          const shouldPlay = (isPlayingRef.current || isPlaying) && 
                                           videoElement.paused && 
                                           document.contains(videoElement) &&
                                           !userPausedRef.current;
                          
                          if (shouldPlay) {
                            // 在执行 play() 之前，最后一次检查用户暂停状态
                            if (userPausedRef.current || (!isPlaying && !isPlayingRef.current)) {
                              console.log('执行 play() 前最后检查：用户已暂停，取消播放');
                              canPlayTimeout = null;
                              return;
                            }
                            
                          console.log('缓冲完成，自动恢复播放');
                          videoElement.play().then(() => {
                              // 播放成功后，再次检查用户暂停状态
                              if (userPausedRef.current) {
                                console.log('播放成功后检测到用户已暂停，立即暂停');
                                videoElement.pause().catch(() => {});
                                setIsPlaying(false);
                                isPlayingRef.current = false;
                                return;
                              }
                            console.log('缓冲完成后自动播放成功');
                            setIsPlaying(true);
                            isPlayingRef.current = true;
                          }).catch(err => {
                            if (err.name !== 'AbortError') {
                              console.warn('缓冲完成后自动播放失败:', err);
                            }
                          });
                          } else {
                            console.log('不自动恢复播放:', {
                              shouldPlay,
                              isPlayingRef: isPlayingRef.current,
                              isPlaying,
                              paused: videoElement.paused,
                              userPaused: userPausedRef.current
                            });
                          }
                          canPlayTimeout = null;
                        }, 200); // 200ms 防抖延迟，确保缓冲真正完成
                      } else if (videoElement._isBuffering && userPausedRef.current) {
                        // 如果用户已经手动暂停，清除缓冲标志，但不自动恢复播放
                        console.log('用户已手动暂停，清除缓冲标志但不自动恢复播放');
                        videoElement._isBuffering = false;
                      } else if (!videoElement._isBuffering) {
                        // 如果缓存加载完成（_isBuffering 为 false），但用户已手动暂停，确保视频不会自动播放
                        if (userPausedRef.current || (!isPlaying && !isPlayingRef.current)) {
                          console.log('缓存加载完成，但用户已手动暂停，不自动播放', {
                            userPaused: userPausedRef.current,
                            isPlaying,
                            isPlayingRef: isPlayingRef.current,
                            paused: videoElement.paused
                          });
                          // 确保视频元素处于暂停状态
                          if (!videoElement.paused) {
                            videoElement.pause().catch(() => {});
                          }
                          // 确保状态正确
                          setIsPlaying(false);
                          isPlayingRef.current = false;
                        }
                      }
                    };
                    videoElement.addEventListener('canplay', onCanPlayAfterWaiting);
                    videoElement.addEventListener('canplaythrough', onCanPlayAfterWaiting);
                    
                    // 监听 stalled 事件（视频加载停滞）
                    const onStalled = () => {
                      console.warn('视频加载停滞');
                      // 如果是 HLS 视频，尝试恢复
                      if (videoElement.hls && playUrl.url?.includes('m3u8')) {
                        console.log('HLS 视频加载停滞，尝试恢复...');
                        try {
                          videoElement.hls.startLoad();
                        } catch (err) {
                          console.error('HLS 恢复失败:', err);
                        }
                      }
                    };
                    videoElement.addEventListener('stalled', onStalled);
                    
                    // 监听 error 事件（播放过程中的错误）
                    const onVideoError = () => {
                      if (videoElement.error) {
                        console.error('视频元素错误:', videoElement.error);
                        const errorCode = videoElement.error.code;
                        // 如果是网络错误或解码错误，尝试恢复
                        if (errorCode === 2 || errorCode === 3) {
                          // MEDIA_ERR_NETWORK 或 MEDIA_ERR_DECODE
                          if (videoElement.hls && playUrl.url?.includes('m3u8')) {
                            console.log('HLS 视频错误，尝试恢复...');
                            try {
                              if (errorCode === 2) {
                                videoElement.hls.startLoad();
                              } else if (errorCode === 3) {
                                videoElement.hls.recoverMediaError();
                              }
                            } catch (err) {
                              console.error('HLS 错误恢复失败:', err);
                              // 如果恢复失败，显示错误信息
                              setVideoLoadError(`视频播放错误: ${videoElement.error.message || '未知错误'}`);
                            }
                          } else {
                            // 普通视频错误，显示错误信息
                            setVideoLoadError(`视频播放错误: ${videoElement.error.message || '未知错误'}`);
                          }
                        }
                      }
                    };
                    videoElement.addEventListener('error', onVideoError);
                    
                    // 保存事件监听器引用，以便后续清理
                    videoElement._eventListeners = [
                      { type: 'playing', handler: onPlaying },
                      { type: 'waiting', handler: onWaiting },
                      { type: 'stalled', handler: onStalled },
                      { type: 'error', handler: onVideoError },
                      { type: 'canplay', handler: onCanPlayAfterWaiting },
                      { type: 'canplaythrough', handler: onCanPlayAfterWaiting }
                    ];
                  }
                } catch (err) {
                  console.error('添加视频元素事件监听失败:', err);
                }
              }, 500);
              
              // 延迟设置播放状态，确保视频元素已完全准备好且仍在 DOM 中
              setTimeout(() => {
                try {
                  // 检查视频元素是否存在且仍在 DOM 中
                  const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                     (playerRef.current?.wrapper?.querySelector?.('video'));
                  
                  console.log('onReady: 检查视频元素状态', {
                    hasElement: !!videoElement,
                    inDocument: videoElement ? document.contains(videoElement) : false,
                    readyState: videoElement?.readyState,
                    networkState: videoElement?.networkState,
                    src: videoElement?.src,
                    currentSrc: videoElement?.currentSrc,
                    paused: videoElement?.paused
                  });
                  
                  // 检查元素是否仍在文档中
                  if (videoElement && document.contains(videoElement)) {
                    // 确保视频元素有正确的 src
                    if (!videoElement.src && !videoElement.currentSrc && playUrl.url) {
                      console.log('视频元素缺少 src，尝试设置:', playUrl.url);
                      videoElement.src = playUrl.url;
                    }
                    
                    // 检查是否为 HLS 视频
                    const isHLSVideo = playUrl.url?.includes('m3u8');
                    
                    if (isHLSVideo) {
                      // HLS 视频：等待 manifest 解析完成
                      const hlsInstance = videoElement.hls;
                      if (hlsInstance && hlsInstance.media === videoElement) {
                        if (hlsInstance.levels && hlsInstance.levels.length > 0) {
                          // manifest 已解析，等待视频元素准备好
                          const waitForReady = () => {
                            if (document.contains(videoElement) && videoElement.readyState >= 1) {
                              console.log('HLS 视频已准备好，设置播放状态');
              setIsPlaying(true);
                            } else {
                              // 等待 canplay 事件
                              const onCanPlay = () => {
                                if (document.contains(videoElement)) {
                                  console.log('HLS 视频可以播放，设置播放状态');
                                  setIsPlaying(true);
                                }
                                videoElement.removeEventListener('canplay', onCanPlay);
                              };
                              videoElement.addEventListener('canplay', onCanPlay, { once: true });
                            }
                          };
                          setTimeout(waitForReady, 300);
                        } else {
                          // 等待 manifest 解析
                          const onManifestParsed = () => {
                            console.log('HLS manifest 解析完成，等待视频元素准备好');
                            const waitForReady = () => {
                              if (document.contains(videoElement) && videoElement.readyState >= 1) {
                                console.log('HLS 视频已准备好，设置播放状态');
                                setIsPlaying(true);
                              } else {
                                // 等待 canplay 事件
                                const onCanPlay = () => {
                                  if (document.contains(videoElement)) {
                                    console.log('HLS 视频可以播放，设置播放状态');
                                    setIsPlaying(true);
                                  }
                                  videoElement.removeEventListener('canplay', onCanPlay);
                                };
                                videoElement.addEventListener('canplay', onCanPlay, { once: true });
                              }
                            };
                            setTimeout(waitForReady, 500);
                            hlsInstance.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                          };
                          hlsInstance.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                        }
                      } else {
                        // HLS 实例还未创建，等待 onStart 创建
                        console.log('HLS 实例还未创建，等待 onStart 创建...');
                      }
                      return; // HLS 视频已处理
                    }
                    
                    // 普通视频：等待 readyState >= 3 (HAVE_FUTURE_DATA) 或至少 >= 2 (HAVE_CURRENT_DATA)
                    if (videoElement.readyState >= 3) {
                      // 视频已加载足够数据，可以安全播放
                      console.log('视频元素已准备好 (readyState >= 3)，设置播放状态');
                      setIsPlaying(true);
                    } else if (videoElement.readyState >= 2) {
                      // readyState >= 2，等待 canplaythrough 事件
                      console.log('视频元素 readyState >= 2，等待 canplaythrough...');
                      const onCanPlayThrough = () => {
                        if (document.contains(videoElement)) {
                          console.log('视频可以流畅播放，设置播放状态');
                          setIsPlaying(true);
                        }
                        videoElement.removeEventListener('canplaythrough', onCanPlayThrough);
                      };
                      videoElement.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
                      
                      // 也监听 canplay 事件作为后备
                      const onCanPlay = () => {
                        if (document.contains(videoElement)) {
                          console.log('视频可以播放，设置播放状态');
                          setIsPlaying(true);
                        }
                        videoElement.removeEventListener('canplay', onCanPlay);
                      };
                      videoElement.addEventListener('canplay', onCanPlay, { once: true });
                    } else {
                      // 等待视频元素准备好
                      console.log('等待视频元素准备好，当前 readyState:', videoElement.readyState);
                      
                      // 如果 readyState 为 0，尝试手动加载
                      if (videoElement.readyState === 0) {
                        console.log('视频元素 readyState 为 0，尝试手动加载');
                        videoElement.load();
                      }
                      
                      // 等待 loadeddata 事件（readyState >= 2）
                      const onLoadedData = () => {
                        if (document.contains(videoElement) && videoElement.readyState >= 2) {
                          console.log('视频数据已加载，等待更多数据...');
                          // 继续等待 canplay 或 canplaythrough
                          const onCanPlayThrough = () => {
                            if (document.contains(videoElement)) {
                              console.log('视频可以流畅播放，设置播放状态');
                              setIsPlaying(true);
                            }
                            videoElement.removeEventListener('canplaythrough', onCanPlayThrough);
                          };
                          videoElement.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
                          
                          const onCanPlay = () => {
                            if (document.contains(videoElement)) {
                              console.log('视频可以播放，设置播放状态');
                              setIsPlaying(true);
                            }
                            videoElement.removeEventListener('canplay', onCanPlay);
                          };
                          videoElement.addEventListener('canplay', onCanPlay, { once: true });
                        }
                        videoElement.removeEventListener('loadeddata', onLoadedData);
                      };
                      videoElement.addEventListener('loadeddata', onLoadedData, { once: true });
                    }
                  } else {
                    // 视频元素不存在或已被移除，延迟重试
                    console.warn('视频元素不存在或已被移除，延迟设置播放状态');
                    setTimeout(() => {
                      setIsPlaying(true);
                    }, 500);
                  }
                } catch (error) {
                  console.warn('检查视频元素时出错，延迟设置播放状态:', error);
                  // 延迟设置，给视频元素更多时间初始化
                  setTimeout(() => {
                    setIsPlaying(true);
                  }, 500);
                }
              }, 200); // 增加延迟时间，给视频元素更多初始化时间
            }}
            onError={(e) => {
              console.error('ArtPlayer 播放出错:', e);
              
              // 清除格式错误重试定时器
              if (formatErrorRetryTimerRef.current) {
                clearTimeout(formatErrorRetryTimerRef.current);
                formatErrorRetryTimerRef.current = null;
              }
              
              // 清除加载超时
              if (videoLoadTimeoutRef.current) {
                clearTimeout(videoLoadTimeoutRef.current);
                videoLoadTimeoutRef.current = null;
              }
              
              // 从 React 合成事件中提取实际的视频元素错误
              let errorMessage = '视频加载失败，请检查网络或重试';
              let isFormatError = false;
              
              try {
                // 尝试从事件目标（video 元素）获取错误
                const videoElement = e?.target || e?.nativeEvent?.target || 
                                   (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                   (playerRef.current?.wrapper?.querySelector?.('video'));
                
                if (videoElement && videoElement.error) {
                  const mediaError = videoElement.error;
                  const errorMsg = mediaError.message || '';
                  isFormatError = mediaError.code === 4 || errorMsg.includes('Format error') || errorMsg.includes('MEDIA_ELEMENT_ERROR');
                  
                  console.error('视频元素错误详情:', {
                    code: mediaError.code,
                    message: mediaError.message,
                    networkState: videoElement.networkState,
                    readyState: videoElement.readyState,
                    src: videoElement.src,
                    currentSrc: videoElement.currentSrc,
                    isFormatError: isFormatError
                  });
                  
                  // 对于格式错误，如果视频还在加载中，延迟判断（可能是初始化问题）
                  if (isFormatError && videoElement.readyState < 2 && errorRetryRef.current === 0) {
                    console.log('检测到格式错误，但视频还在加载中，延迟判断...');
                    errorRetryRef.current = 1;
                    
                    // 延迟 2 秒后重新检查
                    formatErrorRetryTimerRef.current = setTimeout(() => {
                      const currentVideoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                                 (playerRef.current?.wrapper?.querySelector?.('video'));
                      
                      if (currentVideoElement) {
                        // 如果视频元素现在有错误且 readyState 仍然很低，才显示错误
                        if (currentVideoElement.error && currentVideoElement.readyState < 2) {
                          console.error('延迟检查后仍然有错误，显示错误信息');
                          const finalError = currentVideoElement.error;
                          let finalErrorMessage = '视频格式不支持或源地址无效';
                          if (finalError.message) {
                            finalErrorMessage += `: ${finalError.message}`;
                          }
                          setVideoLoadError(finalErrorMessage);
                          dispatch({ type: 'video/fetchPlayUrl/rejected', payload: { message: finalErrorMessage } });
                        } else {
                          console.log('延迟检查后错误已消失，视频可能已正常加载');
                          // 错误已消失，尝试播放（但需要检查用户是否手动暂停）
                          if (currentVideoElement.paused && !isSeekingRef.current && document.contains(currentVideoElement) && !userPausedRef.current) {
                            currentVideoElement.play().catch(err => {
                              console.warn('自动播放失败:', err);
                            });
                          } else if (userPausedRef.current) {
                            console.log('用户已手动暂停，不自动播放（错误恢复后）');
                          }
                        }
                      }
                      formatErrorRetryTimerRef.current = null;
                    }, 2000);
                    
                    return; // 延迟判断，不立即显示错误
                  }
                  
                  // 根据错误代码提供具体的错误信息
                  switch (mediaError.code) {
                    case 1: // MEDIA_ERR_ABORTED
                      errorMessage = '视频加载被中止，请重试';
                      break;
                    case 2: // MEDIA_ERR_NETWORK
                      errorMessage = '网络错误，无法加载视频。请检查网络连接或稍后重试';
                      break;
                    case 3: // MEDIA_ERR_DECODE
                      errorMessage = '视频解码错误，可能是视频文件损坏或格式不支持';
                      break;
                    case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                      errorMessage = '视频格式不支持或源地址无效';
                      break;
                    default:
                      errorMessage = `视频播放错误 (错误代码: ${mediaError.code})`;
                  }
                  
                  // 如果有错误消息，添加到错误信息中
                  if (mediaError.message) {
                    errorMessage += `: ${mediaError.message}`;
                  }
                } else if (e?.message) {
                  // 如果事件本身有消息
                  errorMessage = e.message;
                  isFormatError = errorMessage.includes('Format error') || errorMessage.includes('MEDIA_ELEMENT_ERROR');
                } else if (typeof e === 'string') {
                  // 如果事件是字符串
                  errorMessage = e;
                  isFormatError = errorMessage.includes('Format error') || errorMessage.includes('MEDIA_ELEMENT_ERROR');
                } else if (e?.error) {
                  // 如果事件有 error 属性
                  if (typeof e.error === 'string') {
                    errorMessage = e.error;
                    isFormatError = errorMessage.includes('Format error') || errorMessage.includes('MEDIA_ELEMENT_ERROR');
                  } else if (e.error.message) {
                    errorMessage = e.error.message;
                    isFormatError = errorMessage.includes('Format error') || errorMessage.includes('MEDIA_ELEMENT_ERROR');
              }
                }
              } catch (err) {
                console.error('提取错误信息时出错:', err);
                errorMessage = '视频加载失败，请检查网络或重试';
              }
              
              // 如果不是格式错误或已经重试过，立即显示错误
              if (!isFormatError || errorRetryRef.current > 0) {
                console.error('最终错误信息:', errorMessage);
                setVideoLoadError(errorMessage);
                dispatch({ type: 'video/fetchPlayUrl/rejected', payload: { message: errorMessage } });
              }
            }}
            onPlay={() => {
              // 🎮 使用控制器处理 onPlay 事件
              const videoElement = getVideoElement();
              
              const shouldPlay = controller.handleOnPlay(videoElement);
              
              // 同步 controller 的状态到 VideoDetail 的 refs
              userPausedRef.current = controller.state.userPaused;
              
              if (shouldPlay) {
                setIsPlaying(true);
                isPlayingRef.current = true;
                
                // 📋 添加视频到播放列表（Redux reducer 会自动同步到 localStorage）
                if (videoInfo && id) {
                  const videoType = mapVideoType(videoInfo.type || currentCategory);
                  const isMovie = videoType === 'movies' || videoType === 'movie';
                  const episodeNumber = isMovie ? null : (selectedEpisode?.episode || null);
                  
                  const playlistItem = {
                    videoId: id,
                    videoTitle: videoInfo.title || videoInfo.name || '未知视频',
                    videoCover: videoInfo.cover_url || videoInfo.pic || '',
                    videoType: videoType,
                    episode: episodeNumber,
                    timestamp: Date.now()
                  };
                  
                  dispatch(addToPlaylist(playlistItem));
                }
              } else {
                setIsPlaying(false);
                isPlayingRef.current = false;
              }
            }}
            onLoadedMetadata={() => {
              console.log('ReactPlayer onLoadedMetadata 被调用，视频开始加载');
              
              // 如果正在拖动进度条，不要触发重新加载或播放
              if (isSeekingRef.current) {
                console.log('⚠️ 正在拖动进度条，跳过 onStart 中的重新加载逻辑');
                return;
              }
              
              // 清除之前的超时定时器
              if (videoLoadTimeoutRef.current) {
                clearTimeout(videoLoadTimeoutRef.current);
                videoLoadTimeoutRef.current = null;
              }
              
              // 重置错误状态
              setVideoLoadError(null);
              setVideoLoadTimeout(false);
              
              // 立即创建播放记录（即使进度和时长为0）
              if (videoInfo) {
                const videoId = videoInfo?.videoid || videoInfo?.vod_id || id;
                const videoType = currentCategory || videoInfo.type || (selectedEpisode ? 'tv' : 'movie');
                const isMovie = videoType === 'movies' || videoType === 'movie';
                const episode = isMovie ? null : selectedEpisode;
                
                console.log('📝 onStart: 立即创建播放记录:', {
                  id: videoId,
                  episode,
                  progress: 0,
                  duration: 0,
                  title: videoInfo.title || videoInfo.name || '未知视频',
                  cover: videoInfo.cover_url || videoInfo.pic || '',
                  videoType
                });
                
                // 立即创建记录，即使进度和时长都是0
                updatePlayProgress(
                  videoId,
                  episode,
                  0, // 初始进度为0
                  0, // 初始时长为0（会在后续更新）
                  videoInfo.title || videoInfo.name || '未知视频',
                  videoInfo.cover_url || videoInfo.pic || '',
                  videoType
                );
                
                // 重置保存时间戳，确保下次保存会在5秒后
                lastSavedTimeRef.current = Date.now();
              }
              
              // 根据视频类型设置不同的超时时间
              // HLS 视频需要更长的加载时间
              const isHLS = playUrl.url?.toLowerCase().includes('.m3u8') || 
                           playUrl.url?.toLowerCase().includes('hls');
              const timeoutDuration = isHLS ? 60000 : 30000; // HLS: 60秒, 其他: 30秒
              
              console.log(`设置视频加载超时: ${timeoutDuration / 1000}秒 (${isHLS ? 'HLS' : '普通视频'})`);
              
              // 设置加载超时
              videoLoadTimeoutRef.current = setTimeout(() => {
                console.warn(`视频加载超时（${timeoutDuration / 1000}秒）`);
                // 检查视频元素是否真的没有加载
                try {
                  const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                   (playerRef.current?.wrapper?.querySelector?.('video'));
                  if (videoElement) {
                    const currentTime = videoElement.currentTime || 0;
                    const readyState = videoElement.readyState || 0;
                    
                    console.warn('视频元素状态:', {
                      readyState: readyState,
                      networkState: videoElement.networkState,
                      error: videoElement.error,
                      src: videoElement.src,
                      currentSrc: videoElement.currentSrc,
                      currentTime: currentTime,
                      paused: videoElement.paused
                    });
                    
                    // 如果视频已经开始播放（currentTime > 0），说明实际上已经加载成功，只是超时检查触发
                    if (currentTime > 0 || readyState >= 2) {
                      console.log('视频实际上已加载成功，清除超时错误');
                      setVideoLoadTimeout(false);
                      setVideoLoadError(null);
                      return;
                    }
                    
                    // 如果是 HLS 视频且 readyState >= 1，可能正在加载，再等待一段时间
                    if (playUrl.url?.includes('m3u8') && readyState >= 1) {
                      console.log('HLS 视频可能正在加载，延长超时时间...');
                      // 清除当前超时，设置新的超时（再等待30秒）
                      clearTimeout(videoLoadTimeoutRef.current);
                      videoLoadTimeoutRef.current = setTimeout(() => {
                        setVideoLoadTimeout(true);
                        setVideoLoadError('视频加载超时，请检查网络连接或重试');
                      }, 30000);
                      return;
                    }
                  }
                } catch (e) {
                  console.error('检查视频元素状态失败:', e);
                }
                setVideoLoadTimeout(true);
                setVideoLoadError('视频加载超时，请检查网络连接或重试');
              }, timeoutDuration);
              
              // 对于 HLS 视频，尝试手动创建 HLS 实例（如果还没有）
              if (isHLS) {
                setTimeout(() => {
                  try {
                    const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                       (playerRef.current?.wrapper?.querySelector?.('video'));
                    if (videoElement && !videoElement.hls && Hls.isSupported()) {
                      console.log('onStart: 检测到 HLS 视频但缺少实例，尝试创建...');
                      const hls = new Hls({
                        enableWorker: true,
                        lowLatencyMode: false, // 禁用低延迟模式，避免缓冲不足导致音频卡顿
                        backBufferLength: 90,
                        maxBufferLength: 600, // 增加最大缓冲长度到600秒，确保音频流畅
                        maxMaxBufferLength: 600, // 增加最大缓冲长度上限到600秒
                        startLevel: -1,
                        maxBufferSize: 600 * 1000 * 1000, // 最大缓冲大小 600MB（对应600秒视频）
                        maxBufferHole: 0.5, // 允许的最大缓冲间隙（秒）
                        highBufferWatchdogPeriod: 2, // 高缓冲监控周期（秒）
                        nudgeOffset: 0.1, // 缓冲调整偏移量（秒）
                        nudgeMaxRetry: 3, // 最大重试次数
                        maxFragLoadingTimeOut: 20000, // 片段加载超时时间（毫秒）
                        fragLoadingTimeOut: 20000, // 片段加载超时时间（毫秒）
                        manifestLoadingTimeOut: 10000, // 清单加载超时时间（毫秒）
                        debug: false
                      });
                      
                      hls.loadSource(playUrl.url);
                      hls.attachMedia(videoElement);
                      
                      hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        console.log('onStart: HLS manifest 解析完成');
                        // 等待视频元素准备好再设置播放状态
                        // 需要等待 readyState >= 1 且至少等待 canplay 事件
                        const waitForReady = () => {
                          if (document.contains(videoElement) && videoElement.readyState >= 1) {
                            console.log('onStart: HLS 视频已准备好，设置播放状态');
                            setIsPlaying(true);
                            // 尝试播放
                            if (videoElement.paused && !isSeekingRef.current) {
                              videoElement.play().catch(err => {
                                if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                                  console.warn('onStart: HLS 播放失败:', err);
                                }
                              });
                            }
                          } else {
                            // 等待 canplay 事件
                            const onCanPlay = () => {
                              if (document.contains(videoElement)) {
                                console.log('onStart: HLS 视频可以播放，设置播放状态');
                                setIsPlaying(true);
                                if (videoElement.paused && !isSeekingRef.current) {
                                  videoElement.play().catch(err => {
                                    if (err.name !== 'AbortError' || !err.message?.includes('removed from the document')) {
                                      console.warn('onStart: HLS 播放失败:', err);
                                    }
                                  });
                                }
                              }
                              videoElement.removeEventListener('canplay', onCanPlay);
                            };
                            videoElement.addEventListener('canplay', onCanPlay, { once: true });
                          }
                        };
                        setTimeout(waitForReady, 500); // 增加延迟，确保视频元素已初始化
                      });
                      
                      hls.on(Hls.Events.ERROR, (event, data) => {
                        console.error('onStart: HLS 错误:', data);
                        if (data.fatal) {
                          switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                              hls.startLoad();
                              break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                              hls.recoverMediaError();
                              break;
                            default:
                              hls.destroy();
                              break;
                          }
                        }
                      });
                      
                      videoElement.hls = hls;
                    }
                  } catch (error) {
                    console.error('onStart: 创建 HLS 实例失败:', error);
                  }
                }, 500);
              }

              // 额外读取一次视频时长，避免部分源在初始化阶段 duration 未同步到 state
              setTimeout(() => {
                try {
                  const videoElement = (() => {
                    try {
                      return getVideoElement();
                    } catch (e) {
                      return null;
                    }
                  })() ||
                    (playerRef.current?.wrapper?.querySelector?.('video'));
                  if (
                    videoElement &&
                    videoElement.duration &&
                    !isNaN(videoElement.duration) &&
                    isFinite(videoElement.duration) &&
                    videoElement.duration > 0
                  ) {
                    const elementDuration = Number(videoElement.duration);
                    console.log('✅ 从视频元素获取到时长:', elementDuration, '秒');
                    setDuration(elementDuration);
                  }
                } catch (err) {
                  console.error('从视频元素获取时长失败:', err);
                }
              }, 500);
            }}
            onProgress={handleProgress}
            onEnded={handleEnded}
            onPause={() => {
              // 检查是否是因为缓冲不足导致的暂停
              const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                 (playerRef.current?.wrapper?.querySelector?.('video'));
              const isBuffering = videoElement?._isBuffering || false;
              
              // 🚨 关键修复：播放器未准备好时，忽略 onPause 事件
              // 因为视频加载初期的 pause 事件不是用户主动触发的
              if (!playerReady || !controller.state.playerReady) {
                return;
              }
              
              // 🎮 使用控制器处理 onPause 事件
              // 只有在播放器准备好之后的 pause 事件才视为用户暂停
              // 🔧 关键修复：拖动过程中或拖动保护期内，完全忽略 onPause 事件
              const now = Date.now();
              const inSeeking = isSeekingRef.current || controller.state.isSeeking;
              const inProtectionPeriod = now < seekProtectionEndTimeRef.current;
              
              if (inSeeking || inProtectionPeriod) {
                console.log('🔧 onPause: 拖动中或保护期内，忽略此次暂停事件', {
                  isSeekingRef: isSeekingRef.current,
                  controllerIsSeeking: controller.state.isSeeking,
                  inProtectionPeriod,
                  protectionEndTime: seekProtectionEndTimeRef.current ? new Date(seekProtectionEndTimeRef.current).toLocaleTimeString() : 'N/A'
                });
                return; // 🔧 直接返回，不处理任何逻辑
              }

              // 视频自然结束会先触发 pause，再触发 ended；这里不能标记为“用户暂停”
              if (videoElement?.ended) {
                return;
              }
              
              // 正常处理暂停事件
              controller.state.userPaused = true;
              controller.state.isPlaying = false;
              userPausedRef.current = true; // 同步旧的 ref
              setIsPlaying(false);
              isPlayingRef.current = false;
              
              // 如果 videoElement 存在，执行完整的暂停逻辑
              if (videoElement) {
                controller.handleOnPause(videoElement, isSeekingRef.current);
              }
              
              // 保存播放进度
              if (videoInfo && playerRefInternal.current && !isSeekingRef.current && !isBuffering) {
                const videoType = mapVideoType(videoInfo.type || currentCategory);
                
                // 获取当前播放时间：优先从 ArtPlayer，其次从 state，最后从视频元素
                let currentTime = 0;
                try {
                  if (playerRefInternal.current?.getCurrentTime) {
                    currentTime = playerRefInternal.current.getCurrentTime() || 0;
                  }
                } catch (err) {
                  console.warn('从 ReactPlayer 获取当前时间失败:', err);
                }
                
                // 如果获取失败，使用 state 中的值
                if (!currentTime || currentTime === 0) {
                  currentTime = playedSeconds || 0;
                }
                
                // 如果还是 0，尝试从视频元素获取
                if (!currentTime || currentTime === 0) {
                  try {
                    const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                       (playerRefInternal.current.wrapper?.querySelector?.('video'));
                    if (videoElement && videoElement.currentTime && 
                        !isNaN(videoElement.currentTime) && isFinite(videoElement.currentTime)) {
                      currentTime = Number(videoElement.currentTime);
                    }
                  } catch (err) {
                    console.warn('从视频元素获取当前时间失败:', err);
                  }
                }
                
                // 获取视频总时长：优先从 state，其次从 ArtPlayer，最后从视频元素
                let totalDuration = duration || 0;
                
                if (!totalDuration || totalDuration === 0) {
                  try {
                    if (playerRefInternal.current.getDuration) {
                      const refDuration = playerRefInternal.current.getDuration();
                      if (refDuration && refDuration > 0 && !isNaN(refDuration) && isFinite(refDuration)) {
                        totalDuration = Number(refDuration);
                      }
                    }
                  } catch (err) {
                    console.warn('从 ArtPlayer 获取时长失败:', err);
                  }
                }
                
                if (!totalDuration || totalDuration === 0) {
                  try {
                    const videoElement = (() => {
                try {
                  return getVideoElement();
                } catch (e) {
                  return null;
                }
              })() || 
                                       (playerRefInternal.current.wrapper?.querySelector?.('video'));
                    if (videoElement && videoElement.duration && 
                        !isNaN(videoElement.duration) && isFinite(videoElement.duration) && 
                        videoElement.duration > 0) {
                      totalDuration = Number(videoElement.duration);
                    }
                  } catch (err) {
                    console.warn('从视频元素获取时长失败:', err);
                  }
                }
                
                // 如果还是 0，尝试从已保存的记录中获取
                if (!totalDuration || totalDuration === 0) {
                  const existingRecord = getVideoPlayHistory(id);
                  if (existingRecord && existingRecord.duration && existingRecord.duration > 0) {
                    totalDuration = Number(existingRecord.duration);
                    console.log('从已保存记录获取时长:', totalDuration);
                  }
                }
                
                console.log('onPause: 获取到的播放信息:', {
                  currentTime,
                  totalDuration,
                  playedSeconds,
                  duration,
                  hasArtPlayer: !!playerRefInternal.current
                });
                
                if (currentTime > 0) {
                  updatePlayProgress(
                    id,
                    selectedEpisode,
                    currentTime,
                    totalDuration > 0 && !isNaN(totalDuration) && isFinite(totalDuration) ? totalDuration : 0,
                    videoInfo.title || videoInfo.name || '未知视频',
                    videoInfo.cover_url || videoInfo.pic || '',
                    videoType
                  );
                }
              }
            }}
          />
        </div>
        </div>
      </div>
    );
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
      // 移除重复日志，避免控制台噪音
      return null;
    }
    
    const scrollRelatedVideos = (direction = 1) => {
      const grid = relatedVideosGridRef.current;
      if (!grid) return;
      const distance = Math.max(280, Math.floor(grid.clientWidth * 0.8));
      grid.scrollBy({ left: direction * distance, behavior: 'smooth' });
      setTimeout(updateRelatedScrollState, 260);
    };

    const handleRelatedVideosWheel = (event) => {
      const grid = relatedVideosGridRef.current;
      if (!grid) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      grid.scrollBy({ left: event.deltaY, behavior: 'auto' });
      updateRelatedScrollState();
    };

    return (
      <div className="related-videos-section">
        <h2>为你推荐</h2>
        <div className="related-videos-carousel">
          <button
            type="button"
            className={`related-videos-nav-btn related-videos-nav-btn-left ${canScrollRelatedLeft ? '' : 'is-hidden'}`}
            onClick={() => scrollRelatedVideos(-1)}
            aria-label="向左查看推荐"
            disabled={!canScrollRelatedLeft}
          >
            ‹
          </button>
          <div
            className="related-videos-grid"
            ref={relatedVideosGridRef}
            onWheel={handleRelatedVideosWheel}
            onScroll={updateRelatedScrollState}
          >
            {recommendations.map(video => (
              <div key={video.id} className="related-video-card">
                <div
                  className="related-video-link"
                  onClick={(e) => handleRelatedVideoClick(e, video)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="related-video-thumb">
                    <VideoImage
                      src={video.cover_url || video.pic || video.vod_pic || video.vod_cover || video.img || video.cover || video.thumb}
                      alt={video.title}
                    />
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
                          <span className="meta-label">首映:</span> <span className="meta-value">{video.release_date}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`related-videos-nav-btn related-videos-nav-btn-right ${canScrollRelatedRight ? '' : 'is-hidden'}`}
            onClick={() => scrollRelatedVideos(1)}
            aria-label="向右查看推荐"
            disabled={!canScrollRelatedRight}
          >
            ›
          </button>
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
                <span key={index} className="actor-tag">
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
      {renderActorsModal()}
    </div>
  );
};

export default VideoDetail;