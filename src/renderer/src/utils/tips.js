// utils/tips.js
// 简单的全局提示工具，在页面中间显示 2 秒后自动消失

let tipTimeout = null;

export function showTip(message, duration = 2000) {
  if (!message || typeof document === 'undefined') return;

  let tipEl = document.getElementById('global-tip-message');

  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'global-tip-message';
    tipEl.style.position = 'fixed';
    tipEl.style.top = '50%';
    tipEl.style.left = '50%';
    tipEl.style.transform = 'translate(-50%, -50%) scale(0.88)';
    tipEl.style.zIndex = '99999';
    tipEl.style.padding = '20px 36px';
    tipEl.style.borderRadius = '18px';
    // 更柔和的毛玻璃效果：降低不透明度，增加模糊度
    tipEl.style.background = 'linear-gradient(135deg, rgba(40, 44, 52, 0.82) 0%, rgba(30, 34, 42, 0.85) 100%)';
    tipEl.style.backdropFilter = 'blur(28px) saturate(150%)';
    tipEl.style.webkitBackdropFilter = 'blur(28px) saturate(150%)';
    tipEl.style.color = 'rgba(255, 255, 255, 0.96)';
    tipEl.style.fontSize = '15px';
    tipEl.style.fontWeight = '500';
    tipEl.style.lineHeight = '1.65';
    tipEl.style.letterSpacing = '0.3px';
    // 更柔和、更自然的阴影效果，多层阴影营造深度但不过于突兀
    tipEl.style.boxShadow = 
      '0 12px 48px rgba(0, 0, 0, 0.15), ' +
      '0 6px 20px rgba(0, 0, 0, 0.1), ' +
      '0 2px 8px rgba(0, 0, 0, 0.08), ' +
      'inset 0 1px 0 rgba(255, 255, 255, 0.1), ' +
      'inset 0 -1px 0 rgba(0, 0, 0, 0.06)';
    // 更柔和的边框
    tipEl.style.border = '1px solid rgba(255, 255, 255, 0.06)';
    tipEl.style.opacity = '0';
    // 更平滑的动画效果：使用更柔和的缓动函数
    tipEl.style.transition = 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
    tipEl.style.pointerEvents = 'none';
    tipEl.style.textAlign = 'center';
    tipEl.style.whiteSpace = 'nowrap';
    tipEl.style.maxWidth = '90vw';
    tipEl.style.overflow = 'hidden';
    tipEl.style.textOverflow = 'ellipsis';
    tipEl.style.userSelect = 'none';
    // 添加微妙的文字阴影，提升可读性同时保持柔和
    tipEl.style.textShadow = '0 1px 3px rgba(0, 0, 0, 0.12)';
    tipEl.style.wordWrap = 'break-word';
    tipEl.style.overflowWrap = 'break-word';
    document.body.appendChild(tipEl);
  }

  tipEl.textContent = message;

  // 先清理之前的计时器
  if (tipTimeout) {
    clearTimeout(tipTimeout);
    tipTimeout = null;
  }

  // 显示：淡入 + 缩放动画（更平滑的效果）
  requestAnimationFrame(() => {
    tipEl.style.opacity = '1';
    tipEl.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  // 一定时间后自动隐藏（淡出 + 缩放动画，更柔和的退出效果）
  tipTimeout = setTimeout(() => {
    tipEl.style.opacity = '0';
    tipEl.style.transform = 'translate(-50%, -50%) scale(0.92)';
  }, duration);
}

// 在页面正中间显示提示（用于自动播放下一集等场景）
let centerTipTimeout = null;

export function showCenterTip(message, duration = 2000) {
  if (!message || typeof document === 'undefined') return;

  let tipEl = document.getElementById('center-tip-message');

  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'center-tip-message';
    tipEl.style.position = 'fixed';
    tipEl.style.top = '50%';
    tipEl.style.left = '50%';
    tipEl.style.transform = 'translate(-50%, -50%) scale(0.88)';
    tipEl.style.zIndex = '99999';
    tipEl.style.padding = '20px 36px';
    tipEl.style.borderRadius = '18px';
    // 更柔和的毛玻璃效果：降低不透明度，增加模糊度，使其更融入背景
    tipEl.style.background = 'linear-gradient(135deg, rgba(40, 44, 52, 0.82) 0%, rgba(30, 34, 42, 0.85) 100%)';
    tipEl.style.backdropFilter = 'blur(28px) saturate(150%)';
    tipEl.style.webkitBackdropFilter = 'blur(28px) saturate(150%)';
    tipEl.style.color = 'rgba(255, 255, 255, 0.96)';
    tipEl.style.fontSize = '15px';
    tipEl.style.fontWeight = '500';
    tipEl.style.lineHeight = '1.65';
    tipEl.style.letterSpacing = '0.3px';
    // 更柔和、更自然的阴影效果，多层阴影营造深度但不过于突兀
    tipEl.style.boxShadow = 
      '0 12px 48px rgba(0, 0, 0, 0.15), ' +
      '0 6px 20px rgba(0, 0, 0, 0.1), ' +
      '0 2px 8px rgba(0, 0, 0, 0.08), ' +
      'inset 0 1px 0 rgba(255, 255, 255, 0.1), ' +
      'inset 0 -1px 0 rgba(0, 0, 0, 0.06)';
    // 更柔和的边框
    tipEl.style.border = '1px solid rgba(255, 255, 255, 0.06)';
    tipEl.style.opacity = '0';
    // 更平滑的动画效果：使用更柔和的缓动函数
    tipEl.style.transition = 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
    tipEl.style.pointerEvents = 'none';
    tipEl.style.textAlign = 'center';
    tipEl.style.whiteSpace = 'nowrap';
    tipEl.style.maxWidth = '90vw';
    tipEl.style.overflow = 'hidden';
    tipEl.style.textOverflow = 'ellipsis';
    tipEl.style.userSelect = 'none';
    // 添加微妙的文字阴影，提升可读性同时保持柔和
    tipEl.style.textShadow = '0 1px 3px rgba(0, 0, 0, 0.12)';
    document.body.appendChild(tipEl);
  }

  tipEl.textContent = message;

  // 先清理之前的计时器
  if (centerTipTimeout) {
    clearTimeout(centerTipTimeout);
    centerTipTimeout = null;
  }

  // 显示：淡入 + 缩放动画（更平滑的效果）
  requestAnimationFrame(() => {
    tipEl.style.opacity = '1';
    tipEl.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  // 一定时间后自动隐藏（淡出 + 缩放动画，更柔和的退出效果）
  centerTipTimeout = setTimeout(() => {
    tipEl.style.opacity = '0';
    tipEl.style.transform = 'translate(-50%, -50%) scale(0.92)';
  }, duration);
}


