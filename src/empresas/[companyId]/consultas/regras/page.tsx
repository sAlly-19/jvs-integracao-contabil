"use client";

import { useParams } from "react-router-dom";
import { ConsultationsScreen } from "../../../../components/ConsultationsScreen";
import { CompanyCommandBar, Topbar } from "../../../../components/Topbar";
import { useCompanyById } from "../../../../lib/use-company";

export default function RulesPage() {
  const params = useParams<{ companyId: string }>();
  const company = useCompanyById(params.companyId);

  return (
    <main className="app-shell">
      <Topbar />
      <CompanyCommandBar company={company} showBack />
      <ConsultationsScreen company={company} kind="regras" />
    </main>
  );
}
