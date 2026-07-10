"use client";

import { useParams } from "react-router-dom";
import { AccountPlanScreen } from "../../../components/AccountPlanScreen";
import { CompanyCommandBar, Topbar } from "../../../components/Topbar";
import { useCompanyById } from "../../../lib/use-company";

export default function AccountPlanPage() {
  const params = useParams<{ companyId: string }>();
  const company = useCompanyById(params.companyId);

  return (
    <main className="app-shell">
      <Topbar />
      <CompanyCommandBar company={company} showBack />
      <AccountPlanScreen company={company} />
    </main>
  );
}
