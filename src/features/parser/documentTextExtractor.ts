import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { File } from 'expo-file-system';
import type { DocumentPickerAsset } from 'expo-document-picker';

const maxDocumentSize = 25 * 1024 * 1024;

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: true,
  processEntities: true,
});

const pdfWorkerFallback = `data:text/javascript,${encodeURIComponent(
  'export const WorkerMessageHandler = globalThis.pdfjsWorker.WorkerMessageHandler;',
)}`;

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('Document reading was cancelled.');
  error.name = 'AbortError';
  throw error;
}

function waitForAbortable<T>(operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(Object.assign(new Error('Document reading was cancelled.'), { name: 'AbortError' }));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const error = new Error('Document reading was cancelled.');
      error.name = 'AbortError';
      reject(error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function readDocumentBytes(asset: DocumentPickerAsset, signal: AbortSignal) {
  throwIfAborted(signal);
  if (asset.size && asset.size > maxDocumentSize) {
    throw new Error('Choose a file smaller than 25 MB.');
  }

  let bytes: Uint8Array;
  try {
    const read = asset.file
      ? asset.file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
      : new File(asset.uri).bytes();
    bytes = await waitForAbortable(read, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Android could not access the selected file. Download it to your device and choose it from Downloads.${detail}`);
  }

  throwIfAborted(signal);
  if (bytes.byteLength === 0) {
    throw new Error('The selected file is empty or could not be copied from its storage provider.');
  }
  if (bytes.byteLength > maxDocumentSize) {
    throw new Error('Choose a file smaller than 25 MB.');
  }
  return bytes;
}

function collectDocxText(node: unknown): string {
  if (Array.isArray(node)) return node.map(collectDocxText).join('');
  if (!node || typeof node !== 'object') return '';

  return Object.entries(node).map(([key, value]) => {
    if (key === '#text') return String(value);
    if (key === 'w:t' || key === 't') return collectDocxText(value);
    if (key === 'w:p' || key === 'p') return `${collectDocxText(value).trim()}\n`;
    if (key === 'w:tr' || key === 'tr') return `${collectDocxTableRow(value)}\n`;
    if (key === 'w:br' || key === 'w:cr' || key === 'br' || key === 'cr') return '\n';
    if (key === 'w:tab' || key === 'tab') return '\t';
    return collectDocxText(value);
  }).join('');
}

function collectDocxTableCells(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(collectDocxTableCells);
  if (!node || typeof node !== 'object') return [];

  return Object.entries(node).flatMap(([key, value]) => {
    if (key === 'w:tc' || key === 'tc') return [collectDocxText(value).trim()];
    return collectDocxTableCells(value);
  });
}

function collectDocxTableRow(node: unknown) {
  const cells = collectDocxTableCells(node).filter(Boolean);
  if (cells.length < 2) return cells.join(' ');

  const isTime = (value: string) => /^\d{1,2}(?::\d{2})?\s*(?:AM|PM)?$/i.test(value);
  if (cells.length >= 3 && isTime(cells[0]) && isTime(cells[1])) {
    return `${cells[0]} - ${cells[1]} ${cells.slice(2).join(' ')}`;
  }

  const endTimeAndTitle = /^(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s+(.+)$/i.exec(cells[1]);
  if (isTime(cells[0]) && endTimeAndTitle) {
    return `${cells[0]} - ${endTimeAndTitle[1]} ${endTimeAndTitle[2]}`;
  }

  return cells.join(' ');
}

async function extractDocxText(bytes: Uint8Array, signal: AbortSignal) {
  const archive = await waitForAbortable(JSZip.loadAsync(bytes), signal);
  throwIfAborted(signal);
  const documentXml = archive.file('word/document.xml');
  if (!documentXml) throw new Error('This DOCX file does not contain a readable document body.');

  const xml = await waitForAbortable(documentXml.async('string'), signal);
  throwIfAborted(signal);
  const parsed = xmlParser.parse(xml);
  return collectDocxText(parsed).trim();
}

async function extractPdfText(bytes: Uint8Array, signal: AbortSignal) {
  throwIfAborted(signal);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerFallback;
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    verbosity: 0,
  });
  const destroyOnAbort = () => {
    void loadingTask.destroy().catch((error: unknown) => {
      if (!signal.aborted) console.warn('Could not stop PDF document loading.', error);
    });
  };
  signal.addEventListener('abort', destroyOnAbort, { once: true });

  let document: Awaited<typeof loadingTask.promise>;
  try {
    document = await waitForAbortable(loadingTask.promise, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`This PDF could not be opened. Make sure it is a valid, password-free PDF.${detail}`);
  } finally {
    signal.removeEventListener('abort', destroyOnAbort);
  }
  const destroyOnDocumentAbort = () => {
    void document.destroy().catch((error: unknown) => {
      if (!signal.aborted) console.warn('Could not stop PDF text extraction.', error);
    });
  };
  signal.addEventListener('abort', destroyOnDocumentAbort, { once: true });
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await waitForAbortable(document.getPage(pageNumber), signal);
      const content = await waitForAbortable(page.getTextContent(), signal);
      throwIfAborted(signal);
      const lines: string[] = [];
      let line = '';

      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        } else {
          line += ' ';
        }
      }
      if (line.trim()) lines.push(line);
      pages.push(lines.join('\n'));
    }
    return pages.join('\n');
  } finally {
    signal.removeEventListener('abort', destroyOnDocumentAbort);
    await document.destroy();
  }
}

export async function extractScheduleText(asset: DocumentPickerAsset, signal: AbortSignal) {
  const extension = asset.name.split('.').pop()?.toLowerCase();
  const bytes = await readDocumentBytes(asset, signal);

  if (extension === 'pdf' || asset.mimeType === 'application/pdf') {
    return extractPdfText(bytes, signal);
  }
  if (extension === 'docx' || asset.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      return await extractDocxText(bytes, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`This DOCX file could not be opened. Try saving it again as a .docx document.${detail}`);
    }
  }
  throw new Error('Choose a PDF or DOCX file.');
}
