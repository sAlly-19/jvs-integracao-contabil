import type { ModuleItem } from "./types";

export const modules: ModuleItem[] = [
  {
    id: "files",
    title: "Importar Arquivos",
    icon: "import",
    descriptionLead: "Realize o fechamento contabil.",
    descriptionBody:
      "Importe arquivos de pagamentos e recebimentos, valide De/Paras, configure contas portadoras e gere os arquivos finais."
  },
  {
    id: "sheets",
    title: "Configurar Planilhas",
    icon: "sheet",
    descriptionLead: "Parametrize layouts reais",
    descriptionBody: "para planilhas simples e modelos customizados usados na leitura dos arquivos da empresa."
  }
];
