import type { ImportBatch, ImportStep, SheetKind, StoredImportProgress } from "../types";
import { getProgress, saveProgress, deleteProgress } from "../api/importProgress";

export async function getImportProgress(companyId: string | number, kind: SheetKind): Promise<StoredImportProgress | null> {
  return await getProgress(companyId, kind);
}

export async function saveImportProgress(companyId: string | number, kind: SheetKind, batch: ImportBatch, step: ImportStep) {
  await saveProgress(companyId, kind, {
    companyId: companyId as any as number,
    kind,
    batch: removeUndefinedValues(createPersistableBatch(batch)) as ImportBatch,
    step,
    updatedAt: new Date().toISOString()
  });
}

export async function clearImportProgress(companyId: string | number, kind: SheetKind) {
  await deleteProgress(companyId, kind);
}

function createPersistableBatch(batch: ImportBatch): ImportBatch {
  return {
    ...batch,
    files: batch.files.map((file) => ({
      ...file,
      content: file.content ? `[texto extraido omitido: ${file.content.length} caracteres]` : file.content
    }))
  };
}

function removeUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedValues);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([entryKey, entryValue]) => [entryKey, removeUndefinedValues(entryValue)])
  );
}
