import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { StatementLayout } from "../types";

const COLLECTION = "statementLayouts";

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function getLayoutsFromDb(): Promise<StatementLayout[]> {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION));
    const layouts: StatementLayout[] = [];
    querySnapshot.forEach((docSnap) => {
      layouts.push(docSnap.data() as StatementLayout);
    });
    return layouts;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION);
  }
}

export async function saveLayoutToDb(layout: StatementLayout): Promise<void> {
  const path = `${COLLECTION}/${layout.id}`;
  try {
    await setDoc(doc(db, COLLECTION, layout.id), layout);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteLayoutFromDb(layoutId: string): Promise<void> {
  const path = `${COLLECTION}/${layoutId}`;
  try {
    await deleteDoc(doc(db, COLLECTION, layoutId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
