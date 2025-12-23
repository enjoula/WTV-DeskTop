import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter as Router } from 'react-router-dom';
import store from './store';
import Routes from './Routes';
import { fetchAllFilters } from './store/videoSlice';
import './App.css';

function App() {
  const [version, setVersion] = React.useState('未知版本');

  React.useEffect(() => {
    // 获取应用版本
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
      window.electronAPI.getAppVersion().then(version => {
        setVersion(version);
      }).catch(err => {
        console.log('获取应用版本失败:', err);
        setVersion('开发版本');
      });
    } else {
      setVersion('开发版本');
    }
    
    // 应用启动时获取所有筛选条件
    console.log('App 初始化 - 开始获取所有筛选条件');
    store.dispatch(fetchAllFilters()).then(() => {
      console.log('App 初始化 - 筛选条件获取完成');
    }).catch(error => {
      console.error('App 初始化 - 获取筛选条件失败:', error);
    });
    
    // 调试信息：检查环境
    console.log('App 初始化');
    console.log('PUBLIC_URL:', process.env.PUBLIC_URL);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('当前路径:', window.location.href);
  }, []);

  return (
    <Provider store={store}>
      <Router>
        <div className="App">
          <Routes />
        </div>
      </Router>
    </Provider>
  );
}

export default App;