import chalk from "chalk";

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

  // Calculate column widths
  const widths: number[] = columns.map((col) => {
    const maxDataWidth = rows.reduce((max, row) => {
      const val = String(row[col.key] ?? "");
      return Math.max(max, val.length);
    }, 0);
    return col.width ?? Math.max(col.header.length, maxDataWidth);
  });

  // Build separator
  const sep = "+-" + widths.map((w) => "-".repeat(w)).join("-+-") + "-+";

  // Build header
  const headerCells = columns.map((col, i) =>
    col.header.padEnd(widths[i])
  );
  const headerRow = "| " + headerCells.join(" | ") + " |";

  console.log(chalk.gray(sep));
  console.log(chalk.bold("| " + headerCells.join(" | ") + " |"));
  console.log(chalk.gray(sep));

  // Data rows
  for (const row of rows) {
    const cells = columns.map((col, i) => {
      const val = String(row[col.key] ?? "");
      const padded = val.padEnd(widths[i]);
      return col.color ? col.color(padded) : padded;
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
