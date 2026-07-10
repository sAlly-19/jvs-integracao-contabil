import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Company, NewCompany, TaxationType } from "../types";

const COLLECTION = "companies";

export async function getCompanies(search?: string): Promise<Company[]> {
  // If we had a real index on name, we could do full text search. 
  // For now we'll fetch all and filter in memory if search is provided.
  const snapshot = await getDocs(collection(db, COLLECTION));
  let companies = snapshot.docs.map((snapshotDoc) => {
    const data = snapshotDoc.data() as Partial<Company>;
    return normalizeCompany({ ...data, id: snapshotDoc.id } as Company);
  });
  
  if (search) {
    const s = search.toLowerCase();
    companies = companies.filter(c => 
      c.name.toLowerCase().includes(s) || 
      c.code.toLowerCase().includes(s) || 
      c.document.includes(s)
    );
  }
  
  return companies.sort((a, b) => Number(b.id) - Number(a.id));
}

export async function getCompany(id: string): Promise<Company | null> {
  const docRef = doc(db, COLLECTION, id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Partial<Company>;
  return normalizeCompany({ ...data, id: snapshot.id } as Company);
}

export async function createCompany(newCompany: NewCompany): Promise<Company> {
  // Give it a sequential-like ID based on timestamp for simplicity
  const id = Date.now().toString();
  const company: Company = {
    id,
    code: newCompany.accountingCode,
    name: newCompany.name,
    document: newCompany.document,
    nickname: newCompany.nickname,
    lastProcess: "-",
    mode: "Customizada",
    taxation: newCompany.taxation
  };
  await setDoc(doc(db, COLLECTION, id), company);
  return company;
}

export async function updateCompany(id: string, updatedCompany: NewCompany): Promise<Company> {
  const docRef = doc(db, COLLECTION, id);
  const dataToUpdate = {
    code: updatedCompany.accountingCode,
    name: updatedCompany.name,
    document: updatedCompany.document,
    nickname: updatedCompany.nickname,
    taxation: updatedCompany.taxation,
  };
  await updateDoc(docRef, dataToUpdate);
  return normalizeCompany({ id: id as any as number, ...dataToUpdate, lastProcess: "-", mode: "Customizada" } as Company);
}

export async function deleteCompany(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

function normalizeCompany(company: Company): Company {
  return {
    ...company,
    taxation: normalizeTaxation(company.taxation)
  };
}

function normalizeTaxation(value: TaxationType | undefined): TaxationType {
  if (value === "Lucro Real" || value === "Lucro Presumido" || value === "Simples Nacional" || value === "Imunes/Isentas") {
    return value;
  }

  return "Lucro Presumido";
}
