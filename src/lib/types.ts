export type EntityId = string | number;

export type Company = {
  id: EntityId;
  code: string;
  name: string;
  document: string;
  nickname: string;
  lastProcess: string;
  mode?: "Customizada" | "Simples";
  taxation: TaxationType;
};

export type TaxationType = "Lucro Real" | "Lucro Presumido" | "Simples Nacional" | "Imunes/Isentas";

export type NewCompany = {
  document: string;
  name: string;
  nickname: string;
  accountingCode: string;
  taxation: TaxationType;
};

export type ModuleId = "files" | "sheets";
export type SheetKind = "payments" | "receipts";
export type ImportStep = "initial" | "processing" | "mapping" | "bankAccount";
export type ImportSource = "ofx" | "csv" | "pdf";
export type MovementDirection = "outflow" | "inflow";
export type StatementLayoutSource = ImportSource;
export type StatementLayoutParserKind = "ofx-universal" | "spreadsheet-simple" | "spreadsheet-layout" | "pdf-layout" | "pdf-bruteforce";

export type MonthlyEntry = {
  month: string;
  value: number;
  tone: "primary" | "dark";
};

export type ModuleItem = {
  id: ModuleId;
  title: string;
  icon: "import" | "sheet";
  descriptionLead: string;
  descriptionBody: string;
};

export type MappingField = {
  id: string;
  label: string;
};

export type SheetMappings = Record<string, string>;
export type CompanySheetConfig = Record<SheetKind, SheetMappings>;
export type SheetConfigByCompany = Record<number, CompanySheetConfig>;

export type ImportFile = {
  id: string | number;
  name: string;
  type: ImportSource;
  content?: string;
  signature?: string;
};

export type PendingMapping = {
  id: string | number;
  supplier: string;
  origin: string;
  transactionIds?: string[];
  amount?: number;
};

export type BankOrigin = {
  id: string | number;
  bank: string;
  origin: string;
  transactionIds?: string[];
};

export type CompanyOfxConfig = Record<SheetKind, number[]>;

export type CompanyImportConfig = {
  companyId: EntityId;
  csv: CompanySheetConfig;
  ofx: CompanyOfxConfig;
};

export type ImportedTransaction = {
  id: string;
  source: ImportSource;
  fileName: string;
  kind: SheetKind;
  direction: MovementDirection;
  date: string;
  person: string;
  bank: string;
  grossValue: number;
  netValue: number;
  document: string;
  interest: number;
  fine: number;
  discount: number;
  complements: string[];
  origin: "CSV" | "OFX" | "PDF";
  raw: Record<string, unknown>;
};

export type StatementBank = {
  id: string;
  name: string;
  aliases: string[];
  supportedSources: StatementLayoutSource[];
};

export type StatementLayoutMatcher = {
  id: string;
  type: "text" | "regex";
  value: string;
  weight: number;
  required?: boolean;
};

export type StatementLayoutFieldMapping = {
  bank?: string;
  date?: string;
  description?: string;
  document?: string;
  value?: string;
  debitCredit?: string;
  balance?: string;
  extraOne?: string;
  extraTwo?: string;
  extraThree?: string;
};

export type StatementLayout = {
  id: string;
  bankId: string;
  bankName: string;
  name: string;
  source: StatementLayoutSource;
  parser: StatementLayoutParserKind;
  version: number;
  enabled: boolean;
  priority: number;
  minimumScore: number;
  matchers: StatementLayoutMatcher[];
  fieldMapping?: StatementLayoutFieldMapping;
  createdAt: string;
  updatedAt: string;
};

export type LayoutIdentificationCandidate = {
  layout: StatementLayout;
  matchedRequired: boolean;
  score: number;
  totalWeight: number;
  confidence: number;
  matchedMatchers: string[];
};

export type LayoutIdentificationResult = {
  layout: StatementLayout | null;
  confidence: number;
  candidates: LayoutIdentificationCandidate[];
  strategy: "layout" | "bruteforce" | "universal";
};

export type ImportBatch = {
  id: string;
  companyId: EntityId;
  kind: SheetKind;
  files: ImportFile[];
  selectedLayoutIds: number[];
  transactions: ImportedTransaction[];
  pendingMappings: PendingMapping[];
  bankOrigins: BankOrigin[];
  errors: string[];
};

export type StoredImportProgress = {
  companyId: EntityId;
  kind: SheetKind;
  step: ImportStep;
  batch: ImportBatch;
  updatedAt: string;
};

export type GeneratedAccountingLine = {
  id: string;
  date: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  history: string;
  historyCode: string;
  document: string;
  person: string;
  bank: string;
  origin: "CSV" | "OFX" | "PDF";
  sourceFile: string;
};

export type GeneratedFile = {
  id: string | number;
  name: string;
  date: string;
  sent: boolean;
  batchId: string;
  kind: SheetKind;
  content: string;
  mimeType: string;
  lineCount: number;
  totalValue: number;
};

export type ProcessedBatch = {
  id: string;
  companyId: EntityId;
  kind: SheetKind;
  generatedAt: string;
  fileName: string;
  lineCount: number;
  totalValue: number;
  sourceFileNames: string[];
  sourceFileHashes?: string[];
  generatedFile: GeneratedFile;
};

export type ExportLayoutColumn = {
  key: string;
  label: string;
  description: string;
  required: boolean;
};

export type AccountPlanEntry = {
  id: string | number;
  account: string;
  reducedAccount?: string;
  synthetic: string;
  classificationCode?: string;
  classification: string;
  nickname: string;
};

export type HistorySegment = {
  text: string;
  fieldLabel: string;
};

export type DefaultHistoryConfig = {
  companyId: EntityId;
  kind: SheetKind;
  historyCode: string;
  historySegments: HistorySegment[];
};

export type IntegrationRule = {
  id: string;
  companyId: EntityId;
  kind: SheetKind;
  type: "simple" | "advanced";
  targetDescription: string;
  searchTokens?: string[];
  accountDebit: string;
  historyCode?: string;
  historySegments?: HistorySegment[];
};
