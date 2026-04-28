// pages/TermsOfService.js
import React, { useEffect } from 'react';
import './TermsOfService.css';

const TermsOfService = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="terms-page">
      <div className="terms-container">
        <header className="terms-header">
          <h1>服务条款</h1>
          <p className="last-updated">最后更新日期：2024年3月</p>
        </header>

        <div className="terms-content">
          <section className="terms-intro">
            <p>
              欢迎使用 <strong>WTV</strong>（以下简称“本应用”）。在您使用本应用提供的服务之前，请务必仔细阅读并理解本《服务条款》（以下简称“本协议”）。
            </p>
          </section>

          <section className="terms-section">
            <h2>1. 服务定义与范围</h2>
            <div className="section-item">
              <h3>服务本质</h3>
              <p><strong>WTV</strong> 是一款视频搜索与链接聚合工具。本应用通过自动化搜索技术，为用户提供互联网公开视频内容的索引、链接跳转或流媒体解析播放服务。</p>
            </div>
            <div className="section-item">
              <h3>不提供存储</h3>
              <p>本应用本身不存储、不托管、不上传、不修改任何视频文件或源文件。所有视频内容均直接来源于第三方互联网平台。</p>
            </div>
          </section>

          <section className="terms-section">
            <h2>2. 知识产权声明与免责</h2>
            <div className="section-item">
              <h3>版权归属</h3>
              <p>本应用搜索结果中显示的视频内容，其版权均归属于原视频上传者或相关权利人。</p>
            </div>
            <div className="section-item">
              <h3>第三方行为</h3>
              <p>由于本应用仅提供搜索聚合服务，我们无法控制第三方网站的内容、隐私政策或行为。用户在使用过程中跳转至第三方平台产生的任何风险，由用户自行承担。</p>
            </div>
            <div className="section-item">
              <h3>技术中立</h3>
              <p>本应用仅作为技术服务提供方，不对视频内容的合法性、准确性、完整性负责。</p>
            </div>
          </section>

          <section className="terms-section">
            <h2>3. 用户使用规范</h2>
            <p>用户在使用本应用时，必须承诺：</p>
            <div className="section-item">
              <h3>合法使用</h3>
              <p>遵守所在地法律法规，不得利用本应用从事侵犯他人版权、名誉权或其他合法权益的活动。</p>
            </div>
            <div className="section-item">
              <h3>禁止商业化</h3>
              <p>除非另有书面协议，否则不得将本应用提供的搜索结果用于商业赢利。</p>
            </div>
            <div className="section-item">
              <h3>不干扰系统</h3>
              <p>不得利用自动化脚本、爬虫或恶意攻击手段干扰本应用的正常运行。</p>
            </div>
          </section>

          <section className="terms-section">
            <h2>4. 侵权通知（DMCA/版权保护政策）</h2>
            <p>本应用高度重视知识产权保护。如果您是版权所有者，且认为本应用索引的内容侵犯了您的权利：</p>
            <div className="section-item">
              <p>请通过 <strong>[联系邮箱/反馈入口]</strong> 向我们发送有效的侵权通知。</p>
              <p>通知应包含：权利证明、侵权链接、及您的联系方式。</p>
              <p>收到合法通知后，我们将根据“避风港原则”在合理时间内断开相关搜索链接。</p>
            </div>
          </section>

          <section className="terms-section">
            <h2>5. 免责条款</h2>
            <div className="section-item">
              <h3>服务中断</h3>
              <p>因网络环境、第三方站点下架或不可抗力导致视频无法播放，本应用不承担责任。</p>
            </div>
            <div className="section-item">
              <h3>数据准确性</h3>
              <p>本应用不保证搜索结果的实时性与绝对准确性。</p>
            </div>
            <div className="section-item">
              <h3>损害赔偿</h3>
              <p>在法律允许的最大范围内，本应用不对用户因使用服务产生的任何直接或间接损失承担责任。</p>
            </div>
          </section>

          <section className="terms-section">
            <h2>6. 协议的修改</h2>
            <p>我们保留随时修改本协议的权利。协议更新后，我们将在应用内发布公告。若您继续使用本应用，即视为您接受修改后的条款。</p>
          </section>

          <section className="terms-section">
            <h2>7. 适用法律与争议解决</h2>
            <p>本协议的解释、效力及纠纷的解决，均适用 <strong>中国</strong> 法律。若发生争议，应首先通过友好协商解决；协商不成时，提交至 <strong>[指定仲裁委员会/法院]</strong> 裁决。</p>
          </section>
        </div>

        <footer className="terms-footer">
          <button className="back-button" onClick={() => window.close()}>关闭窗口</button>
        </footer>
      </div>
    </div>
  );
};

export default TermsOfService;

