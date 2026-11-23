// Real Chrome renders for review: desktop 1280px + phone 390px, README / script /
// deck tabs. Reports horizontal overflow and any JS console errors.
// Run: node scripts/shots.mjs — writes screenshots/*.png
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CHROME = process.env.CHROME_BIN
  || ['/opt/meta-chromium/chrome', '/usr/bin/chromium-browser', 'google-chrome']
    .find((c) => c.startsWith('/') ? fs.existsSync(c) : true);
const DEBUG_PORT = 9229; // fresh port per run family; old runs may hold 9226-9228

const policy = 'hatch-webgl-allowed-domains-v1\nexample.com\n';
const policyFile = path.join(os.tmpdir(), 'hackathon-teammate-webgl-policy.txt');
fs.writeFileSync(policyFile, policy);
const sha = createHash('sha256').update(policy).digest('hex');

const SHOTS = [
  { name: 'desktop-readme.png', width: 1280, url: 'index.html' },
  { name: 'desktop-script.png', width: 1280, url: 'index.html#script' },
  { name: 'desktop-deck.png', width: 1280, url: 'index.html#deck' },
  { name: 'mobile-readme.png', width: 390, url: 'index.html' },
  { name: 'mobile-deck.png', width: 390, url: 'index.html#deck' },
];

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'htm-shots-'))}`,
  `--hatch-webgl-allowed-domains-file=${policyFile}`,
  `--hatch-webgl-allowed-domains-sha256=${sha}`,
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--window-size=1280,900',
  `file://${ROOT}/${SHOTS[0].url}`,
]);

let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const targets = await res.json();
    const page = targets.find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (err) { /* not up yet */ }
  await delay(250);
}
if (!wsUrl) { chrome.kill('SIGTERM'); throw new Error('Chrome DevTools did not come up'); }

const socket = new WebSocket(wsUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
const consoleErrors = [];
socket.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 400));
  }
};
const call = (method, params = {}) => new Promise((resolve) => {
  const i = ++id;
  pending.set(i, resolve);
  socket.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ __timeout: true }); } }, 25000);
});
const evalJs = async (expr) => {
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r?.result?.result?.value;
};

await call('Page.enable');
await call('Runtime.enable');
try {
  for (const shot of SHOTS) {
    await call('Page.navigate', { url: `file://${ROOT}/${shot.url}` });
    await call('Emulation.setDeviceMetricsOverride', {
      width: shot.width, height: 900, deviceScaleFactor: 1, mobile: shot.width < 600,
    });
    await delay(1800);
    // Wait until the app has rendered the README preview (scripts are local
    // but the first load can lag under memory pressure).
    for (let i = 0; i < 20; i++) {
      const ready = await evalJs(`!!document.querySelector('#readmePreview h1')`);
      if (ready) break;
      await delay(500);
    }
    const checks = await evalJs(`JSON.stringify({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      readmeTitle: (document.querySelector('#readmePreview h1') || {}).textContent || '',
      treeItems: document.querySelectorAll('#fileTree li').length,
      slideTitle: (document.querySelector('#slideCanvas h3') || {}).textContent || ''
    })`);
    const res = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (!res?.result?.data) throw new Error('no screenshot data for ' + shot.name);
    fs.writeFileSync(path.join(ROOT, 'screenshots', shot.name), Buffer.from(res.result.data, 'base64'));
    console.log('wrote', shot.name, checks);
  }
  if (consoleErrors.length) {
    console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
    process.exitCode = 1;
  } else {
    console.log('no console errors');
  }
} finally {
  socket.close();
  chrome.kill('SIGTERM');
}
