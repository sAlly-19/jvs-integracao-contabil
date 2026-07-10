import { collection, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { StoredImportProgress } from "../types";

const COLLECTION = "importProgress";

export async function getProgress(companyId: string | number, kind: string): Promise<StoredImportProgress | null> {
  const docRef = doc(db, COLLECTION, `${companyId}-${kind}`);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as StoredImportProgress;
}

export async function saveProgress(companyId: string | number, kind: string, progress: StoredImportProgress): Promise<void> {
  const docRef = doc(db, COLLECTION, `${companyId}-${kind}`);
  await setDoc(docRef, progress);
}

export async function deleteProgress(companyId: string | number, kind: string): Promise<void> {
  const docRef = doc(db, COLLECTION, `${companyId}-${kind}`);
  await deleteDoc(docRef);
}
