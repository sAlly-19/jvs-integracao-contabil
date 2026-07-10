import { Link } from "react-router-dom";
import { AppIcon, type AppIconName, PageHeader, PageShell, StatusPill } from "./design-system";
import { modules } from "../lib/app-modules";
import type { Company, ModuleId } from "../lib/types";
import { Card, CardContent } from "./ui/card";

const iconByModule: Record<ModuleId, AppIconName> = {
  files: "upload",
  sheets: "sheet"
};

const moduleAccent: Record<ModuleId, string> = {
  files: "from-sky-500 to-cyan-400",
  sheets: "from-violet-500 to-sky-400"
};

export function CompanyModules({ company }: { company: Company }) {
  const selectedModule = modules.find((moduleItem) => moduleItem.id === "files") ?? modules[0];

  return (
    <PageShell className="space-y-8">
      <PageHeader
        badge="Empresa selecionada"
        title="Central de integração contábil"
        description={
          <>
            Escolha um módulo para continuar o fechamento e a parametrização da empresa{" "}
            <strong className="font-semibold text-foreground">{company.code} - {company.name}</strong>.
          </>
        }
      />

      <div className="grid gap-5 md:grid-cols-2">
        {modules.map((moduleItem) => {
          const hrefByModule: Record<ModuleId, string> = {
            files: `/empresas/${company.id}/importar-arquivos`,
            sheets: `/empresas/${company.id}/configurar-planilhas`
          };

          return (
            <Link className="group block focus-visible:outline-none" to={hrefByModule[moduleItem.id]} key={moduleItem.id}>
              <Card className="relative h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-sky-950/10 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${moduleAccent[moduleItem.id]}`} />
                <CardContent className="flex min-h-72 flex-col justify-between p-6">
                  <div className="flex items-start justify-between">
                    <AppIcon
                      className="size-14 rounded-2xl bg-primary/10 text-lg text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                      name={iconByModule[moduleItem.id]}
                    />
                    <AppIcon className="bg-muted text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:bg-primary/10 group-hover:text-primary" name="arrow" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">{moduleItem.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      <strong className="font-semibold text-foreground">{moduleItem.descriptionLead}</strong> {moduleItem.descriptionBody}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong className="font-semibold text-foreground">{selectedModule.descriptionLead}</strong> {selectedModule.descriptionBody}
          </span>
          <StatusPill tone="info">Fluxo operacional</StatusPill>
        </CardContent>
      </Card>
    </PageShell>
  );
}
