// pages/AboutUs.js
import React, { useEffect } from 'react';
import './AboutUs.css';

const AboutUs = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="about-page">
      <div className="about-container">
        <header className="about-header">
          <div className="about-logo">
            <span className="logo-icon">🎬</span>
            <h1>关于 WTV</h1>
          </div>
          <p className="about-subtitle">专业的视频搜索与聚合平台</p>
        </header>

        <div className="about-content">
          <section className="about-section">
            <h2>我们的愿景</h2>
            <p>在信息爆炸的时代，寻找高质量的长视频内容往往费时费力。<strong>WTV</strong> 致力于打造一个连接用户与全球公开网络资源的桥梁。我们通过先进的搜索技术，让发现好内容变得简单、快捷且高效。</p>
          </section>

          <section className="about-section">
            <h2>我们是谁？</h2>
            <p><strong>WTV</strong> 是一款创新的移动互联网视频搜索引擎。我们不生产内容，也不存储视频，我们是互联网海量信息的“导航员”。</p>
            <p>通过智能聚合算法，我们将散落在互联网各个角落的公开视频资源进行索引，为您提供一站式的搜索与在线观看体验。无论是纪录片、影视剧还是公开课，只要网络上存在，我们就能帮您找到。</p>
          </section>

          <section className="about-section">
            <h2>我们的核心原则</h2>
            <div className="principles-grid">
              <div className="principle-card">
                <div className="principle-icon">🚀</div>
                <h3>技术驱动</h3>
                <p>利用高效的爬虫与索引技术，实时更新互联网公开资源，确保搜索结果的丰富性。</p>
              </div>
              <div className="principle-card">
                <div className="principle-icon">⚖️</div>
                <h3>尊重版权</h3>
                <p>我们严格遵守互联网法律法规，尊重每一位内容创作者的劳动成果。作为技术服务方，我们仅提供链接索引，不触碰内容本身。</p>
              </div>
              <div className="principle-card">
                <div className="principle-icon">✨</div>
                <h3>极致体验</h3>
                <p>简洁的界面、无广告的干扰，以及丝滑的跨平台播放适配，是我们不断追求的目标。</p>
              </div>
            </div>
          </section>

          <section className="about-section legal-notice">
            <h2>法律与合规说明</h2>
            <div className="notice-item">
              <h3>非托管服务</h3>
              <p><strong>WTV</strong> 仅提供搜索技术服务，所有视频源均来自第三方公开网站。我们服务器不存储、不上传任何视频文件。</p>
            </div>
            <div className="notice-item">
              <h3>版权声明</h3>
              <p>视频内容的版权归原权利人所有。若您发现搜索结果中存在侵权内容，请通过 [版权投诉通道] 联系我们，我们将依法第一时间断开链接。</p>
            </div>
            <div className="notice-item">
              <h3>合规使用</h3>
              <p>我们倡导用户在法律允许的范围内使用本工具，共同维护健康的互联网生态环境。</p>
            </div>
          </section>

          <section className="about-section contact-section">
            <h2>联系我们</h2>
            <p>如果您有任何建议、技术反馈或商务合作需求，欢迎通过以下方式与我们取得联系：</p>
            <div className="contact-info">
              <div className="contact-item">
                <span className="contact-label">官方邮箱：</span>
                <span className="contact-value">support@wtv.com</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">反馈建议：</span>
                <span className="contact-value">点击应用内“设置-意见反馈”</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">官方网站：</span>
                <span className="contact-value">www.wtv-app.com</span>
              </div>
            </div>
          </section>
        </div>

        <footer className="about-footer">
          <button className="back-button" onClick={() => window.close()}>关闭窗口</button>
        </footer>
      </div>
    </div>
  );
};

export default AboutUs;

