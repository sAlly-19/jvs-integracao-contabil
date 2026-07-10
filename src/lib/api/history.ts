import { collection, doc, getDocs, getDoc, setDoc, query, where, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ProcessedBatch } from "../types";

const COLLECTION = "processedBatches";

export async function getHistory(companyId?: string | number): Promise<ProcessedBatch[]> {
  let q = collection(db, COLLECTION) as any;
  if (companyId) {
    q = query(q, where("companyId", "==", companyId.toString()));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map((snapshotDoc) => {
    const data = snapshotDoc.data() as Partial<ProcessedBatch>;
    return { ...data, id: snapshotDoc.id } as ProcessedBatch;
  });
}

export async function saveHistory(batch: ProcessedBatch): Promise<void> {
  const docRef = doc(db, COLLECTION, batch.id.toString());
  await setDoc(docRef, {
    ...batch,
    companyId: batch.companyId.toString()
  });
}

export async function deleteHistory(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
