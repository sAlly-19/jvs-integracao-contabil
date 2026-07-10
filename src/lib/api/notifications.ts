import { collection, doc, getDocs, setDoc, query, where } from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION = "notifications";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  companyId?: string | number;
}

export async function getNotifications(companyId?: string | number): Promise<AppNotification[]> {
  let q = collection(db, COLLECTION) as any;
  if (companyId) {
    q = query(q, where("companyId", "==", companyId.toString()));
  }
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((snapshotDoc) => {
    const data = snapshotDoc.data() as Partial<AppNotification>;
    return { ...data, id: snapshotDoc.id } as AppNotification;
  });
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function saveNotification(notification: AppNotification): Promise<void> {
  const docRef = doc(db, COLLECTION, notification.id);
  const data = { ...notification };
  if (data.companyId) data.companyId = data.companyId.toString();
  await setDoc(docRef, data);
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION, id);
  await setDoc(docRef, { read: true }, { merge: true });
}
