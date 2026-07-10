import { collection, doc, getDocs, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { AccountPlanEntry } from "../types";

const COLLECTION = "accountPlans";

export async function getAccountPlans(companyId: string | number): Promise<AccountPlanEntry[]> {
  if (!companyId) return [];
  const q = query(collection(db, COLLECTION), where("companyId", "==", companyId.toString()));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.data().id ?? doc.id } as any as AccountPlanEntry));
}

export async function saveAccountPlan(companyId: string | number, plan: AccountPlanEntry): Promise<void> {
  const id = `${companyId}-${plan.account || plan.reducedAccount || plan.id}`;
  const docRef = doc(db, COLLECTION, id);
  await setDoc(docRef, { ...plan, id: plan.id, companyId: companyId.toString() });
}

export async function deleteAccountPlan(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
