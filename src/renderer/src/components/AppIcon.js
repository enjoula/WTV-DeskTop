import React from 'react';

const iconPaths = {
  movie: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h18M3 15h18" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 18v3M8 3l4 3 4-3" />
    </>
  ),
  anime: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.2" />
      <circle cx="15" cy="10" r="1.2" />
      <path d="M8.5 14.5c1 .8 2.2 1.2 3.5 1.2s2.5-.4 3.5-1.2" />
    </>
  ),
  variety: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 4v16M9 9h11" />
    </>
  ),
  documentary: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
      <path d="M14 4v4h4M8 13h8M8 16h6M8 10h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </>
  ),
  favorite: (
    <path d="M12 20s-7-4.4-9-8.3C1.7 8.8 3.4 6 6.3 6c2 0 3.1 1.1 3.7 2.2C10.6 7.1 11.7 6 13.7 6c2.9 0 4.6 2.8 3.3 5.7C19 15.6 12 20 12 20z" />
  ),
};

const AppIcon = ({ name, className = '' }) => {
  const shape = iconPaths[name] || iconPaths.search;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape}
    </svg>
  );
};

export default AppIcon;
