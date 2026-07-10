"use client";

import { useParams } from "react-router-dom";
import { SheetConfigurationScreen } from "../../../components/SheetConfigurationScreen";
import { CompanyCommandBar, Topbar } from "../../../components/Topbar";
import { useCompanyById } from "../../../lib/use-company";

export default function SheetConfigurationPage() {
  const params = useParams<{ companyId: string }>();
  const company = useCompanyById(params.companyId);

  return (
    <main className="app-shell">
      <Topbar />
      <CompanyCommandBar company={company} showBack />
      <SheetConfigurationScreen company={company} />
    </main>
  );
}
