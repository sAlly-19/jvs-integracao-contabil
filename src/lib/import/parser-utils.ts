import type { BankOrigin, EntityId, ImportFile, ImportedTransaction, MovementDirection, PendingMapping } from "../types";

export function parseMoney(value: string | undefined) {
  if (!value) {
    return 0;
  }

  let cleaned = value.trim().replace(/\s/g, "");
  // Detect if negative (starts with -, ends with -, contains (-), wrapped in parens, or ends with D)
  const isNegative =
    cleaned.startsWith("-") ||
    cleaned.endsWith("-") ||
    cleaned.includes("(-") ||
    /^R\$\-/i.test(cleaned) ||
    /^R\$\s*-/i.test(value.trim()) ||
    (cleaned.startsWith("(") && cleaned.endsWith(")")) ||
    /[0-9]+,[0-9]{2}D$/i.test(cleaned) ||
    /[0-9]+\.[0-9]{2}D$/i.test(cleaned);

  const normalized = cleaned
    .replace(/R\$/gi, "")
    .replace(/[CD\-()]/gi, "")
    .replace(/^\+/, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsedValue = Number.parseFloat(normalized);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return isNegative ? -Math.abs(parsedValue) : Math.abs(parsedValue);
}

export function normalizeDate(value: string | undefined) {
  if (!value) {
    return "";
  }

  const compactDate = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactDate) {
    return `${compactDate[3]}/${compactDate[2]}/${compactDate[1]}`;
  }

  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  }

  const dateParts = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dateParts) {
    const year = dateParts[3].length === 2 ? `20${dateParts[3]}` : dateParts[3];
    return `${dateParts[1].padStart(2, "0")}/${dateParts[2].padStart(2, "0")}/${year}`;
  }

  return value;
}

export function getDirection(amount: number): MovementDirection {
  return amount < 0 ? "outflow" : "inflow";
}

export function matchesKind(direction: MovementDirection, kind: "payments" | "receipts") {
  return kind === "payments" ? direction === "outflow" : direction === "inflow";
}

export function buildBatchId(companyId: EntityId, files: ImportFile[]) {
  const signatures = files.map((file) => file.signature).filter(Boolean).sort().join("-");
  return signatures ? `${companyId}-${signatures.slice(0, 18)}` : `${companyId}-${Date.now()}`;
}

export function buildPendingMappings(transactions: ImportedTransaction[]): PendingMapping[] {
  const groupedMappings = new Map<string, ImportedTransaction[]>();

  for (const transaction of transactions) {
    const key = `${transaction.origin}-${transaction.person}`;
    groupedMappings.set(key, [...(groupedMappings.get(key) ?? []), transaction]);
  }

  return Array.from(groupedMappings.values()).map((items, index) => ({
    id: index + 1,
    supplier: items[0].person,
    origin: formatOriginLabel(items[0].origin),
    transactionIds: items.map((item) => item.id),
    amount: items.reduce((total, item) => total + item.netValue, 0)
  }));
}

export function buildBankOrigins(transactions: ImportedTransaction[]): BankOrigin[] {
  const groupedBanks = new Map<string, ImportedTransaction[]>();

  for (const transaction of transactions) {
    const key = `${transaction.origin}-${transaction.bank}`;
    groupedBanks.set(key, [...(groupedBanks.get(key) ?? []), transaction]);
  }

  return Array.from(groupedBanks.values()).map((items, index) => ({
    id: index + 1,
    bank: items[0].bank,
    origin: formatOriginLabel(items[0].origin),
    transactionIds: items.map((item) => item.id)
  }));
}

function formatOriginLabel(origin: ImportedTransaction["origin"]) {
  if (origin === "OFX" || origin === "PDF") {
    return "EXTRATO";
  }

  return "PLANILHA";
}
