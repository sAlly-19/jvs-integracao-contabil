"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { ConfirmDialog } from "./ConfirmDialog";
import { AppIcon, PageHeader, PageShell, StatusPill } from "./design-system";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { getCompanyImportConfig, getCompanySheetConfig, saveCompanySheetConfig } from "../lib/import/config-store";
import { identifyStatementLayout } from "../lib/import/layout-identification";
import { extractPdfTextFromBuffer } from "../lib/import/pdf-text-extractor";
import { createImportBatch } from "../lib/import/readers";
import { deleteStatementLayout, getStatementLayouts, getSupportedStatementBanks, saveStatementLayout, syncLayoutsWithDb } from "../lib/import/statement-layout-store";
import { columnOptions, sheetFields } from "../lib/sheet-layout-config";
import type { Company, CompanySheetConfig, ImportedTransaction, LayoutIdentificationResult, SheetKind, StatementLayout } from "../lib/types";

type LayoutTab = "simple" | "pdf" | "custom";
type LayoutDraft = {
  id: string;
  bankColumn: string;
  bankId: string;
  balanceColumn: string;
  createdAt: string;
  dateColumn: string;
  debitCreditColumn: string;
  descriptionColumn: string;
  documentColumn: string;
  extraOneColumn: string;
  extraTwoColumn: string;
  matchers: string;
  name: string;
  valueColumn: string;
};
type LayoutTestResult = {
  fileName: string;
  identification: LayoutIdentificationResult;
  transactions: ImportedTransaction[];
  errors: string[];
  content?: string;
};

export function SheetConfigurationScreen({ company }: { company: Company }) {
  const [activeTab, setActiveTab] = useState<LayoutTab>("simple");
  const [activeKind, setActiveKind] = useState<SheetKind>("payments");
  const [config, setConfig] = useState<CompanySheetConfig | null>(null);
  const [customLayouts, setCustomLayouts] = useState<StatementLayout[]>(() => getSpreadsheetLayouts());
  const [pdfLayouts, setPdfLayouts] = useState<StatementLayout[]>(() => getPdfLayouts());
  const [deletingLayout, setDeletingLayout] = useState<StatementLayout | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<LayoutDraft>(createEmptyLayoutDraft);
  const [saveMessage, setSaveMessage] = useState("");
  const [layoutQuery, setLayoutQuery] = useState("");
  const [bankFilter, setBankFilter] = useState("all");
  const [testKind, setTestKind] = useState<SheetKind>("payments");
  const [isTestingLayout, setIsTestingLayout] = useState(false);
  const [testResult, setTestResult] = useState<LayoutTestResult | null>(null);
  const form = useForm<CompanySheetConfig>({ defaultValues: config || undefined });

  useEffect(() => {
    getCompanySheetConfig(company.id).then((storedConfig) => {
      setConfig(storedConfig);
      if (storedConfig) {
        form.reset(storedConfig);
      }
    });
    syncLayoutsWithDb().then(() => {
      refreshLayouts();
    });
    setSaveMessage("");
  }, [company.id, form]);

  function refreshLayouts() {
    setCustomLayouts(getSpreadsheetLayouts());
    setPdfLayouts(getPdfLayouts());
  }

  function updateSheetMapping(kind: SheetKind, fieldId: string, column: string) {
    if (!config) return;
    setSaveMessage("");
    form.setValue(kind, { ...config[kind], [fieldId]: column });
    setConfig((current) => {
      if (!current) return null;
      return {
        payments: { ...current.payments },
        receipts: { ...current.receipts },
        [kind]: { ...current[kind], [fieldId]: column }
      };
    });
  }

  function confirmSheetConfig() {
    if (!config) return;
    const label = activeKind === "payments" ? "pagamentos" : "recebimentos";
    saveCompanySheetConfig(company.id, activeKind, config[activeKind]);
    setSaveMessage(`Configuracao de ${label} salva para ${company.nickname}.`);
  }

  function saveCustomLayout() {
    const bank = getSupportedStatementBanks().find((item) => item.id === layoutDraft.bankId) ?? getSupportedStatementBanks().at(-1);
    if (!bank || !layoutDraft.name.trim()) {
      return;
    }

    const now = new Date().toISOString();
    const layout: StatementLayout = {
      id: layoutDraft.id || `custom-csv-${Date.now()}`,
      bankId: bank.id,
      bankName: bank.name,
      name: layoutDraft.name.trim(),
      source: "csv",
      parser: "spreadsheet-layout",
      version: 1,
      enabled: true,
      priority: 70,
      minimumScore: 30,
      matchers: layoutDraft.matchers
        .split(/\n|,/)
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value, index) => ({ id: `${layoutDraft.id || "custom"}-matcher-${index + 1}`, type: "text" as const, value, weight: 30 })),
      fieldMapping: {
        bank: layoutDraft.bankColumn,
        balance: layoutDraft.balanceColumn,
        date: layoutDraft.dateColumn,
        debitCredit: layoutDraft.debitCreditColumn,
        description: layoutDraft.descriptionColumn,
        document: layoutDraft.documentColumn,
        extraOne: layoutDraft.extraOneColumn,
        extraTwo: layoutDraft.extraTwoColumn,
        value: layoutDraft.valueColumn
      },
      createdAt: layoutDraft.createdAt || now,
      updatedAt: now
    };

    saveStatementLayout(layout);
    refreshLayouts();
    setLayoutDraft(createEmptyLayoutDraft());
    setSaveMessage(`Layout customizado "${layout.name}" salvo.`);
  }

  function editCustomLayout(layout: StatementLayout) {
    setActiveTab("custom");
    setLayoutDraft({
      id: layout.id,
      bankColumn: layout.fieldMapping?.bank ?? "",
      bankId: layout.bankId,
      balanceColumn: layout.fieldMapping?.balance ?? "",
      createdAt: layout.createdAt,
      dateColumn: layout.fieldMapping?.date ?? "",
      debitCreditColumn: layout.fieldMapping?.debitCredit ?? "",
      descriptionColumn: layout.fieldMapping?.description ?? "",
      documentColumn: layout.fieldMapping?.document ?? "",
      extraOneColumn: layout.fieldMapping?.extraOne ?? "",
      extraTwoColumn: layout.fieldMapping?.extraTwo ?? "",
      matchers: layout.matchers.map((matcher) => matcher.value).join("\n"),
      name: layout.name,
      valueColumn: layout.fieldMapping?.value ?? ""
    });
  }

  function removeCustomLayout(layout: StatementLayout) {
    deleteStatementLayout(layout.id);
    refreshLayouts();
    setDeletingLayout(null);
  }

  function toggleLayout(layout: StatementLayout) {
    saveStatementLayout({ ...layout, enabled: !layout.enabled });
    refreshLayouts();
  }

  async function testPdfLayout(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    setIsTestingLayout(true);
    setTestResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const content = await extractPdfTextFromBuffer(buffer);
      const identification = identifyStatementLayout("pdf", content);
      const batch = createImportBatch({
        companyId: company.id,
        config: await getCompanyImportConfig(company.id),
        files: [{ id: Date.now(), name: file.name, type: "pdf", content }],
        kind: testKind,
        selectedLayoutIds: []
      });
      setTestResult({ fileName: file.name, identification, transactions: batch.transactions, errors: batch.errors, content });
    } catch {
      setTestResult({
        fileName: file.name,
        identification: { layout: null, confidence: 0, candidates: [], strategy: "bruteforce" },
        transactions: [],
        errors: [`${file.name}: nao foi possivel ler o PDF.`]
      });
    } finally {
      setIsTestingLayout(false);
    }
  }

  if (!config) {
    return (
      <PageShell className="space-y-6">
        <PageHeader
          badge="Configuracao"
          title="Parametrizar importacao"
          description="Configure planilhas simples, layouts PDF reais e layouts customizados usados na leitura automatica."
        />
        <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Carregando configurações da empresa...</span>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-6">
      <PageHeader
        badge="Configuracao"
        title="Parametrizar importacao"
        description="Configure planilhas simples, layouts PDF reais e layouts customizados usados na leitura automatica."
      />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
        <TabButton active={activeTab === "simple"} label="Planilha simples" onClick={() => setActiveTab("simple")} />
        <TabButton active={activeTab === "pdf"} label="Layouts PDF" onClick={() => setActiveTab("pdf")} />
        <TabButton active={activeTab === "custom"} label="Layouts customizados" onClick={() => setActiveTab("custom")} />
      </div>

      {activeTab === "simple" ? (
        <SimpleSpreadsheetCard
          activeKind={activeKind}
          config={config}
          saveMessage={saveMessage}
          onChangeKind={setActiveKind}
          onConfirm={form.handleSubmit(confirmSheetConfig)}
          onUpdateMapping={updateSheetMapping}
        />
      ) : null}

      {activeTab === "pdf" ? (
        <PdfLayoutsCard
          bankFilter={bankFilter}
          isTestingLayout={isTestingLayout}
          layoutQuery={layoutQuery}
          pdfLayouts={pdfLayouts}
          testKind={testKind}
          testResult={testResult}
          onBankFilterChange={setBankFilter}
          onLayoutQueryChange={setLayoutQuery}
          onTestKindChange={setTestKind}
          onTestPdf={testPdfLayout}
          onToggleLayout={toggleLayout}
          onRefreshLayouts={refreshLayouts}
        />
      ) : null}

      {activeTab === "custom" ? (
        <CustomSpreadsheetLayoutsCard
          customLayouts={customLayouts}
          draft={layoutDraft}
          onChangeDraft={(draft) => setLayoutDraft((current) => ({ ...current, ...draft }))}
          onDelete={setDeletingLayout}
          onEdit={editCustomLayout}
          onResetDraft={() => setLayoutDraft(createEmptyLayoutDraft())}
          onSave={saveCustomLayout}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingLayout)}
        title="Excluir layout customizado?"
        description={`O layout "${deletingLayout?.name ?? ""}" nao sera mais usado na identificacao automatica.`}
        confirmLabel="Excluir"
        tone="danger"
        onOpenChange={(open) => {
          if (!open) {
            setDeletingLayout(null);
          }
        }}
        onConfirm={() => {
          if (deletingLayout) {
            removeCustomLayout(deletingLayout);
          }
        }}
      />
    </PageShell>
  );
}

function PdfLayoutsCard({
  bankFilter,
  isTestingLayout,
  layoutQuery,
  onBankFilterChange,
  onLayoutQueryChange,
  onTestKindChange,
  onTestPdf,
  onToggleLayout,
  pdfLayouts,
  testKind,
  testResult,
  onRefreshLayouts
}: {
  bankFilter: string;
  isTestingLayout: boolean;
  layoutQuery: string;
  onBankFilterChange: (bankId: string) => void;
  onLayoutQueryChange: (query: string) => void;
  onTestKindChange: (kind: SheetKind) => void;
  onTestPdf: (fileList: FileList | null) => void;
  onToggleLayout: (layout: StatementLayout) => void;
  pdfLayouts: StatementLayout[];
  testKind: SheetKind;
  testResult: LayoutTestResult | null;
  onRefreshLayouts: () => void;
}) {
  const banks = getSupportedStatementBanks().filter((bank) => pdfLayouts.some((layout) => layout.bankId === bank.id));
  const normalizedQuery = normalizeSearch(layoutQuery);
  const filteredLayouts = useMemo(
    () =>
      pdfLayouts.filter((layout) => {
        const matchesBank = bankFilter === "all" || layout.bankId === bankFilter;
        const matchesQuery = normalizedQuery ? normalizeSearch(`${layout.bankName} ${layout.name} ${layout.source}`).includes(normalizedQuery) : true;
        return matchesBank && matchesQuery;
      }),
    [bankFilter, normalizedQuery, pdfLayouts]
  );
  const closeCandidates = getCloseCandidates(testResult?.identification);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardDescription>Extratos PDF</CardDescription>
              <CardTitle>Layouts reais cadastrados</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={bankFilter} onChange={(event) => onBankFilterChange(event.target.value)}>
                <option value="all">Todos os bancos</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
              <Input className="w-64" placeholder="Buscar por banco, layout ou tipo" value={layoutQuery} onChange={(event) => onLayoutQueryChange(event.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <div>
              <p className="font-semibold">Testar layout antes de importar</p>
              <p>Envie um PDF para ver banco detectado, confianca e lancamentos encontrados.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-10 rounded-lg border border-sky-200 bg-white px-3 text-sm" value={testKind} onChange={(event) => onTestKindChange(event.target.value as SheetKind)}>
                <option value="payments">Pagamentos</option>
                <option value="receipts">Recebimentos</option>
              </select>
              <Button asChild type="button">
                <label>
                  <input className="sr-only" accept=".pdf" disabled={isTestingLayout} type="file" onChange={(event) => { void onTestPdf(event.target.files); event.target.value = ""; }} />
                  <AppIcon className="bg-white/15 text-primary-foreground" name="upload" />
                  {isTestingLayout ? "Testando..." : "Testar PDF"}
                </label>
              </Button>
            </div>
          </div>

          {testResult ? <LayoutTestPreview closeCandidates={closeCandidates} result={testResult} onRefreshLayouts={onRefreshLayouts} /> : null}

          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[92px_180px_1fr_120px_140px] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Status</span>
              <span>Banco</span>
              <span>Layout</span>
              <span>Tipo</span>
              <span>Confianca min.</span>
            </div>
            {filteredLayouts.map((layout) => (
              <div className="grid grid-cols-[92px_180px_1fr_120px_140px] items-center gap-3 border-t border-border px-4 py-3 text-sm" key={layout.id}>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${layout.enabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                  type="button"
                  onClick={() => onToggleLayout(layout)}
                >
                  {layout.enabled ? "Ativo" : "Inativo"}
                </button>
                <span className="font-medium text-foreground">{layout.bankName}</span>
                <span className="text-muted-foreground">{layout.name}</span>
                <span className="text-muted-foreground">PDF</span>
                <span className="text-muted-foreground">{layout.minimumScore}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function suggestMatchersFromContent(content: string, fileName: string): string[] {
  const suggested: string[] = [];
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.length > 5 && l.length < 50);
  
  const candidateLines = lines.filter(line => {
    const hasNumbers = /\d{3,}/.test(line);
    const hasCurrency = /R\$/i.test(line);
    const hasDate = /\d{1,2}[/-]\d{1,2}/.test(line);
    return !hasNumbers && !hasCurrency && !hasDate;
  });

  const markers = ["extrato", "conta", "agencia", "periodo", "demonstrativo", "movimentacao", "lancamento", "saldo", "banco", "banking"];
  const markedCandidates = candidateLines.filter(line => 
    markers.some(marker => line.toLowerCase().includes(marker))
  );

  suggested.push(...markedCandidates.slice(0, 3));

  if (suggested.length < 2) {
    for (const cand of candidateLines) {
      if (!suggested.includes(cand) && cand.length > 10) {
        suggested.push(cand);
        if (suggested.length >= 3) break;
      }
    }
  }

  if (suggested.length === 0) {
    suggested.push("Extrato");
  }

  return suggested;
}

function detectBankFromContent(content: string, fileName: string): string {
  const normalizedText = (content + " " + fileName).toLowerCase();
  const banks = getSupportedStatementBanks();
  
  for (const bank of banks) {
    if (bank.id === "outros") continue;
    
    const namesToCheck = [bank.name, ...bank.aliases];
    for (const name of namesToCheck) {
      if (normalizedText.includes(name.toLowerCase())) {
        return bank.id;
      }
    }
  }
  
  return "outros";
}

function LayoutTestPreview({
  closeCandidates,
  result,
  onRefreshLayouts
}: {
  closeCandidates: NonNullable<LayoutIdentificationResult["candidates"]>;
  result: LayoutTestResult;
  onRefreshLayouts: () => void;
}) {
  const best = result.identification.layout;
  const [showLearningForm, setShowLearningForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedBankId, setSelectedBankId] = useState("outros");
  const [matchersInput, setMatchersInput] = useState("");
  const [minScore, setMinScore] = useState(50);
  const [saveSuccess, setSaveSuccess] = useState("");

  useEffect(() => {
    if (result.content) {
      const suggestedName = result.fileName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
      setNewName(suggestedName);
      
      const detectedId = detectBankFromContent(result.content, result.fileName);
      setSelectedBankId(detectedId);
      
      const suggested = suggestMatchersFromContent(result.content, result.fileName);
      setMatchersInput(suggested.join("\n"));
    } else {
      setNewName("");
      setSelectedBankId("outros");
      setMatchersInput("");
    }
    setSaveSuccess("");
    setShowLearningForm(false);
  }, [result]);

  function saveLearnedLayout() {
    const bank = getSupportedStatementBanks().find(b => b.id === selectedBankId) || getSupportedStatementBanks().find(b => b.id === "outros");
    if (!bank) return;
    
    const now = new Date().toISOString();
    const layoutId = `custom-pdf-${Date.now()}`;
    const matchersList = matchersInput
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map((val, idx) => ({
        id: `${layoutId}-matcher-${idx + 1}`,
        type: "text" as const,
        value: val,
        weight: 30
      }));
      
    const newLayout: StatementLayout = {
      id: layoutId,
      bankId: bank.id,
      bankName: bank.name,
      name: newName.trim(),
      source: "pdf",
      parser: "pdf-layout",
      version: 1,
      enabled: true,
      priority: 95,
      minimumScore: minScore,
      matchers: matchersList,
      createdAt: now,
      updatedAt: now
    };
    
    saveStatementLayout(newLayout);
    setSaveSuccess(`Layout "${newLayout.name}" cadastrado com sucesso!`);
    onRefreshLayouts();
    setTimeout(() => {
      setShowLearningForm(false);
      setSaveSuccess("");
    }, 2500);
  }

  const banks = getSupportedStatementBanks();

  return (
    <Card className="border-sky-200">
      <CardContent className="grid gap-4 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <StatusPill tone={best ? "success" : "warning"}>{best ? best.bankName : "Banco nao identificado"}</StatusPill>
          <StatusPill tone="neutral">{best?.name ?? "Forca bruta"}</StatusPill>
          <StatusPill tone={result.identification.confidence >= 0.7 ? "success" : "warning"}>{Math.round(result.identification.confidence * 100)}% confianca</StatusPill>
          <StatusPill tone={result.transactions.length > 0 ? "success" : "warning"}>{result.transactions.length} lancamento(s)</StatusPill>
        </div>
        {closeCandidates.length > 1 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            Atencao: {closeCandidates.length} layouts tiveram pontuacao parecida. Confira o layout detectado antes de importar.
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground border-b border-border pb-3">
          <div className="grid gap-1">
            <p className="font-semibold text-foreground">Identificadores encontrados</p>
            <p>{result.identification.candidates[0]?.matchedMatchers.join(", ") || "Nenhum identificador especifico encontrado."}</p>
          </div>
          {!best && (
            <Button size="sm" type="button" onClick={() => setShowLearningForm(!showLearningForm)}>
              <AppIcon className="bg-white/15 text-primary-foreground" name="settings" />
              {showLearningForm ? "Ocultar Cadastro" : "Aprender este Layout"}
            </Button>
          )}
        </div>

        {showLearningForm ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 grid gap-4 text-sm">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
              <span className="font-bold text-emerald-800">Aprendizado Inteligente de Layout PDF</span>
              <span className="text-xs text-emerald-600">O sistema analisou o extrato e pre-preencheu os campos</span>
            </div>
            {saveSuccess ? (
              <div className="rounded-lg bg-emerald-100 p-3 text-emerald-800 font-semibold">{saveSuccess}</div>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-emerald-800">Banco</span>
                    <select
                      className="h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm"
                      value={selectedBankId}
                      onChange={(e) => setSelectedBankId(e.target.value)}
                    >
                      {banks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-emerald-800">Nome do Layout</span>
                    <Input
                      className="border-emerald-200 bg-white"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ex: Banco Inter Modelo 2"
                    />
                  </label>
                </div>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-emerald-800">Identificadores Textuais Recomendados (um por linha)</span>
                  <span className="text-xs text-emerald-600 mb-1">Phrases estaticas que existem apenas neste modelo de PDF para reconhecimento automatico</span>
                  <textarea
                    className="min-h-24 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-emerald-500"
                    value={matchersInput}
                    onChange={(e) => setMatchersInput(e.target.value)}
                  />
                </label>
                <div className="flex items-center justify-between border-t border-emerald-100 pt-3">
                  <label className="flex items-center gap-2 text-xs text-emerald-700">
                    <span>Confianca Minima:</span>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      className="w-16 h-8 rounded border border-emerald-200 bg-white text-center text-sm"
                      value={minScore}
                      onChange={(e) => setMinScore(Number(e.target.value))}
                    />
                    <span>%</span>
                  </label>
                  <Button size="sm" type="button" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={saveLearnedLayout}>
                    <AppIcon className="bg-white/15 text-primary-foreground" name="check" />
                    Salvar e Vincular Layout
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {result.errors.length > 0 ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{result.errors.join(" ")}</div>
        ) : null}
        <div className="max-h-72 overflow-auto rounded-2xl border border-border">
          <div className="grid grid-cols-[120px_1fr_120px_160px] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Data</span>
            <span>Historico</span>
            <span>Valor</span>
            <span>Banco</span>
          </div>
          {result.transactions.slice(0, 20).map((transaction) => (
            <div className="grid grid-cols-[120px_1fr_120px_160px] gap-3 border-t border-border px-4 py-3 text-sm" key={transaction.id}>
              <span>{transaction.date}</span>
              <span className="truncate">{transaction.person}</span>
              <span>{formatMoney(transaction.netValue)}</span>
              <span className="truncate">{transaction.bank}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleSpreadsheetCard({
  activeKind,
  config,
  onChangeKind,
  onConfirm,
  onUpdateMapping,
  saveMessage
}: {
  activeKind: SheetKind;
  config: CompanySheetConfig;
  onChangeKind: (kind: SheetKind) => void;
  onConfirm: () => void;
  onUpdateMapping: (kind: SheetKind, fieldId: string, column: string) => void;
  saveMessage: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardDescription>Planilha Simples</CardDescription>
            <CardTitle>Layout de colunas</CardTitle>
          </div>
          <div className="flex rounded-full border border-border bg-muted p-1" role="radiogroup" aria-label="Tipo de planilha simples">
            <KindButton active={activeKind === "payments"} label="Pagamentos" onClick={() => onChangeKind("payments")} />
            <KindButton active={activeKind === "receipts"} label="Recebimentos" onClick={() => onChangeKind("receipts")} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <div className="grid gap-4 lg:grid-cols-2">
            {sheetFields[activeKind].map((field) => (
              <ColumnSelect key={field.id} label={field.label} value={config[activeKind][field.id] ?? ""} onChange={(column) => onUpdateMapping(activeKind, field.id, column)} />
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            {saveMessage ? <StatusPill tone="success">{saveMessage}</StatusPill> : <StatusPill tone="neutral">Alteracoes ficam por empresa e tipo de planilha</StatusPill>}
            <Button type="submit">
              <AppIcon className="bg-white/15 text-primary-foreground" name="check" />
              Confirmar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CustomSpreadsheetLayoutsCard({
  customLayouts,
  draft,
  onChangeDraft,
  onDelete,
  onEdit,
  onResetDraft,
  onSave
}: {
  customLayouts: StatementLayout[];
  draft: LayoutDraft;
  onChangeDraft: (draft: Partial<LayoutDraft>) => void;
  onDelete: (layout: StatementLayout) => void;
  onEdit: (layout: StatementLayout) => void;
  onResetDraft: () => void;
  onSave: () => void;
}) {
  const banks = getSupportedStatementBanks();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <CardDescription>Planilha Customizada</CardDescription>
        <CardTitle>Layouts parametrizados por banco</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Banco</span>
            <select className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={draft.bankId} onChange={(event) => onChangeDraft({ bankId: event.target.value })}>
              {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
            </select>
          </label>
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome do layout</span>
            <Input value={draft.name} onChange={(event) => onChangeDraft({ name: event.target.value })} placeholder="Ex.: Bradesco Modelo A" />
          </label>
          <label className="grid gap-2 lg:col-span-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Textos de identificacao</span>
            <textarea className="min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm" value={draft.matchers} onChange={(event) => onChangeDraft({ matchers: event.target.value })} />
          </label>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ColumnSelect label="Data" value={draft.dateColumn} onChange={(value) => onChangeDraft({ dateColumn: value })} />
          <ColumnSelect label="Descricao" value={draft.descriptionColumn} onChange={(value) => onChangeDraft({ descriptionColumn: value })} />
          <ColumnSelect label="Valor" value={draft.valueColumn} onChange={(value) => onChangeDraft({ valueColumn: value })} />
          <ColumnSelect label="Banco" value={draft.bankColumn} onChange={(value) => onChangeDraft({ bankColumn: value })} />
          <ColumnSelect label="Documento" value={draft.documentColumn} onChange={(value) => onChangeDraft({ documentColumn: value })} />
          <ColumnSelect label="Debito/Credito" value={draft.debitCreditColumn} onChange={(value) => onChangeDraft({ debitCreditColumn: value })} />
          <ColumnSelect label="Saldo" value={draft.balanceColumn} onChange={(value) => onChangeDraft({ balanceColumn: value })} />
          <ColumnSelect label="Complemento 1" value={draft.extraOneColumn} onChange={(value) => onChangeDraft({ extraOneColumn: value })} />
          <ColumnSelect label="Complemento 2" value={draft.extraTwoColumn} onChange={(value) => onChangeDraft({ extraTwoColumn: value })} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-5">
          <Button type="button" variant="outline" onClick={onResetDraft}>Limpar</Button>
          <Button disabled={!draft.name.trim() || !draft.dateColumn || !draft.descriptionColumn || !draft.valueColumn} type="button" onClick={onSave}>Salvar layout customizado</Button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[96px_1fr_180px_160px] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Acoes</span><span>Layout</span><span>Banco</span><span>Identificadores</span>
          </div>
          {customLayouts.length > 0 ? customLayouts.map((layout) => (
            <div className="grid grid-cols-[96px_1fr_180px_160px] items-center gap-3 border-t border-border px-4 py-3 text-sm" key={layout.id}>
              <div className="flex gap-1">
                <Button size="icon" type="button" variant="ghost" aria-label={`Editar ${layout.name}`} onClick={() => onEdit(layout)}><AppIcon className="bg-sky-50 text-sky-600" name="settings" /></Button>
                <Button size="icon" type="button" variant="ghost" aria-label={`Excluir ${layout.name}`} onClick={() => onDelete(layout)}><AppIcon className="bg-rose-50 text-rose-600" name="close" /></Button>
              </div>
              <span className="font-medium text-foreground">{layout.name}</span>
              <span className="text-muted-foreground">{layout.bankName}</span>
              <span className="text-muted-foreground">{layout.matchers.length}</span>
            </div>
          )) : <div className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum layout customizado cadastrado.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ColumnSelect({ label, onChange, value }: { label: string; onChange: (column: string) => void; value: string }) {
  return (
    <label className="group grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {columnOptions.map((column) => <option key={column || "empty"} value={column}>{column || "Selecione uma coluna"}</option>)}
      </select>
    </label>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={`rounded-xl px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} type="button" onClick={onClick}>{label}</button>;
}

function KindButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-checked={active} className={`rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`} role="radio" type="button" onClick={onClick}>{label}</button>;
}

function getSpreadsheetLayouts() {
  return getStatementLayouts("csv").filter((layout) => layout.parser === "spreadsheet-layout" && layout.id.startsWith("custom-csv"));
}

function getPdfLayouts() {
  return getStatementLayouts("pdf").filter((layout) => layout.parser === "pdf-layout");
}

function getCloseCandidates(identification: LayoutIdentificationResult | undefined) {
  if (!identification?.candidates.length) {
    return [];
  }
  const bestConfidence = identification.candidates[0].confidence;
  return identification.candidates.filter((candidate) => bestConfidence - candidate.confidence <= 0.15);
}

function createEmptyLayoutDraft(): LayoutDraft {
  return {
    id: "",
    bankColumn: "",
    bankId: "outros",
    balanceColumn: "",
    createdAt: "",
    dateColumn: "",
    debitCreditColumn: "",
    descriptionColumn: "",
    documentColumn: "",
    extraOneColumn: "",
    extraTwoColumn: "",
    matchers: "",
    name: "",
    valueColumn: ""
  };
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}
