import type { StatementBank } from "../types";

export const supportedStatementBanks: StatementBank[] = [
  createBank("banco-do-brasil", "Banco do Brasil", ["BB", "BANCO DO BRASIL"], ["ofx", "pdf", "csv"]),
  createBank("asaas", "Asaas", ["ASAAS"], ["ofx", "pdf", "csv"]),
  createBank("bmg", "BMG", ["BANCO BMG", "BMG"], ["ofx", "pdf", "csv"]),
  createBank("banco-da-amazonia", "Banco da Amazônia", ["BASA", "BANCO DA AMAZONIA", "BANCO DA AMAZÔNIA"], ["ofx", "pdf", "csv"]),
  createBank("original", "Original", ["BANCO ORIGINAL", "ORIGINAL"], ["ofx", "pdf", "csv"]),
  createBank("bradesco", "Bradesco", ["BRADESCO"], ["ofx", "pdf", "csv"]),
  createBank("c6-bank", "C6 Bank", ["C6", "C6 BANK", "BANCO C6"], ["ofx", "pdf", "csv"]),
  createBank("caixa", "Caixa Econômica Federal", ["CAIXA", "CEF", "CAIXA ECONOMICA FEDERAL", "CAIXA ECONÔMICA FEDERAL"], ["ofx", "pdf", "csv"]),
  createBank("cora", "Cora", ["CORA"], ["ofx", "pdf", "csv"]),
  createBank("infinity-pay", "Infinity Pay", ["INFINITY PAY", "INFINITY"], ["ofx", "pdf", "csv"]),
  createBank("inter", "Inter", ["BANCO INTER", "INTER"], ["ofx", "pdf", "csv"]),
  createBank("itau", "Itaú", ["ITAU", "ITAÚ"], ["ofx", "pdf", "csv"]),
  createBank("mercado-pago", "Mercado Pago", ["MERCADO PAGO", "MERCADOPAGO"], ["ofx", "pdf", "csv"]),
  createBank("nubank", "Nubank", ["NUBANK", "NU PAGAMENTOS"], ["ofx", "pdf", "csv"]),
  createBank("pagbank", "PagBank", ["PAGBANK", "PAGSEGURO"], ["ofx", "pdf", "csv"]),
  createBank("picpay", "PicPay", ["PICPAY"], ["ofx", "pdf", "csv"]),
  createBank("santander", "Santander", ["SANTANDER"], ["ofx", "pdf", "csv"]),
  createBank("sicoob", "Sicoob", ["SICOOB"], ["ofx", "pdf", "csv"]),
  createBank("sicredi", "Sicredi", ["SICREDI"], ["ofx", "pdf", "csv"]),
  createBank("stone", "Stone", ["STONE"], ["ofx", "pdf", "csv"]),
  createBank("tribanco", "Tribanco", ["TRIBANCO"], ["ofx", "pdf", "csv"]),
  createBank("bv", "BV", ["BANCO BV", "BV"], ["ofx", "pdf", "csv"]),
  createBank("bk-bank", "BK Bank", ["BK BANK", "BK"], ["ofx", "pdf", "csv"]),
  createBank("outros", "Outros", ["OUTROS"], ["pdf", "csv"])
];

function createBank(id: string, name: string, aliases: string[], supportedSources: StatementBank["supportedSources"] = ["ofx", "pdf", "csv"]): StatementBank {
  return {
    id,
    name,
    aliases,
    supportedSources
  };
}
