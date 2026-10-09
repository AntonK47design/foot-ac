/* Headless economy bot (npm run sim). Fails if the §5.1 beat sheet / M1 pacing targets are missed. */
import { runBot, fmt, type BotReport } from '../src/sim/bot/bot';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function checksFor(r: BotReport, strict: boolean): Check[] {
  const m = r.marks;
  const le = (k: string, lim: number, label: string): Check => {
    const v = m[k];
    return { name: label, ok: v !== undefined && v <= lim, detail: v === undefined ? 'never' : `${v.toFixed(1)}s (≤ ${lim}s)` };
  };
  const out: Check[] = [];
  if (strict) {
    out.push(le('firstCash', 5, 'first cash ≤ 5s'));
    out.push(le('firstUnlock', 12, 'first unlock ≤ 12s'));
    out.push(le('unlock:p_goal', 20, 'goal unlocked ≤ 20s'));
    out.push(le('firstSign', 25, 'first trainee signed ≤ 25s'));
    out.push(le('firstDelivery', 35, 'balls delivered ≤ 35s'));
    out.push(le('firstRep', 45, 'first rep ≤ 45s'));
    out.push(le('thirdUnlock', 60, '3 unlocks ≤ 60s'));
    out.push(le('secondTrainee', 60, 'second trainee ≤ 60s'));
    out.push({ name: '≥ 2 pads visible at 60s', ok: (m.visiblePadsAt60 ?? 0) >= 2, detail: String(m.visiblePadsAt60) });
    const a = m.firstAutomation;
    out.push({ name: 'first automation ~3:00 (2:15–4:00)', ok: a !== undefined && a >= 135 && a <= 240, detail: a === undefined ? 'never' : fmt(a) });
  } else {
    out.push(le('thirdUnlock', 90, '3 unlocks ≤ 90s (distracted)'));
    const a = m.firstAutomation;
    out.push({ name: 'first automation ≤ 5:00 (distracted)', ok: a !== undefined && a <= 300, detail: a === undefined ? 'never' : fmt(a) });
  }
  const early = r.unlockTimes.filter((t) => t <= 180);
  let earlyGap = 0;
  for (let i = 1; i < early.length; i++) earlyGap = Math.max(earlyGap, (early[i] as number) - (early[i - 1] as number));
  const avg = early.length > 1 ? ((early[early.length - 1] as number) - (early[0] as number)) / (early.length - 1) : Infinity;
  const avgLim = strict ? 20 : 28;
  const maxLim = strict ? 35 : 45;
  out.push({ name: `avg purchase gap ≤ ${avgLim}s in first 3 min`, ok: avg <= avgLim, detail: `${avg.toFixed(1)}s` });
  out.push({ name: `max purchase gap ≤ ${maxLim}s in first 3 min`, ok: earlyGap <= maxLim, detail: `${earlyGap.toFixed(1)}s` });
  // §5.2 through minute 20: never long without a purchase (pad or upgrade) or a match
  const mg = r.midGameGap;
  const mgLim = strict ? 60 : 90;
  out.push({ name: `3:00–20:00 never > ${mgLim}s without a purchase or match`, ok: mg.gap <= mgLim, detail: `${mg.gap.toFixed(1)}s (${fmt(mg.from)}→${fmt(mg.to)})` });
  // §5.2 pacing: purchases slow down towards 30–45 s gaps by minute 10
  const n610 = [...r.unlockTimes, ...r.upgradeTimes].filter((t) => t >= 360 && t < 600).length;
  const avg610 = 240 / Math.max(1, n610);
  out.push({ name: 'avg purchase gap 6–10 min ≥ 18s', ok: avg610 >= 18, detail: `${avg610.toFixed(1)}s` });
  out.push({ name: '≥ 15 unlocks by 10:00 (pads + upgrades)', ok: [...r.unlockTimes, ...r.upgradeTimes].filter((t) => t <= 600).length >= 15, detail: String([...r.unlockTimes, ...r.upgradeTimes].filter((t) => t <= 600).length) });
  // M6: the Training Ground opens around minute 12 and carries the session to ~minute 35
  const gate = r.marks['unlock:p2_gate'];
  const [g0, g1] = strict ? [420, 960] : [420, 1080];
  out.push({ name: `Training Ground opens ${fmt(g0)}–${fmt(g1)}`, ok: gate !== undefined && gate >= g0 && gate <= g1, detail: gate === undefined ? 'never' : fmt(gate) });
  if (r.sim.state.time >= 2400) {
    const done = r.contentDoneAt;
    out.push({ name: 'Training Ground complete 30:00–40:00', ok: done !== null && done >= 1800 && done <= 2400, detail: done === null ? 'not yet' : fmt(done) });
    const lg = r.lateGameGap;
    const lgLim = strict ? 90 : 120;
    out.push({ name: `20:00–40:00 never > ${lgLim}s without a purchase or match`, ok: lg.gap <= lgLim, detail: `${lg.gap.toFixed(1)}s (${fmt(lg.from)}→${fmt(lg.to)})` });
  }
  const lim = strict ? 60 : 85;
  out.push({ name: `never > ${lim}s unaffordable (content horizon)`, ok: r.longestUnaffordable.gap <= lim, detail: `${r.longestUnaffordable.gap.toFixed(1)}s from ${fmt(r.longestUnaffordable.from)}` });
  return out;
}

function report(label: string, r: BotReport, strict: boolean, quiet: boolean): boolean {
  console.log(`\n━━ ${label} ━━`);
  if (!quiet) for (const e of r.timeline) console.log(`  ${fmt(e.t).padStart(6)}  ${e.what}`);
  console.log(`  stars ${r.stars}/${r.totalStars} · level ${r.level} · cash $${Math.floor(r.finalCash)} · pads done ${r.contentDoneAt ? fmt(r.contentDoneAt) : '—'} · upgrades ${r.upgradeTimes.length} (last ${r.upgradeTimes.length ? fmt(r.upgradeTimes[r.upgradeTimes.length - 1] as number) : '—'}) · matches ${r.matchTimes.length}`);
  console.log(`  longest purchase gap ${r.longestPurchaseGap.gap.toFixed(1)}s (${fmt(r.longestPurchaseGap.from)}→${fmt(r.longestPurchaseGap.to)})`);
  let ok = true;
  for (const c of checksFor(r, strict)) {
    console.log(`  ${c.ok ? '✔' : '✘'} ${c.name}: ${c.detail}`);
    if (!c.ok) ok = false;
  }
  return ok;
}

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const minutes = Number(args.find((a) => a.startsWith('--minutes='))?.split('=')[1] ?? 40);
const seeds = [12345, 777, 4242];
let allOk = true;
for (const seed of seeds) {
  const r = runBot({ efficiency: 1, seed, minutes });
  allOk = report(`focused bot · seed ${seed}`, r, true, quiet || seed !== seeds[0]) && allOk;
}
for (const seed of seeds) {
  const r = runBot({ efficiency: 0.7, seed, minutes });
  allOk = report(`distracted bot (70%) · seed ${seed}`, r, false, quiet || seed !== seeds[0]) && allOk;
}
console.log(allOk ? '\nSIM OK' : '\nSIM FAILED');
process.exit(allOk ? 0 : 1);
