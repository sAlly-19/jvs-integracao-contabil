import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { AnimatedGroup, AnimatedItem, AnimatedPage } from "./animate-ui/motion";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export type AppIconName =
  | "activity"
  | "alert"
  | "arrow"
  | "bank"
  | "calendar"
  | "check"
  | "close"
  | "company"
  | "download"
  | "file"
  | "history"
  | "link"
  | "moon"
  | "plus"
  | "search"
  | "settings"
  | "sheet"
  | "spark"
  | "sun"
  | "table"
  | "upload";

const iconSymbol: Record<AppIconName, string> = {
  activity: "↗",
  alert: "!",
  arrow: "→",
  bank: "B",
  calendar: "C",
  check: "✓",
  close: "×",
  company: "J",
  download: "↓",
  file: "F",
  history: "H",
  link: "∞",
  moon: "●",
  plus: "+",
  search: "⌕",
  settings: "⚙",
  sheet: "▦",
  spark: "✦",
  sun: "○",
  table: "≡",
  upload: "↑"
};

const iconClass: Record<AppIconName, string> = {
  activity: "fi-rr-arrow-trend-up",
  alert: "fi-rr-triangle-warning",
  arrow: "fi-rr-arrow-right",
  bank: "fi-rr-bank",
  calendar: "fi-rr-calendar",
  check: "fi-rr-check",
  close: "fi-rr-x",
  company: "fi-rr-apartment",
  download: "fi-rr-download",
  file: "fi-rr-file",
  history: "fi-rr-time-past",
  link: "fi-rr-link",
  moon: "fi-rr-moon",
  plus: "fi-rr-add",
  search: "fi-rr-search",
  settings: "fi-rr-settings",
  sheet: "fi-rr-table-layout",
  spark: "fi-rr-bolt",
  sun: "fi-rr-sun",
  table: "fi-rr-table-list",
  upload: "fi-rr-upload"
};

export function AppIcon({ className, name }: { className?: string; name: AppIconName }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[0.95rem] leading-none",
        className
      )}
    >
      <i className={cn(iconClass[name], "block leading-none")} />
    </span>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 rotate-45 grid-cols-2 gap-1 rounded-2xl bg-slate-950 p-1 shadow-lg shadow-sky-500/20 dark:bg-slate-900",
        className
      )}
    >
      <span className="rounded-[5px] bg-sky-500" />
      <span className="rounded-[5px] bg-fuchsia-500" />
      <span className="rounded-[5px] bg-cyan-400" />
      <span className="rounded-[5px] bg-amber-400" />
    </span>
  );
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <AnimatedPage className={cn("mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8", className)}>{children}</AnimatedPage>;
}

export function PageHeader({
  actions,
  badge,
  description,
  title
}: {
  actions?: ReactNode;
  badge?: string;
  description?: ReactNode;
  title: string;
}) {
  return (
    <AnimatedGroup className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <AnimatedItem className="max-w-3xl">
        {badge ? (
          <Badge className="mb-3 rounded-full px-3 py-1" variant="secondary">
            {badge}
          </Badge>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1>
        {description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </AnimatedItem>
      {actions ? <AnimatedItem className="flex shrink-0 flex-wrap items-center gap-2">{actions}</AnimatedItem> : null}
    </AnimatedGroup>
  );
}

export function MetricCard({
  description,
  icon,
  label,
  value
}: {
  description?: string;
  icon: AppIconName;
  label: string;
  value: string;
}) {
  return (
    <Card className="overflow-hidden bg-card/90 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-950/5">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <strong className="mt-2 block text-2xl font-semibold tracking-tight text-foreground">{value}</strong>
          {description ? <span className="mt-1 block text-xs text-muted-foreground">{description}</span> : null}
        </div>
        <AppIcon className="size-10 rounded-2xl bg-primary/10 text-primary" name={icon} />
      </CardContent>
    </Card>
  );
}

export function DataCard({
  children,
  className,
  description,
  title
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        {description ? <CardDescription>{description}</CardDescription> : null}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function StatusPill({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "danger" | "info" | "neutral" | "success" | "warning";
}) {
  const tones = {
    danger: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
    info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
    neutral: "border-border bg-muted text-muted-foreground",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}
