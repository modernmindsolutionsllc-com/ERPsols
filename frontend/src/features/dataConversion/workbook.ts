import * as XLSX from 'xlsx';

import type { Entity, ExcelRow, MappingRule, ParsedWorkbookData } from '@/features/dataConversion/types';

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

function buildMockRow(rules: MappingRule[]): ExcelRow {
  return rules.reduce<ExcelRow>((row, rule) => {
    const inputColumnName = typeof rule.InputColumnName === 'string' ? rule.InputColumnName.trim() : '';
    if (inputColumnName && !isNullLikeValue(inputColumnName)) {
      row[inputColumnName] = inputColumnName;
    }
    return row;
  }, {});
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
  const workbook = XLSX.read(workbookData, { type: 'array' });
  const entityNames = workbook.SheetNames.filter(name => !name.toLowerCase().includes('sheet'));
  const finalEntityNames = entityNames.length > 0 ? entityNames : workbook.SheetNames;

  const excelData: Record<string, ExcelRow[]> = {};
  const mappingConfigs: Record<string, MappingRule[]> = {};

  finalEntityNames.forEach(entityName => {
    const worksheet = workbook.Sheets[entityName];
    if (!worksheet) {
      return;
    }

    const rules = XLSX.utils.sheet_to_json<MappingRule>(worksheet, { defval: null });
    mappingConfigs[entityName] = rules;
    excelData[entityName] = [buildMockRow(getSortedRulesByPrefix(rules, 'B'))];
  });

  return {
    entityNames: finalEntityNames,
    excelData,
    mappingConfigs,
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

  const bLines = sheetData.map(row =>
    getSortedRulesByPrefix(sheetConfig, 'B')
      .map(rule => {
        if (!isNullLikeValue(rule.HDL)) {
          return String(rule.HDL).trim();
        }

        const inputColumnName = typeof rule.InputColumnName === 'string' ? rule.InputColumnName : '';
        if (!inputColumnName) {
          return '';
        }

        const value = row[inputColumnName];
        return value === null || value === undefined ? '' : String(value);
      })
      .join('|')
  );

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
