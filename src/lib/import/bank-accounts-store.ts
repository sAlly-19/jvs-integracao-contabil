import { getBankAccounts, saveBankAccount, deleteBankAccount } from "../api/bankAccounts";

export async function getCompanyBankAccounts(companyId: string | number): Promise<Record<string, string>> {
  const accounts = await getBankAccounts(companyId);
  const result: Record<string, string> = {};
  for (const acc of accounts) {
    result[acc.bank] = acc.accountDebit; // Portador usually maps to debit for this system or similar depending on the context
  }
  return result;
}

export async function saveCompanyBankAccount(companyId: string | number, bank: string, accountPortador: string) {
  const id = `${companyId}-${bank}`.replace(/\s+/g, '-').toLowerCase();
  await saveBankAccount({
    id,
    companyId: companyId ? companyId.toString() : "",
    bank,
    accountDebit: accountPortador,
    accountCredit: ""
  });
}

export async function saveCompanyBankAccounts(companyId: string | number, mappings: Record<string, string>) {
  for (const [bank, account] of Object.entries(mappings)) {
    if (account && account.trim()) {
      await saveCompanyBankAccount(companyId, bank, account.trim());
    }
  }
}

export async function deleteCompanyBankAccount(companyId: string | number, bank: string) {
  const id = `${companyId}-${bank}`.replace(/\s+/g, '-').toLowerCase();
  await deleteBankAccount(id);
}
