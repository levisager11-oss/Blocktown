// The icons of the interface, drawn as small flat pictures (24 x 24) with a few simple shapes each.
// icon("coin") gives an element to put anywhere; the size comes from the CSS (1em by default).

const S = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
// Shared colours.
const W = "#ffffff", INK = "#27324a", GOLD = "#ffc83d", GOLD2 = "#f29a1f", RED = "#ff5a4f", RED2 = "#c9302c", GREEN = "#4cd47a", GREEN2 = "#22a35a",
  BLUE = "#4fa8ff", BLUE2 = "#2b6fd6", SKY = "#9fd8ff", GREY = "#c5ccd8", GREY2 = "#8792a6", BROWN = "#a86b3c", PURPLE = "#a875ff", ORANGE = "#ff9a3d", TEAL = "#2ec4b6";

const face = (mouth: string, color: string) => S(`<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="12" cy="10" r="8" fill="#fff" opacity=".18"/><circle cx="8.6" cy="10" r="1.5" fill="${INK}"/><circle cx="15.4" cy="10" r="1.5" fill="${INK}"/>${mouth}`);

const ICONS: Record<string, string> = {
  // ---- interface
  menu: S(`<rect x="3" y="5" width="18" height="3" rx="1.5" fill="${W}"/><rect x="3" y="10.5" width="18" height="3" rx="1.5" fill="${W}"/><rect x="3" y="16" width="18" height="3" rx="1.5" fill="${W}"/>`),
  close: S(`<path d="M6 6l12 12M18 6L6 18" stroke="${W}" stroke-width="3.4" stroke-linecap="round"/>`),
  check: S(`<path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="${W}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  undo: S(`<path d="M9 5L4 10l5 5" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10h9a5 5 0 010 10h-3" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round"/>`),
  back: S(`<path d="M15 4l-8 8 8 8" fill="none" stroke="${W}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  pause: S(`<rect x="5.5" y="4" width="4.5" height="16" rx="1.5" fill="${W}"/><rect x="14" y="4" width="4.5" height="16" rx="1.5" fill="${W}"/>`),
  play: S(`<path d="M7 4.5v15a1 1 0 001.5.9l12-7.5a1 1 0 000-1.8l-12-7.5A1 1 0 007 4.5z" fill="${W}"/>`),
  ff: S(`<path d="M2.5 5.5v13l9-6.5zM12 5.5v13l9-6.5z" fill="${W}" stroke="${W}" stroke-width="1.5" stroke-linejoin="round"/>`),
  fff: S(`<path d="M1 6.5v11l6.5-5.5zM8.5 6.5v11l6.5-5.5zM16 6.5v11l6.5-5.5z" fill="${W}" stroke="${W}" stroke-width="1.3" stroke-linejoin="round"/>`),
  plus: S(`<path d="M12 5v14M5 12h14" stroke="${W}" stroke-width="3.6" stroke-linecap="round"/>`),
  minus: S(`<path d="M5 12h14" stroke="${W}" stroke-width="3.6" stroke-linecap="round"/>`),
  gear: S(`<path d="M12 2.5l2 .3.6 2.4 1.9.8 2.1-1.3 1.4 1.4-1.3 2.1.8 1.9 2.4.6.3 2-.3 2-2.4.6-.8 1.9 1.3 2.1-1.4 1.4-2.1-1.3-1.9.8-.6 2.4-2 .3-2-.3-.6-2.4-1.9-.8-2.1 1.3-1.4-1.4 1.3-2.1-.8-1.9-2.4-.6L2.5 12l.3-2 2.4-.6.8-1.9-1.3-2.1 1.4-1.4 2.1 1.3 1.9-.8.6-2.4z" fill="${W}"/><circle cx="12" cy="12" r="3.6" fill="${INK}" opacity=".55"/>`),
  help: S(`<circle cx="12" cy="12" r="10" fill="${BLUE}"/><path d="M9 9.2a3 3 0 115 2.3c-1.2.8-2 1.3-2 2.8" fill="none" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="18" r="1.6" fill="${W}"/>`),
  info: S(`<circle cx="12" cy="12" r="10" fill="${BLUE}"/><circle cx="12" cy="7" r="1.7" fill="${W}"/><rect x="10.4" y="10" width="3.2" height="8.5" rx="1.6" fill="${W}"/>`),
  warn: S(`<path d="M12 2.5L1.8 20.5h20.4z" fill="${ORANGE}" stroke="${ORANGE}" stroke-width="2" stroke-linejoin="round"/><rect x="10.6" y="8" width="2.8" height="7" rx="1.4" fill="${W}"/><circle cx="12" cy="17.6" r="1.6" fill="${W}"/>`),
  bad: S(`<circle cx="12" cy="12" r="10" fill="${RED}"/><rect x="10.4" y="5.5" width="3.2" height="8.5" rx="1.6" fill="${W}"/><circle cx="12" cy="17.4" r="1.8" fill="${W}"/>`),
  good: S(`<circle cx="12" cy="12" r="10" fill="${GREEN}"/><path d="M7 12.5l3.4 3.4L17.2 9" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  star: S(`<path d="M12 2l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.1l-6 3.3 1.3-6.7-5-4.7 6.8-.8z" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 5l1.8 4 4.4.5" fill="none" stroke="#fff" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>`),
  lock: S(`<path d="M7.5 10V7.5a4.5 4.5 0 019 0V10" fill="none" stroke="${GREY2}" stroke-width="2.8"/><rect x="4.5" y="10" width="15" height="11" rx="3" fill="${GOLD}"/><rect x="4.5" y="10" width="15" height="4" rx="2" fill="#fff" opacity=".3"/><circle cx="12" cy="15.5" r="1.8" fill="${GOLD2}"/>`),
  trophy: S(`<path d="M7 3h10v6a5 5 0 01-10 0z" fill="${GOLD}"/><path d="M7 5H3.5a3.5 3.5 0 003.8 4M17 5h3.5a3.5 3.5 0 01-3.8 4" fill="none" stroke="${GOLD2}" stroke-width="2"/><rect x="10.5" y="13" width="3" height="4" fill="${GOLD2}"/><rect x="7" y="17" width="10" height="4" rx="1.2" fill="${BROWN}"/>`),
  pin: S(`<path d="M12 22s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z" fill="${RED}"/><circle cx="12" cy="10" r="2.8" fill="${W}"/>`),
  save: S(`<rect x="3" y="3" width="18" height="18" rx="3" fill="${BLUE}"/><rect x="7" y="3" width="10" height="6" rx="1" fill="${W}"/><rect x="6.5" y="13" width="11" height="8" rx="1" fill="${SKY}"/>`),
  full: S(`<path d="M3.5 9V3.5H9M15 3.5h5.5V9M20.5 15v5.5H15M9 20.5H3.5V15" fill="none" stroke="${W}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  turnL: S(`<path d="M5 12a7 7 0 107-7H8" fill="none" stroke="${W}" stroke-width="2.8" stroke-linecap="round"/><path d="M10 2L7 5l3 3" fill="none" stroke="${W}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  turnR: S(`<path d="M19 12a7 7 0 11-7-7h4" fill="none" stroke="${W}" stroke-width="2.8" stroke-linecap="round"/><path d="M14 2l3 3-3 3" fill="none" stroke="${W}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  tiltUp: S(`<path d="M6 15l6-6 6 6" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  tiltDown: S(`<path d="M6 9l6 6 6-6" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
  chart: S(`<rect x="3" y="13" width="4.5" height="8" rx="1" fill="${GREEN}"/><rect x="9.75" y="8" width="4.5" height="13" rx="1" fill="${BLUE}"/><rect x="16.5" y="3" width="4.5" height="18" rx="1" fill="${GOLD}"/>`),
  bag: S(`<path d="M8 6l-2-3h12l-2 3" fill="${GOLD2}"/><path d="M8 6h8c3 3 6 7 6 10.5 0 3-2.2 4.5-5 4.5H7c-2.8 0-5-1.5-5-4.5C2 13 5 9 8 6z" fill="${GOLD}"/><text x="12" y="18" font-size="9" font-weight="800" text-anchor="middle" fill="${GOLD2}" font-family="sans-serif">$</text>`),
  hammer: S(`<path d="M13.5 9.5l-9 9a1.8 1.8 0 002.5 2.5l9-9z" fill="${BROWN}"/><path d="M9 4.5l4-2.5 7 7-3 3.2-2.5-1.2-2.5-2.5z" fill="${GREY}"/><path d="M9 4.5l4-2.5 2 2-4 2.6z" fill="#fff" opacity=".5"/>`),
  eye: S(`<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="${W}"/><circle cx="12" cy="12" r="4.2" fill="${BLUE2}"/><circle cx="12" cy="12" r="2" fill="${INK}"/>`),
  layers: S(`<path d="M12 3l10 5-10 5L2 8z" fill="${PURPLE}"/><path d="M2 12l10 5 10-5" fill="none" stroke="${W}" stroke-width="2.4" stroke-linejoin="round"/><path d="M2 16l10 5 10-5" fill="none" stroke="${W}" stroke-width="2.4" stroke-linejoin="round"/>`),
  dozer: S(`<rect x="7" y="6" width="9" height="7" rx="1.2" fill="${GOLD}"/><rect x="9" y="7.5" width="5" height="3.5" rx=".6" fill="${SKY}"/><rect x="5" y="12" width="13" height="5" rx="1.5" fill="${GOLD2}"/><rect x="5" y="16" width="13" height="4.5" rx="2.2" fill="${INK}"/><circle cx="8" cy="18.2" r="1.2" fill="${GREY}"/><circle cx="15" cy="18.2" r="1.2" fill="${GREY}"/><path d="M18 10l4-1v11l-4-1.5z" fill="${GREY2}"/>`),

  // ---- the top bar
  people: S(`<circle cx="16.5" cy="8" r="3.3" fill="${BLUE2}"/><path d="M10.5 20a6 6 0 0112 0z" fill="${BLUE2}"/><circle cx="9" cy="7.5" r="3.8" fill="${BLUE}"/><path d="M1.5 21a7.5 7.5 0 0115 0z" fill="${BLUE}"/>`),
  coin: S(`<circle cx="12" cy="12.8" r="9.6" fill="${GOLD2}"/><circle cx="12" cy="11.2" r="9.6" fill="${GOLD}"/><circle cx="12" cy="11.2" r="6.6" fill="none" stroke="${GOLD2}" stroke-width="1.5"/><path d="M7.5 7.5a6 6 0 016-1.8" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/><rect x="10.6" y="7.6" width="2.8" height="7.2" rx="1.2" fill="${GOLD2}"/>`),
  happy: face(`<path d="M7 13.5a5 5 0 0010 0z" fill="${INK}"/>`, GREEN),
  fine: face(`<path d="M7.8 14.5a4.6 4.6 0 008.4 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`, "#9bdc4a"),
  meh: face(`<path d="M8 15h8" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`, GOLD),
  sad: face(`<path d="M7.8 16.5a4.6 4.6 0 018.4 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`, ORANGE),
  angry: face(`<path d="M7.8 16.5a4.6 4.6 0 018.4 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/><path d="M6.5 7l3.5 1.5M17.5 7L14 8.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`, RED),
  car: S(`<path d="M5 11l1.8-4.6A2 2 0 018.7 5h6.6a2 2 0 011.9 1.4L19 11z" fill="${RED2}"/><rect x="2.5" y="10.5" width="19" height="7" rx="2.5" fill="${RED}"/><path d="M7.2 10.5l1.3-3.6h7l1.3 3.6z" fill="${SKY}"/><circle cx="7" cy="17.5" r="2.4" fill="${INK}"/><circle cx="17" cy="17.5" r="2.4" fill="${INK}"/><rect x="3.6" y="12.4" width="2.6" height="1.8" rx=".8" fill="${GOLD}"/><rect x="17.8" y="12.4" width="2.6" height="1.8" rx=".8" fill="${GOLD}"/>`),
  clock: S(`<circle cx="12" cy="12" r="10" fill="${W}"/><circle cx="12" cy="12" r="10" fill="none" stroke="${GREY}" stroke-width="2"/><path d="M12 6.5V12l3.5 2.5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`),
  sun: S(`<g stroke="${GOLD2}" stroke-width="2.2" stroke-linecap="round"><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></g><circle cx="12" cy="12" r="5.5" fill="${GOLD}"/>`),
  moon: S(`<path d="M15 3a9 9 0 106.5 14A7.5 7.5 0 0115 3z" fill="#ffe7a3"/>`),
  cloud: S(`<path d="M6.5 19a4.5 4.5 0 01-.6-9 6 6 0 0111.5-1.5A5 5 0 0117.5 19z" fill="${W}"/><path d="M6.5 19h11" stroke="${GREY}" stroke-width="1.5"/>`),
  rain: S(`<path d="M6.5 14a4.5 4.5 0 01-.6-9 6 6 0 0111.5-1.5A5 5 0 0117.5 14z" fill="${GREY}"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" stroke="${BLUE}" stroke-width="2.2" stroke-linecap="round"/>`),
  storm: S(`<path d="M6.5 13a4.5 4.5 0 01-.6-9 6 6 0 0111.5-1.5A5 5 0 0117.5 13z" fill="${GREY2}"/><path d="M12.5 12l-3 5h3.5l-2 5 5.5-7h-3.5l1.5-3z" fill="${GOLD}"/>`),
  fog: S(`<path d="M3 8h14M6 12h15M3 16h14M7 20h11" stroke="${GREY}" stroke-width="2.4" stroke-linecap="round"/>`),
  snow: S(`<g stroke="${SKY}" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5" fill="none"/></g>`),
  spring: S(`<path d="M12 21V11" stroke="${GREEN2}" stroke-width="2.2" stroke-linecap="round"/><path d="M12 13c-5 0-7-3-7-7 4 0 7 2 7 7zM12 11c0-5 3-7 7-7 0 4-2 7-7 7z" fill="${GREEN}"/>`),
  summer: S(`<circle cx="12" cy="12" r="5" fill="${GOLD}"/><g stroke="${GOLD2}" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></g>`),
  autumn: S(`<path d="M12 2l2 4 4-1-1 4 4 2-4 2 1 4-4-1-2 4-2-4-4 1 1-4-4-2 4-2-1-4 4 1z" fill="${ORANGE}"/><path d="M12 8v14" stroke="${BROWN}" stroke-width="1.8"/>`),
  winter: S(`<g stroke="${SKY}" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/></g><circle cx="12" cy="12" r="2.4" fill="${W}"/>`),

  // ---- the build menu
  roads: S(`<path d="M8 22L10.5 2h3L16 22z" fill="${INK}"/><path d="M2 22L9 2h1.6L5 22zM22 22L15 2h-1.6L19 22z" fill="${GREY2}"/><path d="M12 4v3M12 10v3.5M12 17v4" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round"/>`),
  zones: S(`<path d="M2.5 11L12 3l9.5 8" fill="${RED}" stroke="${RED2}" stroke-width="1.6" stroke-linejoin="round"/><path d="M4.5 10.5V21h15V10.5L12 4.5z" fill="#fff3d6"/><rect x="9.5" y="14" width="5" height="7" rx="1" fill="${BROWN}"/><rect x="5.8" y="12" width="3" height="3" rx=".5" fill="${SKY}"/><rect x="15.2" y="12" width="3" height="3" rx=".5" fill="${SKY}"/>`),
  power: S(`<path d="M13.5 1.5L4 13.5h6.5L9 22.5l10.5-13H13z" fill="${GOLD}" stroke="${GOLD2}" stroke-width="1.4" stroke-linejoin="round"/>`),
  water: S(`<path d="M12 2.5S5 10.5 5 15a7 7 0 0014 0c0-4.5-7-12.5-7-12.5z" fill="${BLUE}"/><path d="M9 15a3 3 0 003 3" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".8"/>`),
  services: S(`<rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="${W}"/><path d="M9.5 6h5v3.5H18v5h-3.5V18h-5v-3.5H6v-5h3.5z" fill="${RED}"/>`),
  edu: S(`<path d="M12 4L1.5 9 12 14l10.5-5z" fill="${INK}"/><path d="M6 11.5v4.5c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5L12 14.5z" fill="#46557a"/><path d="M21 9.5v6" stroke="${GOLD}" stroke-width="1.6"/><circle cx="21" cy="16.5" r="1.4" fill="${GOLD}"/>`),
  parks: S(`<rect x="10.6" y="14" width="2.8" height="8" rx="1" fill="${BROWN}"/><circle cx="12" cy="9.5" r="7.5" fill="${GREEN}"/><circle cx="9.5" cy="7" r="3" fill="#fff" opacity=".2"/>`),
  transit: S(`<rect x="4" y="2.5" width="16" height="17" rx="3.5" fill="${GREEN2}"/><rect x="6" y="5" width="12" height="6.5" rx="1.2" fill="${SKY}"/><circle cx="8" cy="15.5" r="1.4" fill="${GOLD}"/><circle cx="16" cy="15.5" r="1.4" fill="${GOLD}"/><rect x="5.5" y="19" width="3.5" height="3" rx="1" fill="${INK}"/><rect x="15" y="19" width="3.5" height="3" rx="1" fill="${INK}"/>`),
  landmarks: S(`<path d="M12 1.5l1.6 3.6 3.9.4-2.9 2.6.8 3.9L12 10l-3.4 2 .8-3.9-2.9-2.6 3.9-.4z" fill="${GOLD}"/><path d="M5 22v-6.5l7-3 7 3V22z" fill="#f2ead8"/><path d="M4 15.5l8-3.5 8 3.5" fill="none" stroke="${TEAL}" stroke-width="2" stroke-linejoin="round"/><rect x="7" y="17" width="2" height="5" fill="${GREY}"/><rect x="11" y="17" width="2" height="5" fill="${GREY}"/><rect x="15" y="17" width="2" height="5" fill="${GREY}"/>`),
  garbage: S(`<rect x="5" y="7" width="14" height="15" rx="2" fill="${GREY2}"/><rect x="3.5" y="4.5" width="17" height="3.5" rx="1.5" fill="${GREY}"/><rect x="9.5" y="2" width="5" height="3" rx="1" fill="${GREY}"/><path d="M9 11v7M12 11v7M15 11v7" stroke="${GREY}" stroke-width="1.6" stroke-linecap="round"/>`),
  police: S(`<path d="M12 2l8.5 3v6.5c0 5-3.6 9-8.5 10.5C7.1 20.5 3.5 16.5 3.5 11.5V5z" fill="${BLUE2}"/><path d="M12 6.5l1.5 3.1 3.4.4-2.5 2.3.7 3.4L12 14l-3.1 1.7.7-3.4-2.5-2.3 3.4-.4z" fill="${GOLD}"/>`),
  fire: S(`<path d="M12 22c-4.4 0-7.5-3-7.5-7 0-4.5 4-6.5 4-11 3 1.5 4.5 4 4.5 6 1-1 1.5-2 1.5-3.5C17 9 19.5 12 19.5 15c0 4-3.1 7-7.5 7z" fill="${ORANGE}"/><path d="M12 22c-2.2 0-3.7-1.5-3.7-3.5 0-2.5 2.2-3.5 2.7-6 2 1.5 4.7 3.5 4.7 6 0 2-1.5 3.5-3.7 3.5z" fill="${GOLD}"/>`),
  health: S(`<rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="${W}"/><path d="M9.5 6h5v3.5H18v5h-3.5V18h-5v-3.5H6v-5h3.5z" fill="${RED}"/>`),
  bus: S(`<rect x="4" y="2.5" width="16" height="17" rx="3.5" fill="${GREEN2}"/><rect x="6" y="5" width="12" height="6.5" rx="1.2" fill="${SKY}"/><circle cx="8" cy="15.5" r="1.4" fill="${GOLD}"/><circle cx="16" cy="15.5" r="1.4" fill="${GOLD}"/><rect x="5.5" y="19" width="3.5" height="3" rx="1" fill="${INK}"/><rect x="15" y="19" width="3.5" height="3" rx="1" fill="${INK}"/>`),
  tram: S(`<path d="M8 4.5L12 2l4 2.5" fill="none" stroke="${INK}" stroke-width="1.6"/><rect x="4.5" y="5" width="15" height="14" rx="3" fill="${GOLD}"/><rect x="6.5" y="7.5" width="11" height="5.5" rx="1" fill="${SKY}"/><path d="M4 22h16" stroke="${GREY2}" stroke-width="2"/><path d="M7 19l-1.5 3M17 19l1.5 3" stroke="${INK}" stroke-width="1.8"/>`),
  metro: S(`<circle cx="12" cy="12" r="10" fill="${BLUE2}"/><path d="M6.5 17V7.5l5.5 6 5.5-6V17" fill="none" stroke="${W}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`),
  stop: S(`<rect x="11" y="9" width="2.4" height="13" fill="${GREY2}"/><circle cx="12.2" cy="7" r="5.5" fill="${GREEN2}"/><text x="12.2" y="9.8" font-size="8" font-weight="800" text-anchor="middle" fill="#fff" font-family="sans-serif">H</text>`),
  list: S(`<rect x="3" y="3" width="18" height="18" rx="4" fill="${W}"/><path d="M7 8h10M7 12h10M7 16h6" stroke="${GREY2}" stroke-width="2" stroke-linecap="round"/>`),

  // ---- road tools
  straight: S(`<circle cx="5" cy="19" r="2.6" fill="${W}"/><circle cx="19" cy="5" r="2.6" fill="${W}"/><path d="M5 19L19 5" stroke="${W}" stroke-width="2.8"/>`),
  curve: S(`<circle cx="4" cy="20" r="2.6" fill="${W}"/><circle cx="20" cy="4" r="2.6" fill="${W}"/><path d="M4 20C4 9 10 4 20 4" fill="none" stroke="${W}" stroke-width="2.8"/>`),
  tunnel: S(`<path d="M1 21C3 9 8 5 12 5s9 4 11 16z" fill="#7cc05a"/><path d="M7.5 21v-4a4.5 4.5 0 019 0v4z" fill="${INK}"/><path d="M9 21l1-3h4l1 3" fill="${GREY2}"/>`),
  upgrade: S(`<path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5" fill="none" stroke="${W}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  reverse: S(`<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" fill="none" stroke="${W}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  roundabout: S(`<circle cx="12" cy="12" r="7" fill="none" stroke="${W}" stroke-width="2.8"/><circle cx="12" cy="12" r="3" fill="${GREEN}"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="${W}" stroke-width="2.8"/>`),
  brush: S(`<path d="M14 3l7 7-8.5 8.5-7-7z" fill="${PURPLE}"/><path d="M5.5 11.5l7 7L9 22c-2 1-5.5 0-6.5-1S1 17 2 15z" fill="${GOLD}"/>`),
  street: S(`<rect x="2" y="9" width="20" height="6" rx="1" fill="${INK}"/><path d="M4 12h3M10.5 12h3M17 12h3" stroke="${W}" stroke-width="1.5"/><rect x="3" y="3" width="5" height="5" rx="1" fill="${GREEN}"/><rect x="9.5" y="3" width="5" height="5" rx="1" fill="${GREEN}"/><rect x="16" y="3" width="5" height="5" rx="1" fill="${GREEN}"/><rect x="3" y="16" width="5" height="5" rx="1" fill="${GREEN}"/><rect x="9.5" y="16" width="5" height="5" rx="1" fill="${GREEN}"/><rect x="16" y="16" width="5" height="5" rx="1" fill="${GREEN}"/>`),
  eraser: S(`<path d="M14.5 3.5l6 6L11 19H5l-2.5-2.5z" fill="#ff8fb0"/><path d="M8.5 9.5l6 6" stroke="#fff" stroke-width="1.6"/><path d="M11 19h10" stroke="${W}" stroke-width="2" stroke-linecap="round"/>`),

  // ---- problems over buildings
  noRoad: S(`<path d="M9.5 3h5l4 18h-13z" fill="${ORANGE}"/><path d="M8.6 8h6.8M7.5 13h9" stroke="${W}" stroke-width="2.4"/><rect x="3" y="19.5" width="18" height="2.5" rx="1" fill="${INK}"/>`),
  noPower: S(`<path d="M13.5 1.5L4 13.5h6.5L9 22.5l10.5-13H13z" fill="${GOLD}"/><path d="M3 3l18 18" stroke="${RED}" stroke-width="3" stroke-linecap="round"/>`),
  noWater: S(`<path d="M12 2.5S5 10.5 5 15a7 7 0 0014 0c0-4.5-7-12.5-7-12.5z" fill="${BLUE}"/><path d="M3 3l18 18" stroke="${RED}" stroke-width="3" stroke-linecap="round"/>`),
  sewage: S(`<rect x="2" y="6" width="9" height="5" rx="1" fill="${GREY2}"/><rect x="9" y="6" width="5" height="13" rx="1" fill="${GREY2}"/><path d="M16 14c2 0 4 1.5 4 4s-2 3-4 3-3-1-3-3" fill="#8a6a3a"/>`),
  abandoned: S(`<path d="M3 11L12 3l9 8" fill="${GREY2}"/><path d="M5 10.5V21h14V10.5L12 4.5z" fill="${GREY}"/><path d="M9 9l2 4-2 3 2 5M14.5 11l-1.5 3 2 2" stroke="${INK}" stroke-width="1.4" fill="none"/>`),
  burnt: S(`<path d="M5 21V12l3-2 2 3 3-5 3 4 3-1v10z" fill="${INK}"/><path d="M7 8c0-2 2-3 2-5M15 7c0-2 2-3 2-5" stroke="${GREY2}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`),
  flood: S(`<path d="M2 9c3-3 5 3 8 0s5 3 8 0 4 0 4 0M2 15c3-3 5 3 8 0s5 3 8 0 4 0 4 0M2 21c3-3 5 3 8 0s5 3 8 0 4 0 4 0" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/>`),
  unhappy: face(`<path d="M7.8 16.5a4.6 4.6 0 018.4 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/><path d="M6.5 7l3.5 1.5M17.5 7L14 8.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`, RED),

  // ---- views
  city: S(`<rect x="2" y="10" width="6" height="12" rx="1" fill="${BLUE}"/><rect x="9" y="3" width="7" height="19" rx="1" fill="${TEAL}"/><rect x="17" y="8" width="5" height="14" rx="1" fill="${GOLD}"/><path d="M11 6h3M11 9h3M11 12h3M11 15h3" stroke="#fff" stroke-width="1.4"/>`),
  traffic: S(`<rect x="7" y="1.5" width="10" height="21" rx="3.5" fill="${INK}"/><circle cx="12" cy="6.2" r="2.4" fill="${RED}"/><circle cx="12" cy="12" r="2.4" fill="${GOLD}"/><circle cx="12" cy="17.8" r="2.4" fill="${GREEN}"/>`),
  value: S(`<path d="M6 3h12l4 6-10 12L2 9z" fill="${TEAL}"/><path d="M2 9h20M6 3l3 6 3-6 3 6 3-6M9 9l3 12 3-12" fill="none" stroke="#fff" stroke-width="1.2" opacity=".7"/>`),
  pollution: S(`<path d="M5.5 19a4.5 4.5 0 01-.4-9A6 6 0 0116.5 9 4.5 4.5 0 0118 19z" fill="${GREY2}"/><circle cx="8" cy="7" r="3" fill="${GREY}"/><circle cx="13" cy="5" r="2.5" fill="${GREY}"/>`),
  noise: S(`<path d="M3 9h4l5-4.5v15L7 15H3z" fill="${INK}"/><path d="M15 8.5a5 5 0 010 7M17.5 6a8.5 8.5 0 010 12" fill="none" stroke="${ORANGE}" stroke-width="2.2" stroke-linecap="round"/>`),
  school: S(`<path d="M12 4L1.5 9 12 14l10.5-5z" fill="${INK}"/><path d="M6 11.5v4.5c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5L12 14.5z" fill="#46557a"/><path d="M21 9.5v6" stroke="${GOLD}" stroke-width="1.6"/>`),
  charm: S(`<rect x="10.6" y="14" width="2.8" height="8" rx="1" fill="${BROWN}"/><circle cx="12" cy="9.5" r="7.5" fill="${GREEN}"/>`),
  soil: S(`<path d="M12 22V8" stroke="${BROWN}" stroke-width="2"/><g fill="${GOLD}"><ellipse cx="9" cy="8" rx="2" ry="3.5" transform="rotate(-25 9 8)"/><ellipse cx="15" cy="8" rx="2" ry="3.5" transform="rotate(25 15 8)"/><ellipse cx="9" cy="13.5" rx="2" ry="3.5" transform="rotate(-25 9 13.5)"/><ellipse cx="15" cy="13.5" rx="2" ry="3.5" transform="rotate(25 15 13.5)"/><ellipse cx="12" cy="4" rx="1.8" ry="3"/></g>`),
  forest: S(`<path d="M12 2l6 8h-3l5 7H4l5-7H6z" fill="${GREEN2}"/><rect x="10.6" y="17" width="2.8" height="5" fill="${BROWN}"/>`),
  ore: S(`<path d="M3 21l6-12 4 5 3-3 5 10z" fill="${GREY2}"/><path d="M14 3l7 4M17.5 5L9 14" stroke="${BROWN}" stroke-width="2.4" stroke-linecap="round"/><path d="M12 2.5l5 1.5 1 3" fill="none" stroke="${GREY}" stroke-width="2.4" stroke-linecap="round"/>`),
  oil: S(`<path d="M12 2.5S5 10.5 5 15a7 7 0 0014 0c0-4.5-7-12.5-7-12.5z" fill="${INK}"/><path d="M9 15a3 3 0 003 3" stroke="${PURPLE}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`),
  tourists: S(`<rect x="3" y="7" width="18" height="13" rx="3" fill="${BLUE}"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" fill="none" stroke="${BLUE2}" stroke-width="2"/><circle cx="12" cy="13.5" r="3.4" fill="${W}"/><circle cx="12" cy="13.5" r="1.8" fill="${INK}"/>`),
};

/** An icon as an element. Unknown names give an empty square, so a typo shows. */
export function icon(name: string, cls = ""): HTMLElement {
  const el = document.createElement("i");
  el.className = "ic" + (cls ? " " + cls : "");
  el.innerHTML = ICONS[name] ?? S(`<rect x="3" y="3" width="18" height="18" rx="4" fill="#ff00ff"/>`);
  return el;
}
export const hasIcon = (name: string) => name in ICONS;
/** The markup of an icon, for places that build HTML as text. */
export const iconSvg = (name: string) => ICONS[name] ?? "";
