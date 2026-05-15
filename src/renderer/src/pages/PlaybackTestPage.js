// pages/PlaybackTestPage.js
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchPlayUrl } from '../store/videoSlice';

const PlaybackTestPage = () => {
  const dispatch = useDispatch();
  const [videoId, setVideoId] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [playType, setPlayType] = useState('tv');
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleTestPlayback = async () => {
    if (!videoId || !episodeId) {
      alert('请输入视频ID和剧集ID');
      return;
    }

    setLoading(true);
    setTestResult(null);

    try {
      const params = {
        type: playType,
        videoid: videoId,
        episodes: episodeId
      };

      console.log('Testing playback with params:', params);
      
      // unwrap 为接口 response.data；若有嵌套 data 字段则取内层，否则用整包
      const wrapped = await dispatch(fetchPlayUrl(params)).unwrap();
      const result = wrapped?.data ?? wrapped;

      console.log('Playback test result:', result);
      setTestResult({
        success: true,
        data: result,
        message: '成功获取播放地址'
      });
    } catch (error) {
      console.error('Playback test failed:', error);
      setTestResult({
        success: false,
        error: error,
        message: error.message || '获取播放地址失败'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>视频播放功能测试页面</h1>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h2>测试参数</h2>
        <div style={{ marginBottom: '10px' }}>
          <label>播放类型: </label>
          <select 
            value={playType} 
            onChange={(e) => setPlayType(e.target.value)}
            style={{ marginLeft: '10px', padding: '5px' }}
          >
            <option value="tv">电视剧</option>
            <option value="movie">电影</option>
            <option value="anime">动漫</option>
          </select>
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label>视频ID: </label>
          <input 
            type="text" 
            value={videoId} 
            onChange={(e) => setVideoId(e.target.value)}
            placeholder="输入视频ID"
            style={{ marginLeft: '10px', padding: '5px', width: '200px' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label>剧集ID: </label>
          <input 
            type="text" 
            value={episodeId} 
            onChange={(e) => setEpisodeId(e.target.value)}
            placeholder="输入剧集ID"
            style={{ marginLeft: '10px', padding: '5px', width: '200px' }}
          />
        </div>
        
        <button 
          onClick={handleTestPlayback}
          disabled={loading}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '测试中...' : '测试播放'}
        </button>
      </div>

      {testResult && (
        <div style={{ 
          padding: '15px', 
          border: `1px solid ${testResult.success ? '#28a745' : '#dc3545'}`, 
          borderRadius: '5px',
          backgroundColor: testResult.success ? '#d4edda' : '#f8d7da',
          color: testResult.success ? '#155724' : '#721c24'
        }}>
          <h2>测试结果</h2>
          <p><strong>状态:</strong> {testResult.message}</p>
          
          {testResult.success ? (
            <div>
              <h3>播放地址信息:</h3>
              <pre style={{ background: '#f8f9fa', padding: '10px', overflowX: 'auto' }}>
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
              
              {testResult.data?.data?.url && (
                <div style={{ marginTop: '10px' }}>
                  <h3>播放链接:</h3>
                  <a href={testResult.data.data.url} target="_blank" rel="noopener noreferrer">
                    {testResult.data.data.url}
                  </a>
                </div>
              )}
              
              {testResult.data?.data?.quality_options && (
                <div style={{ marginTop: '10px' }}>
                  <h3>画质选项:</h3>
                  <ul>
                    {testResult.data.data.quality_options.map((option, index) => (
                      <li key={index}>
                        {option.quality}: <a href={option.url} target="_blank" rel="noopener noreferrer">{option.url}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3>错误详情:</h3>
              <pre style={{ background: '#f8f9fa', padding: '10px', overflowX: 'auto' }}>
                {JSON.stringify(testResult.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h2>使用说明</h2>
        <ol>
          <li>输入要测试的视频ID和剧集ID</li>
          <li>选择正确的播放类型</li>
          <li>点击"测试播放"按钮</li>
          <li>查看测试结果和播放地址信息</li>
        </ol>
        <p><strong>注意:</strong> 如果测试失败，请检查控制台日志以获取更多错误信息。</p>
      </div>
    </div>
  );
};

export default PlaybackTestPage;