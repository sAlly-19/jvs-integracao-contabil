import { defaultSheetConfig } from "../sheet-layout-config";
import type { CompanyImportConfig, CompanyOfxConfig, CompanySheetConfig, EntityId, SheetKind } from "../types";
import { getLayoutSelections, saveLayoutSelection } from "../api/layoutSelections";
import { getSheetConfig, saveSheetConfig } from "../api/sheetConfigs";

function cloneSheetConfig(config: CompanySheetConfig): CompanySheetConfig {
  return {
    payments: { ...config.payments },
    receipts: { ...config.receipts }
  };
}

function createDefaultOfxConfig(): CompanyOfxConfig {
  return {
    payments: [],
    receipts: []
  };
}

export function createDefaultImportConfig(companyId: EntityId): CompanyImportConfig {
  return {
    companyId,
    csv: cloneSheetConfig(defaultSheetConfig),
    ofx: createDefaultOfxConfig()
  };
}

export async function getCompanyImportConfig(companyId: string | number): Promise<CompanyImportConfig> {
  const defaultConfig = createDefaultImportConfig(companyId);

  let storedConfig: CompanySheetConfig | null = null;
  let layoutSelections = createDefaultOfxConfig();

  try {
    [storedConfig, layoutSelections] = await Promise.all([getSheetConfig(companyId), getLayoutSelections(companyId)]);
  } catch (error) {
    console.warn("Nao foi possivel carregar a configuracao da empresa. Usando configuracao padrao.", error);
    return defaultConfig;
  }

  if (!storedConfig) {
    return defaultConfig;
  }
  return {
    companyId,
    csv: storedConfig,
    ofx: layoutSelections
  };
}

export async function getCompanySheetConfig(companyId: string | number): Promise<CompanySheetConfig> {
  const config = await getCompanyImportConfig(companyId);
  return config.csv;
}

export async function saveCompanySheetConfig(companyId: string | number, kind: SheetKind, mappings: Record<string, string>) {
  const currentConfig = await getCompanyImportConfig(companyId);
  const newConfig = {
    ...currentConfig.csv,
    [kind]: { ...mappings }
  };
  await saveSheetConfig(companyId, newConfig);
}

export async function getCompanyOfxLayoutIds(companyId: string | number, kind: SheetKind) {
  const selections = await getLayoutSelections(companyId);
  return selections[kind];
}

export async function saveCompanyOfxLayoutIds(companyId: string | number, kind: SheetKind, layoutIds: number[]) {
  await saveLayoutSelection(companyId, kind, layoutIds);
}
