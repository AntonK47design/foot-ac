/**
 * Store covers from one square key-art image: crops it to 1920×1080, 800×1200 and 800×800 and adds the title in
 * the game's display font. Rendered at 2× in Chromium, then downscaled with ffmpeg (lanczos).
 *   npx tsx tools/compose-cover.ts store/key-art-source.jpg            (classic: white title)
 *   npx tsx tools/compose-cover.ts store/key-art-source.jpg --bold     (store/bold/: tighter crop, chunky logo)
 *   npx tsx tools/compose-cover.ts store/key-art-v3.webp --wide        (store/v3/: 16:9 key art, bold logo)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';

const src = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'store/key-art-source.jpg';
const WIDE = process.argv.includes('--wide');
const BOLD = WIDE || process.argv.includes('--bold');
const OUT = WIDE ? 'store/v3' : BOLD ? 'store/bold' : 'store';
const mime = src.endsWith('.webp') ? 'image/webp' : src.endsWith('.png') ? 'image/png' : 'image/jpeg';
const img = `data:${mime};base64,${readFileSync(src).toString('base64')}`;
/** Source height / width (1 for the square key art). */
const [srcW, srcH] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).toString().trim().split(',').map(Number) as [number, number];
const aspect = srcH / srcW;
const fontFile = readdirSync('node_modules/@fontsource/fredoka/files').find((f) => f.includes('latin-600-normal') && f.endsWith('.woff2'));
const font = `data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/fredoka/files/${fontFile}`).toString('base64')}`;

interface Layout {
  name: string;
  w: number;
  h: number;
  /** Visible part of the square source (0..1): left, top, size along the source's width. */
  crop: { x: number; y: number; s: number };
  title: string;
  /** Push the art down by this share of the cover's height and continue the sky above it (room for the logo). */
  drop?: number;
}

const CLASSIC: Layout[] = [
  // landscape: a band through the middle; title in the sky on the right (CrazyGames puts labels over the top-left)
  { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, crop: { x: 0, y: 0.17, s: 1 }, title: 'right:3.5%;top:5%;font-size:44px' },
  // portrait: a strip through the middle; title in the sky band at the top
  { name: 'cover-portrait-800x1200', w: 800, h: 1200, crop: { x: 0.1665, y: 0, s: 0.667 }, title: 'left:0;right:0;top:3.5%;font-size:25px' },
  { name: 'cover-square-800x800', w: 800, h: 800, crop: { x: 0, y: 0, s: 1 }, title: 'left:0;right:0;top:1.2%;font-size:19px' },
];

/**
 * Thumbnail-first: on the store grid a cover is ~300 px wide, so the characters get more of the frame (tighter crop)
 * and the logo is a chunky sticker (yellow, thick outline, 3D drop, slight tilt) like the category's top covers.
 */
const BOLD_LAYOUTS: Layout[] = [
  { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, crop: { x: 0.12, y: 0.3, s: 0.8 }, title: 'right:2.5%;top:6%;font-size:46px' },
  { name: 'cover-portrait-800x1200', w: 800, h: 1200, crop: { x: 0.2, y: 0.12, s: 0.6 }, title: 'left:0;right:0;top:3%;font-size:27px' },
  { name: 'cover-square-800x800', w: 800, h: 800, crop: { x: 0.1, y: 0.16, s: 0.8 }, title: 'left:0;right:0;top:2%;font-size:21px' },
  // 9:16 portrait slot (some portals ask for at least 1080×1920): the full source height, a strip through the coach
  { name: 'cover-portrait-1080x1920', w: 1080, h: 1920, crop: { x: 0.215, y: 0, s: 0.5625 }, title: 'left:0;right:0;top:3%;font-size:36px' },
];
/**
 * 16:9 key art (coach left of centre, pointing at the viewer, academy behind): landscape shows all of it with the logo
 * in the sky on the right; the tall formats are strips through the coach with the logo over the grass at the bottom.
 */
const WIDE_LAYOUTS: Layout[] = [
  { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, crop: { x: 0, y: 0, s: 1 }, title: 'right:3%;top:7%;font-size:46px' },
  { name: 'cover-square-800x800', w: 800, h: 800, crop: { x: 0.07, y: 0, s: 0.5628 }, drop: 0.2, title: 'left:0;right:0;top:3%;font-size:19px' },
  { name: 'cover-portrait-800x1200', w: 800, h: 1200, crop: { x: 0.1, y: 0, s: 0.375 }, drop: 0.17, title: 'left:0;right:0;top:3%;font-size:25px' },
  { name: 'cover-portrait-1080x1920', w: 1080, h: 1920, crop: { x: 0.12, y: 0, s: 0.3166 }, drop: 0.15, title: 'left:0;right:0;top:3%;font-size:36px' },
];
const LAYOUTS = WIDE ? WIDE_LAYOUTS : BOLD ? BOLD_LAYOUTS : CLASSIC;

const CLASSIC_CSS = `.t b{font-weight:600;font-size:3em;line-height:.9;color:#fff;letter-spacing:.02em;-webkit-text-stroke:.09em #1d2433;paint-order:stroke fill;text-shadow:0 .07em 0 #1d2433,0 .14em .25em rgba(0,0,0,.3);text-align:center}
      .t i{font-style:normal;font-weight:600;font-size:1.25em;color:#1d2433;background:#ffd23f;border:.12em solid #1d2433;border-radius:999px;padding:.1em .75em;box-shadow:0 .14em 0 #1d2433;letter-spacing:.06em}`;
const BOLD_CSS = `.t{transform:rotate(-4deg)}
      .t b{font-weight:600;font-size:3.3em;line-height:.88;color:#ffd23f;letter-spacing:.01em;-webkit-text-stroke:.13em #13183a;paint-order:stroke fill;text-align:center;
        text-shadow:0 .04em 0 #13183a,0 .08em 0 #13183a,0 .12em 0 #13183a,0 .16em 0 #13183a,0 .22em .3em rgba(0,0,0,.45)}
      .t b span{color:#fff}
      .t i{font-style:normal;font-weight:600;font-size:1.3em;color:#fff;background:#e2443a;border:.13em solid #13183a;border-radius:.35em;padding:.08em .7em .12em;box-shadow:0 .16em 0 #13183a;letter-spacing:.06em;-webkit-text-stroke:.03em #13183a}`;

async function main(): Promise<void> {
  const browser = await chromium.launch();
  for (const L of LAYOUTS) {
    const page = await browser.newPage({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 2 });
    const bgW = L.w / L.crop.s;
    await page.setContent(`<!doctype html><html><head><style>
      @font-face{font-family:'WKDisplay';src:url(${font}) format('woff2');font-weight:600}
      html,body{margin:0;width:${L.w}px;height:${L.h}px;overflow:hidden;background:linear-gradient(#0f7ff0,#1c94fc ${(L.drop ?? 0) * 100}%)}
      .bg{position:absolute;left:${-L.crop.x * bgW}px;top:${(L.drop ?? 0) * L.h - L.crop.y * bgW}px;${L.drop ? '-webkit-mask-image:linear-gradient(transparent,#000 4%)' : ''};width:${bgW}px;height:${bgW * aspect}px;background:url(${img}) 0 0/100% 100%;${BOLD ? 'filter:saturate(1.25) contrast(1.08)' : ''}}
      ${BOLD ? '.v{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,transparent 55%,rgba(10,14,40,.45) 100%)}' : ''}
      .t{position:absolute;display:flex;flex-direction:column;align-items:center;gap:.45em;font-family:'WKDisplay';${L.title}}
      ${BOLD ? BOLD_CSS : CLASSIC_CSS}
    </style></head><body><div class="bg"></div>${BOLD ? '<div class="v"></div>' : ''}<div class="t"><b>${BOLD ? '<span>KICKOFF</span><br>ACADEMY' : 'KICKOFF<br>ACADEMY'}</b><i>FOOTBALL TYCOON</i></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const raw = `store/.${L.name}@2x.png`;
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: raw });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${L.w}:${L.h}:flags=lanczos`, `${OUT}/${L.name}.png`]);
    rmSync(raw);
    await page.close();
    console.log('✔', `${OUT}/${L.name}.png`);
  }
  await browser.close();
}

void main();
