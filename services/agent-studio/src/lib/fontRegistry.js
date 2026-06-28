/** Shared typography tokens for 1080px-wide social exports. */
export const TYPE_SCALE_1080 = {
  display: "88px",
  title: "52px",
  subtitle: "40px",
  body: "32px",
  caption: "26px",
  minBodyPx: 32
};

export const CJK_FONT_STACK =
  '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", system-ui, sans-serif';

export const SERIF_DISPLAY_STACK =
  '"Noto Serif SC", "Songti SC", "STSong", "Source Han Serif SC", Georgia, serif';

export function fontRegistryCss() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;700;900&family=Noto+Serif+SC:wght@600;700;900&display=swap');
  :root {
    --type-display: ${TYPE_SCALE_1080.display};
    --type-title: ${TYPE_SCALE_1080.title};
    --type-body: ${TYPE_SCALE_1080.body};
    --type-caption: ${TYPE_SCALE_1080.caption};
    --font-sans: ${CJK_FONT_STACK};
    --font-serif: ${SERIF_DISPLAY_STACK};
  }
  `;
}