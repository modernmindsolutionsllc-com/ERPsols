import * as XLSX from 'xlsx';

import type { Entity, ExcelRow, MappingRule, ParsedWorkbookData } from '@/features/dataConversion/types';

const TEMPLATE_REQUIRED_HEADERS = ['columnorder', 'hdl', 'inputcolumnname'];

function normalizeEntityId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

function encodeDateToDos(now: Date): { time: number; date: number } {
  const seconds = Math.floor(now.getSeconds() / 2);
  const minutes = now.getMinutes();
  const hours = now.getHours();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = Math.max(now.getFullYear(), 1980) - 1980;

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: (year << 9) | (month << 5) | day,
  };
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }

    table[index] = crc >>> 0;
  }

  return table;
}

const CRC32_TABLE = createCrc32Table();

function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach(part => {
    result.set(part, offset);
    offset += part.length;
  });

  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function buildStoredZipBlob(entryName: string, content: string): Blob {
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(entryName);
  const contentBytes = encoder.encode(content);
  const crc32 = calculateCrc32(contentBytes);
  const { time, date } = encodeDateToDos(new Date());

  const localHeader = new Uint8Array(30 + filenameBytes.length);
  const localHeaderView = new DataView(localHeader.buffer);
  localHeaderView.setUint32(0, 0x04034b50, true);
  localHeaderView.setUint16(4, 20, true);
  localHeaderView.setUint16(6, 0, true);
  localHeaderView.setUint16(8, 0, true);
  localHeaderView.setUint16(10, time, true);
  localHeaderView.setUint16(12, date, true);
  localHeaderView.setUint32(14, crc32, true);
  localHeaderView.setUint32(18, contentBytes.length, true);
  localHeaderView.setUint32(22, contentBytes.length, true);
  localHeaderView.setUint16(26, filenameBytes.length, true);
  localHeaderView.setUint16(28, 0, true);
  localHeader.set(filenameBytes, 30);

  const centralDirectory = new Uint8Array(46 + filenameBytes.length);
  const centralDirectoryView = new DataView(centralDirectory.buffer);
  centralDirectoryView.setUint32(0, 0x02014b50, true);
  centralDirectoryView.setUint16(4, 20, true);
  centralDirectoryView.setUint16(6, 20, true);
  centralDirectoryView.setUint16(8, 0, true);
  centralDirectoryView.setUint16(10, 0, true);
  centralDirectoryView.setUint16(12, time, true);
  centralDirectoryView.setUint16(14, date, true);
  centralDirectoryView.setUint32(16, crc32, true);
  centralDirectoryView.setUint32(20, contentBytes.length, true);
  centralDirectoryView.setUint32(24, contentBytes.length, true);
  centralDirectoryView.setUint16(28, filenameBytes.length, true);
  centralDirectoryView.setUint16(30, 0, true);
  centralDirectoryView.setUint16(32, 0, true);
  centralDirectoryView.setUint16(34, 0, true);
  centralDirectoryView.setUint16(36, 0, true);
  centralDirectoryView.setUint32(38, 0, true);
  centralDirectoryView.setUint32(42, 0, true);
  centralDirectory.set(filenameBytes, 46);

  const endOfCentralDirectory = new Uint8Array(22);
  const endOfCentralDirectoryView = new DataView(endOfCentralDirectory.buffer);
  endOfCentralDirectoryView.setUint32(0, 0x06054b50, true);
  endOfCentralDirectoryView.setUint16(4, 0, true);
  endOfCentralDirectoryView.setUint16(6, 0, true);
  endOfCentralDirectoryView.setUint16(8, 1, true);
  endOfCentralDirectoryView.setUint16(10, 1, true);
  endOfCentralDirectoryView.setUint32(12, centralDirectory.length, true);
  endOfCentralDirectoryView.setUint32(16, localHeader.length + contentBytes.length, true);
  endOfCentralDirectoryView.setUint16(20, 0, true);

  const zipBytes = concatUint8Arrays([
    localHeader,
    contentBytes,
    centralDirectory,
    endOfCentralDirectory,
  ]);

  return new Blob([toArrayBuffer(zipBytes)], { type: 'application/zip' });
}

function isNullLikeValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  const normalized = String(value).trim().toUpperCase();
  return normalized === '' || normalized === 'NULL';
}

function getColumnOrderValue(rule: MappingRule): string {
  return typeof rule.ColumnOrder === 'string' ? rule.ColumnOrder : '';
}

function getSortedRulesByPrefix(rules: MappingRule[], prefix: string): MappingRule[] {
  return rules
    .filter(rule => getColumnOrderValue(rule).startsWith(prefix))
    .sort((left, right) => {
      const leftOrder = Number.parseInt(getColumnOrderValue(left).slice(1), 10);
      const rightOrder = Number.parseInt(getColumnOrderValue(right).slice(1), 10);
      return leftOrder - rightOrder;
    });
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeSheetName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function stripTemplateKeywords(value: string): string {
  return value
    .replace(/template|mapping|config|rule|rules/gi, '')
    .replace(/[_\-\s]+/g, '');
}

function stripDataKeywords(value: string): string {
  return value
    .replace(/data|input|upload|value|values|record|records/gi, '')
    .replace(/[_\-\s]+/g, '');
}

function tokenizeSheetName(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter(token => ![
      'template',
      'mapping',
      'config',
      'rule',
      'rules',
      'data',
      'input',
      'upload',
      'value',
      'values',
      'record',
      'records',
    ].includes(token));
}

function getWorksheetMatrix(worksheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
    blankrows: false,
  });
}

function findTemplateHeaderRowIndex(matrix: unknown[][]): number | null {
  for (let index = 0; index < matrix.length; index += 1) {
    const normalizedRow = (matrix[index] ?? []).map(normalizeHeader);
    const hasTemplateHeaders = TEMPLATE_REQUIRED_HEADERS.every(header => normalizedRow.includes(header));

    if (hasTemplateHeaders) {
      return index;
    }
  }

  return null;
}

function parseTemplateWorksheetRows(worksheet: XLSX.WorkSheet): MappingRule[] | null {
  const matrix = getWorksheetMatrix(worksheet);
  const headerRowIndex = findTemplateHeaderRowIndex(matrix);

  if (headerRowIndex === null) {
    return null;
  }

  const rows = XLSX.utils.sheet_to_json<MappingRule>(worksheet, {
    range: headerRowIndex,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  return rows.length > 0 ? rows : null;
}

function parseWorksheetRows<T extends Record<string, unknown>>(worksheet: XLSX.WorkSheet): T[] {
  return XLSX.utils.sheet_to_json<T>(worksheet, {
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });
}

function findMatchingDataSheet(templateSheetName: string, dataSheetNames: string[]): string | null {
  if (dataSheetNames.length === 0) {
    return null;
  }

  const normalizedTemplate = normalizeSheetName(templateSheetName);
  const simplifiedTemplate = stripTemplateKeywords(normalizedTemplate);
  const templateTokens = tokenizeSheetName(templateSheetName);

  const rankedMatches = dataSheetNames
    .map(sheetName => {
      const normalizedData = normalizeSheetName(sheetName);
      const simplifiedData = stripDataKeywords(normalizedData);
      const dataTokens = tokenizeSheetName(sheetName);
      const sharedTokens = dataTokens.filter(token => templateTokens.includes(token));

      let score = 0;
      if (simplifiedData === simplifiedTemplate && simplifiedData !== '') {
        score = 10;
      } else if (
        templateTokens.length > 0
        && dataTokens.length > 0
        && sharedTokens.length === Math.min(templateTokens.length, dataTokens.length)
      ) {
        score = 9;
      } else if (normalizedData === normalizedTemplate) {
        score = 8;
      } else if (sharedTokens.length > 0) {
        score = 7;
      } else if (simplifiedData && simplifiedTemplate && normalizedData.includes(simplifiedTemplate)) {
        score = 6;
      } else if (simplifiedData && simplifiedTemplate && simplifiedTemplate.includes(simplifiedData)) {
        score = 5;
      } else if (dataSheetNames.length === 1) {
        score = 1;
      }

      return { sheetName, score };
    })
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score);

  return rankedMatches[0]?.sheetName ?? null;
}

function createHeaderLookup(row: ExcelRow): Map<string, string> {
  const lookup = new Map<string, string>();

  Object.keys(row).forEach(key => {
    lookup.set(normalizeHeader(key), key);
  });

  return lookup;
}

function resolveRowValue(row: ExcelRow, headerLookup: Map<string, string>, inputColumnName: string): unknown {
  const exactKey = headerLookup.get(normalizeHeader(inputColumnName));
  if (exactKey) {
    return row[exactKey];
  }

  return row[inputColumnName];
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const result = event.target?.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
        return;
      }
      reject(new Error('Unable to read workbook contents.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read workbook contents.'));
    reader.readAsArrayBuffer(file);
  });
}

export function createEntitiesFromNames(entityNames: string[]): Entity[] {
  const seen = new Set<string>();

  return entityNames
    .map(name => name.trim())
    .filter(name => {
      if (!name) {
        return false;
      }

      const normalized = normalizeEntityId(name);
      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    })
    .map(name => ({
      id: normalizeEntityId(name),
      name,
      lifecycleState: 'pending',
    }));
}

export async function parseWorkbookForConversion(file: File): Promise<ParsedWorkbookData> {
  const workbookData = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(workbookData, { type: 'array', cellDates: true });
  const templateSheetNames: string[] = [];
  const dataSheetNames: string[] = [];
  const worksheetRowsByName = new Map<string, ExcelRow[]>();
  const templateRowsByName = new Map<string, MappingRule[]>();

  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return;
    }

    const templateRows = parseTemplateWorksheetRows(worksheet);
    if (templateRows) {
      templateRowsByName.set(sheetName, templateRows);
      templateSheetNames.push(sheetName);
      return;
    }

    const rows = parseWorksheetRows<ExcelRow>(worksheet);
    worksheetRowsByName.set(sheetName, rows);

    dataSheetNames.push(sheetName);
  });

  const excelData: Record<string, ExcelRow[]> = {};
  const mappingConfigs: Record<string, MappingRule[]> = {};
  const entityDataSheetNames: Record<string, string> = {};

  if (templateSheetNames.length > 0) {
    const unusedDataSheetNames = new Set(dataSheetNames);

    templateSheetNames.forEach((templateSheetName, index) => {
      const rules = templateRowsByName.get(templateSheetName) ?? [];
      const availableDataSheetNames = dataSheetNames.filter(sheetName => unusedDataSheetNames.has(sheetName));
      const rankedDataSheetName = findMatchingDataSheet(templateSheetName, availableDataSheetNames);
      const fallbackDataSheetName = availableDataSheetNames[index] ?? availableDataSheetNames[0] ?? null;
      const dataSheetName = rankedDataSheetName ?? fallbackDataSheetName;

      mappingConfigs[templateSheetName] = rules;
      entityDataSheetNames[templateSheetName] = dataSheetName ?? '';
      excelData[templateSheetName] = dataSheetName
        ? (worksheetRowsByName.get(dataSheetName) ?? [])
        : [];

      if (dataSheetName) {
        unusedDataSheetNames.delete(dataSheetName);
      }
    });

    return {
      entityNames: templateSheetNames,
      excelData,
      mappingConfigs,
      entityDataSheetNames,
    };
  }

  const entityNames = workbook.SheetNames.filter(name => !name.toLowerCase().includes('sheet'));
  const finalEntityNames = entityNames.length > 0 ? entityNames : workbook.SheetNames;

  finalEntityNames.forEach(entityName => {
    const rows = worksheetRowsByName.get(entityName) ?? [];
    mappingConfigs[entityName] = rows as MappingRule[];
    excelData[entityName] = rows;
    entityDataSheetNames[entityName] = entityName;
  });

  return {
    entityNames: finalEntityNames,
    excelData,
    mappingConfigs,
    entityDataSheetNames,
  };
}

export function buildDatContent(sheetData: ExcelRow[], sheetConfig: MappingRule[]): string {
  if (sheetConfig.length === 0) {
    throw new Error('No configuration rules available for this sheet.');
  }

  const aLine = getSortedRulesByPrefix(sheetConfig, 'A')
    .map(rule => {
      if (!isNullLikeValue(rule.HDL)) {
        return String(rule.HDL).trim();
      }
      return typeof rule.InputColumnName === 'string' ? rule.InputColumnName : '';
    })
    .join('|');

  const bRules = getSortedRulesByPrefix(sheetConfig, 'B');
  const bLines = sheetData.map(row => {
    const headerLookup = createHeaderLookup(row);

    return bRules
      .map(rule => {
        if (!isNullLikeValue(rule.HDL)) {
          return String(rule.HDL).trim();
        }

        const inputColumnName = typeof rule.InputColumnName === 'string' ? rule.InputColumnName.trim() : '';
        if (!inputColumnName) {
          return '';
        }

        const value = resolveRowValue(row, headerLookup, inputColumnName);
        return value === null || value === undefined ? '' : String(value).trim();
      })
      .join('|');
  });

  return [aLine, ...bLines].join('\n');
}

export async function downloadEntityArchive(entityName: string, datContent: string): Promise<void> {
  const archive = buildStoredZipBlob(`${entityName}.dat`, datContent);
  const url = URL.createObjectURL(archive);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${entityName}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
