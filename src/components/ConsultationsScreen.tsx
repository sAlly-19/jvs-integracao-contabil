"use client";

import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getAccountOptions } from "../lib/account-plan-store";
import { deleteCompanyBankAccount, getCompanyBankAccounts, saveCompanyBankAccount } from "../lib/import/bank-accounts-store";
import { getDefaultHistoryConfig, saveDefaultHistoryConfig } from "../lib/import/default-history-store";
import { deleteCompanyRule, getCompanyRules, saveCompanyRule } from "../lib/import/rules-store";
import type { Company, DefaultHistoryConfig, EntityId, HistorySegment, IntegrationRule, SheetKind } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { AppIcon, PageHeader, PageShell, StatusPill } from "./design-system";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ConsultationKind = "de-paras" | "regras" | "contas-padroes";

const titleByKind: Record<ConsultationKind, string> = {
  "de-paras": "De / Paras",
  regras: "Regras",
  "contas-padroes": "Contas Padroes"
};

const descriptionByKind: Record<ConsultationKind, string> = {
  "de-paras": "Consulte os fornecedores e clientes ja vinculados a contas contabeis.",
  regras: "Consulte regras avancadas usadas para parametrizar lancamentos recorrentes.",
  "contas-padroes": "Consulte contas portador salvas por banco e contas disponiveis no plano."
};

export function ConsultationsScreen({ company, kind }: { company: Company; kind: ConsultationKind }) {
  return (
    <PageShell className="space-y-6">
      <PageHeader
        badge="Consultar"
        title={titleByKind[kind]}
        description={`${descriptionByKind[kind]} Empresa ${company.code} - ${company.name}.`}
        actions={
          <Button asChild type="button" variant="outline">
            <Link to={`/empresas/${company.id}/importar-arquivos`}>
              <AppIcon className="bg-muted" name="upload" />
              Importar arquivos
            </Link>
          </Button>
        }
      />

      <ConsultationTabs companyId={company.id} activeKind={kind} />

      {kind === "de-paras" ? <DeParasPanel companyId={company.id} /> : null}
      {kind === "regras" ? <RulesPanel companyId={company.id} /> : null}
      {kind === "contas-padroes" ? <DefaultAccountsPanel companyId={company.id} /> : null}
    </PageShell>
  );
}

function ConsultationTabs({ activeKind, companyId }: { activeKind: ConsultationKind; companyId: EntityId }) {
  const items: Array<{ href: string; kind: ConsultationKind; label: string }> = [
    { href: `/empresas/${companyId}/consultas/de-paras`, kind: "de-paras", label: "De / Paras" },
    { href: `/empresas/${companyId}/consultas/regras`, kind: "regras", label: "Regras" },
    { href: `/empresas/${companyId}/consultas/contas-padroes`, kind: "contas-padroes", label: "Contas Padroes" }
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Button asChild key={item.kind} type="button" variant={activeKind === item.kind ? "default" : "outline"}>
          <Link to={item.href}>{item.label}</Link>
        </Button>
      ))}
    </div>
  );
}

function DeParasPanel({ companyId }: { companyId: EntityId }) {
  const [simpleRules, setSimpleRules] = useState<IntegrationRule[]>([]);
  const [accountOptions, setAccountOptions] = useState<string[]>([]);
  const [editingRule, setEditingRule] = useState<IntegrationRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<IntegrationRule | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function refreshRules() {
    getCompanyRules(companyId).then(rules => setSimpleRules(rules.filter((rule) => rule.type === "simple")));
  }

  useEffect(() => {
    getCompanyRules(companyId).then(rules => setSimpleRules(rules.filter((rule) => rule.type === "simple")));
    getAccountOptions(companyId).then(setAccountOptions);
  }, [companyId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [simpleRules.length]);

  function deleteRule(rule: IntegrationRule) {
    deleteCompanyRule(companyId, rule.id);
    refreshRules();
  }

  const totalItems = simpleRules.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRules = simpleRules.slice(startIndex, endIndex);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardDescription>{simpleRules.length} registro(s)</CardDescription>
        <CardTitle>Historicos exatos com conta atribuida</CardTitle>
      </CardHeader>
      <CardContent>
        {paginatedRules.length > 0 ? (
          <>
            <DeParaTable rules={paginatedRules} onDelete={setDeletingRule} onEdit={setEditingRule} />
            <PaginationControls
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={totalItems}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              itemLabel="De/Para(s)"
            />
          </>
        ) : (
          <EmptyState message="Nenhum De/Para salvo para esta empresa." />
        )}
      </CardContent>
      {editingRule ? (
        <EditDeParaDialog
          accountOptions={accountOptions}
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSave={async (updatedRule) => {
            await saveCompanyRule(companyId, updatedRule);
            setEditingRule(null);
            refreshRules();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deletingRule)}
        title="Excluir De/Para?"
        description={`O vinculo "${deletingRule?.targetDescription ?? ""}" deixara de preencher a conta automaticamente.`}
        confirmLabel="Excluir"
        tone="danger"
        onOpenChange={(open) => {
          if (!open) {
            setDeletingRule(null);
          }
        }}
        onConfirm={async () => {
          if (deletingRule) {
            deleteRule(deletingRule);
          }
        }}
      />
    </Card>
  );
}

function DeParaTable({
  onDelete,
  onEdit,
  rules
}: {
  onDelete: (rule: IntegrationRule) => void;
  onEdit: (rule: IntegrationRule) => void;
  rules: IntegrationRule[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[96px_1.4fr_220px_160px] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Acoes</span>
          <span>Historico importado</span>
          <span>Conta atribuida</span>
          <span>Aplicacao</span>
        </div>
        {rules.map((rule) => (
          <div className="grid grid-cols-[96px_1.4fr_220px_160px] items-center gap-3 border-t border-border px-4 py-3 text-sm" key={rule.id}>
            <div className="flex items-center gap-1">
              <Button size="icon" type="button" variant="ghost" aria-label={`Editar De/Para ${rule.targetDescription}`} onClick={() => onEdit(rule)}>
                <AppIcon className="bg-sky-50 text-sky-600" name="settings" />
              </Button>
              <Button size="icon" type="button" variant="ghost" aria-label={`Excluir De/Para ${rule.targetDescription}`} onClick={() => onDelete(rule)}>
                <AppIcon className="bg-rose-50 text-rose-600" name="close" />
              </Button>
            </div>
            <span className="font-medium text-foreground">{rule.targetDescription}</span>
            <span className="text-muted-foreground">{rule.accountDebit}</span>
            <StatusPill tone="success">Exato</StatusPill>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditDeParaDialog({
  accountOptions,
  onClose,
  onSave,
  rule
}: {
  accountOptions: string[];
  onClose: () => void;
  onSave: (rule: IntegrationRule) => void;
  rule: IntegrationRule;
}) {
  const [targetDescription, setTargetDescription] = useState(rule.targetDescription);
  const [accountDebit, setAccountDebit] = useState(rule.accountDebit);

  function saveRule() {
    if (!targetDescription.trim() || !accountDebit.trim()) {
      return;
    }

    onSave({
      ...rule,
      accountDebit: normalizeAccountInput(accountDebit),
      targetDescription: targetDescription.trim()
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar De/Para</DialogTitle>
          <DialogDescription>Altere o historico exato e a conta atribuida automaticamente.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="depara-description">Historico importado</Label>
            <Input id="depara-description" value={targetDescription} onChange={(event) => setTargetDescription(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="depara-account">Conta atribuida</Label>
            <Input
              id="depara-account"
              list="account-options"
              value={accountDebit}
              onChange={(event) => setAccountDebit(event.target.value)}
              onBlur={(event) => setAccountDebit(normalizeAccountInput(event.target.value))}
            />
            <AccountDatalist accounts={accountOptions} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!targetDescription.trim() || !accountDebit.trim()} type="button" onClick={saveRule}>
            Salvar alteracoes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulesPanel({ companyId }: { companyId: EntityId }) {
  const [advancedRules, setAdvancedRules] = useState<IntegrationRule[]>([]);
  const [editingRule, setEditingRule] = useState<IntegrationRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<IntegrationRule | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function refreshRules() {
    getCompanyRules(companyId).then(rules => setAdvancedRules(rules.filter((rule) => rule.type === "advanced")));
  }

  useEffect(() => {
    getCompanyRules(companyId).then(rules => setAdvancedRules(rules.filter((rule) => rule.type === "advanced")));
  }, [companyId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [advancedRules.length]);

  function deleteRule(rule: IntegrationRule) {
    deleteCompanyRule(companyId, rule.id);
    refreshRules();
  }

  const totalItems = advancedRules.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRules = advancedRules.slice(startIndex, endIndex);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardDescription>{advancedRules.length} regra(s)</CardDescription>
        <CardTitle>Regras avancadas automaticas</CardTitle>
      </CardHeader>
      <CardContent>
        {paginatedRules.length > 0 ? (
          <>
            <RulesTable rules={paginatedRules} showType onDelete={setDeletingRule} onEdit={setEditingRule} />
            <PaginationControls
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={totalItems}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              itemLabel="regra(s) avançada(s)"
            />
          </>
        ) : (
          <EmptyState message="Nenhuma regra avancada salva para esta empresa." />
        )}
      </CardContent>
      {editingRule ? (
        <EditRuleDialog
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSave={async (updatedRule) => {
            await saveCompanyRule(companyId, updatedRule);
            setEditingRule(null);
            refreshRules();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deletingRule)}
        title="Excluir regra avancada?"
        description={`A regra "${deletingRule ? formatRuleCondition(deletingRule) : ""}" nao sera mais aplicada nos proximos arquivos.`}
        confirmLabel="Excluir"
        tone="danger"
        onOpenChange={(open) => {
          if (!open) {
            setDeletingRule(null);
          }
        }}
        onConfirm={async () => {
          if (deletingRule) {
            deleteRule(deletingRule);
          }
        }}
      />
    </Card>
  );
}

function RulesTable({
  onDelete,
  onEdit,
  rules,
  showType
}: {
  onDelete: (rule: IntegrationRule) => void;
  onEdit: (rule: IntegrationRule) => void;
  rules: IntegrationRule[];
  showType: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <div className="min-w-[960px]">
        <div className="grid grid-cols-[96px_1.4fr_160px_220px_1fr] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Acoes</span>
          <span>Quando encontrar</span>
          <span>Tipo</span>
          <span>Conta aplicada</span>
          <span>Historico / Tokens</span>
        </div>
        {rules.map((rule) => (
          <div className="grid grid-cols-[96px_1.4fr_160px_220px_1fr] items-center gap-3 border-t border-border px-4 py-3 text-sm" key={rule.id}>
            <div className="flex items-center gap-1">
              <Button size="icon" type="button" variant="ghost" aria-label={`Editar regra ${formatRuleCondition(rule)}`} onClick={() => onEdit(rule)}>
                <AppIcon className="bg-sky-50 text-sky-600" name="settings" />
              </Button>
              <Button size="icon" type="button" variant="ghost" aria-label={`Excluir regra ${formatRuleCondition(rule)}`} onClick={() => onDelete(rule)}>
                <AppIcon className="bg-rose-50 text-rose-600" name="close" />
              </Button>
            </div>
            <span className="font-medium text-foreground">{formatRuleCondition(rule)}</span>
            <StatusPill tone={rule.type === "advanced" ? "info" : "success"}>{showType ? rule.type : "De/Para"}</StatusPill>
            <span className="text-muted-foreground">{rule.accountDebit}</span>
            <span className="text-muted-foreground">
              {rule.historyCode || rule.searchTokens?.join(", ") || "Historico padrao"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditRuleDialog({
  onClose,
  onSave,
  rule
}: {
  onClose: () => void;
  onSave: (rule: IntegrationRule) => void;
  rule: IntegrationRule;
}) {
  const [accountDebit, setAccountDebit] = useState(rule.accountDebit);
  const [historyCode, setHistoryCode] = useState(rule.historyCode ?? "");
  const [searchTokensText, setSearchTokensText] = useState((rule.searchTokens ?? []).join(", "));
  const [historySegments, setHistorySegments] = useState<HistorySegment[]>(() => rule.historySegments ?? []);
  const searchTokens = useMemo(
    () =>
      searchTokensText
        .split(/[,+\n]/)
        .map((token) => token.trim())
        .filter(Boolean),
    [searchTokensText]
  );

  function saveRule() {
    if (!accountDebit.trim() || searchTokens.length === 0) {
      return;
    }

    onSave({
      ...rule,
      accountDebit: accountDebit.trim(),
      historyCode: historyCode.trim() || undefined,
      historySegments: historySegments.filter((segment) => segment.text.trim() || segment.fieldLabel.trim()),
      searchTokens
    });
  }

  function updateHistorySegment(index: number, segment: Partial<HistorySegment>) {
    setHistorySegments((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...segment } : item)));
  }

  function addHistorySegment() {
    setHistorySegments((current) => [...current, { text: "", fieldLabel: "" }]);
  }

  function removeHistorySegment(index: number) {
    setHistorySegments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar regra avancada</DialogTitle>
          <DialogDescription>Altere os trechos encontrados, conta aplicada e codigo do historico.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="rule-tokens">Trechos do historico</Label>
            <Input
              id="rule-tokens"
              value={searchTokensText}
              onChange={(event) => setSearchTokensText(event.target.value)}
              placeholder="Ex.: TRANSPORTES, EVOLUCAO"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rule-account">Conta aplicada</Label>
            <Input id="rule-account" value={accountDebit} onChange={(event) => setAccountDebit(event.target.value)} placeholder="Conta aplicada" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rule-history-code">Codigo do historico</Label>
            <Input
              id="rule-history-code"
              value={historyCode}
              onChange={(event) => setHistoryCode(event.target.value)}
              placeholder="Codigo do historico"
            />
          </div>
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Composicao do historico</Label>
              <Button size="sm" type="button" variant="outline" onClick={addHistorySegment}>
                Adicionar trecho
              </Button>
            </div>
            {historySegments.length > 0 ? (
              historySegments.map((segment, index) => (
                <div className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[1fr_1fr_auto]" key={`edit-history-segment-${index}`}>
                  <Input
                    value={segment.text}
                    onChange={(event) => updateHistorySegment(index, { text: event.target.value })}
                    placeholder={index === 0 ? "Texto inicial" : `Texto ${index + 1}`}
                  />
                  <Input
                    value={segment.fieldLabel}
                    onChange={(event) => updateHistorySegment(index, { fieldLabel: event.target.value })}
                    placeholder="Campo do arquivo"
                  />
                  <Button size="icon" type="button" variant="ghost" aria-label="Remover trecho" onClick={() => removeHistorySegment(index)}>
                    <AppIcon className="bg-rose-50 text-rose-600" name="close" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Nenhuma composicao de historico salva nesta regra.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!accountDebit.trim() || searchTokens.length === 0} type="button" onClick={saveRule}>
            Salvar alteracoes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatRuleCondition(rule: IntegrationRule) {
  if (rule.type === "advanced" && rule.searchTokens?.length) {
    return `Historico contem ${rule.searchTokens.join(" + ")}`;
  }

  return rule.targetDescription;
}

function DefaultAccountsPanel({ companyId }: { companyId: EntityId }) {
  const [bankAccounts, setBankAccounts] = useState<Array<[string, string]>>([]);
  const [accountOptions, setAccountOptions] = useState<string[]>([]);
  const [editingBankAccount, setEditingBankAccount] = useState<{ bank: string; account: string } | null>(null);
  const [deletingBankAccount, setDeletingBankAccount] = useState<{ bank: string; account: string } | null>(null);
  const [historyKind, setHistoryKind] = useState<SheetKind>("payments");
  const [defaultHistory, setDefaultHistory] = useState<DefaultHistoryConfig>({
    companyId,
    kind: "payments",
    historyCode: "",
    historySegments: []
  });
  const [accountSearch, setAccountSearch] = useState("");
  const [accountPage, setAccountPage] = useState(1);
  const accountPageSize = 10;

  useEffect(() => {
    getCompanyBankAccounts(companyId).then(res => setBankAccounts(Object.entries(res)));
    getAccountOptions(companyId).then(setAccountOptions);
  }, [companyId]);

  useEffect(() => {
    getDefaultHistoryConfig(companyId, historyKind).then(setDefaultHistory);
  }, [companyId, historyKind]);

  useEffect(() => {
    setAccountPage(1);
  }, [accountSearch]);

  const filteredAccounts = useMemo(() => {
    return accountOptions.filter((account) =>
      account.toLowerCase().includes(accountSearch.toLowerCase())
    );
  }, [accountOptions, accountSearch]);

  const totalAccounts = filteredAccounts.length;
  const totalAccountPages = Math.ceil(totalAccounts / accountPageSize);
  const startAccIndex = (accountPage - 1) * accountPageSize;
  const endAccIndex = startAccIndex + accountPageSize;
  const paginatedAccounts = filteredAccounts.slice(startAccIndex, endAccIndex);

  function refreshBankAccounts() {
    getCompanyBankAccounts(companyId).then(res => setBankAccounts(Object.entries(res)));
  }

  async function deleteBankAccount(bank: string) {
    await deleteCompanyBankAccount(companyId, bank);
    refreshBankAccounts();
  }

  function updateDefaultHistorySegment(index: number, segment: Partial<HistorySegment>) {
    setDefaultHistory((current) => ({
      ...current,
      historySegments: current.historySegments.map((item, itemIndex) => (itemIndex === index ? { ...item, ...segment } : item))
    }));
  }

  function addDefaultHistorySegment() {
    setDefaultHistory((current) => ({
      ...current,
      historySegments: [...current.historySegments, { text: "", fieldLabel: "" }]
    }));
  }

  function removeDefaultHistorySegment(index: number) {
    setDefaultHistory((current) => ({
      ...current,
      historySegments: current.historySegments.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function saveDefaultHistory() {
    await saveDefaultHistoryConfig(companyId, historyKind, {
      historyCode: defaultHistory.historyCode,
      historySegments: defaultHistory.historySegments
    });
    const updated = await getDefaultHistoryConfig(companyId, historyKind);
    setDefaultHistory(updated);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardDescription>{bankAccounts.length} banco(s)</CardDescription>
          <CardTitle>Conta portador por banco</CardTitle>
        </CardHeader>
        <CardContent>
          {bankAccounts.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="grid grid-cols-[96px_1fr_1fr] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Acoes</span>
                <span>Banco</span>
                <span>Conta Portador</span>
              </div>
              {bankAccounts.map(([bank, account]) => (
                <div className="grid grid-cols-[96px_1fr_1fr] items-center gap-3 border-t border-border px-4 py-3 text-sm" key={bank}>
                  <div className="flex items-center gap-1">
                    <Button size="icon" type="button" variant="ghost" aria-label={`Editar conta portador ${bank}`} onClick={() => setEditingBankAccount({ bank, account })}>
                      <AppIcon className="bg-sky-50 text-sky-600" name="settings" />
                    </Button>
                    <Button size="icon" type="button" variant="ghost" aria-label={`Excluir conta portador ${bank}`} onClick={() => setDeletingBankAccount({ bank, account })}>
                      <AppIcon className="bg-rose-50 text-rose-600" name="close" />
                    </Button>
                  </div>
                  <span className="font-medium text-foreground">{bank}</span>
                  <span className="text-muted-foreground">{account}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Nenhuma conta portador salva para esta empresa." />
          )}
          <AccountDatalist accounts={accountOptions} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden flex flex-col">
        <CardHeader className="pb-3">
          <CardDescription>{totalAccounts} de {accountOptions.length} conta(s)</CardDescription>
          <CardTitle>Contas do plano</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 space-y-3">
          {accountOptions.length > 0 && (
            <div className="relative">
              <AppIcon className="absolute left-3 top-1/2 -translate-y-1/2 bg-transparent text-muted-foreground size-4" name="search" />
              <Input
                className="pl-10 h-9 text-xs"
                placeholder="Pesquisar conta..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
              />
            </div>
          )}
          
          {paginatedAccounts.length > 0 ? (
            <div className="flex-1 space-y-2 min-h-[220px]">
              {paginatedAccounts.map((account) => (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-foreground" key={account}>
                  {account}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 min-h-[220px] flex items-center justify-center">
              <EmptyState message={accountOptions.length > 0 ? "Nenhuma conta corresponde à busca." : "Importe o plano de contas para listar as contas disponiveis."} />
            </div>
          )}

          {totalAccountPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
              <span>{startAccIndex + 1} - {Math.min(endAccIndex, totalAccounts)} de {totalAccounts}</span>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={accountPage === 1}
                  onClick={() => setAccountPage((p) => Math.max(p - 1, 1))}
                >
                  ‹
                </Button>
                <span className="px-2 font-medium">pág. {accountPage} / {totalAccountPages}</span>
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={accountPage === totalAccountPages}
                  onClick={() => setAccountPage((p) => Math.min(p + 1, totalAccountPages))}
                >
                  ›
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden lg:col-span-2">
        <CardHeader>
          <CardDescription>Usado em De/Para ou quando uma regra nao informar codigo do historico</CardDescription>
          <CardTitle>Historico padrao dos lancamentos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={historyKind === "payments" ? "default" : "outline"} onClick={() => setHistoryKind("payments")}>
              Pagamentos
            </Button>
            <Button type="button" variant={historyKind === "receipts" ? "default" : "outline"} onClick={() => setHistoryKind("receipts")}>
              Recebimentos
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="default-history-code">Codigo do historico</Label>
            <Input
              id="default-history-code"
              value={defaultHistory.historyCode}
              onChange={(event) => setDefaultHistory((current) => ({ ...current, historyCode: event.target.value }))}
              placeholder="Codigo do historico padrao"
            />
          </div>
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Complementos do historico</Label>
              <Button type="button" variant="outline" onClick={addDefaultHistorySegment}>
                Adicionar complemento
              </Button>
            </div>
            {defaultHistory.historySegments.length > 0 ? (
              defaultHistory.historySegments.map((segment, index) => (
                <div className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[1fr_1fr_auto]" key={`default-history-${index}`}>
                  <Input
                    value={segment.text}
                    onChange={(event) => updateDefaultHistorySegment(index, { text: event.target.value })}
                    placeholder={index === 0 ? "Texto inicial" : `Texto ${index + 1}`}
                  />
                  <Input
                    value={segment.fieldLabel}
                    onChange={(event) => updateDefaultHistorySegment(index, { fieldLabel: event.target.value })}
                    placeholder="Campo do arquivo. Ex.: Descricao, Banco, COMPLEMENTO01"
                  />
                  <Button size="icon" type="button" variant="ghost" aria-label="Remover complemento" onClick={() => removeDefaultHistorySegment(index)}>
                    <AppIcon className="bg-rose-50 text-rose-600" name="close" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Nenhum complemento cadastrado. O historico automatico usara o texto padrao do lancamento.
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={saveDefaultHistory}>
              Salvar historico padrao
            </Button>
          </div>
        </CardContent>
      </Card>

      {editingBankAccount ? (
        <EditBankAccountDialog
          accountOptions={accountOptions}
          bankAccount={editingBankAccount}
          onClose={() => setEditingBankAccount(null)}
          onSave={async (bank, account) => {
            if (bank !== editingBankAccount.bank) {
              await deleteCompanyBankAccount(companyId, editingBankAccount.bank);
            }
            await saveCompanyBankAccount(companyId, bank, normalizeAccountInput(account));
            setEditingBankAccount(null);
            refreshBankAccounts();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deletingBankAccount)}
        title="Excluir conta portador?"
        description={`O banco ${deletingBankAccount?.bank ?? ""} ficara sem contrapartida padrao ate ser configurado novamente.`}
        confirmLabel="Excluir"
        tone="danger"
        onOpenChange={(open) => {
          if (!open) {
            setDeletingBankAccount(null);
          }
        }}
        onConfirm={async () => {
          if (deletingBankAccount) {
            deleteBankAccount(deletingBankAccount.bank);
          }
        }}
      />
    </div>
  );
}

function EditBankAccountDialog({
  accountOptions,
  bankAccount,
  onClose,
  onSave
}: {
  accountOptions: string[];
  bankAccount: { bank: string; account: string };
  onClose: () => void;
  onSave: (bank: string, account: string) => void;
}) {
  const [bank, setBank] = useState(bankAccount.bank);
  const [account, setAccount] = useState(bankAccount.account);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar conta portador</DialogTitle>
          <DialogDescription>Altere o banco e a conta padrao usada como contrapartida.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="bank-account-bank">Banco</Label>
            <Input id="bank-account-bank" value={bank} onChange={(event) => setBank(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bank-account-account">Conta portador</Label>
            <Input
              id="bank-account-account"
              list="account-options"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              onBlur={(event) => setAccount(normalizeAccountInput(event.target.value))}
            />
            <AccountDatalist accounts={accountOptions} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!bank.trim() || !account.trim()} type="button" onClick={() => onSave(bank.trim(), account)}>
            Salvar alteracoes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border bg-muted/25 p-6 text-center">
      <div>
        <AppIcon className="mx-auto size-12 rounded-2xl bg-muted text-muted-foreground" name="search" />
        <p className="mt-3 text-sm font-semibold text-foreground">{message}</p>
      </div>
    </div>
  );
}

function normalizeAccountInput(value: string) {
  return value.split(" - ")[0]?.replace(/[^\w./-]/g, "").trim() ?? value.trim();
}

function AccountDatalist({ accounts }: { accounts: string[] }) {
  return (
    <datalist id="account-options">
      {accounts.map((account) => (
        <option key={account} label={account} value={normalizeAccountInput(account)} />
      ))}
    </datalist>
  );
}

function getPageNumbers(currentPage: number, totalPages: number) {
  const pages: (number | string)[] = [];
  const maxVisible = 5;
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) {
      pages.push("ellipsis-1");
    }
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) {
      pages.push("ellipsis-2");
    }
    pages.push(totalPages);
  }
  return pages;
}

function PaginationControls({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  itemLabel = "item(s)"
}: {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}) {
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Itens por página:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <span>
        Exibindo {totalItems > 0 ? `${startIndex + 1} - ${Math.min(endIndex, totalItems)}` : "0"} de {totalItems} {itemLabel}.
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            type="button"
            variant="outline"
            className="h-8 w-8"
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
            aria-label="Página anterior"
          >
            <span className="font-semibold">‹</span>
          </Button>
          {pageNumbers.map((page, index) => {
            if (typeof page === "string") {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground font-medium">
                  ...
                </span>
              );
            }
            return (
              <Button
                key={page}
                size="icon"
                type="button"
                variant={currentPage === page ? "default" : "outline"}
                className="h-8 w-8 text-xs font-medium"
                onClick={() => onPageChange(page)}
              >
                {page}
              </Button>
            );
          })}
          <Button
            size="icon"
            type="button"
            variant="outline"
            className="h-8 w-8"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
            aria-label="Próxima página"
          >
            <span className="font-semibold">›</span>
          </Button>
        </div>
      )}
    </div>
  );
}
