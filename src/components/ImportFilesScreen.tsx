"use client";

import { useEffect, useMemo, useState, type ReactNode, type DragEvent } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { getAccountOptions } from "../lib/account-plan-store";
import { generateAccountingFiles } from "../lib/import/accounting-generator";
import { ACCOUNTING_EXPORT_LAYOUT_NAME, ACCOUNTING_EXPORT_SEPARATOR, accountingExportColumns } from "../lib/import/export-layout";
import { getCompanyBankAccounts, saveCompanyBankAccount, saveCompanyBankAccounts } from "../lib/import/bank-accounts-store";
import { getCompanyImportConfig, getCompanyOfxLayoutIds, saveCompanyOfxLayoutIds } from "../lib/import/config-store";
import { getDefaultHistoryConfig } from "../lib/import/default-history-store";
import { clearImportProgress, getImportProgress, saveImportProgress } from "../lib/import/import-progress-store";
import { deleteProcessedBatchFile, getCompanyGeneratedFiles, hasProcessedBatchWithFileHashes, saveProcessedBatch } from "../lib/import/processed-batches-store";
import { extractPdfTextFromBuffer } from "../lib/import/pdf-text-extractor";
import { availableLayouts, type AvailableLayout, type LayoutGroupFilter, type LayoutTypeFilter } from "../lib/import/layouts";
import { createImportBatch } from "../lib/import/readers";
import { syncLayoutsWithDb } from "../lib/import/statement-layout-store";
import { buildTransactionSearchText, getCompanyRules, saveCompanyRule, saveSimpleMapping, matchTransaction } from "../lib/import/rules-store";
import type {
  BankOrigin,
  Company,
  EntityId,
  HistorySegment,
  ImportBatch,
  ImportFile,
  ImportSource,
  ImportStep,
  ImportedTransaction,
  IntegrationRule,
  PendingMapping,
  GeneratedFile,
  SheetKind
} from "../lib/types";
import { AppIcon, PageHeader, PageShell, StatusPill } from "./design-system";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "./ToastContext";
import { getFriendlyErrorMessage } from "../lib/error-handler";

type RuleModalTab = "rule" | "impacted" | "history";
type RuleFormData = {
  accountDebit: string;
  historyCode: string;
};

type RuleFileField = {
  label: string;
  value: string;
};

type EditableGeneratedLine = {
  id: string;
  date: string;
  amount: string;
  debitAccount: string;
  creditAccount: string;
  historyCode: string;
  history: string;
  raw: string[];
};
type GeneratedDownloadFormat = "csv" | "que";

function resolveImportSource(fileName: string): ImportSource {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return "csv";
  }

  if (extension === "pdf") {
    return "pdf";
  }

  return "ofx";
}

async function readImportFileText(file: File, buffer: ArrayBuffer) {
  if (file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfTextFromBuffer(buffer);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

async function createFileSignature(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeRuleText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeHistory(history: string) {
  const tokens = history.match(/[A-Za-zÀ-ÿ0-9]+/g) ?? [];
  const uniqueTokens = new Map<string, string>();

  for (const token of tokens) {
    const normalizedToken = normalizeRuleText(token);
    if (normalizedToken.length < 2 || uniqueTokens.has(normalizedToken)) {
      continue;
    }

    uniqueTokens.set(normalizedToken, token.toUpperCase());
  }

  return Array.from(uniqueTokens.values());
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

function extractAccountCode(value: string) {
  return parseAccountOption(value).code;
}

function normalizeAccountInput(value: string) {
  return extractAccountCode(value).replace(/[^\w./-]/g, "").trim();
}

function getTransactionFieldMap(transaction: ImportedTransaction): RuleFileField[] {
  const complementLabels = ["COMPLEMENTO01", "COMPLEMENTO02", "COMPLEMENTO04"];
  const complementFields = transaction.complements
    .map((value, index) => ({ label: complementLabels[index] ?? `COMPLEMENTO${String(index + 1).padStart(2, "0")}`, value: value.trim() }))
    .filter((field) => field.value);

  return [
    { label: "Descrição", value: transaction.person },
    { label: "Banco", value: transaction.bank },
    { label: "Data", value: transaction.date },
    { label: "Valor", value: formatCurrency(transaction.netValue) },
    { label: "Documento", value: transaction.document || "-" },
    ...complementFields
  ];
}

function getCoreTransactionFields(fileFields: RuleFileField[]) {
  const hiddenLabels = new Set(["COMPLEMENTO01", "COMPLEMENTO02", "COMPLEMENTO04"]);
  return fileFields.filter((field) => !hiddenLabels.has(field.label));
}

function createEmptyHistorySegments(): HistorySegment[] {
  return [1, 2, 3, 4, 5].map(() => ({ fieldLabel: "", text: "" }));
}

function getTransactionFieldValue(transaction: ImportedTransaction, fieldLabel: string) {
  return getTransactionFieldMap(transaction).find((field) => field.label === fieldLabel)?.value ?? "";
}

function buildHistoryText(transaction: ImportedTransaction, segments: HistorySegment[]) {
  return segments
    .flatMap((segment) => [segment.text.trim(), segment.fieldLabel ? getTransactionFieldValue(transaction, segment.fieldLabel) : ""])
    .filter(Boolean)
    .join(" ");
}

function filterImpactedTransactions(transactions: ImportedTransaction[], selectedParts: string[]) {
  if (selectedParts.length === 0) {
    return [];
  }

  const normalizedParts = selectedParts.map(normalizeRuleText);

  return transactions.filter((transaction) => {
    const history = buildTransactionSearchText(transaction);
    return normalizedParts.every((part) => history.includes(part));
  });
}

function getRuleTokenSource(transaction: ImportedTransaction | undefined, fallback: string) {
  if (!transaction) {
    return fallback;
  }

  return getTransactionFieldMap(transaction).map((field) => field.value).join(" ");
}

export function ImportFilesScreen({ company }: { company: Company }) {
  const { toast } = useToast();
  const [importKind, setImportKind] = useState<SheetKind>("payments");
  const [importStep, setImportStep] = useState<ImportStep>("initial");
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<ImportFile[]>([]);
  const [showGeneratedFiles, setShowGeneratedFiles] = useState(false);
  const [advancedRuleMapping, setAdvancedRuleMapping] = useState<PendingMapping | null>(null);
  const [isLayoutsModalOpen, setIsLayoutsModalOpen] = useState(false);
  const [selectedLayouts, setSelectedLayouts] = useState<number[]>([]);
  useEffect(() => {
    getCompanyOfxLayoutIds(company.id, importKind).then(setSelectedLayouts);
  }, [company.id, importKind]);
  const [currentBatch, setCurrentBatch] = useState<ImportBatch | null>(null);
  const [rules, setRules] = useState<IntegrationRule[]>([]);
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});
  const [bankAccountMappings, setBankAccountMappings] = useState<Record<string, string>>({});
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  useEffect(() => {
    getCompanyGeneratedFiles(company.id).then(setGeneratedFiles);
  }, [company.id]);
  const [downloadPreviewFile, setDownloadPreviewFile] = useState<GeneratedFile | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [readingFileName, setReadingFileName] = useState("");
  const [mappingErrors, setMappingErrors] = useState<string[]>([]);
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);
  const [isConfirmingFiles, setIsConfirmingFiles] = useState(false);
  const [isSavingAndContinuing, setIsSavingAndContinuing] = useState(false);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [savingBanks, setSavingBanks] = useState<Record<string, boolean>>({});
  const [deletingFileIds, setDeletingFileIds] = useState<Record<string, boolean>>({});

  const kindLabel = importKind === "payments" ? "pagamentos" : "recebimentos";
  const selectedAvailableLayouts = availableLayouts.filter((layout) => selectedLayouts.includes(layout.id));
  const [accountOptions, setAccountOptions] = useState<string[]>([]);
  useEffect(() => {
    getAccountOptions(company.id).then(setAccountOptions);
  }, [company.id]);

  useEffect(() => {
    syncLayoutsWithDb().catch((err) => console.error("Erro ao sincronizar layouts:", err));
    getImportProgress(company.id, importKind).then(savedProgress => {
      setSelectedFiles(savedProgress?.batch.files ?? []);
      setCurrentBatch(savedProgress?.batch ?? null);
      setImportStep(savedProgress?.step ?? "initial");
    });
    getCompanyOfxLayoutIds(company.id, importKind).then(setSelectedLayouts);
    getCompanyRules(company.id, importKind).then(setRules);
    setLocalMappings({});
    getCompanyBankAccounts(company.id).then(setBankAccountMappings);
    getCompanyGeneratedFiles(company.id).then(setGeneratedFiles);
    setUploadErrors([]);
    setIsReadingFiles(false);
    setReadingFileName("");
    setMappingErrors([]);
    setGenerationErrors([]);
  }, [company.id, importKind]);

  const unmappedTransactions = useMemo(() => {
    if (!currentBatch) {
      return [];
    }
    return currentBatch.transactions.filter((t) => !matchTransaction(t, rules));
  }, [currentBatch, rules]);

  const pendingMappings = useMemo(() => {
    const grouped = new Map<string, typeof unmappedTransactions>();
    for (const t of unmappedTransactions) {
      const key = `${t.origin}-${t.person}`;
      grouped.set(key, [...(grouped.get(key) ?? []), t]);
    }

    return Array.from(grouped.values()).map((items, index) => ({
      id: index + 1,
      supplier: items[0].person,
      origin: items[0].origin === "CSV" ? "PLANILHA" : "EXTRATO",
      transactionIds: items.map((item) => item.id),
      amount: items.reduce((total, item) => total + item.netValue, 0)
    }));
  }, [unmappedTransactions]);

  const bankOrigins = useMemo(() => {
    if (!currentBatch) {
      return [];
    }
    return currentBatch.bankOrigins;
  }, [currentBatch]);

  function openFileModal() {
    setIsFileModalOpen(true);
  }

  function removeSelectedFile(fileId: EntityId) {
    setUploadErrors([]);
    setSelectedFiles((current) => current.filter((file) => file.id !== fileId));
  }

  async function addBrowserFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    const files: ImportFile[] = [];
    const readErrors: string[] = [];

    setIsReadingFiles(true);
    setUploadErrors([]);

    try {
      for (const [index, file] of Array.from(fileList).entries()) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (!extension || !["ofx", "csv", "pdf"].includes(extension)) {
          readErrors.push(`${file.name}: Tipo de arquivo não suportado. Use apenas OFX, CSV ou PDF.`);
          continue;
        }

        const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
        if (file.size > MAX_FILE_SIZE) {
          readErrors.push(`${file.name}: Arquivo excede o tamanho máximo de 15MB.`);
          continue;
        }

        setReadingFileName(file.name);

        try {
          const buffer = await file.arrayBuffer();
          const content = await readImportFileText(file, buffer);

          files.push({
            id: Date.now() + index,
            name: file.name,
            type: resolveImportSource(file.name),
            content,
            signature: await createFileSignature(buffer)
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
          readErrors.push(`${file.name}: não foi possível ler o arquivo. ${errorMessage}`);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    } finally {
      setIsReadingFiles(false);
      setReadingFileName("");
    }

    const currentSignatures = new Set(selectedFiles.map((file) => file.signature).filter(Boolean));
    const uniqueFiles = files.filter((file) => !file.signature || !currentSignatures.has(file.signature));
    const skippedCount = files.length - uniqueFiles.length;

    setUploadErrors([
      ...readErrors,
      ...(skippedCount > 0 ? [`${skippedCount} arquivo(s) duplicado(s) ignorado(s) neste lote.`] : [])
    ]);
    setSelectedFiles((current) => [...current, ...uniqueFiles]);

    if (uniqueFiles.length > 0) {
      toast.success("Arquivos carregados", `${uniqueFiles.length} arquivo(s) importado(s) com sucesso.`);
    }
    if (readErrors.length > 0) {
      toast.error("Erro ao importar arquivo", "Alguns arquivos não puderam ser lidos ou não são suportados.");
    }
  }

  async function confirmFiles() {
    if (isConfirmingFiles) return;
    setIsConfirmingFiles(true);
    try {
      const fileHashes = selectedFiles.map((file) => file.signature).filter((signature): signature is string => Boolean(signature));
      const hasDuplicateInSelection = new Set(fileHashes).size !== fileHashes.length;

      if (hasDuplicateInSelection) {
        setUploadErrors(["Existem arquivos duplicados no lote atual. Remova os repetidos antes de continuar."]);
        setIsConfirmingFiles(false);
        return;
      }

      let hasPreviouslyProcessedBatch = false;
      try {
        hasPreviouslyProcessedBatch = await hasProcessedBatchWithFileHashes(company.id, importKind, fileHashes, selectedFiles.map((file) => file.name));
      } catch (error) {
        console.warn("Nao foi possivel verificar duplicidade do lote antes da importacao:", error);
      }

      if (hasPreviouslyProcessedBatch) {
        setUploadErrors(["Este conjunto de arquivos ja foi gerado anteriormente para esta empresa e tipo de lancamento."]);
        setIsConfirmingFiles(false);
        return;
      }

      const batch = createImportBatch({
        companyId: company.id,
        config: await getCompanyImportConfig(company.id),
        files: selectedFiles,
        kind: importKind,
        selectedLayoutIds: selectedLayouts
      });

      setCurrentBatch(batch);
      setIsFileModalOpen(false);
      setUploadErrors([]);
      setImportStep("processing");
      await saveImportProgressSafely(company.id, importKind, batch, "processing");
      window.setTimeout(async () => {
        setImportStep("mapping");
        await saveImportProgressSafely(company.id, importKind, batch, "mapping");
        setIsConfirmingFiles(false);
      }, 1200);
    } catch (error) {
      console.error(error);
      const friendly = getFriendlyErrorMessage(error);
      toast.error("Erro ao importar arquivo", friendly.description);
      setUploadErrors(["Ocorreu um erro ao processar os arquivos. Tente novamente."]);
      setIsConfirmingFiles(false);
    }
  }

  async function saveImportProgressSafely(companyId: Company["id"], kind: SheetKind, batch: ImportBatch, step: ImportStep) {
    try {
      await saveImportProgress(companyId, kind, batch, step);
    } catch (error) {
      console.warn("Nao foi possivel salvar o progresso da importacao:", error);
    }
  }

  async function confirmLayouts(layoutIds: number[]) {
    await saveCompanyOfxLayoutIds(company.id, importKind, layoutIds);
    setSelectedLayouts(layoutIds);
    setCurrentBatch(null);
    setImportStep("initial");
    await clearImportProgress(company.id, importKind);
  }

  async function clearLayouts() {
    await saveCompanyOfxLayoutIds(company.id, importKind, []);
    setSelectedLayouts([]);
    setCurrentBatch(null);
    setImportStep("initial");
    await clearImportProgress(company.id, importKind);
  }

  async function cancelCurrentImport() {
    setSelectedFiles([]);
    setCurrentBatch(null);
    setLocalMappings({});
    setMappingErrors([]);
    setGenerationErrors([]);
    setUploadErrors([]);
    setImportStep("initial");
    await clearImportProgress(company.id, importKind);
  }

  async function handleSaveAndContinue() {
    try {
      const filledMappings = Object.entries(localMappings).filter(([, account]) => account && account.trim());

      for (const [supplier, account] of filledMappings) {
        if (account && account.trim()) {
          await saveSimpleMapping(company.id, importKind, supplier, normalizeAccountInput(account));
        }
      }

      const updatedRules = await getCompanyRules(company.id, importKind);
      const remainingMappings = pendingMappings.filter((mapping) => !localMappings[mapping.supplier]?.trim());

      setRules(updatedRules);
      setLocalMappings({});

      if (filledMappings.length > 0) {
        toast.success("Sucesso ao salvar", `${filledMappings.length} mapeamento(s) De/Para salvo(s).`);
      }

      if (remainingMappings.length > 0) {
        const savedMessage = filledMappings.length > 0 ? `${filledMappings.length} De/Para salvo(s). ` : "";
        setMappingErrors([`${savedMessage}Ainda existem ${remainingMappings.length} De/Para pendente(s) antes de continuar.`]);
        return;
      }

      setMappingErrors([]);
      setImportStep("bankAccount");
      if (currentBatch) {
        await saveImportProgress(company.id, importKind, currentBatch, "bankAccount");
      }
    } catch (error) {
      console.error(error);
      const friendly = getFriendlyErrorMessage(error);
      toast.error("Erro ao salvar", friendly.description);
    }
  }

  async function handleGenerateAccountingBatch() {
    if (!currentBatch) {
      setGenerationErrors(["Nenhum lote carregado para gerar."]);
      return;
    }

    const missingBankAccounts = currentBatch.bankOrigins.filter((item) => !bankAccountMappings[item.bank]?.trim());
    if (missingBankAccounts.length > 0) {
      setGenerationErrors([`Informe a conta portador para ${missingBankAccounts.length} banco(s) antes de gerar o lote.`]);
      return;
    }

    setIsGeneratingBatch(true);
    try {
      const normalizedBankAccounts = Object.fromEntries(Object.entries(bankAccountMappings).map(([bank, account]) => [bank, normalizeAccountInput(account)]));
      await saveCompanyBankAccounts(company.id, normalizedBankAccounts);

      const updatedRules = await getCompanyRules(company.id, importKind);
      const result = generateAccountingFiles({
        bankAccounts: normalizedBankAccounts,
        batch: currentBatch,
        company,
        defaultHistory: await getDefaultHistoryConfig(company.id, importKind),
        rules: updatedRules
      });
      setRules(updatedRules);
      setGenerationErrors(result.errors);

      if (result.errors && result.errors.length > 0) {
        toast.error("Erro ao processar lote", "Houve erros na validação das regras de processamento.");
      }

      if (result.files.length > 0) {
        await Promise.all(result.files.map((file) => saveProcessedBatch(company.id, currentBatch, file)));
        setGeneratedFiles((current) => [...result.files, ...current]);
        setShowGeneratedFiles(true);
        await clearImportProgress(company.id, importKind);
        toast.success("Sucesso ao gerar arquivo", "Lote contábil gerado com sucesso!");
      }
    } catch (error) {
      console.error(error);
      const friendly = getFriendlyErrorMessage(error);
      toast.error("Erro ao processar lote", friendly.description);
    } finally {
      setIsGeneratingBatch(false);
    }
  }

  async function deleteGeneratedFile(fileId: EntityId) {
    const fileKey = String(fileId);
    setDeletingFileIds((prev) => ({ ...prev, [fileKey]: true }));
    try {
      await deleteProcessedBatchFile(company.id, fileId);
      setGeneratedFiles((current) => current.filter((file) => file.id !== fileId));
      toast.success("Arquivo excluído", "O arquivo gerado foi removido com sucesso.");
    } catch (error) {
      console.error(error);
      const friendly = getFriendlyErrorMessage(error);
      toast.error("Erro ao excluir arquivo", friendly.description);
    } finally {
      setDeletingFileIds((prev) => ({ ...prev, [fileKey]: false }));
    }
  }

  function downloadGeneratedFile(file: GeneratedFile) {
    const blob = new Blob([file.content], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function requestGeneratedFileDownload(file: GeneratedFile) {
    setDownloadPreviewFile(file);
  }

  function confirmGeneratedFileDownload(file: GeneratedFile, lines: EditableGeneratedLine[], format: GeneratedDownloadFormat) {
    const csvContent = buildGeneratedFileContent(file.content, lines);
    const downloadFile: GeneratedFile = {
      ...file,
      content: format === "que" ? buildQueFileContent(lines) : csvContent,
      name: buildDownloadFileName(file.name, format),
      mimeType: format === "que" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8",
      lineCount: lines.length,
      totalValue: lines.reduce((total, line) => total + parseGeneratedMoney(line.amount), 0)
    };
    const storedFile: GeneratedFile = {
      ...file,
      content: csvContent,
      lineCount: downloadFile.lineCount,
      totalValue: downloadFile.totalValue
    };

    setGeneratedFiles((current) => current.map((item) => (item.id === storedFile.id ? storedFile : item)));
    setDownloadPreviewFile(null);
    downloadGeneratedFile(downloadFile);
  }

  async function saveBankAccountMapping(bank: string) {
    setSavingBanks((prev) => ({ ...prev, [bank]: true }));
    try {
      await saveCompanyBankAccount(company.id, bank, normalizeAccountInput(bankAccountMappings[bank] ?? ""));
      toast.success("Sucesso ao salvar", "Conta de portador salva com sucesso.");
      setGenerationErrors([]);
    } catch (error) {
      console.error(error);
      const friendly = getFriendlyErrorMessage(error);
      toast.error("Erro ao salvar", friendly.description);
    } finally {
      setSavingBanks((prev) => ({ ...prev, [bank]: false }));
    }
  }

  return (
    <PageShell className="relative">
      <PageHeader
        badge="Importação"
        title="Importar arquivos"
        description="Carregue arquivos OFX, CSV ou PDF, acompanhe a leitura e resolva pendências de De/Para antes da geração final."
        actions={
          <div className="flex flex-wrap gap-2">
            {importStep === "initial" ? (
              <Button type="button" variant="outline" onClick={() => setShowGeneratedFiles(true)}>
                <AppIcon className="bg-muted" name="history" />
                Lotes anteriores
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setIsLayoutsModalOpen(true)}>
              <AppIcon className="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" name="table" />
              {selectedLayouts.length > 0 ? <StatusPill tone="success">{selectedLayouts.length}</StatusPill> : null}
              Layouts disponíveis
            </Button>
          </div>
        }
      />

      <div className="mt-6 space-y-6">
      <ImportToolbar
        importKind={importKind}
        showGeneratedFiles={showGeneratedFiles}
        onChangeKind={setImportKind}
        onToggleGenerated={setShowGeneratedFiles}
      />

      {selectedAvailableLayouts.length > 0 ? (
        <SelectedLayoutsPanel layouts={selectedAvailableLayouts} onClear={clearLayouts} onEdit={() => setIsLayoutsModalOpen(true)} />
      ) : null}

      {importStep === "initial" && !showGeneratedFiles ? (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Selecione os arquivos para leitura</h2>
              <p className="mt-1 text-sm text-muted-foreground">Aceita arquivos OFX, CSV e PDF. É possível adicionar mais de um arquivo no mesmo lote.</p>
            </div>
            <Button className="rounded-xl" type="button" variant="premium" onClick={openFileModal}>
              <AppIcon className="bg-white/15 text-white" name="upload" />
              Carregar arquivos
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {showGeneratedFiles ? (
        <div className="space-y-6">
          <GeneratedFilesPanel files={generatedFiles} onDelete={deleteGeneratedFile} onDownload={requestGeneratedFileDownload} deletingFileIds={deletingFileIds} />
          <ExportLayoutPanel />
        </div>
      ) : (
        <>
          {importStep === "processing" ? <ImportProcessing files={selectedFiles} /> : null}
          {importStep === "mapping" ? (
            <PendingMappingPanelV2
              accountOptions={accountOptions}
              errors={currentBatch?.errors ?? []}
              mappings={pendingMappings}
              mappingErrors={mappingErrors}
              localMappings={localMappings}
              onMappingChange={(supplier: string, account: string) => {
                setMappingErrors([]);
                setLocalMappings((prev) => ({ ...prev, [supplier]: account }));
              }}
              totalTransactions={currentBatch?.transactions.length ?? 0}
              onContinue={handleSaveAndContinue}
              onOpenAdvancedRule={setAdvancedRuleMapping}
              onCancelBatch={cancelCurrentImport}
              isSaving={isSavingAndContinuing}
            />
          ) : null}
          {importStep === "bankAccount" ? (
            <BankAccountPanelV2
              accountOptions={accountOptions}
              bankAccountMappings={bankAccountMappings}
              bankOrigins={currentBatch?.bankOrigins ?? []}
              generationErrors={generationErrors}
              totalTransactions={currentBatch?.transactions.length ?? 0}
              onBankAccountChange={(bank, account) => {
                setGenerationErrors([]);
                setBankAccountMappings((current) => ({ ...current, [bank]: account }));
              }}
              onSaveBankAccount={saveBankAccountMapping}
              onGenerate={handleGenerateAccountingBatch}
              onCancelBatch={cancelCurrentImport}
              isGenerating={isGeneratingBatch}
              savingBanks={savingBanks}
            />
          ) : null}
        </>
      )}

      {showGeneratedFiles ? null : null } 

      </div>

      <FileUploadDialog
        files={selectedFiles}
        isReadingFiles={isReadingFiles}
        readingFileName={readingFileName}
        errors={uploadErrors}
        open={isFileModalOpen}
        onFilesSelected={addBrowserFiles}
        onConfirm={confirmFiles}
        onOpenChange={setIsFileModalOpen}
        onRemoveFile={removeSelectedFile}
        isConfirming={isConfirmingFiles}
      />
      <AvailableLayoutsDialog
        open={isLayoutsModalOpen}
        selectedLayoutIds={selectedLayouts}
        onConfirm={confirmLayouts}
        onOpenChange={setIsLayoutsModalOpen}
      />

      {advancedRuleMapping ? (
        <AdvancedRuleModalV2
          accountOptions={accountOptions}
          mapping={advancedRuleMapping}
          transactions={currentBatch?.transactions ?? []}
          onClose={() => setAdvancedRuleMapping(null)}
          onSaveRule={async (ruleData: Omit<IntegrationRule, "id" | "companyId" | "kind" | "targetDescription" | "type">) => {
            try {
              await saveCompanyRule(company.id, {
                companyId: company.id,
                kind: importKind,
                targetDescription: advancedRuleMapping.supplier,
                type: "advanced",
                ...ruleData
              });
              toast.success("Sucesso ao salvar", "Regra avançada de integração salva com sucesso.");
              getCompanyRules(company.id, importKind).then(setRules);
              setMappingErrors([]);
              setAdvancedRuleMapping(null);
            } catch (error) {
              console.error(error);
              const friendly = getFriendlyErrorMessage(error);
              toast.error("Erro ao salvar", friendly.description);
              throw error;
            }
          }}
        />
      ) : null}

      {downloadPreviewFile ? (
        <GeneratedFilePreviewDialog
          accountOptions={accountOptions}
          file={downloadPreviewFile}
          onClose={() => setDownloadPreviewFile(null)}
          onConfirm={(lines, format) => confirmGeneratedFileDownload(downloadPreviewFile, lines, format)}
        />
      ) : null}
    </PageShell>
  );
}

function ImportToolbar({
  importKind,
  onChangeKind,
  onToggleGenerated,
  showGeneratedFiles
}: {
  importKind: SheetKind;
  onChangeKind: (kind: SheetKind) => void;
  onToggleGenerated: (value: boolean) => void;
  showGeneratedFiles: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div
          className="relative grid h-12 w-full max-w-xs grid-cols-2 overflow-hidden rounded-full border border-border bg-muted/80 p-1 shadow-inner shadow-slate-950/5 sm:w-72"
          role="radiogroup"
          aria-label="Tipo de arquivo"
        >
          <span
            aria-hidden="true"
            className={`absolute bottom-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-card shadow-sm shadow-slate-950/10 ring-1 ring-border/70 transition-transform duration-300 ease-out ${
              importKind === "receipts" ? "translate-x-[calc(100%+0.25rem)]" : "translate-x-0"
            }`}
          />
          <ToggleButton active={importKind === "payments"} label="Pagamentos" onClick={() => onChangeKind("payments")} />
          <ToggleButton active={importKind === "receipts"} label="Recebimentos" onClick={() => onChangeKind("receipts")} />
        </div>

        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-muted-foreground">
          <input className="sr-only" checked={showGeneratedFiles} onChange={(event) => onToggleGenerated(event.target.checked)} type="checkbox" />
          <span className={`flex h-6 w-11 rounded-full p-0.5 transition-colors ${showGeneratedFiles ? "bg-primary" : "bg-muted-foreground/25"}`}>
            <span className={`size-5 rounded-full bg-white shadow-sm transition-transform ${showGeneratedFiles ? "translate-x-5" : ""}`} />
          </span>
          Exibir arquivos gerados
        </label>
      </CardContent>
    </Card>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-checked={active}
      className={`relative z-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
      role="radio"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SelectedLayoutsPanel({
  layouts,
  onClear,
  onEdit
}: {
  layouts: AvailableLayout[];
  onClear: () => void;
  onEdit: () => void;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AppIcon className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" name="check" />
            <h2 className="text-sm font-semibold text-foreground">Layouts selecionados para importacao</h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {layouts.map((layout) => (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm dark:border-emerald-900"
                key={layout.id}
              >
                <AppIcon className="size-5 bg-transparent text-emerald-600" name={layout.group === "Planilhas" ? "sheet" : "bank"} />
                {layout.bank}
                <span className="text-muted-foreground">{layout.type}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            Editar selecao
          </Button>
          <Button type="button" variant="ghost" onClick={onClear}>
            Limpar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FileUploadDialog({
  errors,
  files,
  isReadingFiles,
  onConfirm,
  onFilesSelected,
  onOpenChange,
  onRemoveFile,
  open,
  readingFileName,
  isConfirming
}: {
  errors: string[];
  files: ImportFile[];
  isReadingFiles: boolean;
  onConfirm: () => void;
  onFilesSelected: (files: FileList | null) => void;
  onOpenChange: (open: boolean) => void;
  onRemoveFile: (fileId: EntityId) => void;
  open: boolean;
  readingFileName: string;
  isConfirming?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!isReadingFiles) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (isReadingFiles) {
      return;
    }

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      void onFilesSelected(event.dataTransfer.files);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Deseja enviar estes arquivos?</DialogTitle>
          <DialogDescription>Você pode importar vários arquivos de uma vez.</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Importação em lote disponível para OFX, CSV e PDF.
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <AppIcon className="size-4 text-amber-700 bg-transparent" name="alert" />
            Aviso sobre arquivos PDF:
          </p>
          Os arquivos PDF de extrato exigem processamento avançado via OCR ou inteligência artificial no servidor. A estrutura de integração está ativa no sistema, mas pode requerer credenciais de API. Para garantir precisão absoluta, recomendamos priorizar formatos OFX ou CSV.
        </div>

        {errors.length > 0 ? (
          <div className="grid gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        {isReadingFiles ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            <AppIcon className="bg-amber-100 text-amber-700" name="history" />
            Lendo arquivo: {readingFileName || "aguarde..."}
          </div>
        ) : null}

        <div className="grid gap-3">
          {files.map((file) => (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 px-3 py-3" key={file.id}>
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{file.name}</span>
              <Button size="icon" type="button" variant="ghost" onClick={() => onRemoveFile(file.id)} aria-label={`Remover ${file.name}`}>
                <AppIcon className="bg-rose-50 text-rose-600 dark:bg-rose-950/40" name="close" />
              </Button>
            </div>
          ))}

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragging
                ? "border-primary bg-primary/10 scale-[1.01] shadow-lg shadow-primary/5"
                : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/30"
            } ${isReadingFiles ? "pointer-events-none opacity-50" : ""}`}
          >
            <input
              id="file-dropzone-input"
              className="sr-only"
              disabled={isReadingFiles}
              multiple
              accept=".ofx,.csv,.pdf"
              type="file"
              onChange={(event) => {
                void onFilesSelected(event.target.files);
                event.target.value = "";
              }}
            />
            <label
              htmlFor="file-dropzone-input"
              className="flex flex-col items-center justify-center gap-3 cursor-pointer w-full h-full"
            >
              <div className={`p-4 rounded-2xl bg-background border border-border shadow-sm transition-transform duration-200 ${isDragging ? "scale-110 text-primary" : "text-muted-foreground"}`}>
                <AppIcon className="size-8 text-current bg-transparent" name="upload" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Arraste e solte seus arquivos aqui ou <span className="text-primary hover:underline">busque no computador</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Formatos aceitos: OFX, CSV ou PDF (máximo 15MB por arquivo)
                </p>
              </div>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming}>
            Cancelar
          </Button>
          <Button disabled={files.length === 0 || isReadingFiles || isConfirming} type="button" onClick={onConfirm}>
            {isConfirming ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processando...
              </>
            ) : (
              <>
                <AppIcon className="bg-white/15 text-primary-foreground" name="upload" />
                Confirmar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvailableLayoutsDialog({
  onConfirm,
  onOpenChange,
  open,
  selectedLayoutIds
}: {
  onConfirm: (layoutIds: number[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedLayoutIds: number[];
}) {
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<LayoutGroupFilter>("Todos");
  const [typeFilter, setTypeFilter] = useState<LayoutTypeFilter>("Todos");
  const [draftSelection, setDraftSelection] = useState<number[]>(selectedLayoutIds);

  useEffect(() => {
    if (open) {
      setDraftSelection(selectedLayoutIds);
      setQuery("");
      setGroupFilter("Todos");
      setTypeFilter("Todos");
    }
  }, [open, selectedLayoutIds]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredLayouts = availableLayouts.filter((layout) => {
    const searchText = `${layout.bank} ${layout.type} ${layout.group}`.toLowerCase();
    const matchesQuery = normalizedQuery ? searchText.includes(normalizedQuery) : true;
    const matchesGroup = groupFilter === "Todos" ? true : layout.group === groupFilter;
    const matchesType = typeFilter === "Todos" ? true : layout.type === typeFilter;

    return matchesQuery && matchesGroup && matchesType;
  });
  const selectedFilteredCount = filteredLayouts.filter((layout) => draftSelection.includes(layout.id)).length;
  const groupFilters: LayoutGroupFilter[] = ["Todos", ...Array.from(new Set(availableLayouts.map((layout) => layout.group)))] as LayoutGroupFilter[];
  const typeFilters: LayoutTypeFilter[] = ["Todos", ...Array.from(new Set(availableLayouts.map((layout) => layout.type)))] as LayoutTypeFilter[];

  function toggleLayout(layoutId: number) {
    setDraftSelection((current) =>
      current.includes(layoutId) ? current.filter((selectedId) => selectedId !== layoutId) : [...current, layoutId]
    );
  }

  function selectFilteredLayouts() {
    setDraftSelection((current) => Array.from(new Set([...current, ...filteredLayouts.map((layout) => layout.id)])));
  }

  function clearFilteredLayouts() {
    const filteredIds = new Set(filteredLayouts.map((layout) => layout.id));
    setDraftSelection((current) => current.filter((layoutId) => !filteredIds.has(layoutId)));
  }

  async function confirmLayouts() {
    onConfirm(draftSelection);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <AppIcon className="bg-primary/10 text-primary" name="file" />
            Layouts disponiveis
          </DialogTitle>
          <DialogDescription>Selecione um ou mais modelos de layout para usar como referencia da importacao.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 p-6">
          <div className="grid gap-2">
            <Label htmlFor="layout-search">Pesquisar</Label>
            <div className="relative">
              <AppIcon className="pointer-events-none absolute left-3 top-1/2 size-6 -translate-y-1/2 bg-muted text-muted-foreground" name="search" />
              <Input
                id="layout-search"
                className="pl-11"
                placeholder="Busque por banco, tipo de arquivo ou grupo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Integracao via arquivo</h3>
              <p className="text-xs text-muted-foreground">
                {filteredLayouts.length} modelo(s) encontrado(s), {selectedFilteredCount} selecionado(s) nos filtros atuais.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={filteredLayouts.length === 0} type="button" variant="outline" onClick={selectFilteredLayouts}>
                Selecionar resultados
              </Button>
              <Button disabled={selectedFilteredCount === 0} type="button" variant="ghost" onClick={clearFilteredLayouts}>
                Limpar resultados
              </Button>
              <StatusPill tone={draftSelection.length > 0 ? "success" : "neutral"}>{draftSelection.length} total</StatusPill>
            </div>
          </div>

          <div className="grid gap-3 rounded-3xl border border-border bg-muted/25 p-3">
            <FilterGroup
              label="Grupo"
              options={groupFilters}
              value={groupFilter}
              onChange={(value) => setGroupFilter(value as LayoutGroupFilter)}
            />
            <FilterGroup
              label="Formato"
              options={typeFilters}
              value={typeFilter}
              onChange={(value) => setTypeFilter(value as LayoutTypeFilter)}
            />
          </div>

          <div className="max-h-[480px] overflow-auto rounded-3xl border border-border bg-muted/30 p-4">
            {filteredLayouts.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLayouts.map((layout) => {
                  const isSelected = draftSelection.includes(layout.id);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`group flex min-h-24 flex-col items-start justify-between rounded-2xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${
                        isSelected ? "border-emerald-400 ring-4 ring-emerald-400/15" : "border-border"
                      }`}
                      key={layout.id}
                      type="button"
                      onClick={() => toggleLayout(layout.id)}
                    >
                      <div className="flex w-full items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <AppIcon
                            className={`size-10 rounded-2xl ${
                              isSelected ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" : "bg-primary/10 text-primary"
                            }`}
                            name={layout.group === "Planilhas" ? "sheet" : "bank"}
                          />
                          <span>
                            <strong className="block text-sm font-semibold text-foreground">{layout.bank}</strong>
                            <span className="text-xs text-muted-foreground">{layout.group}</span>
                          </span>
                        </div>
                        <StatusPill tone={isSelected ? "success" : "info"}>{layout.type}</StatusPill>
                      </div>
                      <span className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <AppIcon className="size-5 bg-transparent text-current" name={isSelected ? "check" : "download"} />
                        {isSelected ? "Selecionado para importacao" : "Selecionar modelo"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-card text-center">
                <div>
                  <AppIcon className="mx-auto size-12 rounded-2xl bg-muted text-muted-foreground" name="search" />
                  <p className="mt-3 text-sm font-semibold text-foreground">Nenhum layout encontrado</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ajuste a busca para localizar outro modelo.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/25 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={draftSelection.length === 0} type="button" onClick={confirmLayouts}>
            <AppIcon className="bg-white/15 text-primary-foreground" name="check" />
            Confirmar layouts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterGroup({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <span className="w-20 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
              value === option
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
            key={`${label}-${option}`}
            type="button"
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function GeneratedFilesPanel({
  files,
  onDelete,
  onDownload,
  deletingFileIds = {}
}: {
  files: GeneratedFile[];
  onDelete: (fileId: EntityId) => void;
  onDownload: (file: GeneratedFile) => void;
  deletingFileIds?: Record<string, boolean>;
}) {
  const generatedFiles = files;

  if (generatedFiles.length === 0) {
    return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardDescription>Arquivos gerados</CardDescription>
        <CardTitle>Finalizados e prontos para importação</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-muted/25 p-8 text-center">
          <div>
            <AppIcon className="mx-auto size-12 rounded-2xl bg-muted text-muted-foreground" name="file" />
            <p className="mt-3 text-sm font-semibold text-foreground">Nenhum arquivo gerado ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">Os arquivos finais aparecerão aqui depois da geração do lote.</p>
          </div>
        </div>
      </CardContent>
    </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardDescription>Arquivos gerados</CardDescription>
        <CardTitle>Finalizados e prontos para importação</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[32px_1fr_170px_80px_80px_60px] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span />
            <span>Nome</span>
            <span>Data</span>
            <span>Baixar</span>
            <span>Enviar</span>
            <span>Status</span>
          </div>
              {generatedFiles.map((file) => (
            <div className="grid grid-cols-[32px_1fr_170px_80px_80px_60px] items-center gap-3 border-t border-border px-4 py-3 text-sm" key={file.id}>
              <Button size="icon" type="button" variant="ghost" aria-label={`Excluir ${file.name}`} onClick={() => onDelete(file.id)} disabled={deletingFileIds[String(file.id)]}>
                {deletingFileIds[String(file.id)] ? (
                  <svg className="animate-spin h-4 w-4 text-rose-600 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <AppIcon className="bg-rose-50 text-rose-600 dark:bg-rose-950/40" name="close" />
                )}
              </Button>
              <span className="min-w-0 truncate font-medium text-foreground" title={file.name}>
                {file.name}
              </span>
              <time className="text-muted-foreground">{file.date}</time>
              <Button size="icon" type="button" variant="ghost" aria-label={`Baixar ${file.name}`} onClick={() => onDownload(file)}>
                <AppIcon className="bg-sky-50 text-sky-600 dark:bg-sky-950/40" name="download" />
              </Button>
              <StatusPill tone={file.sent ? "success" : "warning"}>{file.sent ? "OK" : "Pendente"}</StatusPill>
              <Button size="icon" type="button" variant="ghost" aria-label={`Arquivo ${file.name} pronto para importação`}>
                <AppIcon className="bg-primary/10 text-primary" name="check" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GeneratedFilePreviewDialog({
  accountOptions,
  file,
  onClose,
  onConfirm
}: {
  accountOptions: string[];
  file: GeneratedFile;
  onClose: () => void;
  onConfirm: (lines: EditableGeneratedLine[], format: GeneratedDownloadFormat) => void;
}) {
  const [lines, setLines] = useState<EditableGeneratedLine[]>(() => parseGeneratedFileLines(file.content));
  const [downloadFormat, setDownloadFormat] = useState<GeneratedDownloadFormat>("que");

  function updateLine(lineId: string, field: keyof EditableGeneratedLine, value: string) {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, [field]: field.includes("Account") ? normalizeAccountInput(value) : value } : line)));
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[90vh] w-[min(1120px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Conferir lancamentos do arquivo</DialogTitle>
          <DialogDescription>Revise e ajuste os lancamentos antes de baixar o arquivo final.</DialogDescription>
        </DialogHeader>

        <div className="overflow-auto p-4">
          <div className="min-w-[980px] overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[110px_120px_130px_130px_110px_1fr] gap-3 bg-muted/70 px-4 py-3 text-sm font-semibold text-muted-foreground">
              <span>Data</span>
              <span>Valor</span>
              <span>Conta Debito</span>
              <span>Conta Credito</span>
              <span>Cod. Historico</span>
              <span>Historico</span>
            </div>
            {lines.map((line) => (
              <div className="grid grid-cols-[110px_120px_130px_130px_110px_1fr] gap-3 border-t border-border px-4 py-2 text-sm" key={line.id}>
                <Input value={line.date} onChange={(event) => updateLine(line.id, "date", event.target.value)} />
                <Input value={line.amount} onChange={(event) => updateLine(line.id, "amount", event.target.value)} />
                <Input list="account-options" value={line.debitAccount} onChange={(event) => updateLine(line.id, "debitAccount", event.target.value)} />
                <Input list="account-options" value={line.creditAccount} onChange={(event) => updateLine(line.id, "creditAccount", event.target.value)} />
                <Input value={line.historyCode} onChange={(event) => updateLine(line.id, "historyCode", event.target.value)} />
                <Input value={line.history} onChange={(event) => updateLine(line.id, "history", event.target.value)} />
              </div>
            ))}
          </div>
          <AccountDatalist accounts={accountOptions} />
        </div>

        <DialogFooter className="border-t border-border bg-card px-6 py-4 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${downloadFormat === "que" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              type="button"
              onClick={() => setDownloadFormat("que")}
            >
              .QUE
            </button>
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${downloadFormat === "csv" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              type="button"
              onClick={() => setDownloadFormat("csv")}
            >
              .CSV
            </button>
          </div>
          <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onConfirm(lines, downloadFormat)}>
            Confirmar e baixar
          </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseGeneratedFileLines(content: string): EditableGeneratedLine[] {
  const rows = parseCsvRows(content);
  const dataRows = rows.slice(1);

  return dataRows.map((row, index) => ({
    id: `${index}-${row.join("-")}`,
    date: row[4] ?? "",
    debitAccount: row[5] ?? "",
    creditAccount: row[6] ?? "",
    amount: row[7] ?? "",
    history: row[8] ?? "",
    historyCode: row[9] ?? "",
    raw: row
  }));
}

function buildGeneratedFileContent(originalContent: string, lines: EditableGeneratedLine[]) {
  const rows = parseCsvRows(originalContent);
  const header = rows[0] ?? [];

  const updatedRows = lines.map((line) => {
    const row = [...line.raw];
    row[4] = line.date;
    row[5] = normalizeAccountInput(line.debitAccount);
    row[6] = normalizeAccountInput(line.creditAccount);
    row[7] = line.amount;
    row[8] = line.history;
    row[9] = line.historyCode;
    return row;
  });

  return [header, ...updatedRows].map((row) => row.map(escapeCsvCell).join(";")).join("\r\n");
}

function buildQueFileContent(lines: EditableGeneratedLine[]) {
  return lines
    .map((line) =>
      [
        formatQueCompanyCode(line.raw[0] ?? ""),
        formatQueDate(line.date),
        normalizeAccountInput(line.debitAccount),
        normalizeAccountInput(line.creditAccount),
        formatQueMoney(line.amount),
        line.historyCode.trim() || "0",
        quoteQueHistory(line.history)
      ].join(";")
    )
    .join("\r\n");
}

function buildDownloadFileName(fileName: string, format: GeneratedDownloadFormat) {
  const extension = format === "que" ? "QUE" : "csv";
  const baseName = fileName.replace(/\.[^.]+$/i, "");
  return `${baseName}.${extension}`;
}

function formatQueCompanyCode(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? "0001" : "0001";
}

function formatQueDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) {
    return value;
  }

  return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3].slice(-2)}`;
}

function formatQueMoney(value: string) {
  const parsedValue = parseGeneratedMoney(value);
  return parsedValue.toFixed(2);
}

function quoteQueHistory(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === "\"" && quoted && nextChar === "\"") {
      field += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === ";" && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((cell) => cell.trim()));
}

function escapeCsvCell(value: string) {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  return value;
}

function parseGeneratedMoney(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const parsedValue = Number.parseFloat(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function ExportLayoutPanel() {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardDescription>Layout final definido</CardDescription>
        <CardTitle>{ACCOUNTING_EXPORT_LAYOUT_NAME}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <StatusPill tone="info">Separador: {ACCOUNTING_EXPORT_SEPARATOR}</StatusPill>
          <StatusPill tone="neutral">Encoding: UTF-8</StatusPill>
          <StatusPill tone="neutral">Decimal: virgula</StatusPill>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[220px_120px_1fr] gap-3 bg-muted/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Campo</span>
              <span>Obrigatorio</span>
              <span>Descricao</span>
            </div>
            {accountingExportColumns.map((column) => (
              <div className="grid grid-cols-[220px_120px_1fr] gap-3 border-t border-border px-4 py-3 text-sm" key={column.key}>
                <code className="font-semibold text-foreground">{column.label}</code>
                <StatusPill tone={column.required ? "success" : "neutral"}>{column.required ? "Sim" : "Nao"}</StatusPill>
                <span className="text-muted-foreground">{column.description}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportProcessing({ files }: { files: ImportFile[] }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" variant="premium">
            <AppIcon className="animate-pulse bg-white/15 text-white" name="activity" />
            Processando lote 5825277
          </Button>
          <Button size="icon" type="button" variant="outline" aria-label="Excluir lote">
            <AppIcon className="bg-rose-50 text-rose-600 dark:bg-rose-950/40" name="close" />
          </Button>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-sky-100 dark:bg-sky-950">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" />
        </div>
        <p className="text-sm text-muted-foreground">Lendo {files.length} arquivo(s) e identificando lançamentos a serem parametrizados.</p>
      </CardContent>
    </Card>
  );
}

function StatusHeader({ description, onCancelBatch }: { description: string; onCancelBatch?: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm">
          <AppIcon className="bg-amber-600/20 text-amber-950" name="alert" />
          De/Para pendente
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button size="icon" type="button" variant="outline" aria-label="Excluir lote" onClick={onCancelBatch}>
        <AppIcon className="bg-rose-50 text-rose-600 dark:bg-rose-950/40" name="close" />
      </Button>
    </div>
  );
}

function PendingMappingPanelV2({
  accountOptions,
  errors,
  isSaving,
  localMappings,
  mappingErrors,
  mappings,
  onCancelBatch,
  onContinue,
  onMappingChange,
  onOpenAdvancedRule,
  totalTransactions
}: {
  accountOptions: string[];
  errors: string[];
  isSaving: boolean;
  localMappings: Record<string, string>;
  mappingErrors: string[];
  mappings: PendingMapping[];
  onCancelBatch: () => void;
  onContinue: () => void;
  onMappingChange: (supplier: string, account: string) => void;
  onOpenAdvancedRule: (mapping: PendingMapping) => void;
  totalTransactions: number;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(mappings.length / pageSize));
  const visibleMappings = mappings.slice((page - 1) * pageSize, page * pageSize);
  const filledCount = mappings.filter((mapping) => localMappings[mapping.supplier]).length;

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  return (
    <section className="space-y-4">
      <StatusHeader
        description="Salve a conta para este historico. Quando o mesmo historico aparecer exatamente igual em novas importacoes, a conta sera atribuida automaticamente."
        onCancelBatch={onCancelBatch}
      />

      {[...errors, ...mappingErrors].length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/25">
          <CardContent className="space-y-2 p-4">
            {[...errors, ...mappingErrors].map((error) => (
              <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100" key={error}>
                <AppIcon className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" name="alert" />
                {error}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="h-2 bg-primary" />
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <StatusPill tone={filledCount < mappings.length ? "warning" : "success"}>
              {filledCount} / {mappings.length} parametrizados
            </StatusPill>
            <span className="text-xs text-muted-foreground">{totalTransactions} lancamento(s) lido(s)</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[1fr_140px_300px_48px] gap-4 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Historico</span>
                <span>Origem</span>
                <span>Conta atribuida</span>
                <span />
              </div>
              {visibleMappings.length > 0 ? (
                visibleMappings.map((mapping) => (
                  <div className="grid grid-cols-[1fr_140px_300px_48px] items-start gap-4 border-t border-border px-4 py-4 text-sm" key={mapping.id}>
                    <span className="leading-6 text-foreground">{mapping.supplier}</span>
                    <span className="pt-2 text-muted-foreground">{mapping.origin}</span>
                    <AccountSelect
                      accounts={accountOptions}
                      placeholder="Informe a conta"
                      value={localMappings[mapping.supplier] ?? ""}
                      onChange={(value) => onMappingChange(mapping.supplier, value)}
                    />
                    <Button
                      aria-label="Criar regra avancada"
                      className="mt-1"
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => onOpenAdvancedRule(mapping)}
                    >
                      <AppIcon className="bg-sky-50 text-sky-600 dark:bg-sky-950/40" name="plus" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="grid min-h-36 place-items-center border-t border-border px-4 py-8 text-center">
                  <div>
                    <AppIcon className="mx-auto size-12 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" name="check" />
                    <p className="mt-3 text-sm font-semibold text-foreground">Todos os historicos foram parametrizados</p>
                    <p className="mt-1 text-xs text-muted-foreground">Continue para configurar a conta portador e gerar o lote.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              Exibindo {visibleMappings.length > 0 ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, mappings.length)} de {mappings.length} item(s).
            </span>
            <div className="flex items-center gap-2">
              <Button disabled={page === 1} size="icon" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <span aria-hidden>‹</span>
              </Button>
              <StatusPill tone="info">{page}</StatusPill>
              <Button disabled={page === pageCount} size="icon" type="button" variant="outline" onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                <span aria-hidden>›</span>
              </Button>
              <Button disabled={isSaving} type="button" onClick={onContinue}>
                {isSaving ? "Salvando..." : "Salvar De/Para"}
                <AppIcon className="bg-white/15 text-primary-foreground" name="arrow" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function AdvancedRuleModalV2({
  accountOptions,
  mapping,
  onClose,
  onSaveRule,
  transactions
}: {
  accountOptions: string[];
  mapping: PendingMapping;
  onClose: () => void;
  onSaveRule: (ruleData: Omit<IntegrationRule, "id" | "companyId" | "kind" | "targetDescription" | "type">) => Promise<void>;
  transactions: ImportedTransaction[];
}) {
  const [activeTab, setActiveTab] = useState<RuleModalTab>("rule");
  const [isSaving, setIsSaving] = useState(false);
  const relatedTransactions = transactions.filter((transaction) => mapping.transactionIds?.includes(transaction.id) || transaction.person === mapping.supplier);
  const firstTransaction = relatedTransactions[0];
  const fileFields = firstTransaction ? getTransactionFieldMap(firstTransaction) : [{ label: "Descricao", value: mapping.supplier }];
  const descriptionField = fileFields.find((field) => normalizeRuleText(field.label).includes("descri")) ?? { label: "Descricao", value: mapping.supplier };
  const detailFields = getCoreTransactionFields(fileFields).filter((field) => field.label !== descriptionField.label);
  const descriptionTokens = tokenizeHistory(descriptionField.value);
  const [selectedParts, setSelectedParts] = useState<string[]>(() => tokenizeHistory(mapping.supplier).slice(0, 1));
  const [historySegments, setHistorySegments] = useState<HistorySegment[]>(() => {
    const segments = createEmptyHistorySegments();
    segments[0] = { fieldLabel: "Descricao", text: "" };
    return segments;
  });
  const impactedTransactions = selectedParts.length > 0 ? filterImpactedTransactions(transactions, selectedParts) : relatedTransactions;
  const [ruleError, setRuleError] = useState("");
  const { register, handleSubmit, setValue, watch } = useForm<RuleFormData>({
    defaultValues: {
      accountDebit: "",
      historyCode: ""
    }
  });
  const selectedAccount = watch("accountDebit");

  function toggleSelectedPart(part: string) {
    setSelectedParts((current) => (current.includes(part) ? current.filter((item) => item !== part) : [...current, part]));
  }

  function updateHistorySegment(index: number, changes: Partial<HistorySegment>) {
    setHistorySegments((current) => current.map((segment, currentIndex) => (currentIndex === index ? { ...segment, ...changes } : segment)));
  }

  async function submitRule(data: RuleFormData) {
    const normalizedAccount = normalizeAccountInput(data.accountDebit);
    const configuredHistorySegments = historySegments.filter((segment) => segment.text.trim() || segment.fieldLabel);

    if (!normalizedAccount) {
      setRuleError("Informe a conta debito antes de salvar a regra.");
      return;
    }

    if (!data.historyCode.trim() || configuredHistorySegments.length === 0) {
      setRuleError("Configure o historico da regra antes de salvar.");
      setActiveTab("history");
      return;
    }

    setRuleError("");
    setIsSaving(true);
    try {
      await onSaveRule({
        accountDebit: normalizedAccount,
        historyCode: data.historyCode.trim(),
        historySegments: configuredHistorySegments,
        searchTokens: selectedParts.map(normalizeRuleText).filter(Boolean)
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-6xl overflow-visible p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Criar regra avancada</DialogTitle>
          <DialogDescription>
            Selecione os dados reais do lancamento para encontrar proximas ocorrencias e aplicar a mesma composicao.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 border-b border-border">
          <RuleTab active={activeTab === "rule"} icon="settings" label="Configurar regra" onClick={() => setActiveTab("rule")} />
          <RuleTab active={activeTab === "impacted"} icon="table" label={`Lancamentos impactados (${impactedTransactions.length})`} onClick={() => setActiveTab("impacted")} />
          <RuleTab active={activeTab === "history"} icon="history" label="Configurar historico" onClick={() => setActiveTab("history")} />
        </div>

        <form onSubmit={handleSubmit(submitRule)}>
          <div className="max-h-[62vh] overflow-y-auto p-6">
            {activeTab === "rule" ? (
              <div className="grid gap-5">
                <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                  <RuleField label="Descricao">
                    <p className="mb-1 w-full text-sm text-muted-foreground">
                      Selecione os termos que identificam esta regra. Os complementos ficam somente na etapa Configurar Historico.
                    </p>
                    {descriptionTokens.length > 0 ? (
                      descriptionTokens.map((part) => {
                        const selected = selectedParts.includes(part);
                        return (
                          <button
                            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                              selected ? "bg-emerald-500 text-white" : "bg-muted text-foreground hover:bg-muted/70"
                            }`}
                            key={`descricao-${part}`}
                            type="button"
                            onClick={() => toggleSelectedPart(part)}
                          >
                            {part}
                          </button>
                        );
                      })
                    ) : (
                      <span className="rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">Sem valor</span>
                    )}
                  </RuleField>
                  <ReadOnlyRuleField label="Descricao" muted value={descriptionField.value || "-"} />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {detailFields.map((field) => (
                    <ReadOnlyRuleField key={field.label} label={field.label} muted value={field.value || "-"} />
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === "impacted" ? (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[90px_1fr_160px_120px_140px_1fr] gap-4 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Selecionado</span>
                    <span>Fornecedor</span>
                    <span>Banco</span>
                    <span>Data</span>
                    <span className="text-right">Valor</span>
                    <span>Historico final</span>
                  </div>
                  {impactedTransactions.map((transaction) => (
                    <div className="grid grid-cols-[90px_1fr_160px_120px_140px_1fr] gap-4 border-t border-border px-4 py-4 text-sm" key={transaction.id}>
                      <input className="mt-1 size-4 accent-primary" type="checkbox" checked readOnly aria-label="Lancamento selecionado" />
                      <span className="leading-6 text-foreground">{transaction.person}</span>
                      <span>{transaction.bank || "-"}</span>
                      <span>{transaction.date}</span>
                      <span className="text-right font-semibold">{formatCurrency(transaction.netValue)}</span>
                      <span className="leading-6 text-muted-foreground">{buildHistoryText(transaction, historySegments) || transaction.person}</span>
                    </div>
                  ))}
                  {impactedTransactions.length === 0 ? (
                    <div className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      Nenhum lancamento encontrado com os trechos selecionados.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeTab === "history" ? (
              <HistoryConfigurationTabV2
                register={register}
                fields={fileFields}
                onChangeSegment={updateHistorySegment}
                previewTransaction={firstTransaction}
                segments={historySegments}
              />
            ) : null}
          </div>

          <div className="grid gap-3 border-t border-border px-6 py-4">
            <Label>Conta Debito:</Label>
            {ruleError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                {ruleError}
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-start">
              <AccountSelect accounts={accountOptions} placeholder="Conta Debito" value={selectedAccount} onChange={(value) => setValue("accountDebit", value, { shouldDirty: true })} />
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Salvando..." : "Salvar regra"}
                <AppIcon className="bg-white/15 text-primary-foreground" name="check" />
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Ignorar
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryConfigurationTabV2({
  fields,
  onChangeSegment,
  previewTransaction,
  register,
  segments
}: {
  fields: RuleFileField[];
  onChangeSegment: (index: number, changes: Partial<HistorySegment>) => void;
  previewTransaction?: ImportedTransaction;
  register: UseFormRegister<RuleFormData>;
  segments: HistorySegment[];
}) {
  const previewText = previewTransaction ? buildHistoryText(previewTransaction, segments) : segments.map((segment) => segment.text).filter(Boolean).join(" ");

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="history-code">Codigo do historico</Label>
        <Input id="history-code" placeholder="A insercao do codigo acrescenta o texto inicial configurado no historico do ERP contabil" {...register("historyCode")} />
      </div>
      <div className="grid gap-3">
        {segments.map((segment, index) => (
          <div className="grid gap-3 rounded-2xl border border-border bg-background p-3 md:grid-cols-[1fr_220px]" key={index}>
            <Input
              placeholder={`Texto fixo ${index + 1}`}
              value={segment.text}
              onChange={(event) => onChangeSegment(index, { text: event.target.value })}
            />
            <select
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={segment.fieldLabel}
              onChange={(event) => onChangeSegment(index, { fieldLabel: event.target.value })}
            >
              <option value="">Sem campo do arquivo</option>
              {fields.map((field) => (
                <option key={field.label} value={field.label}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <RuleField label="Historico que sera gerado">
        <p className="w-full rounded-xl bg-muted px-3 py-2 text-sm leading-6 text-foreground">{previewText || "Sem historico configurado"}</p>
      </RuleField>
    </div>
  );
}

function RuleTab({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: "history" | "settings" | "table";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors duration-200 ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      role="tab"
      type="button"
      onClick={onClick}
    >
      <AppIcon className={active ? "bg-white/15 text-primary-foreground" : "bg-muted"} name={icon} />
      {label}
    </button>
  );
}

function RuleField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-border bg-background p-3">{children}</div>
    </div>
  );
}

function ReadOnlyRuleField({ label, muted = false, value }: { label: string; muted?: boolean; value: string }) {
  const shouldRenderAsText = value.length > 36 || normalizeRuleText(label).includes("descri");

  return (
    <RuleField label={label}>
      {shouldRenderAsText ? (
        <p className={`w-full rounded-xl px-3 py-2 text-sm leading-6 ${muted ? "bg-muted/50 text-muted-foreground" : "bg-muted text-foreground"}`}>
          {value}
        </p>
      ) : (
        value.split(" ").map((part) => (
          <span className={`rounded-full px-3 py-1.5 text-sm ${muted ? "bg-muted/50 text-muted-foreground" : "bg-muted text-foreground"}`} key={`${label}-${part}`}>
            {part}
          </span>
        ))
      )}
    </RuleField>
  );
}

function BankAccountPanelV2({
  accountOptions,
  bankAccountMappings,
  bankOrigins,
  generationErrors,
  onBankAccountChange,
  onGenerate,
  onSaveBankAccount,
  onCancelBatch,
  totalTransactions,
  isGenerating,
  savingBanks = {}
}: {
  accountOptions: string[];
  bankAccountMappings: Record<string, string>;
  bankOrigins: BankOrigin[];
  generationErrors: string[];
  onBankAccountChange: (bank: string, account: string) => void;
  onGenerate: () => void;
  onSaveBankAccount: (bank: string) => void;
  onCancelBatch: () => void;
  totalTransactions: number;
  isGenerating?: boolean;
  savingBanks?: Record<string, boolean>;
}) {
  const visibleBanks = bankOrigins.slice(0, 5);
  const filledCount = bankOrigins.filter((item) => bankAccountMappings[item.bank]?.trim()).length;

  return (
    <section className="space-y-4" aria-label="Conta do banco referente ao arquivo">
      <StatusHeader description="Informe a conta portador referente ao banco identificado no arquivo." onCancelBatch={onCancelBatch} />

      {generationErrors.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/25">
          <CardContent className="space-y-2 p-4">
            {generationErrors.map((error) => (
              <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100" key={error}>
                <AppIcon className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" name="alert" />
                {error}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="h-2 bg-primary" />
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <StatusPill tone={bankOrigins.length > 0 && filledCount < bankOrigins.length ? "warning" : "success"}>
              {filledCount} / {bankOrigins.length} conta(s)
            </StatusPill>
            <span className="text-xs text-muted-foreground">{totalTransactions} lancamento(s) no lote</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1fr_180px_300px] gap-4 bg-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Banco</span>
                <span>Origem</span>
                <span>Conta Portador (Contrapartida)</span>
              </div>
              {visibleBanks.length > 0 ? (
                visibleBanks.map((item) => (
                  <div className="grid grid-cols-[1fr_180px_300px] items-start gap-4 border-t border-border px-4 py-4 text-sm" key={item.id}>
                    <span className="font-medium text-foreground">{item.bank}</span>
                    <span className="text-muted-foreground">{item.origin}</span>
                    <label className="grid gap-2">
                      <AccountSelect
                        accounts={accountOptions}
                        placeholder="Conta portador"
                        value={bankAccountMappings[item.bank] ?? ""}
                        onChange={(value) => onBankAccountChange(item.bank, value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onSaveBankAccount(item.bank)}
                        disabled={savingBanks[item.bank] || isGenerating}
                      >
                        {savingBanks[item.bank] ? "Salvando..." : "Salvar conta de portadores"}
                      </Button>
                    </label>
                  </div>
                ))
              ) : (
                <div className="grid min-h-36 place-items-center border-t border-border px-4 py-8 text-center">
                  <div>
                    <AppIcon className="mx-auto size-12 rounded-2xl bg-muted text-muted-foreground" name="check" />
                    <p className="mt-3 text-sm font-semibold text-foreground">Nenhum banco pendente</p>
                    <p className="mt-1 text-xs text-muted-foreground">Nao ha conta portador para configurar neste lote.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-end">
            <span className="text-sm text-muted-foreground">
              O lote sera gerado em CSV contabil com debito, credito, valor, historico e origem.
            </span>
            <Button disabled={totalTransactions === 0 || isGenerating} type="button" onClick={onGenerate}>
              {isGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processando...
                </>
              ) : (
                <>
                  Gerar lote contabil
                  <AppIcon className="bg-white/15 text-primary-foreground" name="check" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function AccountSelect({
  accounts,
  onChange,
  placeholder,
  value
}: {
  accounts: string[];
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedAccount = accounts.find((account) => extractAccountCode(account) === value || account === value);
  const searchValue = normalizeRuleText(query || value);
  const visibleAccounts = accounts
    .filter((account) => !searchValue || normalizeRuleText(account).includes(searchValue))
    .slice(0, 8);

  function selectAccount(account: string) {
    onChange(extractAccountCode(account));
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex min-h-11 items-center rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <input
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm outline-none"
          placeholder={placeholder}
          value={isOpen ? query || value : value}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <button className="px-3 text-muted-foreground" type="button" onClick={() => setIsOpen((current) => !current)} aria-label="Selecionar conta">
          v
        </button>
      </div>

      {selectedAccount && !isOpen ? <AccountOptionDetails account={selectedAccount} compact /> : null}

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-full min-w-[280px] rounded-xl border border-border bg-popover p-1 shadow-xl">
          {visibleAccounts.length > 0 ? (
            visibleAccounts.map((account) => (
              <button
                className="grid w-full gap-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                key={account}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectAccount(account)}
              >
                <AccountOptionDetails account={account} />
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">Nenhuma conta encontrada.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AccountOptionDetails({ account, compact = false }: { account: string; compact?: boolean }) {
  const details = parseAccountOption(account);

  return (
    <span className="grid gap-0.5">
      <span className={compact ? "text-xs font-medium text-foreground" : "text-sm font-semibold text-foreground"}>{details.name}</span>
      <span className="text-xs text-muted-foreground">Conta: {details.code}</span>
      <span className="text-xs text-muted-foreground">Classificacao: {details.classificationCode || "-"}</span>
    </span>
  );
}

function parseAccountOption(account: string) {
  if (account.includes("\t")) {
    const [code = "", classificationCode = "", name = "", nickname = ""] = account.split("\t");

    return {
      code: code.trim(),
      classificationCode: classificationCode.trim(),
      name: name.trim() || nickname.trim() || code.trim()
    };
  }

  const [code = account, name = "", ...restParts] = account.split(" - ");

  return {
    code: code.trim(),
    classificationCode: "",
    name: name.trim() || restParts.join(" - ").trim() || account
  };
}

function AccountDatalist({ accounts = [] }: { accounts?: string[] }) {
  return (
    <datalist id="account-options">
      {accounts.map((account) => (
        <option key={account} label={account} value={extractAccountCode(account)} />
      ))}
    </datalist>
  );
}

function InstructionsCard({ kindLabel }: { kindLabel: string }) {
  return (
    <Card className="disabled pointer-events-none border-dashed bg-muted/10">
      <CardHeader>
        <CardTitle>Instruções de Fechamento (não disponível)</CardTitle>
        <CardDescription>Instruções de fechamento para {kindLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        <button
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/35 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          type="button"
        >
          <AppIcon className="bg-card text-primary" name="link" />
          Anexar arquivo(s) às Instruções de Fechamento
        </button>
      </CardContent>
    </Card>
  );
}
