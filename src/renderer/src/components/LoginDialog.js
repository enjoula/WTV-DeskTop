// components/LoginDialog.js
import React from 'react';
import './LoginDialog.css';

const LoginDialog = ({ 
  message, 
  onConfirm, 
  onCancel, 
  onExtra,
  showCancel = true,
  showExtra = false,
  confirmText = '去登录',
  cancelText = '取消',
  extraText = '去注册',
  type = 'info' // 'info' | 'warning'
}) => {
  const handleOverlayClick = (e) => {
    // 只有点击遮罩层本身时才关闭（不是点击对话框内容）
    if (e.target === e.currentTarget && showCancel) {
      onCancel && onCancel();
    }
  };

  const handleConfirm = () => {
    onConfirm && onConfirm();
  };

  const handleCancel = () => {
    onCancel && onCancel();
  };

  const handleExtra = () => {
    onExtra && onExtra();
  };

  return (
    <div 
      className="login-dialog-overlay" 
      onClick={handleOverlayClick}
    >
      <div className="login-dialog" onClick={(e) => e.stopPropagation()}>
        {/* 图标区域 */}
        <div className={`login-dialog-icon login-dialog-icon-${type}`}>
          {type === 'warning' ? '⚠️' : '🔐'}
        </div>

        {/* 标题 */}
        <div className="login-dialog-title">
          <h2>{type === 'warning' ? '需要重新登录' : '需要登录'}</h2>
        </div>

        {/* 内容 */}
        <div className="login-dialog-content">
          <p>{message}</p>
        </div>

        {/* 按钮区域 */}
        <div className="login-dialog-actions">
          {showExtra && (
            <button
              className="login-button-tertiary"
              onClick={handleExtra}
            >
              {extraText}
            </button>
          )}
          {showCancel && (
            <button 
              className="login-button-secondary" 
              onClick={handleCancel}
            >
              {cancelText}
            </button>
          )}
          <button 
            className="login-button-primary" 
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginDialog;

