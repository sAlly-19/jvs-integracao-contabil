import type { ImportSource } from "../types";
import type { BankStatementParser } from "./importer-types";
import { csvStatementParser } from "./parsers/csv-parser";
import { ofxStatementParser } from "./parsers/ofx-parser";
import { pdfStatementParser } from "./parsers/pdf-parser";

const parsers: BankStatementParser[] = [csvStatementParser, ofxStatementParser, pdfStatementParser];

export function getStatementParser(source: ImportSource): BankStatementParser | undefined {
  return parsers.find((parser) => parser.source === source);
}

export function getRegisteredStatementParsers() {
  return parsers;
}
