import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const PROJECT_STORAGE_KEY = 'sheetlab:v0.1:project';
const DEFAULT_START_PORT = 5500;
const DEFAULT_END_PORT = 6500;
const MIN_READABLE_NOTEHEAD_GAP_PX = 2;

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function findFreePort() {
  for (
    let port = DEFAULT_START_PORT;
    port < DEFAULT_END_PORT;
    port += Math.floor(Math.random() * 7) + 1
  ) {
    const available = await new Promise((resolve) => {
      const server = http.createServer();

      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });

    if (available) {
      return port;
    }
  }

  throw new Error('No free QA port found');
}

async function waitForHttpOk(url, timeoutMs = 15000, init) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, init);

      if (response.ok) {
        return response;
      }
    } catch {
      // Keep polling until the dev server or Chrome endpoint is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, timeoutMs = 15000, init) {
  const response = await waitForHttpOk(url, timeoutMs, init);

  return response.json();
}

async function waitForFile(downloadDir, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const files = await fs.readdir(downloadDir).catch(() => []);
    const match = files.find(
      (fileName) => predicate(fileName) && !fileName.endsWith('.crdownload'),
    );

    if (match) {
      return path.join(downloadDir, match);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Timed out waiting for downloaded file');
}

function findChromeExecutable() {
  const candidates = [
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
  ];
  const chromePath = candidates.find((candidate) => existsSync(candidate));

  if (!chromePath) {
    throw new Error('Chrome/Edge executable not found for browser stress QA');
  }

  return chromePath;
}

function isIgnorableViteHmrIssue(text) {
  return (
    (text.includes('/@vite/client') &&
      (text.includes('WebSocket connection') ||
        text.includes('WebSocket closed without opened'))) ||
    (text.includes('ws://127.0.0.1:24678') &&
      text.includes('WebSocket connection'))
  );
}

async function loadExtremeFixtures(repoRoot) {
  const vite = await createViteServer({
    appType: 'custom',
    server: {
      hmr: false,
      middlewareMode: true,
    },
  });

  try {
    const fixtureModule = await vite.ssrLoadModule(
      '/src/domain/score/fixtureCatalog.ts',
    );

    return fixtureModule.extremeScoreFixtureCatalog.map((fixture) => ({
      capabilities: [...fixture.capabilities],
      expectedEventCount: fixture.expectedEventCount,
      id: fixture.id,
      label: fixture.label,
      risk: fixture.risk,
      score: fixture.score,
    }));
  } finally {
    await vite.close();
  }
}

class CdpSession {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = new Map();
    this.consoleIssues = [];
    this.ignoredConsoleIssueCount = 0;
    this.ignoredConsoleIssueSamples = [];

    webSocket.onmessage = (message) => {
      const payload = JSON.parse(message.data);

      if (payload.id) {
        const callbacks = this.pending.get(payload.id);

        if (!callbacks) {
          return;
        }

        this.pending.delete(payload.id);

        if (payload.error) {
          callbacks.reject(new Error(payload.error.message));
        } else {
          callbacks.resolve(payload.result ?? {});
        }

        return;
      }

      if (payload.method === 'Runtime.exceptionThrown') {
        this.recordConsoleIssue({
          level: 'error',
          text:
            payload.params?.exceptionDetails?.exception?.description ??
            payload.params?.exceptionDetails?.text ??
            'Runtime exception',
        });
      }

      if (
        payload.method === 'Log.entryAdded' &&
        ['error', 'warning'].includes(payload.params?.entry?.level)
      ) {
        this.recordConsoleIssue({
          level: payload.params.entry.level,
          text: payload.params.entry.text,
        });
      }

      const waiters = this.waiters.get(payload.method) ?? [];

      waiters.splice(0).forEach((resolve) => resolve(payload.params ?? {}));
    };
  }

  recordConsoleIssue(issue) {
    if (isIgnorableViteHmrIssue(issue.text)) {
      this.ignoredConsoleIssueCount += 1;
      if (this.ignoredConsoleIssueSamples.length < 2) {
        this.ignoredConsoleIssueSamples.push(issue);
      }
      return;
    }

    this.consoleIssues.push(issue);
  }

  send(method, params = {}) {
    const id = this.nextId;

    this.nextId += 1;
    this.webSocket.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitForEvent(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${method}`)),
        timeoutMs,
      );
      const wrappedResolve = (params) => {
        clearTimeout(timeout);
        resolve(params);
      };
      const waiters = this.waiters.get(method) ?? [];

      waiters.push(wrappedResolve);
      this.waiters.set(method, waiters);
    });
  }
}

async function evaluate(session, expression) {
  const result = await session.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Runtime evaluation failed',
    );
  }

  return result.result?.value;
}

async function waitForExpression(session, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await evaluate(session, expression);

    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for expression: ${expression}`);
}

function assertMetric(condition, message) {
  if (!condition) {
    throw new Error(`Browser stress QA failed: ${message}`);
  }
}

function getAllScoreEvents(score) {
  return score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice) => voice.events),
      ),
    ),
  );
}

function sanitizeFilePart(value) {
  return value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function getFirstRenderedEventId(score) {
  return getAllScoreEvents(score).find((event) => !event.id.startsWith('rest-'))
    ?.id;
}

function getExpectedBrowserCoverage(score) {
  const events = getAllScoreEvents(score);
  const tupletIds = new Set(
    events.flatMap((event) => event.tuplet?.id ?? []),
  );
  const rangeLyricMapCount = events.filter(
    (event) => event.lyricMap && event.lyricMap.eventIds.length > 1,
  ).length;
  const tieCount = events.reduce(
    (total, event) => total + (event.ties?.length ?? 0),
    0,
  );
  const slurCount = events.reduce(
    (total, event) => total + (event.slurs?.length ?? 0),
    0,
  );
  const hairpinCount = events.filter((event) => Boolean(event.hairpin)).length;
  const fermataCount = events.filter((event) => Boolean(event.fermata)).length;
  const glissandoCount = events.filter((event) => Boolean(event.glissando)).length;
  const ottavaCount = (score.marks ?? []).filter(
    (mark) => mark.scope === 'range' && mark.kind === 'ottava',
  ).length;
  const pedalEventCount = events.filter((event) => Boolean(event.pedal)).length;

  return {
    eventCount: getAllScoreEvents(score).length,
    fermataCount,
    glissandoCount,
    hairpinCount,
    ottavaCount,
    pedalEventCount,
    rangeLyricMapCount,
    slurCount,
    tieCount,
    tupletGroupCount: tupletIds.size,
  };
}

async function setDownloadBehavior(session, downloadDir) {
  try {
    await session.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });
  } catch {
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });
  }
}

async function ensureAnnotationDebugViews(session) {
  await evaluate(
    session,
    `(() => {
      ['Show lyric map', 'Show layout zones'].forEach((label) => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.getAttribute('aria-label') === label);

        if (button && button.getAttribute('aria-pressed') !== 'true') {
          button.click();
        }
      });
      return true;
    })()`,
  );
}

async function gatherBrowserMetrics(session) {
  return evaluate(
    session,
    `(() => {
      const byTestId = (id) => [...document.querySelectorAll('[data-testid="' + id + '"]')];
      const notationIds = [
        'rendered-chord-symbol',
        'rendered-dynamic',
        'rendered-fermata',
        'rendered-glissando',
        'rendered-hairpin',
        'rendered-lyric',
        'rendered-ottava',
        'rendered-pedal',
        'rendered-pedal-line',
        'rendered-slur',
        'rendered-tie',
        'rendered-tuplet',
      ];
      const overlayNotationMarkCount = notationIds.reduce(
        (total, id) =>
          total + document.querySelectorAll('.notation-overlay [data-testid="' + id + '"]').length,
        0,
      );
      const hairpins = byTestId('rendered-hairpin').map((node) => ({
        continuation: node.getAttribute('data-continuation'),
        sourceId: node.getAttribute('data-source-id'),
        targetId: node.getAttribute('data-target-id'),
      }));
      const ottavas = byTestId('rendered-ottava').map((node) => ({
        ottava: node.getAttribute('data-ottava'),
        sourceId: node.getAttribute('data-source-id'),
        targetId: node.getAttribute('data-target-id'),
      }));
      const pedalLines = byTestId('rendered-pedal-line').map((node) => ({
        continuation: node.getAttribute('data-continuation'),
        sourceId: node.getAttribute('data-source-id'),
        targetId: node.getAttribute('data-target-id'),
      }));
      const collisionSelectors = [
        '[data-testid="rendered-chord-symbol"]',
        '[data-testid="rendered-dynamic"]',
        '[data-testid="rendered-key-signature-symbol"]',
        '[data-testid="rendered-lyric"]',
        '[data-testid="rendered-pedal"]',
        '[data-testid="rendered-section-marker"]',
        '[data-testid="rendered-tempo-mark"]',
      ].join(',');
      const collisionNodes = [...document.querySelectorAll('.vexflow-output ' + collisionSelectors)]
        .map((node) => ({
          eventId: node.getAttribute('data-event-id'),
          id: node.getAttribute('data-testid'),
          measureIndex: node.getAttribute('data-measure-index'),
          rect: node.getBoundingClientRect(),
          staffId: node.getAttribute('data-staff-id'),
          text: node.textContent?.trim() ?? '',
          voiceIndex: node.getAttribute('data-voice-index'),
        }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);
      const shrinkRect = (rect) => ({
        bottom: rect.bottom - 2,
        left: rect.left + 2,
        right: rect.right - 2,
        top: rect.top + 2,
      });
      const rectsOverlap = (firstRect, secondRect) => {
        const first = shrinkRect(firstRect);
        const second = shrinkRect(secondRect);

        return (
          first.left < second.right &&
          first.right > second.left &&
          first.top < second.bottom &&
          first.bottom > second.top
        );
      };
      const getVerticalOverlap = (firstRect, secondRect) =>
        Math.max(0, Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top));
      const notationTextCollisions = [];

      for (let firstIndex = 0; firstIndex < collisionNodes.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < collisionNodes.length; secondIndex += 1) {
          const first = collisionNodes[firstIndex];
          const second = collisionNodes[secondIndex];

          if (rectsOverlap(first.rect, second.rect)) {
            notationTextCollisions.push({
              first: {
                eventId: first.eventId,
                id: first.id,
                measureIndex: first.measureIndex,
                staffId: first.staffId,
                text: first.text,
                voiceIndex: first.voiceIndex,
              },
              second: {
                eventId: second.eventId,
                id: second.id,
                measureIndex: second.measureIndex,
                staffId: second.staffId,
                text: second.text,
                voiceIndex: second.voiceIndex,
              },
            });
          }
        }
      }

      const toRect = (rect) => ({
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      });
      const combineRects = (rects) =>
        rects.length === 0
          ? null
          : rects.reduce(
              (combined, rect) => ({
                bottom: Math.max(combined.bottom, rect.bottom),
                height: Math.max(combined.bottom, rect.bottom) - Math.min(combined.top, rect.top),
                left: Math.min(combined.left, rect.left),
                right: Math.max(combined.right, rect.right),
                top: Math.min(combined.top, rect.top),
                width: Math.max(combined.right, rect.right) - Math.min(combined.left, rect.left),
              }),
              rects[0],
            );
      const eventNodeMap = new Map(
        [...document.querySelectorAll('.vexflow-output .vf-user-event:not(.vf-generated-rest)')]
          .map((node) => [node.getAttribute('data-event-id'), node]),
      );
      const noteheadRectsByEvent = new Map();

      [...document.querySelectorAll('.vexflow-output .vf-user-notehead')]
        .forEach((node) => {
          const eventId = node.getAttribute('data-event-id');
          const rect = node.getBoundingClientRect();

          if (!eventId || rect.width <= 0 || rect.height <= 0) {
            return;
          }

          const rects = noteheadRectsByEvent.get(eventId) ?? [];
          rects.push(toRect(rect));
          noteheadRectsByEvent.set(eventId, rects);
        });

      const readableNodes = [...eventNodeMap]
        .map(([eventId, eventNode]) => {
          const eventRect = eventNode.getBoundingClientRect();
          const noteheadRect = combineRects(noteheadRectsByEvent.get(eventId) ?? []);

          return {
            beat: Number(eventNode.getAttribute('data-beat') ?? '0'),
            eventId,
            eventRect: toRect(eventRect),
            measureIndex: eventNode.getAttribute('data-measure-index') ?? '',
            noteheadRect,
            staffId: eventNode.getAttribute('data-staff-id') ?? '',
            voiceIndex: eventNode.getAttribute('data-voice-index') ?? '',
          };
        })
        .filter(
          ({ eventRect, noteheadRect }) =>
            eventRect.width > 0 &&
            eventRect.height > 0 &&
            noteheadRect &&
            noteheadRect.width > 0 &&
            noteheadRect.height > 0,
        );
      const groupByLane = (items) =>
        items.reduce((groups, item) => {
          const key = [item.staffId, item.voiceIndex, item.measureIndex].join(':');
          const group = groups.get(key) ?? [];
          group.push(item);
          groups.set(key, group);
          return groups;
        }, new Map());
      const noteheadInkCollisions = [];
      const eventInkCollisions = [];
      let minReadableNoteheadGapPx = null;
      let minReadableOverlappingNoteheadGapPx = null;
      let minReadableEventGapPx = null;

      groupByLane(readableNodes).forEach((laneItems) => {
        const sortedLaneItems = laneItems.sort(
          (first, second) =>
            first.beat - second.beat ||
            first.noteheadRect.left - second.noteheadRect.left,
        );

        for (let index = 0; index < sortedLaneItems.length - 1; index += 1) {
          const first = sortedLaneItems[index];
          const second = sortedLaneItems[index + 1];
          const noteheadGap = second.noteheadRect.left - first.noteheadRect.right;
          const eventGap = second.eventRect.left - first.eventRect.right;

          minReadableNoteheadGapPx =
            minReadableNoteheadGapPx === null
              ? noteheadGap
              : Math.min(minReadableNoteheadGapPx, noteheadGap);
          if (getVerticalOverlap(first.noteheadRect, second.noteheadRect) > 2) {
            minReadableOverlappingNoteheadGapPx =
              minReadableOverlappingNoteheadGapPx === null
                ? noteheadGap
                : Math.min(minReadableOverlappingNoteheadGapPx, noteheadGap);
          }
          minReadableEventGapPx =
            minReadableEventGapPx === null
              ? eventGap
              : Math.min(minReadableEventGapPx, eventGap);

          if (rectsOverlap(first.noteheadRect, second.noteheadRect)) {
            noteheadInkCollisions.push({
              first: {
                eventId: first.eventId,
                measureIndex: first.measureIndex,
                staffId: first.staffId,
                voiceIndex: first.voiceIndex,
              },
              second: {
                eventId: second.eventId,
                measureIndex: second.measureIndex,
                staffId: second.staffId,
                voiceIndex: second.voiceIndex,
              },
            });
          }

          if (rectsOverlap(first.eventRect, second.eventRect)) {
            eventInkCollisions.push({
              eventGap,
              first: {
                eventId: first.eventId,
                measureIndex: first.measureIndex,
                staffId: first.staffId,
                voiceIndex: first.voiceIndex,
              },
              second: {
                eventId: second.eventId,
                measureIndex: second.measureIndex,
                staffId: second.staffId,
                voiceIndex: second.voiceIndex,
              },
            });
          }
        }
      });

      return {
        bodyTextSample: document.body.innerText.slice(0, 240),
        eventCount: document.querySelectorAll('.vexflow-output .vf-user-event').length,
        fermataCount: byTestId('rendered-fermata').length,
        glissandoCount: byTestId('rendered-glissando').length,
        hairpinCount: byTestId('rendered-hairpin').length,
        hairpins,
        invalidMeasureMarkCount: document.querySelectorAll('.is-invalid-measure').length,
        eventInkCollisionCount: eventInkCollisions.length,
        eventInkCollisions: eventInkCollisions.slice(0, 12),
        lyricMapConnectorCount: byTestId('lyric-map-connector').length,
        lyricMapRangeCount: document.querySelectorAll('[data-map-cardinality="range"]').length,
        minReadableEventGapPx,
        minReadableNoteheadGapPx,
        minReadableOverlappingNoteheadGapPx,
        noteheadInkCollisionCount: noteheadInkCollisions.length,
        noteheadInkCollisions: noteheadInkCollisions.slice(0, 12),
        notationTextCollisionCount: notationTextCollisions.length,
        notationTextCollisions: notationTextCollisions.slice(0, 12),
        overlayNotationMarkCount,
        ottavaCount: byTestId('rendered-ottava').length,
        ottavas,
        pedalLineCount: byTestId('rendered-pedal-line').length,
        pedalLines,
        slurCount: byTestId('rendered-slur').length,
        svgHeight: document.querySelector('.vexflow-output svg')?.getAttribute('height') ?? null,
        tieCount: byTestId('rendered-tie').length,
        tupletCount: byTestId('rendered-tuplet').length,
        tupletIds: [...new Set(byTestId('rendered-tuplet').map((node) => node.getAttribute('data-tuplet-id')))],
        zoneCount: byTestId('voice-zone-debug').length,
      };
    })()`,
  );
}

async function runFixtureQa({ fixture, origin, qaDir, session }) {
  const fixtureDir = path.join(qaDir, fixture.id);
  const downloadDir = path.join(fixtureDir, 'downloads');
  const scoreText = JSON.stringify(fixture.score, null, 2);
  const expected = getExpectedBrowserCoverage(fixture.score);
  const firstEventId = getFirstRenderedEventId(fixture.score);

  if (!firstEventId) {
    throw new Error(`Fixture ${fixture.id} has no rendered events`);
  }

  await fs.mkdir(downloadDir, { recursive: true });
  await fs.writeFile(path.join(fixtureDir, `${fixture.id}.score.json`), scoreText);
  await setDownloadBehavior(session, downloadDir);
  await evaluate(
    session,
    `(() => {
      localStorage.setItem(${JSON.stringify(PROJECT_STORAGE_KEY)}, ${JSON.stringify(scoreText)});
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === 'Load');
      button.click();
      return true;
    })()`,
  );
  await waitForExpression(
    session,
    `Boolean(document.querySelector('.vexflow-output .vf-user-event[data-event-id="${firstEventId}"]'))`,
  );
  await ensureAnnotationDebugViews(session);

  if (expected.rangeLyricMapCount > 0) {
    await waitForExpression(
      session,
      `Boolean(document.querySelector('[data-testid="lyric-map-connector"]'))`,
    );
  }

  const metrics = await gatherBrowserMetrics(session);
  const screenshot = await session.send('Page.captureScreenshot', {
    captureBeyondViewport: true,
    format: 'png',
    fromSurface: true,
  });
  const screenshotPath = path.join(fixtureDir, `${fixture.id}.png`);

  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  await evaluate(
    session,
    `(() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === 'Download JSON');
      button.click();
      return true;
    })()`,
  );

  const jsonPath = await waitForFile(
    downloadDir,
    (fileName) => fileName.toLowerCase().endsWith('.json'),
    30000,
  );

  await evaluate(
    session,
    `(() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === 'Export PDF');
      button.click();
      return true;
    })()`,
  );

  const pdfPath = await waitForFile(
    downloadDir,
    (fileName) => fileName.toLowerCase().endsWith('.pdf'),
    30000,
  );
  const downloadedScore = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  const pdfBuffer = await fs.readFile(pdfPath);
  const exportReport = {
    jsonEventCount: getAllScoreEvents(downloadedScore).length,
    jsonPath,
    origin,
    pdfBytes: pdfBuffer.length,
    pdfHeader: pdfBuffer.subarray(0, 5).toString('utf8'),
    pdfPath,
    screenshotPath,
  };
  const report = {
    exportReport,
    expected,
    fixture: {
      capabilities: fixture.capabilities,
      expectedEventCount: fixture.expectedEventCount,
      id: fixture.id,
      label: fixture.label,
      risk: fixture.risk,
    },
    metrics,
  };

  await fs.writeFile(
    path.join(fixtureDir, 'browser-metrics.json'),
    JSON.stringify(metrics, null, 2),
  );
  await fs.writeFile(
    path.join(fixtureDir, 'export-report.json'),
    JSON.stringify(exportReport, null, 2),
  );
  await fs.writeFile(
    path.join(fixtureDir, 'browser-fixture-report.json'),
    JSON.stringify(report, null, 2),
  );

  assertMetric(
    metrics.eventCount === fixture.expectedEventCount,
    `${fixture.id}: event count mismatch`,
  );
  assertMetric(
    metrics.overlayNotationMarkCount === 0,
    `${fixture.id}: notation marks leaked into overlay`,
  );
  assertMetric(
    metrics.notationTextCollisionCount === 0,
    `${fixture.id}: rendered notation text collisions ${JSON.stringify(metrics.notationTextCollisions)}`,
  );
  assertMetric(
    metrics.noteheadInkCollisionCount === 0,
    `${fixture.id}: rendered notehead ink collisions ${JSON.stringify(metrics.noteheadInkCollisions)}`,
  );
  assertMetric(
    metrics.minReadableOverlappingNoteheadGapPx === null ||
      metrics.minReadableOverlappingNoteheadGapPx >= MIN_READABLE_NOTEHEAD_GAP_PX,
    `${fixture.id}: minimum overlapping notehead gap ${metrics.minReadableOverlappingNoteheadGapPx}px is below ${MIN_READABLE_NOTEHEAD_GAP_PX}px`,
  );
  assertMetric(
    metrics.invalidMeasureMarkCount === 0,
    `${fixture.id}: fixture has invalid measure UI`,
  );
  assertMetric(
    exportReport.jsonEventCount === fixture.expectedEventCount,
    `${fixture.id}: JSON download event count mismatch`,
  );
  assertMetric(
    exportReport.pdfHeader === '%PDF-',
    `${fixture.id}: PDF export did not return a PDF`,
  );

  if (expected.tupletGroupCount > 0) {
    assertMetric(
      metrics.tupletIds.length >= expected.tupletGroupCount,
      `${fixture.id}: not all tuplet groups rendered`,
    );
  }

  if (expected.tieCount > 0) {
    assertMetric(metrics.tieCount >= 1, `${fixture.id}: tie mark did not render`);
  }

  if (expected.slurCount > 0) {
    assertMetric(metrics.slurCount >= 1, `${fixture.id}: slur mark did not render`);
  }

  if (expected.hairpinCount > 0) {
    assertMetric(
      metrics.hairpinCount >= 1,
      `${fixture.id}: hairpin mark did not render`,
    );
  }

  if (expected.fermataCount > 0) {
    assertMetric(
      metrics.fermataCount >= 1,
      `${fixture.id}: fermata did not render`,
    );
  }

  if (expected.glissandoCount > 0) {
    assertMetric(
      metrics.glissandoCount >= 1,
      `${fixture.id}: glissando did not render`,
    );
  }

  if (expected.ottavaCount > 0) {
    assertMetric(
      metrics.ottavaCount >= expected.ottavaCount,
      `${fixture.id}: ottava brackets did not render`,
    );
  }

  if (expected.rangeLyricMapCount > 0) {
    assertMetric(
      metrics.lyricMapRangeCount >= expected.rangeLyricMapCount,
      `${fixture.id}: range lyric map did not render`,
    );
  }

  if (expected.pedalEventCount > 0) {
    assertMetric(
      metrics.pedalLineCount >= 1,
      `${fixture.id}: pedal bracket did not render`,
    );
  }

  return report;
}

function startDevServer({ port, repoRoot, qaDir }) {
  const outPath = path.join(qaDir, 'dev-server.out.log');
  const errPath = path.join(qaDir, 'dev-server.err.log');
  const out = fs.open(outPath, 'w');
  const err = fs.open(errPath, 'w');

  return Promise.all([out, err]).then(([outHandle, errHandle]) => {
    const server = spawn(process.execPath, ['server/dev-server.mjs'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        SHEETLAB_DISABLE_HMR: '1',
      },
      stdio: ['ignore', outHandle.fd, errHandle.fd],
      windowsHide: true,
    });

    server.once('exit', () => {
      void outHandle.close();
      void errHandle.close();
    });

    return server;
  });
}

async function main() {
  const repoRoot = getRepoRoot();
  const port = Number(process.env.QA_PORT ?? (await findFreePort()));
  const debugPort = port + 1000;
  const origin = `http://127.0.0.1:${port}`;
  const qaDir = path.join(
    repoRoot,
    'artifacts',
    'browser-qa',
    `stress-${timestamp()}`,
  );
  const profileDir = path.join(qaDir, 'chrome-profile');
  const fixtures = await loadExtremeFixtures(repoRoot);

  await fs.mkdir(profileDir, { recursive: true });
  await fs.writeFile(
    path.join(qaDir, 'fixture-catalog.json'),
    JSON.stringify(
      fixtures.map((fixture) => ({
        capabilities: fixture.capabilities,
        expectedEventCount: fixture.expectedEventCount,
        id: fixture.id,
        label: fixture.label,
        risk: fixture.risk,
      })),
      null,
      2,
    ),
  );

  const devServer = await startDevServer({ port, qaDir, repoRoot });
  let chrome;
  let webSocket;

  try {
    await waitForHttpOk(origin, 15000);

    chrome = spawn(
      findChromeExecutable(),
      [
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profileDir}`,
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1440,1800',
        'about:blank',
      ],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    );

    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);

    const target = await waitForJson(
      `http://127.0.0.1:${debugPort}/json/new`,
      10000,
      { method: 'PUT' },
    );

    webSocket = new WebSocket(target.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      webSocket.onopen = resolve;
      webSocket.onerror = reject;
    });

    const session = new CdpSession(webSocket);

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');

    const loadEvent = session
      .waitForEvent('Page.loadEventFired', 15000)
      .catch(() => null);

    await session.send('Page.navigate', { url: origin });
    await loadEvent;
    await waitForExpression(
      session,
      `Boolean(document.querySelector('[data-testid="vexflow-renderer"]'))`,
    );
    const fixtureReports = [];

    for (const fixture of fixtures) {
      fixtureReports.push(await runFixtureQa({ fixture, origin, qaDir, session }));
    }

    const report = {
      browserAvailability: 'Browser plugin not available; used Chrome CDP',
      consoleIssues: session.consoleIssues,
      fixtureCount: fixtureReports.length,
      fixtureReports,
      ignoredConsoleIssueCount: session.ignoredConsoleIssueCount,
      ignoredConsoleIssueSamples: session.ignoredConsoleIssueSamples,
      qaDir,
    };

    await fs.writeFile(
      path.join(qaDir, 'browser-stress-report.json'),
      JSON.stringify(report, null, 2),
    );

    assertMetric(session.consoleIssues.length === 0, 'browser console has errors or warnings');
    assertMetric(
      fixtureReports.length === fixtures.length,
      'not all extreme fixtures were exercised',
    );

    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
      webSocket.close();
    }

    if (chrome && !chrome.killed) {
      chrome.kill();
    }

    if (devServer && !devServer.killed) {
      devServer.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
