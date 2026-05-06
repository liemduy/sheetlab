import http from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createScorePdf } from './pdf/createScorePdf.mjs';

const PORT = Number(process.env.PORT ?? 5173);
const MAX_BODY_BYTES = 1024 * 1024;

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function handlePdfExport(request, response) {
  try {
    const body = await readRequestBody(request);
    const score = JSON.parse(body);
    const pdfBuffer = await createScorePdf(score);
    const fileTitle = String(score.title || 'sheetlab-score')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    response.writeHead(200, {
      'Content-Disposition': `attachment; filename="${fileTitle || 'sheetlab-score'}.pdf"`,
      'Content-Length': pdfBuffer.length,
      'Content-Type': 'application/pdf',
    });
    response.end(pdfBuffer);
  } catch (error) {
    response.writeHead(400, {
      'Content-Type': 'application/json',
    });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'PDF export failed',
      }),
    );
  }
}

const vite = await createViteServer({
  appType: 'spa',
  server: {
    middlewareMode: true,
  },
});

const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/export-pdf') {
    await handlePdfExport(request, response);
    return;
  }

  vite.middlewares(request, response, () => {
    response.statusCode = 404;
    response.end('Not found');
  });
});

server.listen(PORT, () => {
  console.log(`SheetLab dev server running at http://localhost:${PORT}/`);
});
