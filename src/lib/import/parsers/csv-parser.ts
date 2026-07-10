import type { ImportFile, ImportedTransaction, LayoutIdentificationResult, SheetKind, SheetMappings, StatementLayoutFieldMapping } from "../../types";
import { parseStatementByBruteforce } from "../bruteforce-importer";
import type { BankStatementParser } from "../importer-types";
import { normalizeDate, parseMoney } from "../parser-utils";

const CSV_ORIGIN = "CSV" as const;

export const csvStatementParser: BankStatementParser = {
  source: "csv",
  parse(file, context) {
    try {
      const layoutMappings = toSheetMappings(context.identification?.layout?.fieldMapping);
      return readCsvTransactions(file, context.kind, layoutMappings ?? context.config.csv[context.kind], context.identification);
    } catch (error) {
      return {
        transactions: [],
        errors: [`${file.name}: Erro de leitura ao processar o arquivo CSV. ${error instanceof Error ? error.message : "Erro desconhecido"}`]
      };
    }
  }
};

function readCsvTransactions(file: ImportFile, kind: SheetKind, mappings: SheetMappings, identification?: LayoutIdentificationResult) {
  const content = file.content ?? "";
  const errors: string[] = [];
  const transactions: ImportedTransaction[] = [];

  // Check if file is empty
  if (!content.trim()) {
    return {
      transactions,
      errors: [`${file.name}: Arquivo vazio ou sem conteudo para leitura.`]
    };
  }

  // Check if file contains binary data (null bytes) which indicates an invalid format
  if (content.includes("\u0000")) {
    return {
      transactions,
      errors: [`${file.name}: Arquivo invalido ou formato nao suportado (contem dados binarios e nao parece ser um CSV de texto).`]
    };
  }

  const rows = parseCsv(content);

  if (rows.length === 0) {
    return {
      transactions,
      errors: [`${file.name}: Arquivo CSV nao possui linhas validas ou sem conteudo para leitura.`]
    };
  }

  // Validate mandatory mapping configuration
  const requiredFieldsMissingInConfig: string[] = [];
  if (!mappings?.date) requiredFieldsMissingInConfig.push("Data");
  if (!mappings?.person) requiredFieldsMissingInConfig.push("Descricao/Pessoa");
  if (!mappings?.grossValue && !mappings?.netValue) requiredFieldsMissingInConfig.push("Valor");

  if (requiredFieldsMissingInConfig.length > 0) {
    return {
      transactions,
      errors: [`${file.name}: Colunas obrigatorias ausentes na parametrizacao (${requiredFieldsMissingInConfig.join(", ")}).`]
    };
  }

  const dateIndex = columnToIndex(mappings.date);
  const personIndex = columnToIndex(mappings.person);
  const grossValueIndex = columnToIndex(mappings.grossValue);
  const netValueIndex = columnToIndex(mappings.netValue);

  const indexesToCheck = [dateIndex, personIndex, grossValueIndex, netValueIndex].filter((idx) => idx >= 0);
  const maxRequiredIndex = Math.max(...indexesToCheck);

  // Find the maximum columns in any row
  const maxActualColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);

  if (maxActualColumns <= maxRequiredIndex) {
    const missingColumnName = indexToColumnName(maxRequiredIndex);
    return {
      transactions,
      errors: [
        `${file.name}: Colunas obrigatorias ausentes ou delimitador incorreto. ` +
        `O mapeamento configurado espera a ${missingColumnName}, mas o arquivo possui apenas ${maxActualColumns} coluna(s). ` +
        `Verifique se o delimitador (virgula, ponto e virgula ou tabulacao) esta correto.`
      ]
    };
  }

  rows.forEach((row, rowIndex) => {
    const person = getMappedValue(row, mappings.person);
    const date = normalizeDate(getMappedValue(row, mappings.date));
    const bank = getMappedValue(row, mappings.bank);
    const grossValue = parseMoney(getMappedValue(row, mappings.grossValue));
    const netValue = parseMoney(getMappedValue(row, mappings.netValue)) || grossValue;
    const direction = kind === "payments" ? "outflow" : "inflow";

    if (rowIndex === 0 && looksLikeHeader(row)) {
      return;
    }

    if (!person || !date || netValue === 0) {
      return;
    }

    transactions.push({
      id: `${file.id}-csv-${rowIndex}`,
      source: "csv",
      fileName: file.name,
      kind,
      direction,
      date,
      person,
      bank: bank || identification?.layout?.bankName || "Banco nao informado",
      grossValue: Math.abs(grossValue || netValue),
      netValue: Math.abs(netValue),
      document: getMappedValue(row, mappings.document),
      interest: Math.abs(parseMoney(getMappedValue(row, mappings.interest))),
      fine: Math.abs(parseMoney(getMappedValue(row, mappings.fine))),
      discount: Math.abs(parseMoney(getMappedValue(row, mappings.discount))),
      complements: [mappings.extraOne, mappings.extraTwo, mappings.extraThree].map((column) => getMappedValue(row, column)).filter(Boolean),
      origin: CSV_ORIGIN,
      raw: {
        identificationStrategy: identification?.strategy,
        layoutConfidence: identification?.confidence,
        layoutId: identification?.layout?.id,
        row
      }
    });
  });

  if (transactions.length === 0) {
    const bruteForceTransactions = parseStatementByBruteforce({
      bankName: identification?.layout?.bankName,
      content,
      file,
      kind,
      source: "csv"
    });

    if (bruteForceTransactions.length > 0) {
      return {
        transactions: bruteForceTransactions,
        errors: [`${file.name}: Leitura por forca bruta aplicada porque o layout/mapeamento nao encontrou lancamentos.`]
      };
    }

    errors.push(`${file.name}: Nenhum lancamento de ${kind === "payments" ? "saida" : "entrada"} encontrado no CSV.`);
  }

  return { transactions, errors };
}

function parseCsv(content: string) {
  const normalizedContent = content.replace(/^\uFEFF/, "").trim();
  if (!normalizedContent) {
    return [];
  }

  const delimiter = pickDelimiter(normalizedContent);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < normalizedContent.length; index += 1) {
    const char = normalizedContent[index];
    const nextChar = normalizedContent[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  rows.push(row);

  // Treat empty lines: skip lines where every cell is blank
  return rows.filter((currentRow) => currentRow.some((cell) => cell.trim() !== ""));
}

function pickDelimiter(content: string) {
  const lines = content.split(/\r?\n/).slice(0, 10).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return ";";
  }

  let totalSemicolons = 0;
  let totalCommas = 0;
  let totalTabs = 0;

  for (const line of lines) {
    totalSemicolons += (line.match(/;/g) ?? []).length;
    totalCommas += (line.match(/,/g) ?? []).length;
    totalTabs += (line.match(/\t/g) ?? []).length;
  }

  const max = Math.max(totalSemicolons, totalCommas, totalTabs);
  if (max === 0) {
    return ";"; // Default fallback
  }

  if (max === totalSemicolons) {
    return ";";
  }
  if (max === totalCommas) {
    return ",";
  }
  return "\t";
}

function getMappedValue(row: string[], column: string | undefined) {
  const index = columnToIndex(column);
  if (index < 0) {
    return "";
  }

  return row[index]?.trim() ?? "";
}

function columnToIndex(column: string | undefined) {
  if (!column) {
    return -1;
  }

  const match = column.match(/Coluna\s+([A-Z])/i);
  if (!match) {
    return -1;
  }

  return match[1].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
}

function indexToColumnName(index: number): string {
  return `Coluna ${String.fromCharCode("A".charCodeAt(0) + index)}`;
}

function looksLikeHeader(row: string[]) {
  return row.some((value) => /data|valor|fornecedor|cliente|documento|banco/i.test(value));
}

function toSheetMappings(fieldMapping: StatementLayoutFieldMapping | undefined): SheetMappings | null {
  if (!fieldMapping) {
    return null;
  }

  return {
    bank: fieldMapping.bank ?? "",
    date: fieldMapping.date ?? "",
    discount: "",
    document: fieldMapping.document ?? "",
    extraOne: fieldMapping.extraOne ?? fieldMapping.debitCredit ?? "",
    extraThree: fieldMapping.extraThree ?? fieldMapping.balance ?? "",
    extraTwo: fieldMapping.extraTwo ?? "",
    fine: "",
    grossValue: fieldMapping.value ?? "",
    interest: "",
    netValue: fieldMapping.value ?? "",
    person: fieldMapping.description ?? ""
  };
}
