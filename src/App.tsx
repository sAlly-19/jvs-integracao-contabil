import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./page";
import OperationalHistoryPage from "./historico-operacional/page";
import CompanyPage from "./empresas/[companyId]/page";
import ImportFilesPage from "./empresas/[companyId]/importar-arquivos/page";
import SheetConfigurationPage from "./empresas/[companyId]/configurar-planilhas/page";
import AccountPlanPage from "./empresas/[companyId]/plano-de-contas/page";
import DefaultAccountsPage from "./empresas/[companyId]/consultas/contas-padroes/page";
import DeParasPage from "./empresas/[companyId]/consultas/de-paras/page";
import RulesPage from "./empresas/[companyId]/consultas/regras/page";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/historico-operacional" element={<OperationalHistoryPage />} />
        <Route path="/empresas/:companyId" element={<CompanyPage />} />
        <Route path="/empresas/:companyId/importar-arquivos" element={<ImportFilesPage />} />
        <Route path="/empresas/:companyId/configurar-planilhas" element={<SheetConfigurationPage />} />
        <Route path="/empresas/:companyId/plano-de-contas" element={<AccountPlanPage />} />
        <Route path="/empresas/:companyId/consultas/contas-padroes" element={<DefaultAccountsPage />} />
        <Route path="/empresas/:companyId/consultas/de-paras" element={<DeParasPage />} />
        <Route path="/empresas/:companyId/consultas/regras" element={<RulesPage />} />
      </Routes>
    </BrowserRouter>
  );
}
