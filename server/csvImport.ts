import { z } from "zod";
import type { RiskInput } from "./riskEngine";

export const CSV_IMPORT_COLUMNS = [
  "reference",
  "amount",
  "merchantCategory",
  "transactionCountry",
  "accountCountry",
  "deviceStatus",
  "transactionHour",
  "recentTransactionCount",
] as const;

const rowSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  merchantCategory: z.string().trim().min(2).max(80),
  transactionCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/),
  accountCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/),
  deviceStatus: z.enum(["known", "new"]),
  transactionHour: z.number().int().min(0).max(23),
  recentTransactionCount: z.number().int().min(0).max(50),
});

const columnAliases: Record<string, (typeof CSV_IMPORT_COLUMNS)[number]> = {
  reference: "reference",
  transactionreference: "reference",
  amount: "amount",
  merchantcategory: "merchantCategory",
  merchant_category: "merchantCategory",
  transactioncountry: "transactionCountry",
  transaction_country: "transactionCountry",
  accountcountry: "accountCountry",
  account_country: "accountCountry",
  devicestatus: "deviceStatus",
  device_status: "deviceStatus",
  transactionhour: "transactionHour",
  transaction_hour: "transactionHour",
  recenttransactioncount: "recentTransactionCount",
  recent_transaction_count: "recentTransactionCount",
};

export type CsvImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type CsvImportCandidate = {
  row: number;
  reference: string;
  input: RiskInput;
};

export type ParsedCsvImport = {
  totalRows: number;
  candidates: CsvImportCandidate[];
  errors: CsvImportRowError[];
};

function normaliseHeader(header: string) {
  return header.trim().replace(/^\uFEFF/, "").replace(/[\s-]/g, "").toLowerCase();
}

function parseCsvTable(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (inQuotes) throw new Error("The CSV contains an unclosed quoted value.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseNumber(value: string) {
  if (!value.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return Number.NaN;
  return Number(value);
}

function parseInteger(value: string) {
  if (!/^-?\d+$/.test(value.trim())) return Number.NaN;
  return Number(value);
}

export function parseCsvImport(content: string): ParsedCsvImport {
  const errors: CsvImportRowError[] = [];
  let table: string[][];
  try {
    table = parseCsvTable(content);
  } catch (error) {
    return { totalRows: 0, candidates: [], errors: [{ row: 1, field: "file", message: error instanceof Error ? error.message : "The CSV could not be parsed." }] };
  }
  if (table.length < 2) {
    return { totalRows: 0, candidates: [], errors: [{ row: 1, field: "file", message: "The CSV must contain a header row and at least one transaction row." }] };
  }

  const rawHeaders = table[0] ?? [];
  const headerIndex = new Map<(typeof CSV_IMPORT_COLUMNS)[number], number>();
  rawHeaders.forEach((header, index) => {
    const mapped = columnAliases[normaliseHeader(header)];
    if (mapped && !headerIndex.has(mapped)) headerIndex.set(mapped, index);
  });
  const missingColumns = CSV_IMPORT_COLUMNS.filter((column) => !headerIndex.has(column));
  if (missingColumns.length) {
    return { totalRows: table.length - 1, candidates: [], errors: missingColumns.map((column) => ({ row: 1, field: column, message: `Missing required column: ${column}.` })) };
  }

  const candidates: CsvImportCandidate[] = [];
  for (let index = 1; index < table.length; index += 1) {
    const row = table[index]!;
    const rowNumber = index + 1;
    const field = (column: (typeof CSV_IMPORT_COLUMNS)[number]) => row[headerIndex.get(column)!] ?? "";
    const rawReference = field("reference").trim();
    const reference = rawReference.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(reference)) {
      errors.push({ row: rowNumber, field: "reference", message: "Reference must be 3–32 characters using letters, numbers, hyphens, or underscores." });
      continue;
    }

    const parsed = rowSchema.safeParse({
      amount: parseNumber(field("amount")),
      merchantCategory: field("merchantCategory"),
      transactionCountry: field("transactionCountry").toUpperCase(),
      accountCountry: field("accountCountry").toUpperCase(),
      deviceStatus: field("deviceStatus").toLowerCase(),
      transactionHour: parseInteger(field("transactionHour")),
      recentTransactionCount: parseInteger(field("recentTransactionCount")),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNumber, field: String(issue.path[0] ?? "row"), message: issue.message });
      }
      continue;
    }
    candidates.push({ row: rowNumber, reference, input: parsed.data });
  }

  return { totalRows: table.length - 1, candidates, errors };
}

export function csvTemplate() {
  return `${CSV_IMPORT_COLUMNS.join(",")}\nFRD-IMPORT-001,279.99,electronics,US,US,new,2,4\n`;
}
