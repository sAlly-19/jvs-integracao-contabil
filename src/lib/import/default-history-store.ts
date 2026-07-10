import type { DefaultHistoryConfig, SheetKind } from "../types";
import { getDefaultHistory, saveDefaultHistory } from "../api/defaultHistory";

export async function getDefaultHistoryConfig(companyId: string | number, kind: SheetKind): Promise<DefaultHistoryConfig> {
  const config = await getDefaultHistory(companyId, kind);
  return config ?? {
    companyId: companyId as any as number,
    kind,
    historyCode: "",
    historySegments: []
  };
}

export async function saveDefaultHistoryConfig(companyId: string | number, kind: SheetKind, config: Omit<DefaultHistoryConfig, "companyId" | "kind">) {
  await saveDefaultHistory(companyId, kind, {
    companyId: companyId as any as number,
    kind,
    historyCode: config.historyCode.trim(),
    historySegments: config.historySegments.filter((segment) => segment.text.trim() || segment.fieldLabel.trim())
  });
}
