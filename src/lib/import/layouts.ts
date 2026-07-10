import { supportedStatementBanks } from "./supported-banks";

export type AvailableLayout = {
  id: number;
  bank: string;
  type: "CSV" | "OFX" | "PDF";
  group: "Extratos" | "Planilhas";
};

export type LayoutGroupFilter = "Todos" | AvailableLayout["group"];
export type LayoutTypeFilter = "Todos" | AvailableLayout["type"];

const bankLayouts = supportedStatementBanks.flatMap((bank, bankIndex) => {
  const baseId = (bankIndex + 1) * 10;
  const layouts: AvailableLayout[] = [];

  if (bank.supportedSources.includes("pdf")) {
    layouts.push({ id: baseId + 1, bank: bank.name, type: "PDF", group: "Extratos" });
  }

  if (bank.supportedSources.includes("csv")) {
    layouts.push({ id: baseId + 2, bank: bank.name, type: "CSV", group: "Planilhas" });
  }

  return layouts;
});

export const availableLayouts: AvailableLayout[] = [
  { id: 0, bank: "OFX Universal", type: "OFX", group: "Extratos" },
  ...bankLayouts
];

export function getLayoutById(layoutId: number) {
  return availableLayouts.find((layout) => layout.id === layoutId);
}

export function getOfxLayoutIds(layoutIds: number[]) {
  return layoutIds.filter((layoutId) => getLayoutById(layoutId)?.type === "OFX");
}
