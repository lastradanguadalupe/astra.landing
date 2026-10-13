const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9222;

const proc = spawn(edgePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\usuario\\astra-landing\\temp-profile-cdp'
]);

function getVersion() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      http.get(`http://localhost:${port}/json/version`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearInterval(interval);
          resolve(JSON.parse(data));
        });
      }).on('error', () => {
        if (attempts > 30) {
          clearInterval(interval);
          reject(new Error('Timeout connecting to browser CDP'));
        }
      });
    }, 200);
  });
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const callbacks = new Map();

  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) cb.reject(new Error(msg.error.message));
      else cb.resolve(msg.result);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ send, close: () => ws.close() });
    ws.onerror = reject;
  });
}

async function capture(client, width, height, outputFile) {
  // Set viewport metrics
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: width,
    height: height,
    deviceScaleFactor: 1,
    mobile: width < 768
  });

  // Navigate to local server
  await client.send('Page.navigate', { url: 'http://localhost:3456/' });
  
  // Wait for load and animations/render
  await new Promise(r => setTimeout(r, 2000));

  // Trigger intersection observer if needed by scrolling
  await client.send('Runtime.evaluate', {
    expression: `
      const list = document.querySelector('.steps-list');
      if (list) list.classList.add('in-view');
      window.scrollTo(0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 600));

  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });

  fs.writeFileSync(outputFile, Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved screenshot ${outputFile} (${width}x${height})`);
}

async function captureFullPage(client, width, outputFile) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 768
  });

  await client.send('Page.navigate', { url: 'http://localhost:3456/' });
  await new Promise(r => setTimeout(r, 1500));

  await client.send('Runtime.evaluate', {
    expression: `
      const list = document.querySelector('.steps-list');
      if (list) list.classList.add('in-view');
    `
  });
  await new Promise(r => setTimeout(r, 600));

  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  });

  fs.writeFileSync(outputFile, Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved full page screenshot ${outputFile} (${width}px wide)`);
}

async function run() {
  try {
    const version = await getVersion();
    
    // Create new target/tab via PUT
    const newTabRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/json/new',
        method: 'PUT'
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.end();
    });

    const client = await createCdpClient(newTabRes.webSocketDebuggerUrl);
    await client.send('Page.enable');

    console.log('Taking desktop full page capture...');
    await captureFullPage(client, 1280, 'C:\\Users\\usuario\\astra-landing\\shot-desktop-full.png');

    console.log('Taking mobile 340px capture...');
    await capture(client, 340, 750, 'C:\\Users\\usuario\\astra-landing\\shot-340.png');

    console.log('Taking mobile 360px capture...');
    await capture(client, 360, 780, 'C:\\Users\\usuario\\astra-landing\\shot-360.png');

    console.log('Taking mobile 390px capture...');
    await capture(client, 390, 844, 'C:\\Users\\usuario\\astra-landing\\shot-390.png');

    console.log('Taking mobile 411px capture...');
    await capture(client, 411, 860, 'C:\\Users\\usuario\\astra-landing\\shot-411.png');

    console.log('Taking 600px tablet capture...');
    await capture(client, 600, 900, 'C:\\Users\\usuario\\astra-landing\\shot-600.png');

    client.close();
  } finally {
    proc.kill();
  }
}

run().catch(err => {
  console.error(err);
  proc.kill();
});
