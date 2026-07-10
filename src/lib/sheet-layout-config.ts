import type { CompanySheetConfig, MappingField, SheetKind } from "./types";

export const columnOptions = [
  "",
  "Coluna A",
  "Coluna B",
  "Coluna C",
  "Coluna D",
  "Coluna E",
  "Coluna F",
  "Coluna G",
  "Coluna H",
  "Coluna I",
  "Coluna J",
  "Coluna K",
  "Coluna L",
  "Coluna M",
  "Coluna N",
  "Coluna O",
  "Coluna P",
  "Coluna Q",
  "Coluna R",
  "Coluna S",
  "Coluna T",
  "Coluna U",
  "Coluna V",
  "Coluna W",
  "Coluna X",
  "Coluna Y",
  "Coluna Z"
];

export const sheetFields: Record<SheetKind, MappingField[]> = {
  payments: [
    { id: "date", label: "Data do Pagamento" },
    { id: "person", label: "Fornecedor" },
    { id: "bank", label: "Banco" },
    { id: "grossValue", label: "Valor Original (Bruto)" },
    { id: "netValue", label: "Valor Pago (Liquido)" },
    { id: "document", label: "Documento" },
    { id: "interest", label: "Valor Juros" },
    { id: "fine", label: "Valor Multa" },
    { id: "discount", label: "Valor Desconto" },
    { id: "extraOne", label: "Complemento 1" },
    { id: "extraTwo", label: "Complemento 2" },
    { id: "extraThree", label: "Complemento 3" }
  ],
  receipts: [
    { id: "date", label: "Data do Recebimento" },
    { id: "person", label: "Cliente" },
    { id: "bank", label: "Banco / Portador" },
    { id: "grossValue", label: "Valor Original (Bruto)" },
    { id: "netValue", label: "Valor Recebido (Liquido)" },
    { id: "document", label: "Documento" },
    { id: "interest", label: "Valor Juros" },
    { id: "fine", label: "Valor Multa" },
    { id: "discount", label: "Valor Desconto" },
    { id: "extraOne", label: "Complemento 1" },
    { id: "extraTwo", label: "Complemento 2" },
    { id: "extraThree", label: "Complemento 3" }
  ]
};

const emptySheetMappings = Object.fromEntries(
  Array.from(new Set(Object.values(sheetFields).flat().map((field) => field.id))).map((fieldId) => [fieldId, ""])
) as Record<string, string>;

export const defaultSheetConfig: CompanySheetConfig = {
  payments: { ...emptySheetMappings },
  receipts: { ...emptySheetMappings }
};
