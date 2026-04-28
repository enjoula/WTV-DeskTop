// Routes.js
import React from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import VideoList from './pages/VideoList';
import VideoDetail from './pages/VideoDetail';
import Profile from './pages/Profile';
import Search from './pages/Search';
import Favorites from './pages/Favorites';
import PlayHistory from './pages/PlayHistory';
import TermsOfService from './pages/TermsOfService';
import AboutUs from './pages/AboutUs';
import TestPage from './pages/TestPage';
import DiagnosticPage from './pages/DiagnosticPage';
import PlaybackTestPage from './pages/PlaybackTestPage';

function RoutesComponent() {
  const location = useLocation();
  // 检测是否是 newWindow 参数（新窗口打开的视频详情页）
  // HashRouter 中，查询参数在 location.search 中，例如 "?newWindow=true"
  // 或者从 window.location.hash 中解析
  const isNewWindow = React.useMemo(() => {
    const hash = window.location.hash || location.hash || '';
    const urlParams = new URLSearchParams(hash.split('?')[1] || location.search);
    return urlParams.get('newWindow') === 'true';
  }, [location]);
  
  return (
    <div className={`app-container ${isNewWindow ? 'app-container-no-header' : ''}`}>
      {!isNewWindow && <Header />}
      <main className={`main-content ${isNewWindow ? 'main-content-no-header' : ''}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/videos/movies" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/videos/:category" element={<VideoList />} />
          <Route path="/video/:id" element={<VideoDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/search" element={<Search />} />
          <Route path="/play-history" element={<PlayHistory />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/diagnostic" element={<DiagnosticPage />} />
          <Route path="/playback-test" element={<PlaybackTestPage />} />
        </Routes>
      </main>
      {!isNewWindow && <Footer />}
    </div>
  );
}

export default RoutesComponent;