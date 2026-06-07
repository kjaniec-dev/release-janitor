import chalk from "chalk";

// Strip ANSI escape codes for accurate string length measurement
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;]*m/g;
function visibleLength(str: string): number {
  return str.replace(ANSI_RE, "").length;
}

// Pad a potentially ANSI-colored string to a visible width
function padEndVisible(str: string, targetWidth: number): string {
  const current = visibleLength(str);
  const padding = Math.max(0, targetWidth - current);
  return str + " ".repeat(padding);
}

export interface Column {
  header: string;
  key: string;
  width?: number;
  color?: (val: string) => string;
}

export function printTable(rows: Record<string, string>[], columns: Column[]): void {
  if (rows.length === 0) {
    console.log(chalk.gray("  (no rows)"));
    return;
  }

  // Calculate column widths based on visible (stripped) lengths
  const widths: number[] = columns.map((col) => {
    const maxDataWidth = rows.reduce((max, row) => {
      const val = String(row[col.key] ?? "");
      return Math.max(max, visibleLength(val));
    }, 0);
    return col.width ?? Math.max(col.header.length, maxDataWidth);
  });

  // Build separator
  const sep = "+-" + widths.map((w) => "-".repeat(w)).join("-+-") + "-+";

  // Build header cells (no ANSI, so plain padEnd is fine)
  const headerCells = columns.map((col, i) =>
    col.header.padEnd(widths[i])
  );

  console.log(chalk.gray(sep));
  console.log(chalk.bold("| " + headerCells.join(" | ") + " |"));
  console.log(chalk.gray(sep));

  // Data rows — pad using visible length so ANSI codes don't skew alignment
  for (const row of rows) {
    const cells = columns.map((col, i) => {
      const val = String(row[col.key] ?? "");
      return padEndVisible(val, widths[i]);
    });
    console.log("| " + cells.join(" | ") + " |");
  }

  console.log(chalk.gray(sep));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${val} ${units[i]}`;
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().slice(0, 10);
}
