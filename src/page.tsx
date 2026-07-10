"use client";

import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dashboard } from "./components/Dashboard";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { AppIcon } from "./components/design-system";
import { CommandBand, Topbar } from "./components/Topbar";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { getCompanyHref } from "./lib/company";
import { createCompany, deleteCompany, getCompanies, updateCompany } from "./lib/api/companies";
import { getHistory } from "./lib/api/history";
import { fetchCnpjInfo } from "./lib/api/cnpj";
import type { Company, MonthlyEntry, NewCompany, ProcessedBatch } from "./lib/types";
import { useDebounce } from "./lib/use-debounce";
import { useToast } from "./components/ToastContext";
import { getFriendlyErrorMessage } from "./lib/error-handler";

const taxationOptions = ["Lucro Real", "Lucro Presumido", "Simples Nacional", "Imunes/Isentas"] as const;

const emptyCompany: NewCompany = {
  accountingCode: "",
  document: "",
  name: "",
  nickname: "",
  taxation: "Lucro Presumido"
};

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [dashboardQuery, setDashboardQuery] = useState("");
  const debouncedDashboardQuery = useDebounce(dashboardQuery, 300);
  const debouncedQuery = useDebounce(query, 300);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [cnpjInfo, setCnpjInfo] = useState<{ name?: string; nickname?: string; error?: string } | null>(null);
  const [isCnpjLoading, setIsCnpjLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const form = useForm<NewCompany>({
    defaultValues: emptyCompany,
    mode: "onChange"
  });
  const canSave = form.formState.isValid;

  useEffect(() => {
    const document = form.getValues("document");
    const cleanDocument = document?.replace(/\D/g, "");
    
    if (!document || (cleanDocument.length !== 11 && cleanDocument.length !== 14)) {
      setCnpjInfo(null);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setIsCnpjLoading(true);
      const info = await fetchCnpjInfo(document);
      setCnpjInfo(info);
      
      if (info.name && !form.getValues("name")) {
        form.setValue("name", info.name, { shouldValidate: true });
      }
      
      if (info.nickname && !form.getValues("nickname")) {
        form.setValue("nickname", info.nickname, { shouldValidate: true });
      }
      
      setIsCnpjLoading(false);
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [form, form.getValues("document")]);

  const { data: companies = [], isLoading: isLoadingCompanies } = useQuery({
    queryKey: ["companies", debouncedDashboardQuery],
    queryFn: () => getCompanies(debouncedDashboardQuery),
  });

  const { data: searchCompanies = [] } = useQuery({
    queryKey: ["companies", debouncedQuery],
    queryFn: () => getCompanies(debouncedQuery),
    enabled: isSearchOpen,
  });

  const { data: processedBatches = [] } = useQuery({
    queryKey: ["history"],
    queryFn: () => getHistory(),
  });

  const createMutation = useMutation({
    mutationFn: (newCompany: NewCompany) => createCompany(newCompany),
    onSuccess: (createdCompany) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa cadastrada com sucesso", "A empresa foi adicionada ao sistema.");
      window.setTimeout(() => {
        closeModal();
        navigate(getCompanyHref(createdCompany));
        createMutation.reset();
      }, 1000);
    },
    onError: (error) => {
      const friendly = getFriendlyErrorMessage(error);
      toast.error(friendly.title, friendly.description);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updatedCompany }: { id: string | number; updatedCompany: NewCompany }) => updateCompany(id.toString(), updatedCompany),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa atualizada com sucesso", "Os dados cadastrais foram alterados.");
      window.setTimeout(() => {
        setEditingCompany(null);
        updateMutation.reset();
      }, 1000);
    },
    onError: (error) => {
      const friendly = getFriendlyErrorMessage(error);
      toast.error(friendly.title, friendly.description);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => deleteCompany(id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa excluída com sucesso", "A empresa foi removida do painel.");
      window.setTimeout(() => {
        setEditingCompany(null);
        deleteMutation.reset();
      }, 1000);
    },
    onError: (error) => {
      const friendly = getFriendlyErrorMessage(error);
      toast.error(friendly.title, friendly.description);
    }
  });

  const companiesWithProcess = useMemo(() => {
    return companies.map((company) => {
      const companyBatches = processedBatches.filter((b) => {
        if (!b?.companyId || !company?.id) return false;
        return b.companyId.toString() === company.id.toString();
      });
      if (companyBatches.length > 0) {
        const lastBatch = companyBatches.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
        return {
          ...company,
          lastProcess: new Date(lastBatch.generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
        };
      }
      return company;
    });
  }, [companies, processedBatches]);

  const integrationStats = useMemo(() => {
    const totalLines = processedBatches.reduce((acc, batch) => acc + batch.lineCount, 0);
    const totalValue = processedBatches.reduce((acc, batch) => acc + batch.totalValue, 0);
    
    const total = companies.length;
    const customizadas = companies.filter((c) => c.mode === "Customizada").length;
    const simples = companies.filter((c) => c.mode === "Simples").length;
    const customPercent = total > 0 ? Math.round((customizadas / total) * 100) : 0;
    const simplesPercent = total > 0 ? Math.round((simples / total) * 100) : 0;
    const taxationCounts = {
      lucroReal: companies.filter((c) => c.taxation === "Lucro Real").length,
      lucroPresumido: companies.filter((c) => c.taxation === "Lucro Presumido").length,
      simplesNacional: companies.filter((c) => c.taxation === "Simples Nacional").length,
      imunesIsentas: companies.filter((c) => c.taxation === "Imunes/Isentas").length
    };

    return {
      companiesCount: total,
      linesGenerated: totalLines,
      totalValueIntegrated: totalValue,
      total,
      customizadas,
      simples,
      customPercent,
      simplesPercent,
      taxationCounts,
      taxationPercents: {
        lucroReal: total > 0 ? Math.round((taxationCounts.lucroReal / total) * 100) : 0,
        lucroPresumido: total > 0 ? Math.round((taxationCounts.lucroPresumido / total) * 100) : 0,
        simplesNacional: total > 0 ? Math.round((taxationCounts.simplesNacional / total) * 100) : 0,
        imunesIsentas: total > 0 ? Math.round((taxationCounts.imunesIsentas / total) * 100) : 0
      }
    };
  }, [companies, processedBatches]);

  const monthlyEntries = useMemo(() => buildMonthlyEntries(processedBatches), [processedBatches]);
  const maxEntryValue = Math.max(...monthlyEntries.map((e) => e.value), 1);
  const totalEntries = processedBatches.reduce((sum, batch) => sum + batch.lineCount, 0);

  const existingCompany = useMemo(() => {
    const document = form.getValues("document");
    if (!document) return null;
    const cleanDocument = document.replace(/\D/g, "");
    return companies.find(c => {
      const cleanCompanyDoc = c.document.replace(/\D/g, "");
      return cleanCompanyDoc === cleanDocument;
    });
  }, [companies, form.getValues("document")]);

  function saveCompany(newCompany: NewCompany) {
    if (createMutation.isPending || createMutation.isSuccess) return;
    
    if (existingCompany) {
      toast.error("Empresa já cadastrada", `Já existe uma empresa com o CNPJ ${newCompany.document.replace(/\D/g, "")}.`);
      return;
    }
    
    createMutation.mutate(newCompany);
  }

  function selectCompany(company: Company) {
    setQuery(`${company.code} - ${company.name}`);
    setIsSearchOpen(false);
    navigate(getCompanyHref(company));
  }

  function closeModal() {
    setIsModalOpen(false);
    form.reset(emptyCompany);
  }

  return (
    <main className="min-h-screen bg-muted/30 pb-24 text-foreground selection:bg-primary/20 selection:text-primary">
      <Topbar />
      <CommandBand>
          <div className="relative w-full sm:w-[480px]">
            <AppIcon className="absolute left-3 top-1/2 -translate-y-1/2 bg-muted-foreground/30 text-muted-foreground" name="spark" />
            <Input
              className="h-[52px] w-full rounded-2xl border-white/20 bg-white/10 pl-11 pr-4 text-white shadow-inner backdrop-blur-md transition-all placeholder:text-white/50 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/30 sm:text-base"
              placeholder="Buscar ou acessar empresa..."
              value={query}
              onBlur={() => setTimeout(() => setIsSearchOpen(false), 200)}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsSearchOpen(true)}
            />
            {isSearchOpen ? (
              <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-2xl border border-border bg-background p-2 shadow-2xl animate-in fade-in slide-in-from-top-2">
                {searchCompanies.length > 0 ? (
                  searchCompanies.map((company) => (
                    <button
                      className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      key={company.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectCompany(company);
                      }}
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-sm text-foreground">
                          {company.code} - {company.name}
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">{company.document}</span>
                      </span>
                      <AppIcon className="mt-1 bg-primary/10 text-primary" name="arrow" />
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
                )}
              </div>
            ) : null}
          </div>
          <Button className="h-[52px] rounded-2xl px-5 shadow-xl shadow-sky-950/10" type="button" variant="premium" onClick={() => setIsModalOpen(true)}>
            <AppIcon className="bg-white/15 text-white" name="plus" />
            Nova empresa
          </Button>
      </CommandBand>
      <Dashboard
        companies={companiesWithProcess}
        dashboardQuery={dashboardQuery}
        integrationStats={integrationStats}
        maxEntryValue={maxEntryValue}
        monthlyEntries={monthlyEntries}
        onDashboardQueryChange={setDashboardQuery}
        onEditCompany={setEditingCompany}
        onSelectCompany={selectCompany}
        onToggleShowAllCompanies={() => setShowAllCompanies((current) => !current)}
        showAllCompanies={showAllCompanies}
        totalEntries={totalEntries}
        isLoading={isLoadingCompanies}
      />
      <Dialog open={isModalOpen} onOpenChange={(open) => (open ? setIsModalOpen(true) : closeModal())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>Cadastre uma empresa para iniciar a integração contábil.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => {
            if (createMutation.isPending || createMutation.isSuccess) {
              e.preventDefault();
              return;
            }
            form.handleSubmit(saveCompany)(e);
          }}>
            {createMutation.isError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400">
                <strong className="block font-semibold mb-1">Não foi possível salvar a empresa:</strong>
                {createMutation.error instanceof Error ? createMutation.error.message : "Erro desconhecido. Verifique as regras de banco de dados."}
              </div>
            ) : null}

            {createMutation.isSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                <strong className="block font-semibold mb-1">Empresa cadastrada com sucesso!</strong>
                Redirecionando para a página de integrações...
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="document" className={form.formState.errors.document ? "text-destructive" : ""}>CPF ou CNPJ *</Label>
              <div className="relative">
                <Input 
                  id="document" 
                  autoFocus 
                  placeholder="99.999.999/0001-99" 
                  disabled={createMutation.isPending || createMutation.isSuccess}
                  className={form.formState.errors.document ? "border-destructive focus-visible:ring-destructive" : ""}
                  {...form.register("document", { 
                    required: "CPF ou CNPJ é obrigatório",
                    validate: {
                      unique: (value) => {
                        const cleanDocument = value.replace(/\D/g, "");
                        if (existingCompany) {
                          return `Empresa já cadastrada com este CNPJ`;
                        }
                        return true;
                      }
                    }
                  })} 
                />
                {isCnpjLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {cnpjInfo?.error && !existingCompany && (
                <span className="text-xs text-amber-600 font-medium">{cnpjInfo.error}</span>
              )}
              {existingCompany && (
                <span className="text-xs text-destructive font-medium">Empresa já cadastrada com este CNPJ</span>
              )}
              {form.formState.errors.document && !existingCompany && (
                <span className="text-xs text-destructive font-medium">{form.formState.errors.document.message}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name" className={form.formState.errors.name ? "text-destructive" : ""}>Nome *</Label>
              <Input 
                id="name" 
                placeholder="Razão social ou nome" 
                disabled={createMutation.isPending || createMutation.isSuccess}
                className={form.formState.errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
                {...form.register("name", { required: "Nome é obrigatório" })} 
              />
              {cnpjInfo?.name && !existingCompany && (
                <span className="text-xs text-emerald-600 font-medium">Nome preenchido automaticamente via CNPJ</span>
              )}
              {form.formState.errors.name && (
                <span className="text-xs text-destructive font-medium">{form.formState.errors.name.message}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="nickname" className={form.formState.errors.nickname ? "text-destructive" : ""}>Apelido *</Label>
              <Input 
                id="nickname" 
                maxLength={30} 
                placeholder="Nome curto" 
                disabled={createMutation.isPending || createMutation.isSuccess}
                className={form.formState.errors.nickname ? "border-destructive focus-visible:ring-destructive" : ""}
                {...form.register("nickname", { required: "Apelido é obrigatório" })} 
              />
              {cnpjInfo?.nickname && !existingCompany && (
                <span className="text-xs text-emerald-600 font-medium">Apelido sugerido automaticamente via CNPJ</span>
              )}
              <div className="flex justify-between items-center text-xs">
                {form.formState.errors.nickname ? (
                  <span className="text-destructive font-medium">{form.formState.errors.nickname.message}</span>
                ) : <span />}
                <span className="text-muted-foreground">{form.watch("nickname")?.length ?? 0} / 30</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="accountingCode" className={form.formState.errors.accountingCode ? "text-destructive" : ""}>Código no sistema contábil *</Label>
              <Input 
                id="accountingCode" 
                placeholder="Ex.: 1204" 
                disabled={createMutation.isPending || createMutation.isSuccess}
                className={form.formState.errors.accountingCode ? "border-destructive focus-visible:ring-destructive" : ""}
                {...form.register("accountingCode", { required: "Código no sistema contábil é obrigatório" })} 
              />
              {form.formState.errors.accountingCode && (
                <span className="text-xs text-destructive font-medium">{form.formState.errors.accountingCode.message}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="taxation">Tributação *</Label>
              <select
                id="taxation"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                disabled={createMutation.isPending || createMutation.isSuccess}
                {...form.register("taxation", { required: true })}
              >
                {taxationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal} disabled={createMutation.isPending || createMutation.isSuccess}>
                Cancelar
              </Button>
              <Button disabled={createMutation.isPending || createMutation.isSuccess || !!existingCompany || !canSave} type="submit">
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {editingCompany ? (
        <EditCompanyDialog
          company={editingCompany}
          onClose={() => {
            setEditingCompany(null);
            updateMutation.reset();
            deleteMutation.reset();
          }}
          onDelete={() => deleteMutation.mutate(editingCompany.id)}
          onSave={(updatedCompany) => updateMutation.mutate({ id: editingCompany.id, updatedCompany })}
          isPending={updateMutation.isPending || deleteMutation.isPending}
          isSuccess={updateMutation.isSuccess || deleteMutation.isSuccess}
          error={updateMutation.error instanceof Error ? updateMutation.error.message : updateMutation.isError ? "Erro ao atualizar a empresa." : deleteMutation.isError ? "Erro ao excluir a empresa." : null}
        />
      ) : null}
    </main>
  );
}

function buildMonthlyEntries(processedBatches: ProcessedBatch[]): MonthlyEntry[] {
  const now = new Date();
  const buckets = Array.from({ length: 4 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (3 - index), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      month: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      value: 0,
      tone: index % 2 === 0 ? "primary" : "dark"
    } satisfies MonthlyEntry & { key: string };
  });

  for (const batch of processedBatches) {
    const date = parseProcessedBatchDate(batch.generatedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = buckets.find((item) => item.key === key);
    if (bucket) {
      bucket.value += batch.lineCount;
    }
  }

  return buckets.map(({ key: _key, ...entry }) => entry);
}

function parseProcessedBatchDate(value: string) {
  const ptBrMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (ptBrMatch) {
    const year = ptBrMatch[3].length === 2 ? `20${ptBrMatch[3]}` : ptBrMatch[3];
    return new Date(Number(year), Number(ptBrMatch[2]) - 1, Number(ptBrMatch[1]));
  }

  return new Date(value);
}

function EditCompanyDialog({
  company,
  onClose,
  onDelete,
  onSave,
  isPending,
  isSuccess,
  error
}: {
  company: Company;
  onClose: () => void;
  onDelete: () => void;
  onSave: (company: NewCompany) => void;
  isPending?: boolean;
  isSuccess?: boolean;
  error?: string | null;
}) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const editForm = useForm<NewCompany>({
    defaultValues: {
      accountingCode: company.code,
      document: company.document,
      name: company.name,
      nickname: company.nickname,
      taxation: company.taxation
    },
    mode: "onChange"
  });

  return (
    <>
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
            <DialogDescription>Atualize os dados cadastrais ou exclua esta empresa do painel.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => {
            if (isPending || isSuccess) {
              e.preventDefault();
              return;
            }
            editForm.handleSubmit(onSave)(e);
          }}>
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400">
                <strong className="block font-semibold mb-1">Erro:</strong>
                {error}
              </div>
            ) : null}

            {isSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                <strong className="block font-semibold mb-1">Sucesso!</strong>
                Operação realizada com sucesso. Fechando modal...
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="edit-document" className={editForm.formState.errors.document ? "text-destructive" : ""}>CPF ou CNPJ *</Label>
              <Input 
                id="edit-document" 
                autoFocus 
                placeholder="99.999.999/0001-99" 
                disabled={isPending || isSuccess}
                className={editForm.formState.errors.document ? "border-destructive focus-visible:ring-destructive" : ""}
                {...editForm.register("document", { required: "CPF ou CNPJ é obrigatório" })} 
              />
              {editForm.formState.errors.document && (
                <span className="text-xs text-destructive font-medium">{editForm.formState.errors.document.message}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-name" className={editForm.formState.errors.name ? "text-destructive" : ""}>Nome *</Label>
              <Input 
                id="edit-name" 
                placeholder="Razão social ou nome" 
                disabled={isPending || isSuccess}
                className={editForm.formState.errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
                {...editForm.register("name", { required: "Nome é obrigatório" })} 
              />
              {editForm.formState.errors.name && (
                <span className="text-xs text-destructive font-medium">{editForm.formState.errors.name.message}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-nickname" className={editForm.formState.errors.nickname ? "text-destructive" : ""}>Apelido *</Label>
              <Input 
                id="edit-nickname" 
                maxLength={30} 
                placeholder="Nome curto" 
                disabled={isPending || isSuccess}
                className={editForm.formState.errors.nickname ? "border-destructive focus-visible:ring-destructive" : ""}
                {...editForm.register("nickname", { required: "Apelido é obrigatório" })} 
              />
              <div className="flex justify-between items-center text-xs">
                {editForm.formState.errors.nickname ? (
                  <span className="text-destructive font-medium">{editForm.formState.errors.nickname.message}</span>
                ) : <span />}
                <span className="text-muted-foreground">{editForm.watch("nickname")?.length ?? 0} / 30</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-accountingCode" className={editForm.formState.errors.accountingCode ? "text-destructive" : ""}>Código no sistema contábil *</Label>
              <Input 
                id="edit-accountingCode" 
                placeholder="Ex.: 1204" 
                disabled={isPending || isSuccess}
                className={editForm.formState.errors.accountingCode ? "border-destructive focus-visible:ring-destructive" : ""}
                {...editForm.register("accountingCode", { required: "Código no sistema contábil é obrigatório" })} 
              />
              {editForm.formState.errors.accountingCode && (
                <span className="text-xs text-destructive font-medium">{editForm.formState.errors.accountingCode.message}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-taxation">Tributação *</Label>
              <select
                id="edit-taxation"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                disabled={isPending || isSuccess}
                {...editForm.register("taxation", { required: true })}
              >
                {taxationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button className="text-destructive hover:bg-rose-50 hover:text-destructive" type="button" variant="ghost" onClick={() => setIsDeleteDialogOpen(true)} disabled={isPending || isSuccess}>
                Excluir empresa
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onClose} disabled={isPending || isSuccess}>
                  Cancelar
                </Button>
                <Button disabled={isPending || isSuccess} type="submit">
                  {isPending ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Excluir empresa?"
        description={`A empresa ${company.code} - ${company.name} sera removida da lista local. Os lotes ja processados permanecem no historico operacional.`}
        confirmLabel="Excluir"
        tone="danger"
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={onDelete}
      />
    </>
  );
}
