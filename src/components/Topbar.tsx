"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Company, EntityId, ProcessedBatch } from "../lib/types";
import { getHistory } from "../lib/api/history";
import { getNotifications, markNotificationAsRead } from "../lib/api/notifications";
import { useQuery } from "@tanstack/react-query";
import { AnimatedBand, AnimatedHeader } from "./animate-ui/motion";
import { ConfirmDialog } from "./ConfirmDialog";
import { AppIcon } from "./design-system";
import { Button } from "./ui/button";

const ACCOUNTING_ORGS = ["JVS CONTABILIDADE"];
const ACCOUNTING_ORG_KEY = "jvs-selected-accounting-org-v1";

export function Topbar() {
  const [isDark, setIsDark] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(ACCOUNTING_ORGS[0]);
  const [isOrgOpen, setIsOrgOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);
  const { data: processedBatches = [] } = useQuery({ queryKey: ["history"], queryFn: () => getHistory() });
  const { data: apiNotifications = [], refetch: refetchNotifications } = useQuery({ queryKey: ["notifications"], queryFn: () => getNotifications() });
  const unreadCount = apiNotifications.filter(n => !n.read).length;
  const pendingFiles = processedBatches.filter((batch) => !batch.generatedFile.sent);

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [isDark]);

  function changeOrg(org: string) {
    setSelectedOrg(org);
    window.localStorage.setItem(ACCOUNTING_ORG_KEY, org);
    setIsOrgOpen(false);
  }

  return (
    <AnimatedHeader className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link className="flex min-w-0 items-center" to="/" aria-label="JVS Contabilidade">
          <img className="h-11 w-auto object-contain" src="/jvs-contabilidade-logo.png" alt="JVS Contabilidade" width={220} height={72} />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative hidden md:block">
            <Button
              className="h-10 rounded-full border border-border bg-card/90 px-3 text-sm font-medium text-foreground shadow-sm shadow-slate-950/5"
              type="button"
              variant="ghost"
              aria-expanded={isOrgOpen}
              onClick={() => setIsOrgOpen((current) => !current)}
            >
              <AppIcon className="size-6 bg-primary/10 text-primary" name="company" />
              <span className="max-w-56 truncate">{selectedOrg}</span>
            </Button>
            {isOrgOpen ? (
              <MenuPanel className="right-0 w-72">
                <MenuHeader title="Empresa contabil" description="Selecione o escritorio ativo desta sessao." />
                <div className="grid gap-2">
                  {ACCOUNTING_ORGS.map((org) => (
                    <button
                      className={`rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                        selectedOrg === org ? "bg-primary/10 font-semibold text-primary" : "text-foreground"
                      }`}
                      key={org}
                      type="button"
                      onClick={() => changeOrg(org)}
                    >
                      {org}
                    </button>
                  ))}
                </div>
              </MenuPanel>
            ) : null}
          </div>

          <Button asChild aria-label="Historico operacional" className="rounded-full" size="icon" type="button" variant="ghost">
            <Link to="/historico-operacional">
              <AppIcon className="bg-transparent text-muted-foreground" name="history" />
            </Link>
          </Button>

          <div className="relative">
            <Button
              aria-label="Notificacoes"
              className="relative rounded-full"
              size="icon"
              type="button"
              variant="ghost"
              aria-expanded={isNotificationsOpen}
              onClick={() => setIsNotificationsOpen((current) => !current)}
            >
              <AppIcon className="bg-transparent text-muted-foreground" name="alert" />
              {(pendingFiles.length + unreadCount) > 0 ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {Math.min(pendingFiles.length + unreadCount, 99)}
                </span>
              ) : null}
            </Button>
            {isNotificationsOpen ? (
              <MenuPanel className="right-0 w-80">
                <MenuHeader title="Notificacoes" description="Alertas operacionais do integrador." />
                <div className="grid gap-2">
                  {pendingFiles.length > 0 ? (
                    pendingFiles.slice(0, 4).map((batch) => (
                      <Link
                        className="rounded-xl border border-border bg-muted/35 px-3 py-2 text-sm transition-colors hover:bg-muted"
                        to="/historico-operacional"
                        key={`${batch.companyId}-${batch.generatedFile.id}`}
                        onClick={() => setIsNotificationsOpen(false)}
                      >
                        <strong className="block text-foreground">Arquivo pendente</strong>
                        <span className="block truncate text-xs text-muted-foreground">{batch.fileName}</span>
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                      Nenhum arquivo pendente de envio.
                    </div>
                  )}
                  <Link className="text-sm font-semibold text-primary hover:underline" to="/historico-operacional" onClick={() => setIsNotificationsOpen(false)}>
                    Ver historico operacional
                  </Link>
                </div>
              </MenuPanel>
            ) : null}
          </div>

          <Button
            aria-label="Alternar tema"
            className="rounded-full"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setIsDark((current) => !current)}
          >
            <AppIcon className="bg-transparent text-muted-foreground" name={isDark ? "sun" : "moon"} />
          </Button>

          <div className="relative">
            <Button
              className="size-10 rounded-full bg-gradient-to-br from-sky-500 to-cyan-400 p-0 text-sm font-bold text-white shadow-lg shadow-sky-500/20 hover:from-sky-500 hover:to-cyan-400"
              type="button"
              variant="ghost"
              aria-label="Menu do usuario"
              aria-expanded={isUserOpen}
              onClick={() => setIsUserOpen((current) => !current)}
            >
              JS
            </Button>
            {isUserOpen ? (
              <MenuPanel className="right-0 w-72">
                <MenuHeader title="Usuario local" description="Login e permissoes serao conectados em uma etapa futura." />
                <div className="grid gap-2 text-sm">
                  <Link className="rounded-xl px-3 py-2 hover:bg-muted" to="/" onClick={() => setIsUserOpen(false)}>
                    Painel inicial
                  </Link>
                  <button className="rounded-xl px-3 py-2 text-left hover:bg-muted" type="button" onClick={() => setIsDark((current) => !current)}>
                    Alternar tema
                  </button>
                  <button className="rounded-xl px-3 py-2 text-left text-muted-foreground" type="button" disabled>
                    Entrar com usuario - em breve
                  </button>
                </div>
              </MenuPanel>
            ) : null}
          </div>
        </div>
      </div>
    </AnimatedHeader>
  );
}

export function CompanyCommandBar({
  backHref,
  company,
  showBack = false
}: {
  backHref?: string;
  company: Company;
  showBack?: boolean;
}) {
  const [isConsultOpen, setIsConsultOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <>
      <CommandBand>
        <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-center">
          {showBack ? (
            <Button asChild className="h-[52px] w-fit rounded-2xl border-white/20 bg-white/10 px-5 text-white hover:bg-white/15 hover:text-white" variant="ghost">
              <Link to={backHref ?? `/empresas/${company.id}`}>
                <AppIcon className="bg-white/15 text-white" name="arrow" />
                Voltar
              </Link>
            </Button>
          ) : null}
          <div className="flex h-[52px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/20 bg-white text-slate-900 shadow-xl shadow-sky-950/10 xl:max-w-xl">
            <div className="min-w-0 flex-1 px-4 py-2 text-sm font-medium">
              <span className="block truncate">{company.code} - {company.name}</span>
              <span className="block text-xs text-slate-500">{company.document}</span>
            </div>
            <Button className="h-auto rounded-none border-l border-slate-200 px-3 hover:bg-slate-50" type="button" variant="ghost" aria-label="Atualizar dados da empresa" onClick={() => queryClient.invalidateQueries()}>
              <AppIcon className="bg-primary/10 text-primary" name="spark" />
            </Button>
            <Button className="h-auto rounded-none border-l border-slate-200 px-3 text-destructive hover:bg-rose-50" type="button" variant="ghost" aria-label="Sair da empresa selecionada" onClick={() => setIsLeaveDialogOpen(true)}>
              <AppIcon className="bg-rose-50 text-rose-600" name="close" />
            </Button>
          </div>
          <Button
            className="group h-[52px] w-fit rounded-2xl border-white/20 bg-white/10 px-5 text-white hover:bg-white hover:text-primary"
            type="button"
            variant="ghost"
            aria-expanded={isConsultOpen}
            aria-controls="consult-side-nav"
            onClick={() => setIsConsultOpen((current) => !current)}
          >
            <AppIcon className="bg-white/15 text-white transition-colors group-hover:bg-primary/10 group-hover:text-primary" name={isConsultOpen ? "close" : "settings"} />
            Configurar
          </Button>
        </div>
      </CommandBand>
      {isConsultOpen ? <ConsultSideNav companyId={company.id} onClose={() => setIsConsultOpen(false)} /> : null}
      <ConfirmDialog
        open={isLeaveDialogOpen}
        title="Sair desta empresa?"
        description="Voce voltara para a selecao de empresas. Nenhum dado cadastrado sera apagado."
        confirmLabel="Sair"
        onOpenChange={setIsLeaveDialogOpen}
        onConfirm={() => navigate("/")}
      />
    </>
  );
}

function ConsultSideNav({ companyId, onClose }: { companyId: EntityId; onClose: () => void }) {
  const items = [
    { href: `/empresas/${companyId}/plano-de-contas`, icon: "table" as const, label: "Plano de Contas" },
    { href: `/empresas/${companyId}/consultas/de-paras`, icon: "search" as const, label: "De / Paras" },
    { href: `/empresas/${companyId}/consultas/regras`, icon: "settings" as const, label: "Regras" },
    { href: `/empresas/${companyId}/consultas/contas-padroes`, icon: "bank" as const, label: "Contas Padroes" },
    { href: "/historico-operacional", icon: "history" as const, label: "Historico operacional" }
  ];

  return (
    <>
      <button className="fixed inset-0 top-16 z-30 bg-slate-950/20 backdrop-blur-[1px] xl:hidden" type="button" aria-label="Fechar consultas" onClick={onClose} />
      <aside
        id="consult-side-nav"
        className="fixed bottom-0 right-0 top-16 z-30 w-full max-w-80 border-l border-border bg-card/96 p-5 shadow-2xl shadow-slate-950/20 backdrop-blur-xl"
        aria-label="Consultar"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atalhos</span>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Consultar</h2>
          </div>
          <Button size="icon" type="button" variant="ghost" aria-label="Fechar consultas" onClick={onClose}>
            <AppIcon className="bg-muted text-muted-foreground" name="close" />
          </Button>
        </div>
        <nav className="mt-6 grid gap-3">
          {items.map((item) => (
            <Button
              asChild
              className="h-12 justify-start rounded-2xl bg-primary px-4 text-primary-foreground shadow-md shadow-sky-950/10 hover:bg-primary/90"
              key={item.label}
            >
              <Link to={item.href} onClick={onClose}>
                <AppIcon className="bg-white/15 text-primary-foreground" name={item.icon} />
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
      </aside>
    </>
  );
}

function MenuPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`absolute top-[calc(100%+0.65rem)] z-50 rounded-2xl border border-border bg-card p-3 shadow-2xl shadow-slate-950/20 ${className}`}>
      {children}
    </div>
  );
}

function MenuHeader({ description, title }: { description: string; title: string }) {
  return (
    <div className="mb-3 border-b border-border pb-3">
      <strong className="block text-sm text-foreground">{title}</strong>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
    </div>
  );
}

export function CommandBand({ children }: { children: ReactNode }) {
  return (
    <AnimatedBand className="border-b border-border bg-gradient-to-r from-sky-700 via-cyan-600 to-slate-950 px-4 py-7 shadow-lg shadow-sky-950/10 sm:px-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 md:flex-row md:items-center md:justify-center">{children}</div>
    </AnimatedBand>
  );
}
