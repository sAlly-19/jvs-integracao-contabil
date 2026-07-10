import type { BankStatementParser, ImportParserContext } from "../importer-types";
import type { ImportFile, ImportedTransaction } from "../../types";
import { parseStatementByBruteforce } from "../bruteforce-importer";

export const pdfStatementParser: BankStatementParser = {
  source: "pdf",
  parse(file, context) {
    const content = file.content ?? "";
    const errors: string[] = [];

    if (!content.trim()) {
      return {
        transactions: [],
        errors: [
          `${file.name}: Nao foi possivel extrair texto do PDF. Certifique-se de que o arquivo nao seja uma imagem escaneada e de que possua texto selecionavel.`
        ]
      };
    }

    const identifiedLayout = context.identification?.strategy === "layout" ? context.identification.layout : null;
    const bankName = identifiedLayout?.bankName;

    const transactions = parseStatementByBruteforce({
      bankName,
      content,
      file,
      kind: context.kind,
      source: "pdf"
    });

    if (transactions.length === 0) {
      errors.push(`${file.name}: O texto do PDF foi extraido, mas nenhuma transacao com data e valor correspondentes foi identificada.`);
    } else {
      // If a layout was matched, update the raw metadata of each transaction
      if (identifiedLayout) {
        transactions.forEach((tx) => {
          tx.raw = {
            ...tx.raw,
            layoutId: identifiedLayout.id,
            identificationStrategy: "layout",
            layoutConfidence: context.identification?.confidence
          };
        });
      }
    }

    return {
      transactions,
      errors
    };
  }
};
