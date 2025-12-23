// components/StarRating.js
import React from 'react';

/**
 * 星级评分组件
 * @param {number} score - 评分（0-10分）
 * @param {number} maxScore - 满分（默认10分）
 * @param {number} stars - 星星数量（默认5颗）
 * @param {string} className - 自定义样式类名
 */
const StarRating = ({ score, maxScore = 10, stars = 5, className = '' }) => {
  // 如果没有评分，不显示
  if (!score && score !== 0) {
    return null;
  }

  // 将分数转换为星星数量（0-5颗星）
  // 例如：8.5分（满分10分） = 8.5 / 10 * 5 = 4.25颗星
  const starCount = (score / maxScore) * stars;
  
  // 计算完整星星数量
  const fullStars = Math.floor(starCount);
  
  // 计算是否有半星（小数部分 >= 0.25 且 < 0.75）
  const hasHalfStar = starCount - fullStars >= 0.25 && starCount - fullStars < 0.75;
  
  // 计算是否有四分之三星（小数部分 >= 0.75，显示为完整星）
  const hasQuarterStar = starCount - fullStars >= 0.75;

  return (
    <div className={`star-rating ${className}`}>
      {Array.from({ length: stars }, (_, index) => {
        if (index < fullStars) {
          // 完整星星
          return (
            <span key={index} className="star star-full">★</span>
          );
        } else if (index === fullStars && hasHalfStar) {
          // 半星 - 使用两个重叠的星星
          return (
            <span key={index} className="star star-half">
              <span className="star-half-empty">☆</span>
              <span className="star-half-full">★</span>
            </span>
          );
        } else if (index === fullStars && hasQuarterStar) {
          // 四分之三星（显示为完整星）
          return (
            <span key={index} className="star star-full">★</span>
          );
        } else {
          // 空星
          return (
            <span key={index} className="star star-empty">☆</span>
          );
        }
      })}
      <span className="rating-value">{score.toFixed(1)}</span>
    </div>
  );
};

export default StarRating;

