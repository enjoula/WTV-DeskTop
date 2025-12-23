// DiagnosticPage.js - 用于详细诊断首页数据获取问题
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMovies, fetchTVShows, fetchAnime } from '../store/videoSlice';

const DiagnosticPage = () => {
  const dispatch = useDispatch();
  const { movies, tvShows, anime } = useSelector(state => state.video);
  const [testResults, setTestResults] = useState({
    reduxState: null,
    apiCalls: [],
    errors: []
  });

  useEffect(() => {
    console.log('DiagnosticPage mounted');
    
    // 记录初始Redux状态
    setTestResults(prev => ({
      ...prev,
      reduxState: { movies, tvShows, anime }
    }));

    // 测试API调用
    const testApiCalls = async () => {
      try {
        console.log('开始测试电影列表获取...');
        const movieResult = await dispatch(fetchMovies({ page: 1, page_size: 5 })).unwrap();
        console.log('电影列表获取成功:', movieResult);
        
        setTestResults(prev => ({
          ...prev,
          apiCalls: [...prev.apiCalls, { type: 'movies', status: 'success', data: movieResult }]
        }));
      } catch (error) {
        console.error('电影列表获取失败:', error);
        setTestResults(prev => ({
          ...prev,
          errors: [...prev.errors, { type: 'movies', error: error.message || '未知错误' }]
        }));
      }

      try {
        console.log('开始测试电视剧列表获取...');
        const tvResult = await dispatch(fetchTVShows({ page: 1, page_size: 5 })).unwrap();
        console.log('电视剧列表获取成功:', tvResult);
        
        setTestResults(prev => ({
          ...prev,
          apiCalls: [...prev.apiCalls, { type: 'tvShows', status: 'success', data: tvResult }]
        }));
      } catch (error) {
        console.error('电视剧列表获取失败:', error);
        setTestResults(prev => ({
          ...prev,
          errors: [...prev.errors, { type: 'tvShows', error: error.message || '未知错误' }]
        }));
      }

      try {
        console.log('开始测试动漫列表获取...');
        const animeResult = await dispatch(fetchAnime({ page: 1, page_size: 5 })).unwrap();
        console.log('动漫列表获取成功:', animeResult);
        
        setTestResults(prev => ({
          ...prev,
          apiCalls: [...prev.apiCalls, { type: 'anime', status: 'success', data: animeResult }]
        }));
      } catch (error) {
        console.error('动漫列表获取失败:', error);
        setTestResults(prev => ({
          ...prev,
          errors: [...prev.errors, { type: 'anime', error: error.message || '未知错误' }]
        }));
      }
    };

    testApiCalls();
  }, [dispatch, movies, tvShows, anime]);

  // 监听Redux状态变化
  useEffect(() => {
    console.log('Redux状态更新:', { movies, tvShows, anime });
    setTestResults(prev => ({
      ...prev,
      reduxState: { movies, tvShows, anime }
    }));
  }, [movies, tvShows, anime]);

  return (
    <div style={{ padding: '20px' }}>
      <h1>详细诊断页面</h1>
      <Link to="/">返回首页</Link> | <Link to="/test">简单测试</Link>
      
      <div style={{ marginTop: '20px' }}>
        <h2>Redux状态</h2>
        <pre>{JSON.stringify(testResults.reduxState, null, 2)}</pre>
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <h2>API调用结果</h2>
        {testResults.apiCalls.length > 0 ? (
          <ul>
            {testResults.apiCalls.map((call, index) => (
              <li key={index}>
                <strong>{call.type}:</strong> {call.status}
                <pre>{JSON.stringify(call.data, null, 2)}</pre>
              </li>
            ))}
          </ul>
        ) : (
          <p>等待API调用结果...</p>
        )}
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <h2>错误信息</h2>
        {testResults.errors.length > 0 ? (
          <ul>
            {testResults.errors.map((error, index) => (
              <li key={index} style={{ color: 'red' }}>
                <strong>{error.type}:</strong> {error.error}
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无错误</p>
        )}
      </div>
    </div>
  );
};

export default DiagnosticPage;