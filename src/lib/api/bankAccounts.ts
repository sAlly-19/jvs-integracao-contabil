import { collection, doc, getDocs, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "bankAccounts";

export type BankAccountConfig = {
  id: string;
  companyId: string;
  bank: string;
  accountDebit: string;
  accountCredit: string;
};

export async function getBankAccounts(companyId: string | number): Promise<BankAccountConfig[]> {
  if (!companyId) return [];
  const q = query(collection(db, COLLECTION), where("companyId", "==", companyId.toString()));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankAccountConfig));
}

export async function saveBankAccount(account: BankAccountConfig): Promise<void> {
  const docRef = doc(db, COLLECTION, account.id);
  await setDoc(docRef, account);
}

export async function deleteBankAccount(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
