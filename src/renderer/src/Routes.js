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

function readPopupWindowFlag() {
  try {
    const hash = (typeof window !== 'undefined' ? window.location.hash : '') || '';
    const search = (typeof window !== 'undefined' ? window.location.search : '') || '';
    const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const params = new URLSearchParams(fromHash || search.replace(/^\?/, ''));
    return params.get('newWindow') === 'true';
  } catch (_) {
    return false;
  }
}

function RoutesComponent() {
  const location = useLocation();
  const isNewWindow = React.useMemo(() => {
    if (readPopupWindowFlag()) return true;
    const hash = window.location.hash || location.hash || '';
    const urlParams = new URLSearchParams(hash.split('?')[1] || location.search);
    return urlParams.get('newWindow') === 'true';
  }, [location]);

  if (isNewWindow && typeof document !== 'undefined') {
    document.documentElement.classList.add('wtv-popup-window');
  }

  React.useEffect(() => {
    document.documentElement.classList.toggle('wtv-popup-window', isNewWindow);
  }, [isNewWindow]);
  
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