import React, { useMemo, useState } from 'react';
import { submitVideoFeedback } from '../api/video';
import { showCenterTip } from '../utils/tips';
import './FeedbackDialog.css';

export const FEEDBACK_PROBLEM_TYPES = [
  { type: 'play_error', label: '无法播放/卡顿/花屏' },
  { type: 'wrong_content', label: '内容错误/不对版' },
  { type: 'missing_episode', label: '缺少剧集' },
  { type: 'missing_video', label: '缺少视频' },
  { type: 'audio_error', label: '音画不同步/无声' },
  { type: 'request_video', label: '求片' },
  { type: 'other', label: '其他' },
];

/**
 * 播放器纠错反馈弹窗
 * @param {object} props
 * @param {string|number} props.videoId
 * @param {number} props.episodeNumber 电影传 0
 * @param {string} [props.videoTitle]
 * @param {() => void} props.onClose
 */
const FeedbackDialog = ({ videoId, episodeNumber = 0, videoTitle = '', onClose }) => {
  const [problemType, setProblemType] = useState(FEEDBACK_PROBLEM_TYPES[0].type);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedLabel = useMemo(
    () => FEEDBACK_PROBLEM_TYPES.find((item) => item.type === problemType)?.label || '',
    [problemType]
  );

  const handleSubmit = async () => {
    if (!videoId && problemType !== 'missing_video' && problemType !== 'request_video') {
      showCenterTip('缺少视频信息，无法提交');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        problem_type: problemType,
        content: (content || '').trim(),
        episode_number: Number.isFinite(Number(episodeNumber)) ? Number(episodeNumber) : 0,
      };
      if (videoId != null && String(videoId).trim() !== '') {
        payload.video_id = String(videoId);
      }
      if (videoTitle) {
        payload.video_title = String(videoTitle);
      }
      // 求片且用户填写了内容时，优先把内容当作求片标题补充
      if (problemType === 'request_video' && payload.content && !payload.video_title) {
        payload.video_title = payload.content.slice(0, 255);
      }

      const response = await submitVideoFeedback(payload);
      const resData = response?.data || response;
      if (resData?.code !== 0) {
        throw { message: resData?.message || '提交失败，请稍后重试', response: { data: resData } };
      }
      showCenterTip('反馈已提交，感谢反馈');
      onClose?.();
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        '提交失败，请稍后重试';
      showCenterTip(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="feedback-dialog-overlay" onClick={onClose}>
      <div
        className="feedback-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="纠错反馈"
      >
        <div className="feedback-dialog-header">
          <h3>纠错反馈</h3>
          <button type="button" className="feedback-dialog-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="feedback-dialog-meta">
          {videoTitle ? <span className="feedback-dialog-title">{videoTitle}</span> : null}
          {Number(episodeNumber) > 0 ? (
            <span className="feedback-dialog-episode">第{episodeNumber}集</span>
          ) : null}
        </div>

        <div className="feedback-dialog-body">
          <div className="feedback-type-list">
            {FEEDBACK_PROBLEM_TYPES.map((item) => (
              <button
                key={item.type}
                type="button"
                className={`feedback-type-item${problemType === item.type ? ' is-active' : ''}`}
                onClick={() => setProblemType(item.type)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="feedback-content-label" htmlFor="feedback-content">
            补充说明（可选）
          </label>
          <textarea
            id="feedback-content"
            className="feedback-content-input"
            rows={3}
            maxLength={1000}
            placeholder={
              problemType === 'request_video'
                ? '请填写想看的片名（可空）'
                : `可补充「${selectedLabel}」的具体说明（可空）`
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="feedback-dialog-actions">
          <button type="button" className="feedback-btn-cancel" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="feedback-btn-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '提交中…' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackDialog;
