// TestPage.js - 用于诊断首页数据获取问题
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';

const TestPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        console.log('开始测试API请求...');
        
        // 测试基础连接
        const response = await apiClient.get('/ping');
        console.log('Ping响应:', response);
        
        // 测试电影列表获取
        const moviesResponse = await apiClient.get('/video/movies?page=1&page_size=5');
        console.log('电影列表响应:', moviesResponse);
        setData(moviesResponse.data);
      } catch (err) {
        console.error('测试请求失败:', err);
        setError(err.message || '请求失败');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>诊断测试页面</h1>
      <Link to="/">返回首页</Link>
      
      {loading && <p>加载中...</p>}
      
      {error && (
        <div style={{ color: 'red' }}>
          <h2>错误信息:</h2>
          <p>{error}</p>
        </div>
      )}
      
      {data && (
        <div>
          <h2>测试数据:</h2>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
      
      {!loading && !error && !data && <p>等待测试结果...</p>}
    </div>
  );
};

export default TestPage;