import type { ImportFile, ImportedTransaction, ImportSource, MovementDirection, SheetKind } from "../types";
import { matchesKind, normalizeDate, parseMoney } from "./parser-utils";

type BruteforceInput = {
  bankName?: string;
  content: string;
  file: ImportFile;
  kind: SheetKind;
  source: ImportSource;
};

type ParsedLine = {
  balance?: number;
  confidence: number;
  date: string;
  debitCredit?: string;
  description: string;
  direction: MovementDirection;
  document?: string;
  line: string;
  value: number;
};

const MONEY_PATTERN = /(?:[+-]\s*)?(?:R\$\s*)?(?:[+-]\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\s*[CD]?|(?:[+-]\s*)?(?:R\$\s*)?(?:[+-]\s*)?\d+\.\d{2}\s*[CD]?/gi;
const NUMERIC_DATE_PATTERN = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}-\d{1,2}-\d{2,4}|\d{4}-\d{2}-\d{2})\b/i;
const SHORT_MONTH_DATE_PATTERN = /\b(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{2,4})\b/i;
const LONG_MONTH_DATE_PATTERN =
  /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\b/i;
const DATE_TIME_PREFIX_PATTERN = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+\d{1,2}:\d{2}(?::\d{2})?\s+/;
const DATE_HEADING_PATTERN = new RegExp(`^(?:${LONG_MONTH_DATE_PATTERN.source}|${SHORT_MONTH_DATE_PATTERN.source}|${NUMERIC_DATE_PATTERN.source})\\b`, "i");

export function parseStatementByBruteforce({ bankName, content, file, kind, source }: BruteforceInput): ImportedTransaction[] {
  const parsedLines = parseTextLines(content);

  return parsedLines
    .filter((line) => matchesKind(line.direction, kind))
    .map((line, index) => ({
      id: `${file.id}-${source}-bruteforce-${index}`,
      source,
      fileName: file.name,
      kind,
      direction: line.direction,
      date: line.date,
      person: line.description || `Lancamento ${source.toUpperCase()} ${index + 1}`,
      bank: bankName || file.name.replace(/\.(pdf|csv|ofx)$/i, "") || "Banco nao informado",
      grossValue: Math.abs(line.value),
      netValue: Math.abs(line.value),
      document: line.document ?? "",
      interest: 0,
      fine: 0,
      discount: 0,
      complements: [line.line, line.debitCredit ?? "", line.balance ? `Saldo ${line.balance}` : ""].filter(Boolean),
      origin: source.toUpperCase() as ImportedTransaction["origin"],
      raw: {
        balance: line.balance,
        confidence: line.confidence,
        debitCredit: line.debitCredit,
        importStrategy: "bruteforce",
        line: line.line
      }
    }));
}

function parseTextLines(content: string): ParsedLine[] {
  const defaultYear = inferStatementYear(content);
  const baseLines = content
    .split(/\r?\n/)
    .flatMap(splitPossibleDelimitedLine)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const contextualLines = buildContextualLines(baseLines, defaultYear);
  const candidateBase = [...baseLines, ...contextualLines];
  const candidateLines = [...candidateBase, ...buildLineWindows(candidateBase)];
  const uniqueLines = Array.from(new Set(candidateLines));

  const parsedLines = uniqueLines
    .map((line) => parseLine(line, defaultYear))
    .filter((line): line is ParsedLine => Boolean(line));

  return deduplicateParsedLines(parsedLines);
}

function buildLineWindows(lines: string[]) {
  const windows: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!findDate(lines[index]) || hasMoney(lines[index])) {
      continue;
    }

    const parts = [lines[index]];
    for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 7); nextIndex += 1) {
      if (findDate(lines[nextIndex]) && !hasMoney(lines[nextIndex])) {
        break;
      }

      parts.push(lines[nextIndex]);

      if (hasMoney(lines[nextIndex])) {
        windows.push(parts.join(" "));
        break;
      }
    }
  }

  return windows;
}

function buildContextualLines(lines: string[], defaultYear?: string) {
  const contextualLines: string[] = [];
  let currentDate = "";
  let currentDirectionHint: "credito" | "debito" | "" = "";

  for (const line of lines) {
    const dateMatch = findDate(line, defaultYear);
    const directionHint = detectSectionDirection(line);

    if (dateMatch && isDateContextLine(line, dateMatch.text)) {
      currentDate = dateMatch.normalized;
    }

    if (directionHint) {
      currentDirectionHint = directionHint;
    }

    if (!currentDate || dateMatch || !hasMoney(line) || looksLikeNonTransactionContext(line)) {
      continue;
    }

    contextualLines.push(`${currentDate} ${line}${currentDirectionHint ? ` ${currentDirectionHint}` : ""}`);
  }

  return contextualLines;
}

function deduplicateParsedLines(lines: ParsedLine[]) {
  const bestLineByKey = new Map<string, ParsedLine>();

  for (const line of lines) {
    const key = [
      line.date,
      Math.abs(line.value).toFixed(2),
      normalizeComparableText(line.description).slice(0, 80)
    ].join("|");
    const current = bestLineByKey.get(key);

    if (!current || line.confidence > current.confidence || line.line.length < current.line.length) {
      bestLineByKey.set(key, line);
    }
  }

  return Array.from(bestLineByKey.values());
}

function splitPossibleDelimitedLine(line: string) {
  const delimiter = pickDelimiter(line);
  if (!delimiter) {
    return [line];
  }

  return [line.split(delimiter).map((part) => part.trim()).join(" ")];
}

function pickDelimiter(line: string) {
  const semicolonCount = (line.match(/;/g) ?? []).length;
  const tabCount = (line.match(/\t/g) ?? []).length;
  const commaCount = (line.match(/,/g) ?? []).length;

  if (semicolonCount >= 3) {
    return ";";
  }

  if (tabCount >= 3) {
    return "\t";
  }

  if (commaCount >= 4) {
    return ",";
  }

  return "";
}

const EXCLUDED_PHRASES_PATTERN = /\b(?:saldo\s+(?:anterior|atual|final|do\s+dia|em\s+conta|disponivel|devedor|credor|projetado)|total\s+(?:das?\s+)?(?:entradas|saidas|debitos?|creditos?|lancamentos?|tarifas)|totalizador|limite\s+(?:de\s+credito|da\s+conta)|juros\s+acumulados|resumo\s+(?:de\s+vendas|do\s+periodo))\b/i;

function parseLine(line: string, defaultYear?: string): ParsedLine | null {
  if (EXCLUDED_PHRASES_PATTERN.test(line)) {
    return null;
  }

  const dateMatch = findDate(line, defaultYear);
  const moneyMatches = findMoneyValues(line);

  if (!dateMatch || moneyMatches.length === 0) {
    return null;
  }

  const valueText = chooseTransactionValue(line, moneyMatches);
  const value = parseMoney(valueText);

  if (!value) {
    return null;
  }

  const debitCredit = detectDebitCredit(line, valueText, value);
  const direction = inferDirection(value, debitCredit);
  const balance = moneyMatches.length > 1 ? parseMoney(moneyMatches.at(-1)) : undefined;
  const document = line.match(/\b(?:doc|documento|fitid|id)[:\s-]*([A-Z0-9./-]{4,})\b/i)?.[1];
  const description = cleanupDescription(line, dateMatch.text, valueText);
  const confidence = scoreParsedLine(line, moneyMatches, Boolean(debitCredit), Boolean(balance));

  if (!description || description.length < 2 || /^\d+$/.test(description.replace(/[\s./-]/g, ""))) {
    return null;
  }

  return {
    balance,
    confidence,
    date: dateMatch.normalized,
    debitCredit,
    description,
    direction,
    document,
    line,
    value
  };
}

function findDate(line: string, defaultYear?: string) {
  const numericDate = line.match(NUMERIC_DATE_PATTERN);
  if (numericDate) {
    const value = numericDate[1];
    const normalized = value.split(/[/-]/).length === 2 && defaultYear ? normalizeDate(`${value}/${defaultYear}`) : normalizeDate(value);
    return { text: value, normalized };
  }

  const shortMonthDate = line.match(SHORT_MONTH_DATE_PATTERN);
  if (shortMonthDate) {
    return {
      text: shortMonthDate[0],
      normalized: normalizeDate(`${shortMonthDate[1]}/${monthToNumber(shortMonthDate[2])}/${shortMonthDate[3]}`)
    };
  }

  const longMonthDate = line.match(LONG_MONTH_DATE_PATTERN);
  if (longMonthDate) {
    return {
      text: longMonthDate[0],
      normalized: normalizeDate(`${longMonthDate[1]}/${monthToNumber(longMonthDate[2])}/${longMonthDate[3]}`)
    };
  }

  return null;
}

function isDateContextLine(line: string, dateText: string) {
  const trimmedLine = line.trim();
  return trimmedLine.startsWith(dateText) || DATE_HEADING_PATTERN.test(trimmedLine);
}

function findMoneyValues(line: string) {
  return Array.from(line.matchAll(MONEY_PATTERN)).map((match) => match[0].trim());
}

function hasMoney(line: string) {
  MONEY_PATTERN.lastIndex = 0;
  return MONEY_PATTERN.test(line);
}

function chooseTransactionValue(line: string, moneyMatches: string[]) {
  const markedValue = moneyMatches.find((value) => detectValueMarker(line, value));
  if (markedValue) {
    return markedValue;
  }

  if (hasDebitMarker(line)) {
    const debitValue = moneyMatches.find((value) => parseMoney(value) < 0);
    if (debitValue) {
      return debitValue;
    }
  }

  if (hasCreditMarker(line)) {
    const creditValue = moneyMatches.find((value) => parseMoney(value) > 0);
    if (creditValue) {
      return creditValue;
    }
  }

  return moneyMatches.find((value) => parseMoney(value) !== 0) ?? moneyMatches[0];
}

function detectDebitCredit(line: string, valueText: string, value: number) {
  const valueMarker = detectValueMarker(line, valueText);
  if (valueMarker) {
    return valueMarker;
  }

  if (hasDebitMarker(line)) {
    return "debito";
  }

  if (hasCreditMarker(line)) {
    return "credito";
  }

  if (value < 0) {
    return "debito";
  }

  return "credito";
}

function hasDebitMarker(line: string) {
  return /\b(debito|d[eé]bito|debit|saida|sa[ií]das|pagamento|pagto|pix enviado|transfer[eê]ncia enviada|tarifa|iof|juros|compra|anuidade|boleto pago)\b/i.test(line);
}

function hasCreditMarker(line: string) {
  return /\b(credito|cr[eé]dito|credit|entrada|entradas|recebimento|recebido|pix recebido|dep[oó]sito|deposito|valor adicionado|cobran[çc]a recebida)\b/i.test(line);
}

function detectValueMarker(line: string, valueText: string): "credito" | "debito" | "" {
  const valueIndex = line.indexOf(valueText);
  const prefix = valueIndex >= 0 ? line.slice(Math.max(0, valueIndex - 6), valueIndex) : "";
  const suffix = valueIndex >= 0 ? line.slice(valueIndex + valueText.length, valueIndex + valueText.length + 6) : "";

  if (/-\s*(?:R\$)?\s*$/i.test(prefix) || /^\s*D\b/i.test(suffix)) {
    return "debito";
  }

  if (/\+\s*(?:R\$)?\s*$/i.test(prefix) || /^\s*C\b/i.test(suffix)) {
    return "credito";
  }

  return "";
}

function inferDirection(value: number, debitCredit?: string): MovementDirection {
  if (debitCredit === "debito") {
    return "outflow";
  }

  if (debitCredit === "credito") {
    return "inflow";
  }

  return value < 0 ? "outflow" : "inflow";
}

function cleanupDescription(line: string, dateText: string, valueText: string) {
  return line
    .replace(DATE_TIME_PREFIX_PATTERN, "")
    .replace(dateText, "")
    .replace(valueText, "")
    .replace(/\b(?:R\$|BRL|credito|cr[eé]dito|debito|d[eé]bito|entrada|saida|pagamento|recebimento)\b/gi, "")
    .replace(/\b(?:saldo\s+por\s+transa[cç][aã]o|saldo\s+do\s+dia|saldo\s+c\/c)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[|;,\-\s]+|[|;,\-\s]+$/g, "")
    .trim();
}

function detectSectionDirection(line: string): "credito" | "debito" | "" {
  if (/\btotal\s+de\s+entradas\b|\bentradas\s*\(cr[eé]ditos\)/i.test(line)) {
    return "credito";
  }

  if (/\btotal\s+de\s+sa[ií]das\b|\bsa[ií]das\s*\(d[eé]bitos\)/i.test(line)) {
    return "debito";
  }

  return "";
}

function looksLikeNonTransactionContext(line: string) {
  return (
    DATE_HEADING_PATTERN.test(line) ||
    /\b(?:saldo\s+(?:do\s+dia|anterior|inicial|final|total|dispon[ií]vel|bloqueado)|total\s+de\s+(?:entradas|sa[ií]das))\b/i.test(line)
  );
}

function scoreParsedLine(line: string, moneyMatches: string[], hasDirectionMarker: boolean, hasBalance: boolean) {
  let score = 0.45;

  if (hasDirectionMarker) {
    score += 0.2;
  }

  if (hasBalance) {
    score += 0.1;
  }

  if (moneyMatches.length === 1) {
    score += 0.1;
  }

  if (/\b(?:pix|ted|doc|boleto|tarifa|compra|receb|pag|transf|dep[oó]sito|deposito)\b/i.test(line)) {
    score += 0.15;
  }

  return Math.min(score, 1);
}

function normalizeComparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, "0")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function inferStatementYear(content: string) {
  const periodMatch = content.match(/\b\d{1,2}[/-]\d{1,2}[/-](\d{4})\b/);
  if (periodMatch?.[1]) {
    return periodMatch[1];
  }

  const generalYearMatch = content.match(/\b(20\d{2})\b/);
  if (generalYearMatch?.[1]) {
    return generalYearMatch[1];
  }

  return String(new Date().getFullYear());
}

function monthToNumber(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const months: Record<string, string> = {
    jan: "01",
    janeiro: "01",
    fev: "02",
    fevereiro: "02",
    mar: "03",
    marco: "03",
    abr: "04",
    abril: "04",
    mai: "05",
    maio: "05",
    jun: "06",
    junho: "06",
    jul: "07",
    julho: "07",
    ago: "08",
    agosto: "08",
    set: "09",
    setembro: "09",
    out: "10",
    outubro: "10",
    nov: "11",
    novembro: "11",
    dez: "12",
    dezembro: "12"
  };

  return months[normalized] ?? "01";
}
