import type { ExportLayoutColumn } from "../types";

export const ACCOUNTING_EXPORT_LAYOUT_NAME = "Otimizza CSV Contabil v1";
export const ACCOUNTING_EXPORT_SEPARATOR = ";";
export const ACCOUNTING_EXPORT_EXTENSION = "csv";

export const accountingExportColumns: ExportLayoutColumn[] = [
  {
    key: "empresa_codigo",
    label: "empresa_codigo",
    description: "Codigo da empresa no sistema contabil.",
    required: true
  },
  {
    key: "empresa_nome",
    label: "empresa_nome",
    description: "Razao social da empresa selecionada.",
    required: true
  },
  {
    key: "lote",
    label: "lote",
    description: "Identificador unico do lote importado.",
    required: true
  },
  {
    key: "tipo",
    label: "tipo",
    description: "pagamentos ou recebimentos.",
    required: true
  },
  {
    key: "data",
    label: "data",
    description: "Data do lancamento em DD/MM/AAAA.",
    required: true
  },
  {
    key: "conta_debito",
    label: "conta_debito",
    description: "Conta contabil debitada.",
    required: true
  },
  {
    key: "conta_credito",
    label: "conta_credito",
    description: "Conta contabil creditada.",
    required: true
  },
  {
    key: "valor",
    label: "valor",
    description: "Valor com virgula decimal e duas casas.",
    required: true
  },
  {
    key: "historico",
    label: "historico",
    description: "Historico montado pela regra ou pelo padrao do lancamento.",
    required: true
  },
  {
    key: "codigo_historico",
    label: "codigo_historico",
    description: "Codigo de historico do ERP contabil, quando configurado.",
    required: false
  },
  {
    key: "documento",
    label: "documento",
    description: "Documento/FITID/identificador do lancamento.",
    required: false
  },
  {
    key: "fornecedor_cliente",
    label: "fornecedor_cliente",
    description: "Fornecedor ou cliente identificado no arquivo.",
    required: true
  },
  {
    key: "banco",
    label: "banco",
    description: "Banco ou portador de origem.",
    required: true
  },
  {
    key: "origem",
    label: "origem",
    description: "CSV ou OFX.",
    required: true
  },
  {
    key: "arquivo_origem",
    label: "arquivo_origem",
    description: "Nome do arquivo importado que gerou o lancamento.",
    required: true
  }
];

export const accountingExportHeader = accountingExportColumns.map((column) => column.key);
