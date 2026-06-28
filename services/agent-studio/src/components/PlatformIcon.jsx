const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true
};

function XhsIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#FF2442" />
      <path d="M7.4 8.2h5.9c1.9 0 3.3 1.2 3.3 3 0 1.1-.5 2-1.4 2.5l1.9 2.8h-3.1l-1.5-2.3h-1.9v2.3H7.4V8.2Zm3.2 2.4v1.4h2.2c.5 0 .8-.3.8-.7s-.3-.7-.8-.7h-2.2Z" fill="#fff" />
    </svg>
  );
}

function DouyinIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#070707" />
      <path d="M13.7 5.2c.3 2.3 1.5 3.7 3.6 4v2.8a6.4 6.4 0 0 1-3.4-1v4.2a4.8 4.8 0 1 1-4.8-4.8c.3 0 .7 0 1 .1v3a2 2 0 1 0 1.2 1.8V5.2h2.4Z" fill="#25F4EE" />
      <path d="M14.4 5.2c.4 2 1.5 3.1 3.2 3.5v2.4a6.6 6.6 0 0 1-3.3-1v4.5a4.8 4.8 0 0 1-7.8 3.7 4.8 4.8 0 0 0 6.3-4.5V5.2h1.6Z" fill="#FE2C55" />
      <path d="M13.2 5.2c.3 2.3 1.5 3.7 3.6 4v2.2a6.1 6.1 0 0 1-3.4-1v4.5a4.3 4.3 0 1 1-4.3-4.3c.3 0 .6 0 .9.1v2.4a1.8 1.8 0 1 0 1.1 1.7V5.2h2.1Z" fill="#fff" />
    </svg>
  );
}

function XIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#050505" />
      <path d="M7 6.5h3.1l2.4 3.2 2.8-3.2h2.1l-3.9 4.5 4.4 6.5h-3.1l-2.7-3.8-3.3 3.8H6.7l4.4-5.1L7 6.5Zm2 1.2 6.4 8.7h.6L9.6 7.7H9Z" fill="#fff" />
    </svg>
  );
}

function WeiboIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#FF8200" />
      <path d="M16.6 8.3c.6.5 1 1.2 1.1 2l-1.5.2c-.1-.4-.3-.8-.7-1.1-.3-.3-.7-.4-1.1-.5l.3-1.4c.7.1 1.3.3 1.9.8Z" fill="#fff" />
      <path d="M18.5 6.5c1 .9 1.6 2.1 1.8 3.4l-1.6.3a4.8 4.8 0 0 0-1.3-2.6 4.5 4.5 0 0 0-2.5-1.2l.3-1.6c1.2.2 2.3.7 3.3 1.7Z" fill="#fff" opacity=".9" />
      <path d="M5.1 13.5c.3-2.1 2.9-3.5 5.9-3.2 3 .4 5.2 2.3 4.9 4.4-.3 2.1-2.9 3.5-5.9 3.2-3-.4-5.2-2.3-4.9-4.4Zm3.8.3a1.1 1.1 0 1 0 2.2.3 1.1 1.1 0 0 0-2.2-.3Zm3.7 1.1c.5.1 1-.1 1-.5.1-.4-.3-.8-.8-.9-.5-.1-1 .1-1 .5-.1.4.3.8.8.9Z" fill="#fff" />
    </svg>
  );
}

function ZhihuIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#1772F6" />
      <path d="M5.7 7h6.4v2H9.9c-.1.8-.2 1.5-.4 2.2h2.7v2H8.8c-.5 1.6-1.3 3-2.5 4.3l-1.6-1.6a10 10 0 0 0 2-2.7H5.1v-2h2.2c.2-.7.3-1.4.4-2.2h-2V7Zm7.4.2h5.5v10.5h-2.1v-.8h-1.3v.8h-2.1V7.2Zm2.1 2v5.7h1.3V9.2h-1.3Z" fill="#fff" />
    </svg>
  );
}

function BilibiliIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#00A1D6" />
      <path d="m8.3 5.8 2 2.2h3.4l2-2.2 1.2 1.1-1 1.1h.5a2.4 2.4 0 0 1 2.4 2.4v5.1a2.4 2.4 0 0 1-2.4 2.4H7.6a2.4 2.4 0 0 1-2.4-2.4v-5.1A2.4 2.4 0 0 1 7.6 8h.5l-1-1.1 1.2-1.1Zm-.3 5.7v3.1h8v-3.1H8Zm1.6 1.1a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Zm4.8 0a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z" fill="#fff" />
    </svg>
  );
}

function InstagramIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <defs>
        <linearGradient id="ig-platform-gradient" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEDA75" />
          <stop offset=".35" stopColor="#FA7E1E" />
          <stop offset=".65" stopColor="#D62976" />
          <stop offset="1" stopColor="#515BD4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-platform-gradient)" />
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.5" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.7" stroke="#fff" strokeWidth="1.8" />
      <circle cx="15.8" cy="8.4" r="1" fill="#fff" />
    </svg>
  );
}

function LinkedinIcon({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="2" y="2" width="20" height="20" rx="4.5" fill="#0A66C2" />
      <path d="M7.1 10h2.5v7.3H7.1V10Zm1.3-3.5a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm3 3.5h2.4v1c.4-.7 1.1-1.2 2.3-1.2 2 0 3 1.3 3 3.5v4h-2.5v-3.6c0-1-.4-1.6-1.3-1.6-.9 0-1.4.6-1.4 1.6v3.6h-2.5V10Z" fill="#fff" />
    </svg>
  );
}

const icons = {
  xhs: XhsIcon,
  douyin: DouyinIcon,
  x: XIcon,
  weibo: WeiboIcon,
  zhihu: ZhihuIcon,
  bilibili: BilibiliIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon
};

export function PlatformIcon({ platform, className = "" }) {
  const Icon = icons[platform] || XhsIcon;
  return <Icon className={className} />;
}
