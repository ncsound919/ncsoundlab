import { writeFileSync } from 'node:fs';

/**
 * Evaluate an expression in the phone's open field tab over Chrome DevTools.
 * Requires `adb forward tcp:9222 localabstract:chrome_devtools_remote`.
 *
 * Usage: node scripts/phone-cdp.mjs "navigator.serviceWorker.controller?.state"
 */

const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = process.env.CDP_TAB_ID
  ? tabs.find((candidate) => candidate.id === process.env.CDP_TAB_ID)
  : tabs.find(
      (candidate) =>
        candidate.type === 'page' &&
        candidate.url.includes(process.env.CDP_TAB_URL ?? 'freebuff.page'),
    );
if (!tab) {
  console.error('No freebuff.page tab found. Open the field URL in Chrome first.');
  process.exit(1);
}

const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (process.argv[2] === '--shot') {
  await send('Page.enable');
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const output = process.argv[3] ?? 'phone-shot.png';
  writeFileSync(output, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${output}`);
  socket.close();
  process.exit(0);
}

if (process.argv[2] === '--bypass-sw') {
  await send('Network.enable');
  await send('Page.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Page.reload', { ignoreCache: true });
  await sleep(6000);
  await send('Network.setBypassServiceWorker', { bypass: false });
  await sleep(2500);
  await send('Page.reload', { ignoreCache: false });
  await sleep(6000);
  const state = await send('Runtime.evaluate', {
    expression: `(async () => ({
      title: document.title,
      url: location.href,
      chunk: performance.getEntriesByType('resource')
        .map((entry) => entry.name.split('/').pop())
        .filter((name) => /^field-.*\\.js$/.test(name)),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      regs: await navigator.serviceWorker.getRegistrations().then((regs) =>
        regs.map((reg) => ({ scope: reg.scope, active: reg.active?.state ?? null }))
      ),
      chopButtons: [...document.querySelectorAll('button')]
        .map((button) => button.textContent.trim())
        .filter((text) => /Auto chop|Even chop|Shape sound/.test(text)),
    }))()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(JSON.stringify(state.result.value, null, 2));
  socket.close();
  process.exit(0);
}

if (process.argv[2] === '--install') {
  await send('Page.enable');
  try {
    const result = await send('Page.installApp', {});
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.log(`installApp error: ${String(error)}`);
  }
  socket.close();
  process.exit(0);
}

if (process.argv[2] === '--pwa') {
  await send('Page.enable');
  const manifest = await send('Page.getAppManifest');
  let installability = null;
  try {
    installability = await send('Page.getInstallabilityErrors');
  } catch (error) {
    installability = { unsupported: String(error) };
  }
  console.log(
    JSON.stringify(
      {
        manifestUrl: manifest.url,
        manifestErrors: manifest.errors,
        installability,
      },
      null,
      2
    )
  );
  socket.close();
  process.exit(0);
}

if (process.argv[2] === '--offline') {
  await send('Network.enable');
  await send('Page.enable');
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  try {
    await send('Page.reload', { ignoreCache: false });
    await sleep(7000);
    const state = await send('Runtime.evaluate', {
      expression: `(async () => ({
        title: document.title,
        url: location.href,
        online: navigator.onLine,
        controller: !!navigator.serviceWorker.controller,
        header: document.querySelector('header')?.innerText?.replace(/\\n+/g, ' | '),
        hasRecord: [...document.querySelectorAll('button')].some(
          (button) => button.textContent.trim() === 'Record'
        ),
        savedTakeVisible: document.body.innerText.includes('1 SAVED'),
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(JSON.stringify(state.result.value, null, 2));
  } finally {
    await send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    socket.close();
  }
  process.exit(0);
}

if (process.argv[2] === '--reload') {
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: false });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const state = await send('Runtime.evaluate', {
    expression: `({
      title: document.title,
      url: location.href,
      hidden: document.hidden,
      controller: !!navigator.serviceWorker.controller,
      chunks: performance.getEntriesByType('resource')
        .map((entry) => entry.name.split('/').pop())
        .filter((name) => /^field-.*\\.js$/.test(name)),
    })`,
    returnByValue: true,
  });
  console.log(JSON.stringify(state.result.value, null, 2));
  socket.close();
  process.exit(0);
}

const expression = process.argv.slice(2).join(' ') || 'document.title';
const result = await send('Runtime.evaluate', {
  expression,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
});

console.log(JSON.stringify(result.result.value ?? result.result, null, 2));
socket.close();
