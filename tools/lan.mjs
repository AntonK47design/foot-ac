// npm run dev:lan — serves the game on the LAN and prints a QR code for phone testing.
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import qrcode from 'qrcode-terminal';

const port = Number(process.env.PORT ?? 5173);
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);
const vite = spawn('npx', ['vite', '--host', '--port', String(port), '--strictPort'], { stdio: 'inherit' });
setTimeout(() => {
  for (const ip of ips) {
    const url = `http://${ip}:${port}/`;
    console.log(`\n📱 Open on your phone (same Wi-Fi): ${url}\n`);
    qrcode.generate(url, { small: true });
  }
  if (!ips.length) console.log('No LAN interface found.');
}, 1200);
process.on('SIGINT', () => vite.kill('SIGINT'));
