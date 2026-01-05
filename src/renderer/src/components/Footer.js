// components/Footer.js
import React from 'react';

const Footer = () => {
  const openNewWindow = (path, title) => {
    if (window.electronAPI && window.electronAPI.openPageWindow) {
      window.electronAPI.openPageWindow(path, title);
    } else {
      // 降级处理：如果在浏览器中运行，则在当前页面跳转
      window.location.hash = `#${path}`;
    }
  };

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <p>&copy; 2024 WTV. 保留所有权利.</p>
        <div className="footer-links">
          <button 
            className="footer-link-btn" 
            onClick={() => openNewWindow('/about', '关于 WTV')}
          >
            关于我们
          </button>
          <button 
            className="footer-link-btn" 
            onClick={() => openNewWindow('/terms', '服务条款')}
          >
            服务条款
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;