// components/PasswordDialog.js
import React, { useState } from 'react';
import './PasswordDialog.css';

const PasswordDialog = ({ onClose, onConfirm }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // 验证密码是否为空
    if (!password || !confirmPassword) {
      setError('请输入密码');
      return;
    }

    // 验证两次密码是否一致
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    // 验证密码长度（根据实际需求调整）
    if (password.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    // 调用确认回调
    onConfirm(password);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="password-dialog-overlay" onClick={handleOverlayClick}>
      <div className="password-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="password-dialog-close" onClick={onClose}>×</button>
        <h2>修改密码</h2>
        <form onSubmit={handleSubmit}>
          <div className="password-dialog-form-group">
            <label>新密码:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入新密码"
              autoComplete="new-password"
            />
          </div>
          <div className="password-dialog-form-group">
            <label>确认密码:</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入新密码"
              autoComplete="new-password"
            />
          </div>
          {error && <div className="password-dialog-error">{error}</div>}
          <div className="password-dialog-actions">
            <button type="button" onClick={onClose} className="password-dialog-cancel">
              取消
            </button>
            <button type="submit" className="password-dialog-confirm">
              确认
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordDialog;

