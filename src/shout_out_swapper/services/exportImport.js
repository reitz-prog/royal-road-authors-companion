// Export/Import service for shoutouts
import * as XLSX from 'xlsx';
import * as db from '../../common/db/proxy.js';
import { log } from '../../common/logging/core.js';
import { parseShoutoutCode } from './parser.js';
import { fetchFictionDetails } from '../../common/utils/fetch.js';

const logger = log.scope('export-import');

/**
 * Export all shoutouts to Excel
 * Each sheet = one of user's fictions + Unscheduled sheet
 */
export async function exportToExcel() {
  logger.info('Starting Excel export...');

  const shoutouts = await db.getAll('shoutouts') || [];
  const myFictions = await db.getAll('myFictions') || [];

  // Group shoutouts by user's fiction
  const fictionShoutouts = new Map();
  const unscheduledRows = [];

  for (const shoutout of shoutouts) {
    const schedules = shoutout.schedules || [];

    // If no schedules, add to unscheduled
    if (schedules.length === 0) {
      unscheduledRows.push({
        'Date': '',
        'Code': shoutout.code || '',
        'Fiction': shoutout.fictionTitle || '',
        'Author': shoutout.authorName || '',
        'Fiction URL': shoutout.fictionUrl || '',
        'Expected Return': shoutout.expectedReturnDate || '',
        'Swapped Date': shoutout.swappedDate || '',
        'Swapped Chapter': shoutout.swappedChapter || '',
        'Swapped Chapter URL': shoutout.swappedChapterUrl || '',
        'Last Scan Date': shoutout.lastSwapScanDate || ''
      });
      continue;
    }

    for (const schedule of schedules) {
      const fictionId = schedule.fictionId;
      const myFiction = myFictions.find(f => String(f.fictionId) === String(fictionId));

      // If schedule has no date, it's unscheduled
      if (!schedule.date) {
        unscheduledRows.push({
          'Date': '',
          'Code': shoutout.code || '',
          'Fiction': shoutout.fictionTitle || '',
          'Author': shoutout.authorName || '',
          'Fiction URL': shoutout.fictionUrl || '',
          'Expected Return': shoutout.expectedReturnDate || '',
          'Swapped Date': shoutout.swappedDate || '',
          'Swapped Chapter': shoutout.swappedChapter || '',
          'Swapped Chapter URL': shoutout.swappedChapterUrl || '',
          'Last Scan Date': shoutout.lastSwapScanDate || ''
        });
        continue;
      }

      if (!myFiction) {
        logger.warn('Skipping schedule - myFiction not found', { fictionId });
        continue;
      }

      if (!fictionShoutouts.has(fictionId)) {
        fictionShoutouts.set(fictionId, {
          title: myFiction.title,
          rows: []
        });
      }

      fictionShoutouts.get(fictionId).rows.push({
        'Date': schedule.date || '',
        'Code': shoutout.code || '',
        'My Fiction ID': fictionId,
        'Fiction': shoutout.fictionTitle || '',
        'Author': shoutout.authorName || '',
        'Fiction URL': shoutout.fictionUrl || '',
        'Chapter': schedule.chapter || '',
        'Chapter URL': schedule.chapterUrl || '',
        'Expected Return': shoutout.expectedReturnDate || '',
        'Swapped Date': shoutout.swappedDate || '',
        'Swapped Chapter': shoutout.swappedChapter || '',
        'Swapped Chapter URL': shoutout.swappedChapterUrl || '',
        'Last Scan Date': shoutout.lastSwapScanDate || ''
      });
    }
  }

  // Create workbook
  const workbook = XLSX.utils.book_new();

  for (const [fictionId, data] of fictionShoutouts) {
    // Sanitize sheet name (Excel has 31 char limit)
    let sheetName = (data.title || 'Unknown').substring(0, 31).replace(/[\\/*?:\[\]]/g, '');

    // Sort rows by date
    data.rows.sort((a, b) => (a.Date || '').localeCompare(b.Date || ''));

    const worksheet = XLSX.utils.json_to_sheet(data.rows);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 12 },  // Date
      { wch: 60 },  // Code
      { wch: 12 },  // My Fiction ID
      { wch: 30 },  // Fiction
      { wch: 20 },  // Author
      { wch: 40 },  // Fiction URL
      { wch: 25 },  // Chapter
      { wch: 50 },  // Chapter URL
      { wch: 12 },  // Expected Return
      { wch: 12 },  // Swapped Date
      { wch: 25 },  // Swapped Chapter
      { wch: 50 },  // Swapped Chapter URL
      { wch: 12 }   // Last Scan Date
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  // Add Unscheduled sheet
  if (unscheduledRows.length > 0) {
    const unscheduledSheet = XLSX.utils.json_to_sheet(unscheduledRows);
    unscheduledSheet['!cols'] = [
      { wch: 12 },  // Date
      { wch: 60 },  // Code
      { wch: 30 },  // Fiction
      { wch: 20 },  // Author
      { wch: 40 },  // Fiction URL
      { wch: 12 },  // Expected Return
      { wch: 12 },  // Swapped Date
      { wch: 25 },  // Swapped Chapter
      { wch: 50 },  // Swapped Chapter URL
      { wch: 12 }   // Last Scan Date
    ];
    XLSX.utils.book_append_sheet(workbook, unscheduledSheet, 'Unscheduled');
  }

  // If no data, create template
  if (fictionShoutouts.size === 0 && unscheduledRows.length === 0) {
    const templateSheet = XLSX.utils.json_to_sheet([{ 'Date': '', 'Code': '' }]);
    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template');
  }

  // Generate filename and download
  const date = new Date().toISOString().split('T')[0];
  const filename = `royal_road_shoutouts_${date}.xlsx`;

  XLSX.writeFile(workbook, filename);
  logger.info('Export complete', { filename });

  return filename;
}

/**
 * Download an empty Excel template with just Date and Code columns — the
 * minimum needed to import. Each of the user's fictions gets its own sheet
 * (sheet name = fiction title) so the importer can attribute rows. Other
 * metadata (fiction title, author, etc.) is auto-filled from the shoutout
 * code on import.
 */
export async function downloadEmptyTemplate() {
  logger.info('Generating empty import template...');

  const myFictions = await db.getAll('myFictions') || [];

  const columns = ['Date', 'Code'];
  const colWidths = [{ wch: 12 }, { wch: 80 }];

  const workbook = XLSX.utils.book_new();

  // One sheet per fiction (header row only). The sheet name is what the
  // importer uses to attribute rows to a fiction. Falls back to a generic
  // Template sheet when the user hasn't set up any fictions yet.
  if (myFictions.length > 0) {
    for (const f of myFictions) {
      const sheetName = (f.title || `Fiction ${f.fictionId}`)
        .substring(0, 31)
        .replace(/[\\/*?:\[\]]/g, '');
      const ws = XLSX.utils.json_to_sheet([], { header: columns });
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    }
  } else {
    const ws = XLSX.utils.json_to_sheet([], { header: columns });
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(workbook, ws, 'Template');
  }

  // Unscheduled sheet for rows without a date (the importer treats a
  // sheet named "Unscheduled" as, well, unscheduled).
  const unscheduled = XLSX.utils.json_to_sheet([], { header: columns });
  unscheduled['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(workbook, unscheduled, 'Unscheduled');

  const filename = 'royal_road_shoutouts_template.xlsx';
  XLSX.writeFile(workbook, filename);
  logger.info('Template download complete', { filename });
  return filename;
}

/**
 * Extract fiction ID from shoutout code
 */
function extractFictionIdFromCode(code) {
  if (!code) return null;
  const match = code.match(/\/fiction\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Import shoutouts from a file — accepts .xlsx/.xls/.csv. Runs in
 * background; returns immediately, progress via getImportState().
 *
 * Options:
 *   csvSheetName — when importing a CSV, the (single) sheet will be
 *     renamed to this value before being sent to the background importer.
 *     Use the title of one of the user's fictions to attribute rows to
 *     that fiction; use "Unscheduled" to park rows with no date.
 */
export async function importFromExcel(file, { csvSheetName } = {}) {
  logger.info('Starting import (background)...', { name: file.name, csvSheetName });

  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        let workbook;
        if (isCsv) {
          const text = typeof e.target.result === 'string'
            ? e.target.result
            : new TextDecoder().decode(new Uint8Array(e.target.result));
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          const data = new Uint8Array(e.target.result);
          workbook = XLSX.read(data, { type: 'array' });
        }

        const workbookData = {
          sheets: workbook.SheetNames.map(sheetName => ({
            name: isCsv && csvSheetName ? csvSheetName : sheetName,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])
          }))
        };

        chrome.runtime.sendMessage({
          type: 'startImport',
          workbookData
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.started) {
            logger.info('Import started in background');
            resolve({ started: true });
          } else {
            reject(new Error(response?.reason || 'Failed to start import'));
          }
        });

      } catch (err) {
        logger.error('Import failed', err);
        reject(err);
      }
    };

    reader.onerror = () => reject(reader.error);
    if (isCsv) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

/**
 * Get current import state from background
 */
export function getImportState() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'getImportState' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Cancel ongoing import
 */
export function cancelImport() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'cancelImport' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
