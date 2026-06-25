// App Store screenshots via Chrome DevTools Protocol (exact viewport, no clipping).
// Preview must be running:  python3 -m http.server 4173 -d web
//   node scripts/dev/shots.cjs
// Uses Emulation.setDeviceMetricsOverride so innerWidth == the real device width
// (plain --window-size clamps to a ~500px minimum and crops, clipping the board).
const CDP = require('chrome-remote-interface');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9456;
const BASE = process.env.SHOT_BASE || 'http://localhost:4173';
const SHOTS = [
  ['01-play', 'shot=play&b=rapids'],
  ['02-perfect', 'shot=win&b=rapids&s=3'],
  ['03-levels', 'shot=levels'],
  ['04-challenge', 'shot=play&b=double'],
  ['05-howto', 'shot=howto'],
];
const SIZES = [          // slot, cssW, cssH, deviceScaleFactor  -> output = cssW*dsr x cssH*dsr
  ['iphone-6.7', 430, 932, 3],   // 1290 x 2796
  ['iphone-6.5', 414, 896, 3],   // 1242 x 2688
  ['ipad-13', 1024, 1366, 2],    // 2048 x 2732
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/moraine-cdp-profile',
    '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  let client;
  for (let i = 0; i < 30 && !client; i++) {
    try { client = await CDP({ port: PORT }); } catch (e) { await sleep(400); }
  }
  if (!client) { chrome.kill(); throw new Error('could not connect to Chrome on ' + PORT); }
  const { Page, Emulation } = client;
  await Page.enable();
  for (const [slot, w, h, dsr] of SIZES) {
    const out = path.join('screenshots/appstore', slot);
    fs.mkdirSync(out, { recursive: true });
    await Emulation.setDeviceMetricsOverride({ width: w, height: h, deviceScaleFactor: dsr, mobile: true });
    for (const [name, q] of SHOTS) {
      await Page.navigate({ url: `${BASE}/?${q}` });
      await sleep(1600);   // settle board-enter + confetti + the harness resize
      const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(data, 'base64'));
      console.log('  ' + slot + '/' + name + '.png');
    }
  }
  await client.close();
  chrome.kill();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
