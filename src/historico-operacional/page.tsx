"use client";

import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Topbar } from "../components/Topbar";
import { AppIcon, PageHeader, PageShell, StatusPill } from "../components/design-system";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { getCompanies } from "../lib/api/companies";
import { getHistory } from "../lib/api/history";
import type { Company, ProcessedBatch } from "../lib/types";

export default function OperationalHistoryPage() {
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies(),
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["history"],
    queryFn: () => getHistory(),
  });

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);

  const filteredBatches = batches.filter((batch) => {
    const company = companyById.get(batch.companyId);
    const searchable = `${batch.fileName} ${batch.kind} ${batch.generatedAt} ${company?.code ?? ""} ${company?.name ?? ""}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  });

  const sortedBatches = useMemo(() => {
    return [...filteredBatches].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
  }, [filteredBatches]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  const totalItems = sortedBatches.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedBatches = sortedBatches.slice(startIndex, endIndex);

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
    <main className="app-shell">
      <Topbar />

      <PageShell className="space-y-6">
        <PageHeader
          badge="Historico operacional"
          title="Arquivos processados"
          description="Consulte os ultimos lotes gerados, arquivos de origem, valores e pendencias de envio."
          actions={
            <Button asChild type="button" variant="outline">
              <Link to="/">
                <AppIcon className="bg-muted" name="arrow" />
                Voltar ao painel
              </Link>
            </Button>
          }
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <AppIcon className="absolute left-3 top-1/2 -translate-y-1/2 bg-transparent text-muted-foreground" name="spark" />
            <Input className="pl-11" placeholder="Buscar por nome, tipo, data ou empresa..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground">
            Total processado: <strong>{filteredBatches.reduce((acc, b) => acc + b.totalValue, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
          </div>
        </div>

        {paginatedBatches.length > 0 ? (
          <div className="grid gap-3">
            {paginatedBatches.map((batch) => {
              const company = companyById.get(batch.companyId);

              return (
                <Card className="overflow-hidden border-border/80" key={batch.id}>
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-primary/10 p-3 text-primary">
                        <AppIcon className="bg-transparent" name="sheet" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{batch.fileName}</span>
                          <StatusPill tone={batch.generatedFile.sent ? "success" : "warning"}>{batch.generatedFile.sent ? "Enviado" : "Pendente"}</StatusPill>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            Data: {new Date(batch.generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span>•</span>
                          <span>Empresa: {company ? `${company.code} - ${company.name}` : `ID: ${batch.companyId}`}</span>
                          <span>•</span>
                          <span>Linhas: {batch.lineCount}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">Origens: {batch.sourceFileNames.join(", ")}</div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <span className="block text-sm font-semibold">{batch.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                      </div>
                      <Button
                        className="h-9 w-9 rounded-full"
                        title="Baixar arquivo TXT novamente"
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          const link = document.createElement("a");
                          link.href = `data:${batch.generatedFile.mimeType};base64,${btoa(batch.generatedFile.content)}`;
                          link.download = batch.generatedFile.name;
                          link.click();
                        }}
                      >
                        <AppIcon className="bg-transparent text-primary" name="spark" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Pagination Panel */}
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
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              
              <span>
                Exibindo {totalItems > 0 ? `${startIndex + 1} - ${Math.min(endIndex, totalItems)}` : "0"} de {totalItems} lote(s) encontrado(s).
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
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Nenhum lote processado encontrado no historico.
          </div>
        )}
      </PageShell>
    </main>
  );
}
