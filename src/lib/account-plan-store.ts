import type { AccountPlanEntry } from "./types";
import { getAccountPlans, saveAccountPlan, deleteAccountPlan } from "./api/accountPlans";

const ACCOUNT_PLAN_STORAGE_KEY = "jvs-account-plan-entries-v1";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function getStorageKey(companyId: string | number) {
  return `${ACCOUNT_PLAN_STORAGE_KEY}-${companyId}`;
}

function readCachedEntries(companyId: string | number): AccountPlanEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(companyId));
    return rawValue ? normalizeAccountPlanEntries(JSON.parse(rawValue) as AccountPlanEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCachedEntries(companyId: string | number, entries: AccountPlanEntry[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(getStorageKey(companyId), JSON.stringify(entries));
}

export async function getAccountPlanEntries(companyId: string | number): Promise<AccountPlanEntry[]> {
  try {
    const entries = normalizeAccountPlanEntries(await getAccountPlans(companyId));
    if (entries.length > 0) {
      writeCachedEntries(companyId, entries);
      return entries;
    }
  } catch (error) {
    console.warn("Nao foi possivel carregar o plano de contas do banco. Usando cache local.", error);
  }

  return readCachedEntries(companyId);
}

export async function saveAccountPlanEntries(companyId: string | number, entries: AccountPlanEntry[]) {
  writeCachedEntries(companyId, entries);

  // First clear existing to do a full replacement (as per original logic where it just overwrites the array)
  try {
    const existing = await getAccountPlans(companyId);
    await Promise.all(existing.map(e => e.id ? deleteAccountPlan(e.id.toString()) : Promise.resolve()));
    await Promise.all(entries.map(e => saveAccountPlan(companyId, e)));
  } catch (error) {
    console.warn("Nao foi possivel salvar o plano de contas no banco. O cache local foi atualizado.", error);
  }
}

export async function clearAccountPlanEntries(companyId: string | number) {
  writeCachedEntries(companyId, []);

  try {
    const existing = await getAccountPlans(companyId);
    await Promise.all(existing.map(e => e.id ? deleteAccountPlan(e.id.toString()) : Promise.resolve()));
  } catch (error) {
    console.warn("Nao foi possivel limpar o plano de contas no banco. O cache local foi limpo.", error);
  }
}

export function parseAccountPlanCsv(csvText: string): AccountPlanEntry[] {
  return normalizeAccountPlanEntries(csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("____") && !line.startsWith('"Conta"') && /^\d+;/.test(line))
    .map((line, index) => {
      const [account = "", synthetic = "", classification = "", nickname = ""] = line
        .split(";")
        .map((part) => part.replace(/^"|"$/g, "").trim());

      const classificationMatch = classification.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
      const classificationCode = classificationMatch?.[1] ?? "";
      const normalizedClassification = classificationMatch?.[2]?.trim() || classification.trim();

      return {
        id: (index + 1) as any as number,
        account,
        reducedAccount: account,
        synthetic,
        classificationCode,
        classification: normalizedClassification || classification,
        nickname
      };
    })
    .filter((entry) => entry.account && entry.classification));
}

export async function getAccountOptions(companyId: string | number): Promise<string[]> {
  const entries = await getAccountPlanEntries(companyId);
  return entries.map((entry) =>
    [
      entry.reducedAccount ?? entry.account,
      entry.classificationCode ?? "",
      entry.classification,
      entry.nickname ?? ""
    ].join("\t")
  );
}

function normalizeAccountPlanEntries(entries: AccountPlanEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    account: cleanAccountPlanText(entry.account),
    reducedAccount: cleanAccountPlanText(entry.reducedAccount),
    synthetic: cleanAccountPlanText(entry.synthetic),
    classificationCode: cleanAccountPlanText(entry.classificationCode),
    classification: cleanAccountPlanText(entry.classification),
    nickname: cleanAccountPlanText(entry.nickname)
  }));
}

function cleanAccountPlanText(value: string | undefined) {
  return (value ?? "")
    .replace(/Comercializa��o/g, "Comercialização")
    .replace(/Transfer�ncias/g, "Transferências")
    .replace(/Dep�sito/g, "Depósito")
    .replace(/Importa��es/g, "Importações")
    .replace(/Importa��o/g, "Importação")
    .replace(/Alimenta��o/g, "Alimentação")
    .replace(/Aut�nomos/g, "Autônomos")
    .replace(/M�dica/g, "Médica")
    .replace(/Gratifica��es/g, "Gratificações")
    .replace(/Pr�mios/g, "Prêmios")
    .replace(/Sal�rio/g, "Salário")
    .replace(/Ordenados/g, "Ordenados")
    .trim();
}
