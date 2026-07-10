import type { ImportedTransaction } from "../../types";
import type { BankStatementParser } from "../importer-types";
import { getDirection, matchesKind, normalizeDate, parseMoney } from "../parser-utils";

const OFX_ORIGIN = "OFX" as const;

export const ofxStatementParser: BankStatementParser = {
  source: "ofx",
  parse(file, context) {
    const transactions: ImportedTransaction[] = [];
    const errors: string[] = [];
    const content = file.content ?? "";
    const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
    const bank = readOfxTag(content, "ACCTID") || readOfxTag(content, "BANKID") || "Banco nao informado";

    if (blocks.length === 0) {
      return {
        transactions,
        errors: [`${file.name}: nenhum bloco STMTTRN encontrado no OFX.`]
      };
    }

    blocks.forEach((block, index) => {
      const amount = parseMoney(readOfxTag(block, "TRNAMT"));
      const direction = getDirection(amount);

      if (!matchesKind(direction, context.kind)) {
        return;
      }

      const name = readOfxTag(block, "NAME") || readOfxTag(block, "MEMO") || "Fornecedor nao identificado";
      const document = readOfxTag(block, "FITID");

      transactions.push({
        id: `${file.id}-ofx-${index}`,
        source: "ofx",
        fileName: file.name,
        kind: context.kind,
        direction,
        date: normalizeDate(readOfxTag(block, "DTPOSTED")),
        person: name,
        bank,
        grossValue: Math.abs(amount),
        netValue: Math.abs(amount),
        document,
        interest: 0,
        fine: 0,
        discount: 0,
        complements: [readOfxTag(block, "MEMO")].filter(Boolean),
        origin: OFX_ORIGIN,
        raw: {
          fitId: document,
          layoutId: context.identification?.layout?.id,
          trnType: readOfxTag(block, "TRNTYPE")
        }
      });
    });

    if (transactions.length === 0) {
      errors.push(`${file.name}: nenhum lancamento de ${context.kind === "payments" ? "saida" : "entrada"} encontrado no OFX.`);
    }

    return { transactions, errors };
  }
};

function readOfxTag(content: string, tag: string) {
  const pairedMatch = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (pairedMatch?.[1]) {
    return cleanOfxValue(pairedMatch[1]);
  }

  const openTagMatch = content.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return cleanOfxValue(openTagMatch?.[1] ?? "");
}

function cleanOfxValue(value: string) {
  return value.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
}
