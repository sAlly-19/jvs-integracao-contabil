"use client";

import { useState, useEffect } from "react";
import type { Company, MonthlyEntry } from "../lib/types";
import { AppIcon, DataCard, MetricCard, PageHeader, PageShell, StatusPill } from "./design-system";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

export function Dashboard({
  companies,
  dashboardQuery,
  integrationStats,
  maxEntryValue,
  monthlyEntries,
  onDashboardQueryChange,
  onEditCompany,
  onSelectCompany,
  onToggleShowAllCompanies,
  showAllCompanies, isLoading,
  totalEntries
}: {
  companies: Company[];
  dashboardQuery: string;
  integrationStats: {
    total: number;
    customizadas: number;
    simples: number;
    customPercent: number;
    simplesPercent: number;
    taxationCounts: {
      lucroReal: number;
      lucroPresumido: number;
      simplesNacional: number;
      imunesIsentas: number;
    };
    taxationPercents: {
      lucroReal: number;
      lucroPresumido: number;
      simplesNacional: number;
      imunesIsentas: number;
    };
  };
  maxEntryValue: number;
  monthlyEntries: MonthlyEntry[];
  onDashboardQueryChange: (query: string) => void;
  onEditCompany: (company: Company) => void;
  onSelectCompany: (company: Company) => void;
  onToggleShowAllCompanies: () => void;
  showAllCompanies: boolean; isLoading?: boolean;
  totalEntries: number;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  const normalizedDashboardQuery = dashboardQuery.trim().toLowerCase();
  const filteredCompanies = companies.filter((company) => {
    if (!normalizedDashboardQuery) {
      return true;
    }

    const searchable = `${company.code} ${company.name} ${company.document} ${company.nickname} ${company.taxation} ${company.lastProcess}`.toLowerCase();
    return searchable.includes(normalizedDashboardQuery);
  });

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedDashboardQuery, showAllCompanies]);

  const totalItems = filteredCompanies.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleCompanies = filteredCompanies.slice(startIndex, endIndex);

  const getPageNumbers = () => {
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
  };

  return (
    <PageShell className="space-y-6">
      <PageHeader
        badge="Painel inicial"
        title="Resumo da integração contábil"
        description="Acompanhe empresas integradas, volume de lançamentos e os últimos processamentos antes de entrar nos módulos operacionais."
        actions={
          <div className="flex w-full min-w-72 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm md:w-80">
            <AppIcon className="size-6 bg-muted text-muted-foreground" name="search" />
            <Input
              className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              placeholder="Buscar no painel"
              value={dashboardQuery}
              onChange={(event) => onDashboardQueryChange(event.target.value)}
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon="company" label="Empresas integradas" value={integrationStats.total.toString()} description="Base ativa" />
        <MetricCard icon="file" label="Lançamentos" value={totalEntries.toLocaleString("pt-BR")} description="Últimos meses" />
        <MetricCard icon="activity" label="Planilhas simples" value={integrationStats.simples.toString()} description={`${integrationStats.simplesPercent}% da base`} />
        <MetricCard icon="sheet" label="Planilhas customizadas" value={integrationStats.customizadas.toString()} description={`${integrationStats.customPercent}% da base`} />
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <DataCard description="Últimos meses" title="Lançamentos gerados">
          <div className="grid h-72 grid-cols-4 items-end gap-4 rounded-2xl border border-border bg-muted/35 p-5">
            {monthlyEntries.map((item) => (
              <div className="flex h-full flex-col items-center justify-end gap-3" key={item.month}>
                <span className="text-xs font-semibold text-muted-foreground">{item.value.toLocaleString("pt-BR")}</span>
                <div className="flex h-full w-full max-w-16 items-end overflow-hidden rounded-full bg-background shadow-inner">
                  <div
                    className="w-full rounded-full bg-gradient-to-b from-cyan-300 via-sky-500 to-sky-700 shadow-lg shadow-sky-500/20 transition-all duration-200"
                    style={{ height: `${Math.max((item.value / maxEntryValue) * 100, 10)}%` }}
                  />
                </div>
                <strong className="text-xs uppercase tracking-wide text-muted-foreground">{item.month}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total consolidado</span>
            <strong className="text-foreground">{totalEntries.toLocaleString("pt-BR")}</strong>
          </div>
        </DataCard>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardDescription>Empresas integradas</CardDescription>
            <CardTitle>{integrationStats.total.toString().padStart(2, "0")} empresas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className="mx-auto flex size-40 items-center justify-center rounded-full p-3 shadow-inner"
              style={{
                background: buildTaxationConicGradient(integrationStats.taxationPercents)
              }}
            >
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-card">
                <strong className="text-3xl font-semibold text-primary">{integrationStats.total}</strong>
                <span className="text-xs font-medium text-muted-foreground">empresas</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DashboardStat label={`Lucro Real (${integrationStats.taxationPercents.lucroReal}%)`} value={integrationStats.taxationCounts.lucroReal} />
              <DashboardStat label={`Lucro Presumido (${integrationStats.taxationPercents.lucroPresumido}%)`} value={integrationStats.taxationCounts.lucroPresumido} />
              <DashboardStat label={`Simples Nacional (${integrationStats.taxationPercents.simplesNacional}%)`} value={integrationStats.taxationCounts.simplesNacional} />
              <DashboardStat label={`Imunes/Isentas (${integrationStats.taxationPercents.imunesIsentas}%)`} value={integrationStats.taxationCounts.imunesIsentas} />
            </div>
            <StatusPill tone="info">Dados podem levar até 24h para atualizar</StatusPill>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardDescription>Histórico operacional</CardDescription>
            <CardTitle>Empresas processadas recentemente</CardTitle>
          </div>
          <Button type="button" variant="outline" onClick={onToggleShowAllCompanies}>
            {showAllCompanies ? "Ver recentes" : "Ver todas"}
            <AppIcon className="bg-transparent" name="arrow" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[88px_1fr_220px_140px] gap-4 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Acoes</span>
              <span>Empresa</span>
              <span>Último processamento</span>
              <span>Tributação</span>
            </div>
            {visibleCompanies.length > 0 ? (
              visibleCompanies.map((company) => (
                <div
                  className="grid w-full grid-cols-[88px_1fr_220px_140px] gap-4 border-t border-border px-4 py-4 text-left text-sm transition-colors duration-200 hover:bg-muted/50"
                  key={company.id}
                >
                  <div className="flex items-center gap-1">
                    <Button size="icon" type="button" variant="ghost" aria-label={`Editar ${company.name}`} onClick={() => onEditCompany(company)}>
                      <AppIcon className="bg-sky-50 text-sky-600" name="settings" />
                    </Button>
                    <Button size="icon" type="button" variant="ghost" aria-label={`Abrir ${company.name}`} onClick={() => onSelectCompany(company)}>
                      <AppIcon className="bg-primary/10 text-primary" name="arrow" />
                    </Button>
                  </div>
                  <button className="min-w-0 text-left" type="button" onClick={() => onSelectCompany(company)}>
                    <strong className="block truncate font-semibold text-foreground">{company.code} - {company.name}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">{company.document}</span>
                  </button>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <AppIcon className="size-6 bg-muted text-muted-foreground" name="calendar" />
                    {company.lastProcess}
                  </span>
                  <Badge variant={company.taxation === "Simples Nacional" ? "success" : "secondary"}>{company.taxation}</Badge>
                </div>
              ))
            ) : (
              <div className="grid min-h-32 place-items-center border-t border-border px-4 py-8 text-center">
                <div>
                  <AppIcon className="mx-auto size-12 rounded-2xl bg-muted text-muted-foreground" name="search" />
                  <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma empresa encontrada</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ajuste a busca para localizar outro processamento.</p>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Itens por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={50}>50</option>
              </select>
            </div>
            
            <span>
              Exibindo {totalItems > 0 ? `${startIndex + 1} - ${Math.min(endIndex, totalItems)}` : "0"} de {totalItems} empresa(s) encontrada(s).
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  aria-label="Página anterior"
                >
                  <span className="font-semibold">‹</span>
                </Button>
                {getPageNumbers().map((page, index) => {
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
                      onClick={() => setCurrentPage(page)}
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
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  aria-label="Próxima página"
                >
                  <span className="font-semibold">›</span>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function DashboardStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-3">
      <strong className="block text-xl font-semibold text-foreground">{value}</strong>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function buildTaxationConicGradient(percents: {
  lucroReal: number;
  lucroPresumido: number;
  simplesNacional: number;
  imunesIsentas: number;
}) {
  const slices = [
    { color: "#0284c7", value: percents.lucroReal },
    { color: "#10b981", value: percents.lucroPresumido },
    { color: "#f59e0b", value: percents.simplesNacional },
    { color: "#8b5cf6", value: percents.imunesIsentas }
  ];
  let start = 0;
  const parts = slices.map((slice) => {
    const end = start + slice.value;
    const part = `${slice.color} ${start}% ${end}%`;
    start = end;
    return part;
  });

  return `conic-gradient(${parts.join(", ")}, var(--muted) ${start}% 100%)`;
}
