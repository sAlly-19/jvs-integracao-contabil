import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { CompanySheetConfig } from "../types";

const COLLECTION = "sheetConfigs";

export async function getSheetConfig(companyId: string | number): Promise<CompanySheetConfig | null> {
  if (!companyId) return null;
  const docRef = doc(db, COLLECTION, companyId.toString());
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as CompanySheetConfig;
}

export async function saveSheetConfig(companyId: string | number, config: CompanySheetConfig): Promise<void> {
  const docRef = doc(db, COLLECTION, companyId.toString());
  await setDoc(docRef, config);
}
