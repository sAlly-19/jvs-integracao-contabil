"use client";

import { useParams } from "react-router-dom";
import { ImportFilesScreen } from "../../../components/ImportFilesScreen";
import { CompanyCommandBar, Topbar } from "../../../components/Topbar";
import { useCompanyById } from "../../../lib/use-company";

export default function ImportFilesPage() {
  const params = useParams<{ companyId: string }>();
  const company = useCompanyById(params.companyId);

  return (
    <main className="app-shell">
      <Topbar />
      <CompanyCommandBar company={company} showBack />
      <ImportFilesScreen company={company} />
    </main>
  );
}
