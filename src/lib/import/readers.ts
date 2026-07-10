import type { CompanyImportConfig, EntityId, ImportBatch, ImportFile, ImportedTransaction, SheetKind } from "../types";
import type { ImportParserContext } from "./importer-types";
import { identifyStatementLayout } from "./layout-identification";
import { buildBankOrigins, buildBatchId, buildPendingMappings } from "./parser-utils";
import { getStatementParser } from "./parser-registry";

type ReaderInput = {
  companyId: EntityId;
  kind: SheetKind;
  files: ImportFile[];
  config: CompanyImportConfig;
  selectedLayoutIds: number[];
};

export function createImportBatch({ companyId, config, files, kind, selectedLayoutIds }: ReaderInput): ImportBatch {
  const transactions: ImportedTransaction[] = [];
  const errors: string[] = [];
  const context: ImportParserContext = {
    companyId,
    config,
    kind,
    selectedLayoutIds
  };

  for (const file of files) {
    const parser = getStatementParser(file.type);

    if (!parser) {
      errors.push(`${file.name}: tipo de arquivo nao suportado.`);
      continue;
    }

    const identification = identifyStatementLayout(file.type, file.content ?? "");
    const result = parser.parse(file, {
      ...context,
      identification
    });
    transactions.push(...result.transactions);
    errors.push(...result.errors);

    if (file.type !== "ofx" && identification.strategy === "bruteforce") {
      errors.push(`${file.name}: nenhum layout parametrizado foi identificado; leitura por forca bruta aplicada.`);
    }
  }

  return {
    id: buildBatchId(companyId, files),
    companyId,
    kind,
    files,
    selectedLayoutIds,
    transactions,
    pendingMappings: buildPendingMappings(transactions),
    bankOrigins: buildBankOrigins(transactions),
    errors
  };
}
