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
 * Extract fiction ID from shoutout code
 */
function extractFictionIdFromCode(code) {
  if (!code) return null;
  const match = code.match(/\/fiction\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Import shoutouts from Excel file - runs in background
 * Returns immediately after starting, use getImportState() to check progress
 */
export async function importFromExcel(file) {
  logger.info('Starting Excel import (background)...');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Convert workbook to simple data structure for background
        const workbookData = {
          sheets: workbook.SheetNames.map(sheetName => ({
            name: sheetName,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])
          }))
        };

        // Send to background for processing
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
    reader.readAsArrayBuffer(file);
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
