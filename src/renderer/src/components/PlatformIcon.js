import React from 'react';
import AppIcon from './AppIcon';
import { isWindows7 } from '../utils/platform';

const PlatformIcon = ({ iconName, fallback, className = '' }) => {
  const useWin7IconMode = isWindows7();
  return (
    <span className={className}>
      {useWin7IconMode ? <AppIcon name={iconName} /> : fallback}
    </span>
  );
};

export default PlatformIcon;
