/**
 * Store covers from one square key-art image: crops it to 1920×1080, 800×1200 and 800×800 and adds the title in
 * the game's display font. Rendered at 2× in Chromium, then downscaled with ffmpeg (lanczos).
 *   npx tsx tools/compose-cover.ts store/key-art-source.jpg
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';

const src = process.argv[2] ?? 'store/key-art-source.jpg';
const img = `data:image/jpeg;base64,${readFileSync(src).toString('base64')}`;
const fontFile = readdirSync('node_modules/@fontsource/fredoka/files').find((f) => f.includes('latin-600-normal') && f.endsWith('.woff2'));
const font = `data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/fredoka/files/${fontFile}`).toString('base64')}`;

interface Layout {
  name: string;
  w: number;
  h: number;
  /** Visible part of the square source (0..1): left, top, size along the source's width. */
  crop: { x: number; y: number; s: number };
  title: string;
}

const LAYOUTS: Layout[] = [
  // landscape: a band through the middle; title in the sky on the right (CrazyGames puts labels over the top-left)
  { name: 'cover-landscape-1920x1080', w: 1920, h: 1080, crop: { x: 0, y: 0.17, s: 1 }, title: 'right:3.5%;top:5%;font-size:44px' },
  // portrait: a strip through the middle; title in the sky band at the top
  { name: 'cover-portrait-800x1200', w: 800, h: 1200, crop: { x: 0.1665, y: 0, s: 0.667 }, title: 'left:0;right:0;top:3.5%;font-size:25px' },
  { name: 'cover-square-800x800', w: 800, h: 800, crop: { x: 0, y: 0, s: 1 }, title: 'left:0;right:0;top:1.2%;font-size:19px' },
];

async function main(): Promise<void> {
  const browser = await chromium.launch();
  for (const L of LAYOUTS) {
    const page = await browser.newPage({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 2 });
    const bgW = L.w / L.crop.s;
    await page.setContent(`<!doctype html><html><head><style>
      @font-face{font-family:'WKDisplay';src:url(${font}) format('woff2');font-weight:600}
      html,body{margin:0;width:${L.w}px;height:${L.h}px;overflow:hidden}
      .bg{position:absolute;left:${-L.crop.x * bgW}px;top:${-L.crop.y * bgW}px;width:${bgW}px;height:${bgW}px;background:url(${img}) 0 0/100% 100%}
      .t{position:absolute;display:flex;flex-direction:column;align-items:center;gap:.45em;font-family:'WKDisplay';${L.title}}
      .t b{font-weight:600;font-size:3em;line-height:.9;color:#fff;letter-spacing:.02em;-webkit-text-stroke:.09em #1d2433;paint-order:stroke fill;text-shadow:0 .07em 0 #1d2433,0 .14em .25em rgba(0,0,0,.3);text-align:center}
      .t i{font-style:normal;font-weight:600;font-size:1.25em;color:#1d2433;background:#ffd23f;border:.12em solid #1d2433;border-radius:999px;padding:.1em .75em;box-shadow:0 .14em 0 #1d2433;letter-spacing:.06em}
    </style></head><body><div class="bg"></div><div class="t"><b>KICKOFF<br>ACADEMY</b><i>FOOTBALL TYCOON</i></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const raw = `store/.${L.name}@2x.png`;
    await page.screenshot({ path: raw });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${L.w}:${L.h}:flags=lanczos`, `store/${L.name}.png`]);
    rmSync(raw);
    await page.close();
    console.log('✔', `store/${L.name}.png`);
  }
  await browser.close();
}

void main();
