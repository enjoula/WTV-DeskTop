// utils/suppressWarnings.js
// 抑制特定的 React 警告

// 注意：React 的“Unknown event handler property”警告仅在开发模式且未包裹 StrictMode 时可被捕获。
// 在 CRA + StrictMode 下，React 会双调用、且有时包装消息，改为前置过滤 console.error。
const originalError = console.error;
console.error = (...args) => {
  const combined = args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.message || String(arg);
    return arg?.toString?.() || '';
  }).join(' ');

  if (
    combined.includes('Unknown event handler property `onDuration`') ||
    combined.includes('Unknown event handler property `onSeek`') ||
    combined.includes('Unknown event handler property `onSeeked`') ||
    combined.includes('Unknown event handler property') && combined.includes('onDuration') ||
    combined.includes('Unknown event handler property') && combined.includes('onSeek')
  ) {
    return;
  }

  originalError.apply(console, args);
};

