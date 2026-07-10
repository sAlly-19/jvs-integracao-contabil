import { collection, doc, getDocs, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { IntegrationRule } from "../types";

const COLLECTION = "integrationRules";

export async function getRules(companyId: string | number): Promise<IntegrationRule[]> {
  if (!companyId) return [];
  const q = query(collection(db, COLLECTION), where("companyId", "==", companyId.toString()));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as IntegrationRule));
}

export async function saveRule(rule: IntegrationRule): Promise<void> {
  const docRef = doc(db, COLLECTION, rule.id.toString());
  await setDoc(docRef, { ...rule, companyId: rule.companyId.toString() });
}

export async function deleteRule(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
