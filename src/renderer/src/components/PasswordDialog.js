// components/PasswordDialog.js
import React, { useState } from 'react';
import './PasswordDialog.css';

const PasswordDialog = ({ onClose, onConfirm }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setError('');

    if (!oldPassword) {
      setError('请输入旧密码');
      return;
    }

    if (!password || !confirmPassword) {
      setError('请输入新密码');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(password)) {
      setError('密码不能包含汉字');
      return;
    }

    if (password === oldPassword) {
      setError('新密码不能与旧密码相同');
      return;
    }

    setPending(true);
    try {
      await onConfirm({ oldPassword, newPassword: password });
    } catch (err) {
      setError(err?.message || '密码修改失败，请稍后重试');
    } finally {
      setPending(false);
    }
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
            <label>旧密码:</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入旧密码"
              autoComplete="current-password"
            />
          </div>
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
            <button type="button" onClick={onClose} className="password-dialog-cancel" disabled={pending}>
              取消
            </button>
            <button type="submit" className="password-dialog-confirm" disabled={pending}>
              {pending ? '提交中...' : '确认'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordDialog;

