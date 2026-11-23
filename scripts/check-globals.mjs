// One-off check: window.PptxGenJS + window.marked exist on the real page.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = '/home/hatch/workspace/projects/hackathon/hackathon-teammate-agent';
const PORT = 9233;
const policy = 'hatch-webgl-allowed-domains-v1\nexample.com\n';
const file = '/tmp/htm-webgl-policy.txt'; // already written by scripts/shots.mjs
const sha = createHash('sha256').update(policy).digest('hex');
const chrome = spawn('/opt/meta-chromium/chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'htm-check-'))}`,
  `--hatch-webgl-allowed-domains-file=${file}`,
  `--hatch-webgl-allowed-domains-sha256=${sha}`,
  `--remote-debugging-port=${PORT}`,
  '--window-size=1280,900',
  `file://${ROOT}/index.html`,
]);
let wsUrl = null;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const page = (await res.json()).find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (e) { /* not up */ }
  await delay(250);
}
if (!wsUrl) { chrome.kill('SIGTERM'); throw new Error('no devtools'); }
const socket = new WebSocket(wsUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let id = 0;
const pending = new Map();
socket.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const call = (method, params = {}) => new Promise((resolve) => {
  const i = ++id;
  pending.set(i, resolve);
  socket.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); resolve({ __timeout: true }); } }, 20000);
});
await delay(2500);
const out = await call('Runtime.evaluate', {
  expression: `JSON.stringify({
    pptxGenJS: typeof window.PptxGenJS,
    marked: typeof window.marked,
    core: typeof window.TeammateCore,
    sample: !!window.SAMPLE_DATA,
    canBuildPptx: (() => { try { const p = new window.PptxGenJS(); p.addSlide(); return p.slides.length; } catch (e) { return 'ERR:' + e.message; } })(),
    readmeH1: (document.querySelector('#readmePreview h1') || {}).textContent || ''
  })`,
  returnByValue: true,
});
console.log(out?.result?.result?.value);
socket.close();
chrome.kill('SIGTERM');
process.exit(0);
