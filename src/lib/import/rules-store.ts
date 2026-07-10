import type { ImportedTransaction, IntegrationRule, SheetKind } from "../types";
import { getRules, saveRule, deleteRule } from "../api/rules";

export async function getCompanyRules(companyId: string | number, kind?: SheetKind): Promise<IntegrationRule[]> {
  const allRules = await getRules(companyId);
  if (kind) {
    return allRules.filter((rule) => rule.kind === kind);
  }
  return allRules;
}

export async function saveCompanyRule(companyId: string | number, ruleData: Omit<IntegrationRule, "id"> & { id?: string }) {
  const currentRules = await getRules(companyId);
  const ruleId = ruleData.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newRule: IntegrationRule = { ...ruleData, id: ruleId, companyId: companyId as any as number };
  
  // Clean old similar simple rules to mimic old behavior if needed, but here we can just save it.
  // Actually, we must delete the old one if we are replacing it. 
  // Let's find if there is an exact simple match to replace
  if (newRule.type === "simple") {
    const existing = currentRules.find(r => r.type === "simple" && normalizeText(r.targetDescription) === normalizeText(newRule.targetDescription) && r.id !== newRule.id);
    if (existing) await deleteRule(existing.id);
  } else {
    const newSignature = getAdvancedRuleSignature(newRule);
    const existing = currentRules.find(r => r.type === "advanced" && r.kind === newRule.kind && getAdvancedRuleSignature(r) === newSignature && r.id !== newRule.id);
    if (existing) await deleteRule(existing.id);
  }
  
  await saveRule(newRule);
}

export async function saveSimpleMapping(companyId: string | number, kind: SheetKind, description: string, accountDebit: string) {
  await saveCompanyRule(companyId, {
    companyId: companyId as any as number,
    kind,
    type: "simple",
    targetDescription: description,
    accountDebit
  });
}

export async function deleteCompanyRule(companyId: string | number, ruleId: string) {
  await deleteRule(ruleId);
}

export function normalizeText(value: string): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buildTransactionSearchText(transaction: Pick<ImportedTransaction, "bank" | "complements" | "document" | "fileName" | "origin" | "person">): string {
  return normalizeText(
    [
      transaction.person,
      transaction.bank,
      transaction.document,
      transaction.origin,
      transaction.fileName,
      ...(transaction.complements || [])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function matchTransaction(
  transaction: Pick<ImportedTransaction, "bank" | "complements" | "document" | "fileName" | "origin" | "person">,
  rules: IntegrationRule[]
): IntegrationRule | null {
  const normalizedPerson = normalizeText(transaction.person);
  const searchableText = buildTransactionSearchText(transaction);

  const simpleRules = rules.filter((r) => r.type === "simple");
  for (const rule of simpleRules) {
    if (normalizeText(rule.targetDescription) === normalizedPerson) {
      return rule;
    }
  }

  const advancedRules = rules.filter((r) => r.type === "advanced");
  for (const rule of advancedRules) {
    if (rule.searchTokens && rule.searchTokens.length > 0) {
      const allMatch = rule.searchTokens.every((token) =>
        searchableText.includes(normalizeText(token))
      );
      if (allMatch) {
        return rule;
      }
    }
  }

  return null;
}

function getAdvancedRuleSignature(rule: IntegrationRule) {
  return (rule.searchTokens ?? []).map(normalizeText).filter(Boolean).sort().join("|");
}
