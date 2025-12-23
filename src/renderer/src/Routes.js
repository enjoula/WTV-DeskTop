// Routes.js
import React from 'react';
import { Routes, Route } from 'react-router-dom';
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
import TestPage from './pages/TestPage';
import DiagnosticPage from './pages/DiagnosticPage';
import PlaybackTestPage from './pages/PlaybackTestPage';

function RoutesComponent() {
  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/videos/:category" element={<VideoList />} />
          <Route path="/video/:id" element={<VideoDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/search" element={<Search />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/diagnostic" element={<DiagnosticPage />} />
          <Route path="/playback-test" element={<PlaybackTestPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default RoutesComponent;