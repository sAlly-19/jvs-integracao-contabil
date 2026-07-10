import type { GeneratedFile, ImportBatch, ProcessedBatch } from "../types";
import { getHistory, saveHistory, deleteHistory } from "../api/history";

export async function getCompanyProcessedBatches(companyId: string | number): Promise<ProcessedBatch[]> {
  return await getHistory(companyId);
}

export async function getAllProcessedBatches(): Promise<ProcessedBatch[]> {
  const all = await getHistory();
  return all.sort((a, b) => Number(b.generatedFile.id) - Number(a.generatedFile.id));
}

export async function getCompanyGeneratedFiles(companyId: string | number): Promise<GeneratedFile[]> {
  const batches = await getCompanyProcessedBatches(companyId);
  return batches.map((batch) => batch.generatedFile);
}

export async function saveProcessedBatch(companyId: string | number, batch: ImportBatch, generatedFile: GeneratedFile) {
  const processedBatch: ProcessedBatch = {
    id: batch.id,
    companyId: companyId as any as number,
    kind: batch.kind,
    generatedAt: generatedFile.date,
    fileName: generatedFile.name,
    lineCount: generatedFile.lineCount,
    totalValue: generatedFile.totalValue,
    sourceFileNames: batch.files.map((file) => file.name),
    sourceFileHashes: batch.files.map((file) => file.signature).filter((signature): signature is string => Boolean(signature)),
    generatedFile
  };
  await saveHistory(processedBatch);
}

export async function deleteProcessedBatchFile(companyId: string | number, generatedFileId: string | number) {
  const batches = await getCompanyProcessedBatches(companyId);
  const toDelete = batches.find(b => b.generatedFile.id === generatedFileId);
  if (toDelete) {
    await deleteHistory(toDelete.id);
  }
}

export async function hasProcessedBatchWithFileHashes(companyId: string | number, kind: ImportBatch["kind"], fileHashes: string[], fileNames: string[] = []) {
  const requestedHashes = normalizeHashes(fileHashes);
  const requestedNames = normalizeFileNames(fileNames);

  if (requestedHashes.length === 0) {
    return false;
  }

  const batches = await getCompanyProcessedBatches(companyId);
  return batches.some((batch) => {
    if (batch.kind !== kind) {
      return false;
    }

    const batchHashes = normalizeHashes(batch.sourceFileHashes ?? []);
    if (batchHashes.length === 0 || batchHashes.join("|") !== requestedHashes.join("|")) {
      return false;
    }

    const batchNames = normalizeFileNames(batch.sourceFileNames ?? []);
    if (requestedNames.length === 0 || batchNames.length === 0) {
      return false;
    }

    return batchNames.join("|") === requestedNames.join("|");
  });
}

function normalizeHashes(fileHashes: string[]) {
  return Array.from(new Set(fileHashes.filter(Boolean))).sort();
}

function normalizeFileNames(fileNames: string[]) {
  return Array.from(new Set(fileNames.map((name) => name.trim().toLowerCase()).filter(Boolean))).sort();
}
