import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const EXPORT_SCORE_KEY = 'sheetlab:v0.1:pdf-export-score';

const PAGE_SIZE_INCHES = {
  a4: {
    height: 11.69,
    width: 8.27,
  },
  letter: {
    height: 11,
    width: 8.5,
  },
};

function getPageSizeInInches(score) {
  return PAGE_SIZE_INCHES[score.pageSize] ?? PAGE_SIZE_INCHES.a4;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  const chromePath = candidates.find((candidate) => existsSync(candidate));

  if (!chromePath) {
    throw new Error('Chrome/Edge executable not found for PDF export');
  }

  return chromePath;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a browser debug port'));
        return;
      }

      const { port } = address;

      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(url, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return response.json();
      }
    } catch {
      // Chrome is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function connectDevTools(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    let commandId = 1;
    const pendingCommands = new Map();
    const events = [];

    socket.addEventListener(
      'open',
      () => {
        socket.addEventListener('message', (message) => {
          const payload = JSON.parse(message.data.toString());

          if (payload.id && pendingCommands.has(payload.id)) {
            const pendingCommand = pendingCommands.get(payload.id);

            pendingCommands.delete(payload.id);

            if (payload.error) {
              pendingCommand.reject(new Error(payload.error.message));
            } else {
              pendingCommand.resolve(payload.result ?? {});
            }

            return;
          }

          if (payload.method) {
            events.push(payload);
          }
        });

        resolve({
          close: () => socket.close(),
          send(method, params = {}) {
            const id = commandId;

            commandId += 1;
            socket.send(JSON.stringify({ id, method, params }));

            return new Promise((commandResolve, commandReject) => {
              pendingCommands.set(id, {
                reject: commandReject,
                resolve: commandResolve,
              });
            });
          },
          waitForEvent(method, timeoutMs = 10000) {
            const existingEventIndex = events.findIndex(
              (event) => event.method === method,
            );

            if (existingEventIndex >= 0) {
              return Promise.resolve(events.splice(existingEventIndex, 1)[0]);
            }

            return new Promise((eventResolve, eventReject) => {
              const startedAt = Date.now();
              const timer = setInterval(() => {
                const eventIndex = events.findIndex(
                  (event) => event.method === method,
                );

                if (eventIndex >= 0) {
                  clearInterval(timer);
                  eventResolve(events.splice(eventIndex, 1)[0]);
                  return;
                }

                if (Date.now() - startedAt > timeoutMs) {
                  clearInterval(timer);
                  eventReject(new Error(`Timed out waiting for ${method}`));
                }
              }, 50);
            });
          },
        });
      },
      { once: true },
    );
    socket.addEventListener('error', reject, { once: true });
  });
}

async function waitForExpression(client, expression, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.send('Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });

    if (result.result?.value) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for score export render');
}

export async function createBrowserScorePdf(score, { origin }) {
  if (!origin) {
    throw new Error('PDF export origin is required');
  }

  const debugPort = await getFreePort();
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'sheetlab-pdf-'));
  const browser = spawn(
    findChromeExecutable(),
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--no-default-browser-check',
      '--no-first-run',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1200,1600',
      'about:blank',
    ],
    {
      stdio: 'ignore',
    },
  );
  let client;

  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);

    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new`, {
      method: 'PUT',
    }).then((response) => response.json());

    client = await connectDevTools(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `sessionStorage.setItem(${JSON.stringify(
        EXPORT_SCORE_KEY,
      )}, ${JSON.stringify(JSON.stringify(score))});`,
    });
    await client.send('Page.navigate', {
      url: `${origin}/?pdf-export=1`,
    });
    await client.waitForEvent('Page.loadEventFired');
    await waitForExpression(
      client,
      `Boolean(document.querySelector('.app-shell.is-pdf-export .vexflow-output svg'))`,
    );
    await client.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `document.fonts ? document.fonts.ready.then(() => true) : true`,
      returnByValue: true,
    });

    const pageSize = getPageSizeInInches(score);
    const paperMetrics = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const paper = document.querySelector('.paper');
        if (!paper) return null;
        const rect = paper.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      })()`,
      returnByValue: true,
    });
    const renderedPaperHeightInches =
      typeof paperMetrics.result?.value?.height === 'number'
        ? paperMetrics.result.value.height / 96
        : pageSize.height;
    const paperHeight = Math.max(
      pageSize.height,
      Math.ceil((renderedPaperHeightInches + 0.05) * 100) / 100,
    );
    const pdf = await client.send('Page.printToPDF', {
      displayHeaderFooter: false,
      landscape: false,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      marginTop: 0,
      paperHeight,
      paperWidth: pageSize.width,
      preferCSSPageSize: false,
      printBackground: true,
    });

    return Buffer.from(pdf.data, 'base64');
  } finally {
    client?.close();
    browser.kill();

    try {
      rmSync(userDataDir, {
        force: true,
        recursive: true,
      });
    } catch {
      // Windows can keep the temporary Chrome profile locked briefly after kill.
      // Cleanup must not turn a successful PDF render into a failed export.
    }
  }
}
