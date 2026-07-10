import type { StatementBank, StatementLayout, StatementLayoutSource } from "../types";
import { supportedStatementBanks } from "./supported-banks";
import { getLayoutsFromDb, saveLayoutToDb, deleteLayoutFromDb } from "../api/layouts";

const STATEMENT_LAYOUTS_STORAGE_KEY = "jvs-statement-layouts-v1";
const NOW_SEED = "2026-01-01T00:00:00.000Z";

type StoredStatementLayouts = {
  layouts: StatementLayout[];
};

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readStoredLayouts(): StoredStatementLayouts | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(STATEMENT_LAYOUTS_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredStatementLayouts;
  } catch {
    return null;
  }
}

function writeStoredLayouts(data: StoredStatementLayouts) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STATEMENT_LAYOUTS_STORAGE_KEY, JSON.stringify(data));
}

export function getSupportedStatementBanks() {
  return supportedStatementBanks;
}

export async function syncLayoutsWithDb(): Promise<StatementLayout[]> {
  try {
    const dbLayouts = await getLayoutsFromDb();
    if (dbLayouts && dbLayouts.length > 0) {
      writeStoredLayouts({ layouts: dbLayouts });
      return dbLayouts;
    } else {
      const defaults = getDefaultStatementLayouts();
      for (const layout of defaults) {
        await saveLayoutToDb(layout);
      }
      writeStoredLayouts({ layouts: defaults });
      return defaults;
    }
  } catch (error) {
    console.error("Erro ao sincronizar layouts com o banco:", error);
    return getStatementLayouts();
  }
}

export function getStatementLayouts(source?: StatementLayoutSource): StatementLayout[] {
  const defaultLayouts = getDefaultStatementLayouts();
  const storedLayouts = readStoredLayouts()?.layouts;
  const layouts = storedLayouts ? mergeStoredLayouts(defaultLayouts, storedLayouts) : defaultLayouts;
  return source ? layouts.filter((layout) => layout.source === source) : layouts;
}

export function getEnabledStatementLayouts(source?: StatementLayoutSource): StatementLayout[] {
  return getStatementLayouts(source).filter((layout) => layout.enabled);
}

export function saveStatementLayout(layout: StatementLayout) {
  const current = getStatementLayouts();
  const nextLayout: StatementLayout = {
    ...layout,
    updatedAt: new Date().toISOString()
  };

  writeStoredLayouts({
    layouts: [nextLayout, ...current.filter((item) => item.id !== layout.id)]
  });

  saveLayoutToDb(nextLayout).catch((err) => {
    console.error("Erro ao salvar layout no banco:", err);
  });
}

export function deleteStatementLayout(layoutId: string) {
  writeStoredLayouts({
    layouts: getStatementLayouts().filter((layout) => layout.id !== layoutId)
  });

  deleteLayoutFromDb(layoutId).catch((err) => {
    console.error("Erro ao excluir layout do banco:", err);
  });
}

export function resetStatementLayoutsToDefaults() {
  const defaults = getDefaultStatementLayouts();
  writeStoredLayouts({ layouts: defaults });

  Promise.all(defaults.map((layout) => saveLayoutToDb(layout))).catch((err) => {
    console.error("Erro ao restaurar defaults no banco:", err);
  });
}

export function getDefaultStatementLayouts(): StatementLayout[] {
  const ofxUniversal = createUniversalOfxLayout();
  const simpleSpreadsheet = createSimpleSpreadsheetLayout();
  const sampledPdfLayouts = createSampledPdfLayouts();
  const bankPdfPlaceholders = supportedStatementBanks
    .filter((bank) => bank.id !== "outros" && bank.supportedSources.includes("pdf"))
    .map(createBankPdfPlaceholderLayout);
  const bankSpreadsheetPlaceholders = supportedStatementBanks
    .filter((bank) => bank.id !== "outros" && bank.supportedSources.includes("csv"))
    .map(createBankSpreadsheetPlaceholderLayout);

  return [
    ofxUniversal,
    simpleSpreadsheet,
    ...sampledPdfLayouts,
    ...bankPdfPlaceholders,
    ...bankSpreadsheetPlaceholders,
    createBruteforcePdfLayout(),
    createBruteforceSpreadsheetLayout()
  ];
}

function mergeStoredLayouts(defaultLayouts: StatementLayout[], storedLayouts: StatementLayout[]) {
  const defaultIds = new Set(defaultLayouts.map((layout) => layout.id));
  const storedLayoutById = new Map(storedLayouts.map((layout) => [layout.id, layout]));
  const mergedDefaultLayouts = defaultLayouts.map((layout) => {
    const storedLayout = storedLayoutById.get(layout.id);
    return storedLayout ? { ...layout, ...storedLayout } : layout;
  });
  const customLayouts = storedLayouts.filter((layout) => !defaultIds.has(layout.id) && layout.id.startsWith("custom-"));

  return [...customLayouts, ...mergedDefaultLayouts];
}

function createSampledPdfLayouts(): StatementLayout[] {
  return [
    createSampledPdfLayout("banco-do-brasil-pdf-modelo-1", "banco-do-brasil", "Banco do Brasil PDF Modelo 1", 91, [
      requiredText("bb-m1-title", "Extrato de Conta Corrente", 40),
      textMatcher("bb-m1-client", "Cliente", 15),
      textMatcher("bb-m1-agency", "Agencia:", 15),
      textMatcher("bb-m1-columns", "Dia Historico Valor", 35)
    ]),
    createSampledPdfLayout("banco-do-brasil-pdf-modelo-2", "banco-do-brasil", "Banco do Brasil PDF Modelo 2", 92, [
      requiredText("bb-m2-title", "Consultas - Extrato de conta corrente", 45),
      textMatcher("bb-m2-current", "Cliente - Conta atual", 20),
      textMatcher("bb-m2-period", "Periodo do extrato", 15),
      textMatcher("bb-m2-columns", "Dt. balancete Dt. movimento Ag. origem Lote Historico Documento Valor", 40)
    ]),
    createSampledPdfLayout("caixa-pdf-modelo-1", "caixa", "Caixa PDF Modelo 1", 91, [
      requiredText("caixa-m1-title", "Extrato por periodo", 40),
      textMatcher("caixa-m1-account", "Conta:", 10),
      textMatcher("caixa-m1-month", "Mes:", 10),
      textMatcher("caixa-m1-columns", "Data Mov. Nr. Doc. Historico Valor Saldo", 45)
    ]),
    createSampledPdfLayout("caixa-pdf-modelo-2", "caixa", "Caixa PDF Modelo 2", 92, [
      requiredText("caixa-m2-title", "Extrato Historico da Conta", 45),
      textMatcher("caixa-m2-product", "CONTA CORRENTE PESSOA JURIDICA CAIXA", 35),
      textMatcher("caixa-m2-owner", "CPF/CNPJ do Titular", 20),
      textMatcher("caixa-m2-period", "Periodo", 10)
    ]),
    createSampledPdfLayout("caixa-pdf-modelo-3", "caixa", "Caixa PDF Modelo 3", 93, [
      requiredText("caixa-m3-title", "Extrato #PESSOAL", 45),
      textMatcher("caixa-m3-period", "Movimentacoes desde o dia", 25),
      textMatcher("caixa-m3-columns", "Descricao/Detalhamento Valor", 30),
      textMatcher("caixa-m3-balance", "Saldo proprio", 15)
    ]),
    createSampledPdfLayout("itau-pdf-modelo-1", "itau", "Itau PDF Modelo 1", 91, [
      requiredText("itau-m1-title", "extrato mensal", 45),
      textMatcher("itau-m1-account", "Minha conta", 20),
      textMatcher("itau-m1-agency", "Minha agencia", 20),
      textMatcher("itau-m1-summary", "Conta Corrente e Aplicacoes Automaticas", 35)
    ]),
    createSampledPdfLayout("itau-pdf-modelo-2", "itau", "Itau PDF Modelo 2", 92, [
      requiredText("itau-m2-title", "Lancamentos do periodo", 45),
      textMatcher("itau-m2-columns", "Data Lancamentos Razao Social CNPJ/CPF Valor", 45),
      textMatcher("itau-m2-total", "Saldo total Limite da conta Utilizado Disponivel", 25)
    ]),
    createSampledPdfLayout("asaas-pdf-modelo-1", "asaas", "Asaas PDF Modelo 1", 90, [
      requiredText("asaas-m1-generated", "Extrato gerado em", 35),
      textMatcher("asaas-m1-period", "Periodo", 15),
      textMatcher("asaas-m1-initial", "Saldo inicial do periodo", 25),
      textMatcher("asaas-m1-columns", "Data Movimentacoes Valor", 40)
    ]),
    createSampledPdfLayout("inter-pdf-modelo-1", "inter", "Inter PDF Modelo 1", 93, [
      requiredText("inter-m1-bank", "Instituicao: Banco Inter", 55),
      textMatcher("inter-m1-request", "Solicitado em", 15),
      textMatcher("inter-m1-balance", "Saldo bloqueado", 20),
      textMatcher("inter-m1-transactions", "Valor Saldo por transacao", 35)
    ]),
    createSampledPdfLayout("bk-bank-pdf-modelo-1", "bk-bank", "BK Bank PDF Modelo 1", 90, [
      requiredText("bk-m1-report", "Relatorio:", 35),
      textMatcher("bk-m1-account", "AG 0001 | CC", 35),
      textMatcher("bk-m1-columns", "DATA OPERACAO DESCRICAO VALOR SALDO STATUS AUTENTICACAO", 45)
    ]),
    createSampledPdfLayout("bradesco-pdf-modelo-1", "bradesco", "Bradesco PDF Modelo 1", 90, [
      requiredText("bradesco-m1-title", "Extrato de: Ag:", 35),
      textMatcher("bradesco-m1-available", "Total Disponivel", 20),
      textMatcher("bradesco-m1-columns", "Data Lancamento Dcto. Credito Debito Saldo", 45),
      textMatcher("bradesco-m1-pix", "TRANSFERENCIA PIX", 15)
    ]),
    createSampledPdfLayout("nubank-pdf-modelo-1", "nubank", "Nubank PDF Modelo 1", 90, [
      requiredText("nubank-m1-values", "VALORES EM R$", 35),
      textMatcher("nubank-m1-summary", "Total de entradas", 25),
      textMatcher("nubank-m1-summary-out", "Total de saidas", 25),
      textMatcher("nubank-m1-moves", "Movimentacoes", 30)
    ]),
    createSampledPdfLayout("santander-pdf-modelo-1", "santander", "Santander PDF Modelo 1", 93, [
      requiredText("santander-m1-title", "Internet Banking Empresarial", 45),
      textMatcher("santander-m1-path", "Conta Corrente > Extrato", 30),
      textMatcher("santander-m1-search", "Opcao de Pesquisa", 20),
      textMatcher("santander-m1-columns", "Data Historico Documento Valor", 35)
    ]),
    createSampledPdfLayout("sicoob-pdf-modelo-1", "sicoob", "Sicoob PDF Modelo 1", 94, [
      requiredText("sicoob-m1-title", "SISTEMA DE COOPERATIVAS DE CREDITO DO BRASIL", 45),
      textMatcher("sicoob-m1-platform", "SICOOB - SISBR", 35),
      textMatcher("sicoob-m1-history", "HISTORICO DE MOVIMENTACAO", 35),
      textMatcher("sicoob-m1-columns", "Data DocumentoHistorico Valor", 25)
    ]),
    createSampledPdfLayout("sicredi-pdf-modelo-1", "sicredi", "Sicredi PDF Modelo 1", 93, [
      requiredText("sicredi-m1-title", "Associado:", 25),
      textMatcher("sicredi-m1-coop", "Cooperativa:", 25),
      textMatcher("sicredi-m1-period", "Extrato (Periodo", 35),
      textMatcher("sicredi-m1-columns", "Data Descricao Documento Valor", 35)
    ]),
    createSampledPdfLayout("stone-pdf-modelo-1", "stone", "Stone PDF Modelo 1", 94, [
      requiredText("stone-m1-bank", "Stone Instituicao de Pagamento", 55),
      textMatcher("stone-m1-title", "Extrato de conta corrente", 25),
      textMatcher("stone-m1-account", "Dados da conta", 15),
      textMatcher("stone-m1-columns", "DATA TIPO DESCRICAO VALOR SALDO CONTRAPARTE", 35)
    ]),
    createSampledPdfLayout("tribanco-pdf-modelo-1", "tribanco", "Tribanco PDF Modelo 1", 90, [
      requiredText("tribanco-m1-title", "Lancamentos da CONTA MOVIMENTO", 45),
      textMatcher("tribanco-m1-columns", "Data Movimentacao Tipo Documento Valor", 35),
      textMatcher("tribanco-m1-credit", "TRANSF. CREDITOS CARTOES", 20),
      textMatcher("tribanco-m1-tricard", "ANTECIPACAO TRICARD", 20)
    ]),
    createSampledPdfLayout("c6-bank-pdf-modelo-1", "c6-bank", "C6 Bank PDF Modelo 1", 90, [
      requiredText("c6-m1-title", "Extrato Digital C6 Bank", 45),
      textMatcher("c6-m1-account", "Conta Corrente", 20),
      textMatcher("c6-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("cora-pdf-modelo-1", "cora", "Cora PDF Modelo 1", 90, [
      requiredText("cora-m1-title", "Extrato Cora", 30),
      textMatcher("cora-m1-account", "Conta", 15),
      textMatcher("cora-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("infinity-pay-pdf-modelo-1", "infinity-pay", "Infinity Pay PDF Modelo 1", 90, [
      requiredText("infinity-m1-title", "Infinity Pay Extrato", 35),
      textMatcher("infinity-m1-account", "Conta", 15),
      textMatcher("infinity-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("mercado-pago-pdf-modelo-1", "mercado-pago", "Mercado Pago PDF Modelo 1", 90, [
      requiredText("mp-m1-title", "Extrato Mercado Pago", 35),
      textMatcher("mp-m1-account", "Conta", 15),
      textMatcher("mp-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("pagbank-pdf-modelo-1", "pagbank", "PagBank PDF Modelo 1", 90, [
      requiredText("pagbank-m1-title", "Extrato PagBank", 30),
      textMatcher("pagbank-m1-account", "Conta", 15),
      textMatcher("pagbank-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("picpay-pdf-modelo-1", "picpay", "PicPay PDF Modelo 1", 90, [
      requiredText("picpay-m1-title", "Extrato PicPay", 25),
      textMatcher("picpay-m1-account", "Conta", 15),
      textMatcher("picpay-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("bv-pdf-modelo-1", "bv", "BV PDF Modelo 1", 90, [
      requiredText("bv-m1-title", "Extrato BV", 25),
      textMatcher("bv-m1-account", "Conta", 15),
      textMatcher("bv-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("original-pdf-modelo-1", "original", "Original PDF Modelo 1", 90, [
      requiredText("original-m1-title", "Extrato Original", 30),
      textMatcher("original-m1-account", "Conta", 15),
      textMatcher("original-m1-columns", "Data Historico Valor", 30)
    ]),
    createSampledPdfLayout("banco-da-amazonia-pdf-modelo-1", "banco-da-amazonia", "Banco da Amazônia PDF Modelo 1", 90, [
      requiredText("basa-m1-title", "Extrato Banco da Amazônia", 40),
      textMatcher("basa-m1-account", "Conta", 15),
      textMatcher("basa-m1-columns", "Data Historico Valor", 30)
    ])
  ];
}

function createSampledPdfLayout(id: string, bankId: string, name: string, priority: number, matchers: StatementLayout["matchers"]): StatementLayout {
  const bank = supportedStatementBanks.find((item) => item.id === bankId);

  return {
    id,
    bankId,
    bankName: bank?.name ?? "Outros",
    name,
    source: "pdf",
    parser: "pdf-layout",
    version: 1,
    enabled: true,
    priority,
    minimumScore: 70,
    matchers,
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED
  };
}

function requiredText(id: string, value: string, weight: number): StatementLayout["matchers"][number] {
  return {
    id,
    type: "text",
    value,
    weight,
    required: true
  };
}

function textMatcher(id: string, value: string, weight: number): StatementLayout["matchers"][number] {
  return {
    id,
    type: "text",
    value,
    weight
  };
}

function createUniversalOfxLayout(): StatementLayout {
  return {
    id: "ofx-universal",
    bankId: "ofx",
    bankName: "OFX",
    name: "OFX Universal",
    source: "ofx",
    parser: "ofx-universal",
    version: 1,
    enabled: true,
    priority: 100,
    minimumScore: 0,
    matchers: [
      { id: "ofx-signature", type: "regex", value: "<(?:OFX|STMTTRN)>", weight: 100, required: true }
    ],
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED
  };
}

function createSimpleSpreadsheetLayout(): StatementLayout {
  return {
    id: "spreadsheet-simple",
    bankId: "outros",
    bankName: "Outros",
    name: "Planilha Simples",
    source: "csv",
    parser: "spreadsheet-simple",
    version: 1,
    enabled: true,
    priority: 90,
    minimumScore: 0,
    matchers: [
      { id: "simple-header", type: "regex", value: "data|valor|fornecedor|cliente|documento|banco", weight: 20 }
    ],
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED
  };
}

function createBankPdfPlaceholderLayout(bank: StatementBank): StatementLayout {
  return {
    id: `${bank.id}-pdf-base`,
    bankId: bank.id,
    bankName: bank.name,
    name: `${bank.name} PDF Base`,
    source: "pdf",
    parser: "pdf-layout",
    version: 1,
    enabled: true,
    priority: 50,
    minimumScore: 50,
    matchers: bank.aliases.map((alias, index) => ({
      id: `${bank.id}-pdf-alias-${index + 1}`,
      type: "text",
      value: alias,
      weight: 60
    })),
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED
  };
}

function createBankSpreadsheetPlaceholderLayout(bank: StatementBank): StatementLayout {
  return {
    id: `${bank.id}-csv-base`,
    bankId: bank.id,
    bankName: bank.name,
    name: `${bank.name} Planilha Base`,
    source: "csv",
    parser: "spreadsheet-layout",
    version: 1,
    enabled: true,
    priority: 45,
    minimumScore: 45,
    matchers: bank.aliases.map((alias, index) => ({
      id: `${bank.id}-csv-alias-${index + 1}`,
      type: "text",
      value: alias,
      weight: 50
    })),
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED
  };
}

function createBruteforcePdfLayout(): StatementLayout {
  return {
    id: "outros-pdf-bruteforce",
    bankId: "outros",
    bankName: "Outros",
    name: "PDF por Forca Bruta",
    source: "pdf",
    parser: "pdf-bruteforce",
    version: 1,
    enabled: true,
    priority: 1,
    minimumScore: 0,
    matchers: [],
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED
  };
}

function createBruteforceSpreadsheetLayout(): StatementLayout {
  return {
    id: "outros-csv-bruteforce",
    bankId: "outros",
    bankName: "Outros",
    name: "Planilha por Forca Bruta",
    source: "csv",
    parser: "spreadsheet-layout",
    version: 1,
    enabled: true,
    priority: 1,
    minimumScore: 0,
    matchers: [],
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED
  };
}
