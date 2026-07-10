"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clearAccountPlanEntries, getAccountPlanEntries, parseAccountPlanCsv, saveAccountPlanEntries } from "../lib/account-plan-store";
import type { AccountPlanEntry, Company } from "../lib/types";
import { AppIcon, PageShell, StatusPill } from "./design-system";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";

export function AccountPlanScreen({ company }: { company: Company }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<AccountPlanEntry[]>([]);

  useEffect(() => {
    getAccountPlanEntries(company.id).then(setEntries);
    setQuery("");
  }, [company.id]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return entries;
    }

    return entries.filter((entry) =>
      `${entry.reducedAccount ?? entry.account} ${entry.synthetic} ${entry.classificationCode ?? ""} ${entry.classification} ${entry.nickname}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [entries, query]);

  async function clearPlan() {
    setEntries([]);
    setQuery("");
    await clearAccountPlanEntries(company.id);
  }

  async function importCsv(file?: File) {
    if (!file) {
      return;
    }

    const text = await readAccountPlanFileText(file);
    const parsedEntries = parseAccountPlanCsv(text);
    await saveAccountPlanEntries(company.id, parsedEntries);
    setEntries(parsedEntries);
  }

  async function deleteEntry(entryId: string | number) {
    const updatedEntries = entries.filter((entry) => entry.id !== entryId);
    setEntries(updatedEntries);
    await saveAccountPlanEntries(company.id, updatedEntries);
  }

  const hasEntries = entries.length > 0;

  return (
    <PageShell className="space-y-5">
      <Card className="mx-auto max-w-5xl">
        <CardContent className="p-4">
          <div className="flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="relative min-w-0 flex-1">
              <AppIcon className="pointer-events-none absolute right-3 top-1/2 size-7 -translate-y-1/2 bg-transparent text-sky-500" name="search" />
              <Input
                className="h-12 rounded-none border-0 pr-12 text-base shadow-none focus-visible:ring-0"
                placeholder="Pesquise os registros desejados"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <input
              ref={fileInputRef}
              accept=".csv,text/csv"
              className="sr-only"
              type="file"
              onChange={(event) => importCsv(event.target.files?.[0])}
            />

            {hasEntries ? (
              <Button className="h-12 rounded-none border-l px-6 text-destructive hover:bg-rose-50" type="button" variant="ghost" onClick={clearPlan}>
                <AppIcon className="bg-rose-50 text-rose-600" name="close" />
                Excluir
              </Button>
            ) : (
              <Button className="h-12 rounded-none px-6" type="button" onClick={() => fileInputRef.current?.click()}>
                <AppIcon className="bg-white/15 text-primary-foreground" name="upload" />
                Importar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasEntries ? (
        <ImportedAccountPlan
          entries={filteredEntries}
          totalEntries={entries.length}
          onDeleteEntry={deleteEntry}
          onImportClick={() => fileInputRef.current?.click()}
        />
      ) : (
        <EmptyAccountPlan company={company} onImportClick={() => fileInputRef.current?.click()} />
      )}
    </PageShell>
  );
}

async function readAccountPlanFileText(file: File) {
  const buffer = await file.arrayBuffer();

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function EmptyAccountPlan({ company, onImportClick }: { company: Company; onImportClick: () => void }) {
  return (
    <Card className="mx-auto max-w-4xl">
      <CardContent className="grid gap-5 p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-2xl">:(</div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Nenhum plano de contas foi importado</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            A empresa <strong className="text-foreground">{company.code} - {company.name}</strong> ainda nao possui plano de contas especifico.
            Importe um CSV no layout do relatorio cadastral para liberar a selecao de contas nos De/Paras.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={onImportClick}>
            <AppIcon className="bg-white/15 text-primary-foreground" name="upload" />
            Importar plano de contas
          </Button>
          <Button type="button" variant="outline">
            Ver documentacao
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportedAccountPlan({
  entries,
  onDeleteEntry,
  onImportClick,
  totalEntries
}: {
  entries: AccountPlanEntry[];
  onDeleteEntry: (entryId: string | number) => void;
  onImportClick: () => void;
  totalEntries: number;
}) {
  return (
    <Card className="mx-auto max-w-5xl overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Plano de contas importado</h1>
            <p className="text-sm text-muted-foreground">Dados carregados a partir do layout CSV especifico da empresa.</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone="success">{totalEntries} contas</StatusPill>
            <Button type="button" variant="outline" onClick={onImportClick}>
              Reimportar CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[64px_140px_80px_170px_1fr_180px] gap-4 bg-muted/70 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span />
              <span>Conta reduzida</span>
              <span>S</span>
              <span>Classificacao</span>
              <span>Descricao</span>
              <span>Apelido</span>
            </div>

            {entries.length > 0 ? (
              entries.map((entry) => (
                <div
                  className="grid grid-cols-[64px_140px_80px_170px_1fr_180px] items-center gap-4 border-t border-border px-5 py-3 text-sm transition-colors hover:bg-muted/35"
                  key={entry.id}
                >
                  <Button size="icon" type="button" variant="ghost" aria-label={`Excluir conta ${entry.account}`} onClick={() => onDeleteEntry(entry.id)}>
                    <AppIcon className="bg-rose-50 text-rose-600 dark:bg-rose-950/40" name="close" />
                  </Button>
                  <span className="font-semibold text-foreground">{entry.reducedAccount ?? entry.account}</span>
                  <span className="text-muted-foreground">{entry.synthetic || "-"}</span>
                  <span className="text-muted-foreground">{entry.classificationCode || "-"}</span>
                  <span className="font-medium text-foreground">{entry.classification}</span>
                  <span className="text-muted-foreground">{entry.nickname || "-"}</span>
                </div>
              ))
            ) : (
              <div className="border-t border-border px-5 py-10 text-center text-sm text-muted-foreground">Nenhum registro encontrado para a busca.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
