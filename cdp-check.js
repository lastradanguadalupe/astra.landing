const { spawn } = require('child_process');
const http = require('http');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9222;

const proc = spawn(edgePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check'
]);

function getWebSocketDebuggerUrl() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      http.get(`http://localhost:${port}/json/version`, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearInterval(interval);
          resolve(JSON.parse(data).webSocketDebuggerUrl);
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

async function run() {
  try {
    const wsUrl = await getWebSocketDebuggerUrl();
    console.log('WS URL:', wsUrl);
  } finally {
    proc.kill();
  }
}

run().catch(console.error);
