import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { CompanyOfxConfig, SheetKind } from "../types";

const COLLECTION = "layoutSelections";

function emptySelections(): CompanyOfxConfig {
  return {
    payments: [],
    receipts: []
  };
}

function normalizeLayoutIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function normalizeSelections(data: Partial<CompanyOfxConfig> | undefined): CompanyOfxConfig {
  return {
    payments: normalizeLayoutIds(data?.payments),
    receipts: normalizeLayoutIds(data?.receipts)
  };
}

export async function getLayoutSelections(companyId: string | number): Promise<CompanyOfxConfig> {
  if (!companyId) {
    return emptySelections();
  }

  const docRef = doc(db, COLLECTION, companyId.toString());
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return emptySelections();
  }

  return normalizeSelections(snapshot.data() as Partial<CompanyOfxConfig>);
}

export async function saveLayoutSelection(
  companyId: string | number,
  kind: SheetKind,
  layoutIds: number[]
): Promise<void> {
  const currentSelections = await getLayoutSelections(companyId);
  const docRef = doc(db, COLLECTION, companyId.toString());

  await setDoc(
    docRef,
    {
      ...currentSelections,
      [kind]: normalizeLayoutIds(layoutIds),
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}
