export type CsvCell = string | number;
export function encodeCsv(headers: string[], rows: CsvCell[][]) {
  const cell = (value: CsvCell) => {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('CSV에는 유한한 숫자가 필요합니다.');
    const raw = String(value);
    const text =
      typeof value === 'string' &&
      !/^-?\d+$/.test(raw) &&
      (/^\s*[=+\-@]/.test(raw) || /^[\t\r\n]/.test(raw))
        ? `'${raw}`
        : raw;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\ufeff' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
