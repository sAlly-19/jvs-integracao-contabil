import type { CompanyImportConfig, EntityId, ImportFile, ImportSource, ImportedTransaction, LayoutIdentificationResult, SheetKind } from "../types";

export type ImportParserContext = {
  companyId: EntityId;
  config: CompanyImportConfig;
  identification?: LayoutIdentificationResult;
  kind: SheetKind;
  selectedLayoutIds: number[];
};

export type ImportParserResult = {
  errors: string[];
  transactions: ImportedTransaction[];
};

export type BankStatementParser = {
  source: ImportSource;
  parse: (file: ImportFile, context: ImportParserContext) => ImportParserResult;
};

export function createEmptyParserResult(): ImportParserResult {
  return {
    errors: [],
    transactions: []
  };
}
