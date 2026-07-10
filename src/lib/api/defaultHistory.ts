import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DefaultHistoryConfig } from "../types";

const COLLECTION = "defaultHistoryConfigs";

export async function getDefaultHistory(companyId: string | number, kind: string): Promise<DefaultHistoryConfig | null> {
  const docRef = doc(db, COLLECTION, `${companyId}-${kind}`);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as DefaultHistoryConfig;
}

export async function saveDefaultHistory(companyId: string | number, kind: string, config: DefaultHistoryConfig): Promise<void> {
  const docRef = doc(db, COLLECTION, `${companyId}-${kind}`);
  await setDoc(docRef, config);
}
