import type { Company, DefaultHistoryConfig, GeneratedAccountingLine, GeneratedFile, ImportBatch, ImportedTransaction, IntegrationRule } from "../types";
import { ACCOUNTING_EXPORT_EXTENSION, ACCOUNTING_EXPORT_SEPARATOR, accountingExportHeader } from "./export-layout";
import { matchTransaction } from "./rules-store";

type GenerateAccountingFilesInput = {
  bankAccounts: Record<string, string>;
  batch: ImportBatch;
  company: Company;
  defaultHistory?: DefaultHistoryConfig;
  rules: IntegrationRule[];
};

type GenerateAccountingFilesResult = {
  errors: string[];
  files: GeneratedFile[];
};

const CSV_SEPARATOR = ACCOUNTING_EXPORT_SEPARATOR;

export function generateAccountingFiles({
  bankAccounts,
  batch,
  company,
  defaultHistory,
  rules
}: GenerateAccountingFilesInput): GenerateAccountingFilesResult {
  const errors: string[] = [];
  const lines: GeneratedAccountingLine[] = [];

  for (const transaction of batch.transactions) {
    const rule = matchTransaction(transaction, rules);
    const bankAccount = bankAccounts[transaction.bank]?.trim();

    if (!rule?.accountDebit?.trim()) {
      errors.push(`${transaction.person}: conta contabil de De/Para nao encontrada.`);
      continue;
    }

    if (!bankAccount) {
      errors.push(`${transaction.bank}: conta portador nao informada.`);
      continue;
    }

    lines.push(createAccountingLine(transaction, rule, bankAccount, defaultHistory));
  }

  if (batch.transactions.length === 0) {
    errors.push("Nenhum lancamento valido foi lido para gerar o lote contabil.");
  }

  if (lines.length === 0) {
    return { errors, files: [] };
  }

  const now = new Date();
  const fileName = buildFileName(company, batch, now);
  const content = buildCsvContent(company, batch, lines);
  const totalValue = lines.reduce((total, line) => total + line.amount, 0);

  return {
    errors,
    files: [
      {
        id: now.getTime(),
        name: fileName,
        date: formatDateTime(now),
        sent: false,
        batchId: batch.id,
        kind: batch.kind,
        content,
        mimeType: "text/csv;charset=utf-8",
        lineCount: lines.length,
        totalValue
      }
    ]
  };
}

function createAccountingLine(
  transaction: ImportedTransaction,
  rule: IntegrationRule,
  bankAccount: string,
  defaultHistory?: DefaultHistoryConfig
): GeneratedAccountingLine {
  const mappedAccount = normalizeAccount(rule.accountDebit);
  const portadorAccount = normalizeAccount(bankAccount);
  const isPayment = transaction.direction === "outflow";
  const historyCode = rule.historyCode?.trim() || defaultHistory?.historyCode?.trim() || "";

  return {
    id: transaction.id,
    date: transaction.date,
    debitAccount: isPayment ? mappedAccount : portadorAccount,
    creditAccount: isPayment ? portadorAccount : mappedAccount,
    amount: transaction.netValue,
    history: buildHistory(transaction, rule, defaultHistory),
    historyCode,
    document: transaction.document,
    person: transaction.person,
    bank: transaction.bank,
    origin: transaction.origin,
    sourceFile: transaction.fileName
  };
}

function buildHistory(transaction: ImportedTransaction, rule: IntegrationRule, defaultHistory?: DefaultHistoryConfig) {
  const segments = rule.historySegments?.length ? rule.historySegments : defaultHistory?.historySegments;
  const customHistory = segments
    ?.flatMap((segment) => [segment.text.trim(), segment.fieldLabel ? getTransactionFieldValue(transaction, segment.fieldLabel) : ""])
    .filter(Boolean)
    .join(" ")
    .trim();

  if (customHistory) {
    return customHistory;
  }

  const label = transaction.direction === "outflow" ? "Pagamento" : "Recebimento";
  const document = transaction.document ? ` Doc ${transaction.document}` : "";

  return `${label} - ${transaction.person}${document}`;
}

function getTransactionFieldValue(transaction: ImportedTransaction, fieldLabel: string) {
  const fields: Record<string, string> = {
    Banco: transaction.bank,
    Data: transaction.date,
    Documento: transaction.document,
    Valor: formatMoney(transaction.netValue),
    "Descricao": transaction.person,
    "DescriÃ§Ã£o": transaction.person,
    COMPLEMENTO01: transaction.complements[0] || transaction.bank,
    COMPLEMENTO02: transaction.complements[1] || transaction.bank,
    COMPLEMENTO04: transaction.person
  };

  return fields[fieldLabel] ?? "";
}

function normalizeAccount(account: string) {
  return account.split(" - ")[0]?.trim() || account.trim();
}

function buildCsvContent(company: Company, batch: ImportBatch, lines: GeneratedAccountingLine[]) {
  const header = accountingExportHeader;

  const rows = lines.map((line) => [
    company.code,
    company.name,
    batch.id,
    batch.kind === "payments" ? "pagamentos" : "recebimentos",
    line.date,
    line.debitAccount,
    line.creditAccount,
    formatMoney(line.amount),
    line.history,
    line.historyCode,
    line.document,
    line.person,
    line.bank,
    line.origin,
    line.sourceFile
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsvValue).join(CSV_SEPARATOR)).join("\r\n");
}

function escapeCsvValue(value: string | number) {
  const text = String(value ?? "");
  if (text.includes(CSV_SEPARATOR) || text.includes("\"") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function formatMoney(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function buildFileName(company: Company, batch: ImportBatch, date: Date) {
  const companyCode = sanitizeFilePart(company.code || String(company.id));
  const kind = batch.kind === "payments" ? "pagamentos" : "recebimentos";
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");

  return `lote_contabil_${companyCode}_${kind}_${stamp}.${ACCOUNTING_EXPORT_EXTENSION}`;
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}
