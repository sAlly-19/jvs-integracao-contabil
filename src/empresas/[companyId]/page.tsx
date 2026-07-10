"use client";

import { useParams } from "react-router-dom";
import { CompanyModules } from "../../components/CompanyModules";
import { CompanyCommandBar, Topbar } from "../../components/Topbar";
import { useCompanyById } from "../../lib/use-company";

export default function CompanyPage() {
  const params = useParams<{ companyId: string }>();
  const company = useCompanyById(params.companyId);

  return (
    <main className="app-shell">
      <Topbar />
      <CompanyCommandBar company={company} />
      <CompanyModules company={company} />
    </main>
  );
}
