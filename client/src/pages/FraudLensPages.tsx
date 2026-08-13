import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, ArrowRight, BellRing, Bot, CalendarClock, CheckCircle2, ChevronRight, CircleDot, Clock3, Database, FileText, Fingerprint, History, KeyRound, Link2, ListFilter, MessageSquare, Paperclip, Send, ShieldAlert, Sparkles, Tag, TrendingUp, Upload, UserCheck, UserCog, UserPlus, UserX, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

type RiskLevel = "low" | "medium" | "high";
type CaseStatus = "under_review" | "confirmed_fraud" | "legitimate";
type CasePriority = "critical" | "high" | "standard";
type AssessmentForm = {
  amount: string;
  merchantCategory: string;
  transactionCountry: string;
  accountCountry: string;
  deviceStatus: "known" | "new";
  transactionHour: string;
  recentTransactionCount: string;
};

const riskStyle: Record<RiskLevel, string> = {
  high: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  medium: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  low: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
};
const statusStyle: Record<CaseStatus, string> = {
  under_review: "border-violet-300/20 bg-violet-300/10 text-violet-200",
  confirmed_fraud: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  legitimate: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
};
const readableStatus: Record<CaseStatus, string> = {
  under_review: "Under review",
  confirmed_fraud: "Confirmed fraud",
  legitimate: "Legitimate",
};
const priorityStyle: Record<CasePriority, string> = {
  critical: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  high: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  standard: "border-slate-300/15 bg-slate-300/[0.07] text-slate-300",
};
const readablePriority: Record<CasePriority, string> = { critical: "Critical", high: "High", standard: "Standard" };

function RiskPill({ level }: { level: RiskLevel }) {
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${riskStyle[level]}`}>{level}</Badge>;
}
function StatusPill({ status }: { status: CaseStatus }) {
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusStyle[status]}`}>{readableStatus[status]}</Badge>;
}
function PriorityPill({ priority }: { priority: CasePriority }) {
  return <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${priorityStyle[priority]}`}>{readablePriority[priority]}</Badge>;
}
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function date(value: Date | string) { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function dateInput(value: Date | string | null | undefined) { if (!value) return ""; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`; }
function Frame({ children }: { children: React.ReactNode }) { return <DashboardLayout><div className="mx-auto max-w-[1540px] fraudlens-enter">{children}</div></DashboardLayout>; }
function Eyebrow({ children }: { children: React.ReactNode }) { return <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{children}</p>; }
function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) { return <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><Eyebrow>{eyebrow}</Eyebrow><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{title}</h1></div>{children}</div>; }
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <Card className={`border-white/[0.075] bg-[#0c1a28] shadow-none ${className}`}><CardContent className="p-5">{children}</CardContent></Card>; }
function QueryState({ state, label }: { state: "loading" | "error" | "empty"; label: string }) {
  const color = state === "error" ? "text-rose-200" : "text-slate-500";
  return <Panel><div className={`py-14 text-center text-sm ${color}`} role={state === "error" ? "alert" : "status"}>{label}</div></Panel>;
}

function validateAssessment(form: AssessmentForm) {
  const errors: Partial<Record<keyof AssessmentForm, string>> = {};
  const amount = Number(form.amount);
  const hour = Number(form.transactionHour);
  const count = Number(form.recentTransactionCount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) errors.amount = "Enter an amount between $1 and $1,000,000.";
  if (!/^[A-Z]{2,3}$/.test(form.transactionCountry)) errors.transactionCountry = "Use a two- or three-letter country code.";
  if (!/^[A-Z]{2,3}$/.test(form.accountCountry)) errors.accountCountry = "Use a two- or three-letter country code.";
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) errors.transactionHour = "Use a whole hour from 0 to 23.";
  if (!Number.isInteger(count) || count < 0 || count > 50) errors.recentTransactionCount = "Use a whole number from 0 to 50.";
  return errors;
}

export function CommandCenterPage() {
  const [, setLocation] = useLocation();
  const overview = trpc.risk.overview.useQuery(undefined, { refetchInterval: 15_000 });
  const data = overview.data;
  const previouslySeenAlerts = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    if (previouslySeenAlerts.current !== null && data.newlyFlagged > previouslySeenAlerts.current) {
      const difference = data.newlyFlagged - previouslySeenAlerts.current;
      toast.warning("New high-risk transaction requires review", { description: `${difference} new alert${difference === 1 ? "" : "s"} added to the queue.` });
    }
    previouslySeenAlerts.current = data.newlyFlagged;
  }, [data?.newlyFlagged]);
  const stats = data ? [
    { label: "High-risk alerts", value: data.highRisk, icon: ShieldAlert, accent: "text-rose-200", note: `${data.newlyFlagged} newly flagged` },
    { label: "Awaiting review", value: data.underReview, icon: Clock3, accent: "text-violet-200", note: "Open investigator cases" },
    { label: "Average risk", value: `${data.averageProbability}%`, icon: TrendingUp, accent: "text-cyan-200", note: "Across visible activity" },
    { label: "Assessed activity", value: data.total, icon: Database, accent: "text-emerald-200", note: "Illustrative queue records" },
  ] : [];
  return <Frame><PageTitle eyebrow="Investigator workspace" title="Command Center"><div className="flex gap-2"><Button variant="outline" onClick={() => setLocation("/transactions")} className="border-white/10 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white">Open queue</Button><Button onClick={() => setLocation("/assess")} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><Sparkles className="mr-2 h-4 w-4" /> New assessment</Button></div></PageTitle>
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-4 py-3 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" /><p><span className="font-semibold">Portfolio preview.</span> Dashboard records are illustrative examples; human review remains required for every risk decision.</p></div>
    {data?.newlyFlagged ? <button onClick={() => setLocation("/transactions")} className="mb-6 flex w-full items-center justify-between rounded-xl border border-rose-300/20 bg-rose-300/[0.075] px-4 py-3 text-left text-rose-100 transition hover:bg-rose-300/[0.11] focus:outline-none focus:ring-2 focus:ring-rose-200"><span className="flex items-center gap-3"><BellRing className="h-4 w-4 animate-pulse" /><span><span className="font-semibold">{data.newlyFlagged} new high-risk {data.newlyFlagged === 1 ? "alert" : "alerts"}</span><span className="ml-2 text-sm text-rose-200/80">Open the review queue to investigate.</span></span></span><ChevronRight className="h-4 w-4" /></button> : null}
    {overview.isLoading ? <QueryState state="loading" label="Loading active risk signals…" /> : overview.error ? <QueryState state="error" label="Unable to load the command center. Please refresh and try again." /> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <Panel key={stat.label}><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{stat.label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-100">{stat.value}</p><p className="mt-2 text-xs text-slate-500">{stat.note}</p></div><div className={`rounded-lg bg-white/[0.035] p-2.5 ${stat.accent}`}><stat.icon className="h-5 w-5" /></div></div></Panel>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]"><Panel><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-100">Priority review queue</p><p className="mt-1 text-xs text-slate-500">Ordered by probability and investigator context</p></div><button onClick={() => setLocation("/transactions")} className="flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300">View all <ChevronRight className="h-3.5 w-3.5" /></button></div><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead><tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.13em] text-slate-500"><th className="pb-3 font-medium">Transaction</th><th className="pb-3 font-medium">Risk</th><th className="pb-3 font-medium">Signals</th><th className="pb-3 text-right font-medium">Amount</th></tr></thead><tbody>{data?.queue.map((record: any) => <tr key={record.id} className="border-b border-white/[0.045] last:border-0"><td className="py-3.5"><button onClick={() => setLocation(`/transactions/${record.id}`)} className="text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"><p className="text-sm font-medium text-slate-200 hover:text-cyan-200">{record.merchantName}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{record.reference}</p></button></td><td className="py-3.5"><div className="flex items-center gap-2"><RiskPill level={record.riskLevel} /><span className="text-xs font-medium text-slate-300">{record.probability}%</span></div></td><td className="max-w-[250px] py-3.5 text-xs text-slate-500">{record.factors.slice(0, 2).map((factor: any) => factor.label).join(" · ") || "No material indicators"}</td><td className="py-3.5 text-right text-sm font-medium text-slate-200">{money(record.amount)}</td></tr>)}</tbody></table></div></Panel>
      <Panel><div className="mb-5"><p className="text-sm font-semibold text-slate-100">New high-risk alerts</p><p className="mt-1 text-xs text-slate-500">Raised in the last 24 hours</p></div><div className="space-y-3">{data?.highRiskAlerts.map((record: any) => <button key={record.id} onClick={() => setLocation(`/transactions/${record.id}`)} className="w-full rounded-xl border border-rose-300/10 bg-rose-300/[0.045] p-3.5 text-left transition hover:bg-rose-300/[0.09] focus:outline-none focus:ring-2 focus:ring-rose-200"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-100">{record.merchantName}</p><RiskPill level="high" /></div><p className="mt-2 text-xs leading-5 text-slate-400">{record.deterministicExplanation}</p><div className="mt-3 flex items-center justify-between text-xs"><span className="font-mono text-slate-500">{record.reference}</span><span className="font-semibold text-rose-200">{record.probability}%</span></div></button>)}</div></Panel></div></>}</Frame>;
}

export function TransactionsPage() {
  const [, setLocation] = useLocation();
  const [riskLevel, setRiskLevel] = useState(""); const [caseStatus, setCaseStatus] = useState(""); const [merchantCategory, setMerchantCategory] = useState(""); const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const list = trpc.risk.list.useQuery({ riskLevel: (riskLevel || undefined) as RiskLevel | undefined, caseStatus: (caseStatus || undefined) as CaseStatus | undefined, merchantCategory: merchantCategory || undefined, dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`) : undefined, dateTo: dateTo ? new Date(`${dateTo}T23:59:59`) : undefined }, { refetchInterval: 15_000 });
  return <Frame><PageTitle eyebrow="Review history" title="Transactions"><p className="max-w-md text-sm leading-6 text-slate-500">Filter the analyst queue by decision risk, review outcome, category, or date range.</p></PageTitle><Panel><div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><select aria-label="Risk level" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All risk levels</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option></select><select aria-label="Case status" value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All case statuses</option><option value="under_review">Under review</option><option value="confirmed_fraud">Confirmed fraud</option><option value="legitimate">Legitimate</option></select><select aria-label="Merchant category" value={merchantCategory} onChange={(event) => setMerchantCategory(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All merchant categories</option><option value="electronics">Electronics</option><option value="travel">Travel</option><option value="jewelry">Jewelry</option><option value="digital goods">Digital goods</option><option value="groceries">Groceries</option><option value="fuel">Fuel</option></select><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="From date" className="border-white/10 bg-[#07111e] text-slate-200 focus-visible:ring-cyan-300" /><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="To date" className="border-white/10 bg-[#07111e] text-slate-200 focus-visible:ring-cyan-300" /></div>
  {list.isLoading ? <p className="py-10 text-center text-sm text-slate-500" role="status">Loading analyst queue…</p> : list.error ? <p className="py-10 text-center text-sm text-rose-200" role="alert">Unable to load transactions. Please refresh and try again.</p> : list.data?.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No transactions match these filters.</p> : <><p className="mb-5 text-xs text-slate-500">{list.data?.length ?? 0} records shown · automatically refreshes for new risk events</p><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left"><thead><tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.13em] text-slate-500"><th className="pb-3 font-medium">Reference</th><th className="pb-3 font-medium">Merchant</th><th className="pb-3 font-medium">Risk</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Created</th><th className="pb-3 text-right font-medium">Amount</th></tr></thead><tbody>{list.data?.map((record: any) => <tr key={record.id} className="border-b border-white/[0.045] last:border-0"><td className="py-4 font-mono text-xs text-slate-400"><button onClick={() => setLocation(`/transactions/${record.id}`)} className="hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300">{record.reference}</button></td><td className="py-4"><button onClick={() => setLocation(`/transactions/${record.id}`)} className="text-left focus:outline-none focus:ring-2 focus:ring-cyan-300"><p className="text-sm font-medium text-slate-100 hover:text-cyan-200">{record.merchantName}</p><p className="mt-1 text-xs text-slate-500">{record.merchantCategory}</p></button></td><td className="py-4"><div className="flex items-center gap-2"><RiskPill level={record.riskLevel} /><span className="text-xs text-slate-300">{record.probability}%</span></div></td><td className="py-4"><StatusPill status={record.caseStatus} /></td><td className="py-4 text-xs text-slate-500">{date(record.createdAt)}</td><td className="py-4 text-right text-sm font-medium text-slate-100">{money(record.amount)}</td></tr>)}</tbody></table></div></>}</Panel></Frame>;
}

export function AssessmentPage() {
  const [, setLocation] = useLocation(); const utils = trpc.useUtils();
  const [form, setForm] = useState<AssessmentForm>({ amount: "1250", merchantCategory: "electronics", transactionCountry: "US", accountCountry: "US", deviceStatus: "new", transactionHour: "23", recentTransactionCount: "4" });
  const [errors, setErrors] = useState<Partial<Record<keyof AssessmentForm, string>>>({});
  const [result, setResult] = useState<any>(null);
  const assess = trpc.risk.assess.useMutation({ onSuccess: (record) => { setResult(record); utils.risk.overview.invalidate(); utils.risk.list.invalidate(); toast.success("Risk assessment created", { description: `${record.riskLevel.toUpperCase()} risk · ${record.probability}% probability` }); }, onError: (error) => toast.error(error.message) });
  const update = (key: keyof AssessmentForm, value: string) => { setForm((previous) => ({ ...previous, [key]: value })); setErrors((previous) => ({ ...previous, [key]: undefined })); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); const validation = validateAssessment(form); setErrors(validation); if (Object.keys(validation).length) { toast.error("Correct the highlighted fields before assessing."); return; } assess.mutate({ amount: Number(form.amount), merchantCategory: form.merchantCategory, transactionCountry: form.transactionCountry, accountCountry: form.accountCountry, deviceStatus: form.deviceStatus, transactionHour: Number(form.transactionHour), recentTransactionCount: Number(form.recentTransactionCount) }); };
  const inputClass = "mt-2 border-white/10 bg-[#07111e] text-slate-100 focus-visible:ring-cyan-300";
  const ErrorText = ({ message }: { message?: string }) => message ? <p className="mt-1.5 text-xs text-rose-200" role="alert">{message}</p> : null;
  return <Frame><PageTitle eyebrow="Instant assessment" title="Assess a transaction"><p className="max-w-xl text-sm leading-6 text-slate-500">Enter non-sensitive demonstration context. The score is returned immediately with a human-readable rationale.</p></PageTitle><div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]"><Panel><form noValidate onSubmit={submit} className="space-y-5"><div><label htmlFor="amount" className="text-xs font-medium text-slate-400">Transaction amount (USD)</label><Input id="amount" type="number" min="1" value={form.amount} onChange={(event) => update("amount", event.target.value)} aria-invalid={Boolean(errors.amount)} aria-describedby={errors.amount ? "amount-error" : undefined} className={inputClass} /><ErrorText message={errors.amount} /></div><div><label htmlFor="category" className="text-xs font-medium text-slate-400">Merchant category</label><select id="category" value={form.merchantCategory} onChange={(event) => update("merchantCategory", event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option>electronics</option><option>travel</option><option>jewelry</option><option>digital goods</option><option>groceries</option><option>fuel</option><option>books</option></select></div><div className="grid grid-cols-2 gap-4"><div><label htmlFor="transaction-country" className="text-xs font-medium text-slate-400">Transaction country</label><Input id="transaction-country" value={form.transactionCountry} maxLength={3} onChange={(event) => update("transactionCountry", event.target.value.toUpperCase())} aria-invalid={Boolean(errors.transactionCountry)} className={inputClass} /><ErrorText message={errors.transactionCountry} /></div><div><label htmlFor="account-country" className="text-xs font-medium text-slate-400">Account country</label><Input id="account-country" value={form.accountCountry} maxLength={3} onChange={(event) => update("accountCountry", event.target.value.toUpperCase())} aria-invalid={Boolean(errors.accountCountry)} className={inputClass} /><ErrorText message={errors.accountCountry} /></div></div><div className="grid grid-cols-2 gap-4"><div><label htmlFor="device" className="text-xs font-medium text-slate-400">Device</label><select id="device" value={form.deviceStatus} onChange={(event) => update("deviceStatus", event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="known">Known device</option><option value="new">New device</option></select></div><div><label htmlFor="hour" className="text-xs font-medium text-slate-400">Transaction hour (0–23)</label><Input id="hour" type="number" min="0" max="23" value={form.transactionHour} onChange={(event) => update("transactionHour", event.target.value)} aria-invalid={Boolean(errors.transactionHour)} className={inputClass} /><ErrorText message={errors.transactionHour} /></div></div><div><label htmlFor="recent-count" className="text-xs font-medium text-slate-400">Recent transaction count</label><Input id="recent-count" type="number" min="0" max="50" value={form.recentTransactionCount} onChange={(event) => update("recentTransactionCount", event.target.value)} aria-invalid={Boolean(errors.recentTransactionCount)} className={inputClass} /><ErrorText message={errors.recentTransactionCount} /></div><Button disabled={assess.isPending} className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">{assess.isPending ? "Assessing…" : "Run instant assessment"}<ArrowRight className="ml-2 h-4 w-4" /></Button></form></Panel><Panel>{result ? <div><div className="flex items-start justify-between"><div><Eyebrow>Assessment complete</Eyebrow><h2 className="mt-2 text-2xl font-semibold text-slate-100">{result.reference}</h2></div><RiskPill level={result.riskLevel} /></div><div className="mt-7 flex items-end gap-3"><span className="text-6xl font-semibold tracking-tighter text-slate-50">{result.probability}</span><span className="mb-2 text-lg text-slate-500">% risk probability</span></div><div className="mt-7 rounded-xl border border-white/[0.07] bg-[#07111e] p-4"><p className="text-sm leading-6 text-slate-300">{result.deterministicExplanation}</p></div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Leading factors</p><div className="mt-3 space-y-2">{result.factors.map((factor: any) => <div key={factor.key} className="flex gap-3 rounded-lg bg-white/[0.035] p-3"><Fingerprint className="mt-0.5 h-4 w-4 text-cyan-300" /><div><p className="text-sm font-medium text-slate-200">{factor.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{factor.detail}</p></div></div>)}</div><div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => setLocation(`/transactions/${result.id}`)} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">View transaction detail</Button><Button variant="outline" onClick={() => setLocation("/casework")} className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]">Open in casework</Button></div></div> : <div className="flex min-h-[520px] flex-col justify-center"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-300"><CircleDot className="h-6 w-6" /></div><h2 className="mt-5 text-xl font-semibold text-slate-100">Ready for context.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Your result will include a consistent risk label, probability, factor-level rationale, and a new review case when appropriate.</p></div>}</Panel></div></Frame>;
}

export function TransactionDetailPage() {
  const [, params] = useRoute("/transactions/:id"); const [, setLocation] = useLocation(); const utils = trpc.useUtils();
  const id = Number(params?.id); const detail = trpc.risk.detail.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0 });
  const summarize = trpc.risk.summarize.useMutation({ onSuccess: () => { utils.risk.detail.invalidate({ id }); utils.risk.list.invalidate(); toast.success("Investigator summary refreshed"); }, onError: () => toast.message("A deterministic explanation is still available.") });
  if (!Number.isInteger(id) || id <= 0) return <Frame><PageTitle eyebrow="Transaction record" title="Invalid transaction reference" /><QueryState state="error" label="The transaction reference is not valid." /></Frame>;
  if (detail.isLoading) return <Frame><PageTitle eyebrow="Transaction record" title="Transaction detail" /><QueryState state="loading" label="Loading transaction evidence…" /></Frame>;
  if (detail.error || !detail.data) return <Frame><PageTitle eyebrow="Transaction record" title="Transaction detail" /><QueryState state="error" label="This transaction could not be found." /></Frame>;
  const record = detail.data;
  return <Frame><PageTitle eyebrow="Transaction record" title={record.merchantName}><Button variant="outline" onClick={() => setLocation("/transactions")} className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"><ArrowLeft className="mr-2 h-4 w-4" /> Back to history</Button></PageTitle><div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]"><div className="space-y-6"><Panel><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs text-slate-500">{record.reference}</p><div className="mt-4 flex flex-wrap items-center gap-2"><RiskPill level={record.riskLevel} /><StatusPill status={record.caseStatus} /><span className="text-sm text-slate-400">Created {date(record.createdAt)}</span></div><p className="mt-6 text-5xl font-semibold tracking-tighter text-slate-50">{record.probability}<span className="text-2xl text-slate-500">% risk</span></p></div><p className="text-right text-2xl font-semibold text-slate-100">{money(record.amount)}<span className="mt-1 block text-xs font-normal text-slate-500">{record.merchantCategory}</span></p></div><div className="mt-7 rounded-xl border border-white/[0.07] bg-[#07111e] p-4"><Eyebrow>Plain-English rationale</Eyebrow><p className="mt-2 text-sm leading-6 text-slate-300">{record.llmSummary || record.deterministicExplanation}</p>{record.llmNextStep && <p className="mt-3 text-sm leading-6 text-cyan-200">Recommended next step: {record.llmNextStep}</p>}</div><div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" disabled={summarize.isPending} onClick={() => summarize.mutate({ id: record.id })} className="border-white/10 bg-white/[0.03] text-cyan-200 hover:bg-white/[0.08]"><Bot className="mr-2 h-4 w-4" /> {summarize.isPending ? "Creating summary…" : "Generate investigator summary"}</Button>{record.caseStatus === "under_review" ? <Button onClick={() => setLocation("/casework")} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">Resolve in casework</Button> : null}</div></Panel><Panel><p className="text-sm font-semibold text-slate-100">Risk evidence</p><p className="mt-1 text-xs text-slate-500">Signals included in this assessment, translated for investigator review.</p><div className="mt-5 space-y-3">{record.factors.length ? record.factors.map((factor: any) => <div key={factor.key} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4"><Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><div><p className="text-sm font-medium text-slate-200">{factor.label}</p><p className="mt-1 text-sm leading-6 text-slate-500">{factor.detail}</p></div></div>) : <p className="rounded-xl bg-white/[0.03] p-4 text-sm text-slate-500">No material risk indicators were present in this assessment.</p>}</div></Panel></div><Panel><p className="text-sm font-semibold text-slate-100">Assessment context</p><dl className="mt-5 divide-y divide-white/[0.06] text-sm">{[["Transaction country", record.transactionCountry], ["Account country", record.accountCountry], ["Device", record.deviceStatus === "new" ? "New device" : "Known device"], ["Transaction hour", `${record.transactionHour}:00`], ["Recent transactions", record.recentTransactionCount]].map(([label, value]) => <div className="flex items-center justify-between gap-6 py-3" key={String(label)}><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-200">{value}</dd></div>)}</dl>{record.caseNote ? <div className="mt-6 rounded-xl border border-violet-300/15 bg-violet-300/[0.045] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-200">Latest investigator note</p><p className="mt-2 text-sm leading-6 text-slate-300">{record.caseNote}</p></div> : null}</Panel></div><CaseCollaborationPanel caseId={record.id} /></Frame>;
}

export function CaseworkPage() {
  const utils = trpc.useUtils(); const records = trpc.risk.list.useQuery({ caseStatus: "under_review" }); const [notes, setNotes] = useState<Record<number, string>>({});
  const updateCase = trpc.risk.updateCase.useMutation({ onSuccess: () => { utils.risk.list.invalidate(); utils.risk.overview.invalidate(); toast.success("Outcome saved and quality trends updated"); }, onError: (error) => toast.error(error.message) });
  const summarize = trpc.risk.summarize.useMutation({ onSuccess: () => { utils.risk.list.invalidate(); toast.success("Investigator summary refreshed"); }, onError: () => toast.message("A deterministic explanation is still available.") });
  const saveOutcome = (record: any, caseStatus: Exclude<CaseStatus, "under_review">) => { const note = (notes[record.id] ?? record.caseNote ?? "").trim(); if (note.length < 3) { toast.error("Add a case note of at least three characters before saving."); return; } if (note.length > 1000) { toast.error("Case notes must be no more than 1,000 characters."); return; } updateCase.mutate({ id: record.id, caseStatus, note }); };
  return <Frame><PageTitle eyebrow="Investigation workflow" title="Casework"><p className="max-w-md text-sm leading-6 text-slate-500">Resolve alerts with a clear reviewer outcome and concise case note. Each confirmed decision contributes to this organization’s quality trend.</p></PageTitle>{records.isLoading ? <QueryState state="loading" label="Loading cases awaiting review…" /> : records.error ? <QueryState state="error" label="Unable to load active cases. Please refresh and try again." /> : <div className="space-y-5">{records.data?.map((record: any) => <Panel key={record.id}><div className="flex flex-col gap-5 lg:flex-row lg:justify-between"><div className="max-w-2xl"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs text-slate-500">{record.reference}</p><RiskPill level={record.riskLevel} /><span className="text-xs font-semibold text-slate-300">{record.probability}%</span></div><h2 className="mt-3 text-lg font-semibold text-slate-100">{record.merchantName} · {money(record.amount)}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{record.llmSummary || record.deterministicExplanation}</p>{record.llmNextStep && <p className="mt-2 text-xs leading-5 text-cyan-200">Next step: {record.llmNextStep}</p>}<div className="mt-4 flex flex-wrap gap-2">{record.factors.map((factor: any) => <span key={factor.key} className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-xs text-slate-400">{factor.label}</span>)}</div></div><div className="w-full lg:max-w-[360px]"><label htmlFor={`case-note-${record.id}`} className="sr-only">Investigation note for {record.reference}</label><Textarea id={`case-note-${record.id}`} value={notes[record.id] ?? record.caseNote ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [record.id]: event.target.value }))} placeholder="Add investigation note (minimum 3 characters)…" className="min-h-[92px] border-white/10 bg-[#07111e] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300" /><p className="mt-1 text-xs text-slate-500">A note is required before resolving a case.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => summarize.mutate({ id: record.id })} disabled={summarize.isPending} className="border-white/10 bg-white/[0.03] text-cyan-200 hover:bg-white/[0.08]"><Bot className="mr-1.5 h-3.5 w-3.5" /> Explain</Button><Button size="sm" onClick={() => saveOutcome(record, "confirmed_fraud")} disabled={updateCase.isPending} className="bg-rose-300 text-rose-950 hover:bg-rose-200">Confirm fraud</Button><Button size="sm" onClick={() => saveOutcome(record, "legitimate")} disabled={updateCase.isPending} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200">Legitimate</Button></div></div></div></Panel>)}{records.data?.length === 0 && <QueryState state="empty" label="No cases await review." />}</div>}</Frame>;
}

export function ModelHealthPage() {
  const health = trpc.risk.modelHealth.useQuery();
  const data = health.data;
  const percent = (value: number | null | undefined) => value === null || value === undefined ? "—" : (value / 10).toFixed(1) + "%";
  const confusionChart = data ? [
    { name: "True positive", value: data.confusionMatrix.truePositive, fill: "#67e8f9" },
    { name: "False positive", value: data.confusionMatrix.falsePositive, fill: "#fbbf24" },
    { name: "False negative", value: data.confusionMatrix.falseNegative, fill: "#fb7185" },
    { name: "True negative", value: data.confusionMatrix.trueNegative, fill: "#5eead4" },
  ] : [];
  const trendChart = data?.trend.map((point) => ({ name: point.day.slice(5), fraud: point.confirmedFraud, legitimate: point.legitimate })) ?? [];

  return <Frame><PageTitle eyebrow="Human-confirmed performance" title="Outcome Quality"><p className="max-w-xl text-sm leading-6 text-slate-500">Quality metrics are calculated only from investigator-confirmed outcomes in this workspace. High-risk assessments count as a positive prediction; this view does not treat unreviewed alerts as ground truth.</p></PageTitle>{health.isLoading ? <QueryState state="loading" label="Loading confirmed-outcome quality trends…" /> : health.error || !data ? <QueryState state="error" label="Unable to load outcome-quality trends. Please refresh and try again." /> : <>{data.reviewed === 0 ? <Panel className="mb-6 border-amber-300/15 bg-amber-300/[0.045]"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><div><p className="text-sm font-semibold text-amber-100">No confirmed outcomes yet</p><p className="mt-1 text-sm leading-6 text-amber-100/75">Resolve cases as confirmed fraud or legitimate from Casework. The first confirmed outcome will begin the quality trend for this organization.</p></div></div></Panel> : null}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Precision", percent(data.precisionMilli), "Confirmed fraud among high-risk assessments"], ["Recall", percent(data.recallMilli), "Known fraud detected as high risk"], ["F1 score", percent(data.f1Milli), "Balance of precision and recall"], ["Reviewed outcomes", data.reviewed.toLocaleString(), "Human-confirmed case results"]].map(([label, value, detail]) => <Panel key={String(label)}><p className="text-xs text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-slate-100">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></Panel>)}</div><div className="mt-6 grid gap-6 xl:grid-cols-2"><Panel><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-100">Confirmed-outcome trend</p><p className="mt-1 text-xs text-slate-500">Last 30 active review days</p></div><TrendingUp className="h-5 w-5 text-cyan-300" /></div>{trendChart.length ? <div className="mt-5 h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendChart}><XAxis dataKey="name" tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#0b1724", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "#e2e8f0" }} cursor={{ fill: "rgba(255,255,255,.035)" }}/><Bar dataKey="fraud" name="Confirmed fraud" stackId="outcomes" fill="#fb7185" radius={[4,4,0,0]} /><Bar dataKey="legitimate" name="Legitimate" stackId="outcomes" fill="#5eead4" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-slate-500">Outcome trends will appear after investigators resolve cases.</p>}</Panel><Panel><p className="text-sm font-semibold text-slate-100">Confusion matrix</p><p className="mt-1 text-xs text-slate-500">Counts from confirmed outcomes only</p><div className="mt-5 h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={confusionChart}><XAxis dataKey="name" tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#0b1724", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "#e2e8f0" }} cursor={{ fill: "rgba(255,255,255,.035)" }}/><Bar dataKey="value" radius={[6,6,0,0]}>{confusionChart.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}</Bar></BarChart></ResponsiveContainer></div></Panel></div><Panel className="mt-6"><p className="text-sm font-semibold text-slate-100">Review summary</p><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Confirmed fraud", data.confirmedFraud], ["Legitimate", data.legitimate], ["False positives", data.confusionMatrix.falsePositive], ["False negatives", data.confusionMatrix.falseNegative]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/[0.06] bg-[#07111e] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p></div>)}</div><p className="mt-5 text-xs leading-5 text-slate-500">A false positive is a high-risk assessment confirmed legitimate. A false negative is a low- or medium-risk assessment confirmed fraud. Review these counts alongside investigation coverage before changing any decision policy.</p></Panel></>}</Frame>;
}

export function AdministratorManagementPage() {
  const { user, organization, orgRole } = useAuth();
  const canManage = user?.role === "admin" && orgRole === "org:admin";
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"org:admin" | "org:member">("org:member");
  const directory = trpc.administration.directory.useQuery(undefined, { enabled: canManage });
  const refreshDirectory = async () => { await directory.refetch(); };
  const invite = trpc.administration.invite.useMutation({
    onSuccess: async () => {
      setInviteEmail("");
      toast.success("Invitation sent", { description: "The team member will receive a workspace invitation by email." });
      await refreshDirectory();
    },
    onError: (error) => toast.error("Unable to send invitation", { description: error.message }),
  });
  const updateOrganizationRole = trpc.administration.updateOrganizationRole.useMutation({
    onSuccess: async () => { toast.success("Organization role updated"); await refreshDirectory(); },
    onError: (error) => toast.error("Unable to update organization role", { description: error.message }),
  });
  const updateFraudLensRole = trpc.administration.updateFraudLensRole.useMutation({
    onSuccess: async () => { toast.success("FraudLens role updated"); await refreshDirectory(); },
    onError: (error) => toast.error("Unable to update FraudLens role", { description: error.message }),
  });
  const deactivateMember = trpc.administration.deactivateMember.useMutation({
    onSuccess: async () => { toast.success("Workspace membership deactivated"); await refreshDirectory(); },
    onError: (error) => toast.error("Unable to deactivate membership", { description: error.message }),
  });
  const revokeSessions = trpc.administration.revokeSessions.useMutation({
    onSuccess: ({ revokedCount }) => toast.success("Sessions revoked", { description: `${revokedCount} active session${revokedCount === 1 ? " was" : "s were"} revoked.` }),
    onError: (error) => toast.error("Unable to revoke sessions", { description: error.message }),
  });
  const revokeInvitation = trpc.administration.revokeInvitation.useMutation({
    onSuccess: async () => { toast.success("Invitation revoked"); await refreshDirectory(); },
    onError: (error) => toast.error("Unable to revoke invitation", { description: error.message }),
  });

  if (!canManage) {
    return <Frame><PageTitle eyebrow="Workspace access" title="Team Access" /><Panel><div className="py-12 text-center"><ShieldAlert className="mx-auto h-9 w-9 text-amber-200" /><h2 className="mt-4 text-lg font-semibold text-slate-100">Administrator access required</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Team controls require both a FraudLens administrator role and Clerk organization administrator membership in the active workspace.</p></div></Panel></Frame>;
  }

  const members = directory.data?.members ?? [];
  const invitations = directory.data?.invitations ?? [];
  const isCurrentUser = (userId: string) => userId === user?.openId;
  const busy = invite.isPending || updateOrganizationRole.isPending || updateFraudLensRole.isPending || deactivateMember.isPending || revokeSessions.isPending || revokeInvitation.isPending;

  return <Frame><PageTitle eyebrow={organization?.name ?? "Active workspace"} title="Team Access"><div className="flex items-center gap-2 text-xs text-slate-500"><UsersRound className="h-4 w-4 text-cyan-300" />{members.length} active member{members.length === 1 ? "" : "s"}</div></PageTitle>
    <div className="mb-6 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-4 py-3 text-sm leading-6 text-amber-100"><span className="font-semibold">Sensitive controls.</span> Changes apply only to this workspace unless noted. Revoking a member’s sessions signs them out of all active sessions associated with their Clerk account.</div>
    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <Panel><div className="flex items-center gap-3"><div className="rounded-lg bg-cyan-300/10 p-2.5 text-cyan-200"><UserPlus className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-100">Invite teammate</p><p className="mt-1 text-xs leading-5 text-slate-500">Invite a person to the active organization.</p></div></div><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); invite.mutate({ emailAddress: inviteEmail, organizationRole: inviteRole }); }}><div><label className="text-xs font-medium text-slate-400" htmlFor="invite-email">Email address</label><Input id="invite-email" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" className="mt-2 border-white/10 bg-[#07111e] text-slate-100 placeholder:text-slate-600 focus-visible:ring-cyan-300" /></div><div><label className="text-xs font-medium text-slate-400" htmlFor="invite-role">Organization access</label><select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="org:member">Member</option><option value="org:admin">Organization administrator</option></select></div><Button type="submit" disabled={invite.isPending} className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"><UserPlus className="mr-2 h-4 w-4" />{invite.isPending ? "Sending invitation…" : "Send invitation"}</Button></form></Panel>
      <Panel><div className="flex items-center gap-3"><div className="rounded-lg bg-violet-300/10 p-2.5 text-violet-200"><UserCog className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-100">Role model</p><p className="mt-1 text-xs leading-5 text-slate-500">Organization roles control workspace administration. FraudLens roles control casework and monitoring access.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.07] bg-[#07111e]/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">Organization role</p><p className="mt-2 text-sm font-medium text-slate-100">Admin or member</p><p className="mt-1 text-xs leading-5 text-slate-500">Managed through Clerk organization membership.</p></div><div className="rounded-xl border border-white/[0.07] bg-[#07111e]/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-300">FraudLens role</p><p className="mt-2 text-sm font-medium text-slate-100">Analyst, manager, or administrator</p><p className="mt-1 text-xs leading-5 text-slate-500">Controls dashboard permissions and investigation access.</p></div></div></Panel>
    </div>
    <div className="mt-6"><div className="mb-4 flex items-end justify-between"><div><p className="text-lg font-semibold text-slate-100">Workspace members</p><p className="mt-1 text-sm text-slate-500">Manage access for the active organization only.</p></div><Button variant="outline" onClick={() => directory.refetch()} disabled={directory.isFetching} className="border-white/10 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white">Refresh</Button></div>{directory.isLoading ? <QueryState state="loading" label="Loading workspace members…" /> : directory.error ? <QueryState state="error" label={directory.error.message || "Unable to load workspace members."} /> : <Panel className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left"><thead><tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.13em] text-slate-500"><th className="pb-3 font-medium">Member</th><th className="pb-3 font-medium">Organization role</th><th className="pb-3 font-medium">FraudLens role</th><th className="pb-3 font-medium">Joined</th><th className="pb-3 text-right font-medium">Controls</th></tr></thead><tbody>{members.map((member) => <tr key={member.membershipId} className="border-b border-white/[0.045] last:border-0"><td className="py-4"><p className="text-sm font-medium text-slate-100">{member.name ?? "Unnamed member"}{isCurrentUser(member.userId) ? <span className="ml-2 text-xs font-normal text-cyan-300">You</span> : null}</p><p className="mt-1 text-xs text-slate-500">{member.email ?? member.userId}</p></td><td className="py-4"><select aria-label={`Organization role for ${member.email ?? member.userId}`} value={member.organizationRole} disabled={busy || isCurrentUser(member.userId)} onChange={(event) => updateOrganizationRole.mutate({ userId: member.userId, organizationRole: event.target.value as "org:admin" | "org:member" })} className="h-9 rounded-md border border-white/10 bg-[#07111e] px-2.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"><option value="org:member">Member</option><option value="org:admin">Administrator</option></select></td><td className="py-4"><select aria-label={`FraudLens role for ${member.email ?? member.userId}`} value={member.applicationRole} disabled={busy || isCurrentUser(member.userId)} onChange={(event) => updateFraudLensRole.mutate({ userId: member.userId, applicationRole: event.target.value as "analyst" | "manager" | "admin" })} className="h-9 rounded-md border border-white/10 bg-[#07111e] px-2.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"><option value="analyst">Analyst</option><option value="manager">Manager</option><option value="admin">Administrator</option></select></td><td className="py-4 text-xs text-slate-500">{date(member.joinedAt)}</td><td className="py-4"><div className="flex justify-end gap-2"><AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={busy || isCurrentUser(member.userId)} className="border-white/10 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white"><KeyRound className="mr-1.5 h-3.5 w-3.5" />Sessions</Button></AlertDialogTrigger><AlertDialogContent className="border-white/10 bg-[#0c1a28] text-slate-100"><AlertDialogHeader><AlertDialogTitle>Revoke all sessions?</AlertDialogTitle><AlertDialogDescription className="leading-6 text-slate-400">This signs {member.name ?? member.email ?? "this member"} out of every active session for their account, including sessions outside this workspace.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent text-slate-200 hover:bg-white/[0.08] hover:text-white">Cancel</AlertDialogCancel><AlertDialogAction onClick={() => revokeSessions.mutate({ userId: member.userId })} className="bg-amber-300 text-slate-950 hover:bg-amber-200">Revoke sessions</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="destructive" disabled={busy || isCurrentUser(member.userId)}><UserX className="mr-1.5 h-3.5 w-3.5" />Deactivate</Button></AlertDialogTrigger><AlertDialogContent className="border-white/10 bg-[#0c1a28] text-slate-100"><AlertDialogHeader><AlertDialogTitle>Deactivate workspace membership?</AlertDialogTitle><AlertDialogDescription className="leading-6 text-slate-400">{member.name ?? member.email ?? "This member"} will lose access to the active organization but will not be deleted from Clerk or other organizations.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent text-slate-200 hover:bg-white/[0.08] hover:text-white">Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deactivateMember.mutate({ userId: member.userId })} className="bg-rose-300 text-slate-950 hover:bg-rose-200">Deactivate membership</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></td></tr>)}</tbody></table></div>{members.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No active organization members were found.</p> : null}</Panel>}</div>
    <div className="mt-8"><div className="mb-4"><p className="text-lg font-semibold text-slate-100">Pending invitations</p><p className="mt-1 text-sm text-slate-500">Revoke invitations that are no longer appropriate for this workspace.</p></div>{directory.isLoading ? <QueryState state="loading" label="Loading invitations…" /> : <Panel>{invitations.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">There are no pending invitations.</p> : <div className="space-y-3">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-[#07111e]/65 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-100">{invitation.email}</p><p className="mt-1 text-xs text-slate-500">{invitation.role === "org:admin" ? "Organization administrator" : "Member"} · {(invitation.status ?? "pending").replaceAll("_", " ")} · Sent {date(invitation.createdAt)}</p></div><AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={busy} className="border-rose-300/20 bg-rose-300/[0.07] text-rose-200 hover:bg-rose-300/[0.12] hover:text-rose-100">Revoke invitation</Button></AlertDialogTrigger><AlertDialogContent className="border-white/10 bg-[#0c1a28] text-slate-100"><AlertDialogHeader><AlertDialogTitle>Revoke invitation?</AlertDialogTitle><AlertDialogDescription className="leading-6 text-slate-400">The invitation for {invitation.email} will no longer be usable.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="border-white/10 bg-transparent text-slate-200 hover:bg-white/[0.08] hover:text-white">Cancel</AlertDialogCancel><AlertDialogAction onClick={() => revokeInvitation.mutate({ invitationId: invitation.id })} className="bg-rose-300 text-slate-950 hover:bg-rose-200">Revoke invitation</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>)}</div>}</Panel>}</div>
  </Frame>;
}

export function DriftPage() {
  const drift = trpc.risk.drift.useQuery(); return <Frame><PageTitle eyebrow="Input surveillance" title="Drift Monitor"><p className="max-w-xl text-sm leading-6 text-slate-500">Compare recent assessment patterns against the training reference to identify features that deserve attention.</p></PageTitle><div className="mb-6 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.045] p-4 text-sm leading-6 text-slate-300"><span className="font-semibold text-cyan-200">How to read this view.</span> Drift does not prove model failure; it is a review signal that indicates the input mix has changed from the benchmark reference.</div>{drift.isLoading ? <QueryState state="loading" label="Loading feature-distribution comparisons…" /> : drift.error ? <QueryState state="error" label="Unable to load drift signals. Please refresh and try again." /> : <div className="grid gap-4 lg:grid-cols-2">{drift.data?.map((item: any) => <Panel key={item.feature}><div className="flex items-start justify-between"><div><p className="text-lg font-semibold text-slate-100">{item.feature}</p><p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p></div><Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${item.status === "elevated" ? "border-rose-300/20 bg-rose-300/10 text-rose-200" : item.status === "watch" ? "border-amber-300/20 bg-amber-300/10 text-amber-200" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"}`}>{item.status}</Badge></div><div className="mt-6 grid grid-cols-3 gap-3"><div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Baseline</p><p className="mt-1 text-sm font-medium text-slate-200">{item.baseline}</p></div><div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Recent</p><p className="mt-1 text-sm font-medium text-slate-200">{item.recent}</p></div><div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Change</p><p className="mt-1 text-sm font-medium text-cyan-200">+{item.changePercent}%</p></div></div></Panel>)}</div>}</Frame>;
}

export function CaseQueuesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [queue, setQueue] = useState<"all" | "mine" | "unassigned">("all");
  const [priority, setPriority] = useState<"" | CasePriority>("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [resolutionReasons, setResolutionReasons] = useState<Record<number, string>>({});
  const canManage = user?.role === "manager" || user?.role === "admin";
  const records = trpc.risk.list.useQuery({
    caseStatus: "under_review",
    assigneeId: queue === "mine" ? user?.openId : undefined,
    unassignedOnly: queue === "unassigned" || undefined,
    casePriority: priority || undefined,
  }, { enabled: Boolean(user) });
  const assignees = trpc.risk.assignees.useQuery(undefined, { enabled: canManage });
  const workload = trpc.risk.workload.useQuery(undefined, { enabled: canManage });
  const refresh = async () => {
    await Promise.all([utils.risk.list.invalidate(), utils.risk.overview.invalidate(), utils.risk.workload.invalidate()]);
  };
  const claim = trpc.risk.claimCase.useMutation({ onSuccess: async () => { toast.success("Case assigned to you"); await refresh(); }, onError: (error) => toast.error(error.message) });
  const updateWorkflow = trpc.risk.updateWorkflow.useMutation({ onSuccess: async () => { toast.success("Case workflow updated"); await refresh(); }, onError: (error) => toast.error(error.message) });
  const updateCase = trpc.risk.updateCase.useMutation({ onSuccess: async () => { toast.success("Outcome saved and quality trends updated"); await refresh(); }, onError: (error) => toast.error(error.message) });
  const summarize = trpc.risk.summarize.useMutation({ onSuccess: async () => { toast.success("Investigator summary refreshed"); await refresh(); }, onError: () => toast.message("A deterministic explanation is still available.") });
  const saveOutcome = (record: any, caseStatus: Exclude<CaseStatus, "under_review">) => {
    const note = (notes[record.id] ?? record.caseNote ?? "").trim();
    if (note.length < 3) { toast.error("Add a case note of at least three characters before resolving."); return; }
    const resolutionReasonCode = resolutionReasons[record.id];
    if (!resolutionReasonCode) { toast.error("Select a resolution reason before resolving."); return; }
    updateCase.mutate({ id: record.id, caseStatus, note, resolutionReasonCode: resolutionReasonCode as "customer_dispute" | "pattern_match" | "account_takeover" | "merchant_confirmation" | "customer_verified" | "duplicate_alert" | "low_risk_pattern" | "other" });
  };
  const isOverdue = (record: any) => record.dueAt && new Date(record.dueAt).getTime() < Date.now();
  const busy = claim.isPending || updateWorkflow.isPending || updateCase.isPending || summarize.isPending;
  const counts = {
    all: records.data?.length ?? 0,
    mine: records.data?.filter((record: any) => record.assigneeId === user?.openId).length ?? 0,
    unassigned: records.data?.filter((record: any) => !record.assigneeId).length ?? 0,
  };

  return <Frame><PageTitle eyebrow="Investigation workflow" title="Case Queue"><div className="flex items-center gap-2 text-xs text-slate-500"><ListFilter className="h-4 w-4 text-cyan-300" />Assignment, urgency, and review ownership</div></PageTitle>
    <div className="mb-6 grid gap-4 sm:grid-cols-3">{[
      { label: "Active cases", value: workload.data?.active ?? counts.all, detail: "Awaiting an investigator decision", tone: "text-cyan-200" },
      { label: "Unassigned", value: workload.data?.unassigned ?? counts.unassigned, detail: "Ready to be claimed or assigned", tone: "text-amber-200" },
      { label: "Overdue", value: workload.data?.overdue ?? 0, detail: "Past the selected service date", tone: "text-rose-200" },
    ].map((item) => <Panel key={item.label}><p className="text-xs text-slate-500">{item.label}</p><p className={`mt-3 text-3xl font-semibold ${item.tone}`}>{item.value}</p><p className="mt-2 text-xs text-slate-500">{item.detail}</p></Panel>)}</div>
    {canManage ? <Panel className="mb-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-sm font-semibold text-slate-100">Manager workload view</p><p className="mt-1 text-xs leading-5 text-slate-500">Open cases are grouped by the assigned investigator. Use this to rebalance work before service dates are missed.</p></div><Button variant="outline" onClick={() => workload.refetch()} disabled={workload.isFetching} className="border-white/10 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white">Refresh workload</Button></div>{workload.isLoading ? <p className="py-5 text-sm text-slate-500">Loading workload…</p> : <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workload.data?.byAssignee.length ? workload.data.byAssignee.map((member) => <div key={member.userId} className="rounded-xl border border-white/[0.07] bg-[#07111e]/65 p-4"><p className="text-sm font-medium text-slate-100">{member.name}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="text-lg font-semibold text-slate-100">{member.open}</p><p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Open</p></div><div><p className="text-lg font-semibold text-rose-200">{member.critical}</p><p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Critical</p></div><div><p className="text-lg font-semibold text-amber-200">{member.overdue}</p><p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Overdue</p></div></div></div>) : <p className="py-4 text-sm text-slate-500">No active cases have been assigned yet.</p>}</div>}</Panel> : null}
    <Panel><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{(["all", "mine", "unassigned"] as const).map((item) => <Button key={item} size="sm" variant={queue === item ? "default" : "outline"} onClick={() => setQueue(item)} className={queue === item ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200" : "border-white/10 bg-white/[0.025] text-slate-300 hover:bg-white/[0.08] hover:text-white"}>{item === "all" ? "All active" : item === "mine" ? "My cases" : "Unassigned"}</Button>)}</div><select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value as "" | CasePriority)} className="h-9 rounded-md border border-white/10 bg-[#07111e] px-3 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="standard">Standard</option></select></div>
      {records.isLoading ? <QueryState state="loading" label="Loading active case queue…" /> : records.error ? <QueryState state="error" label="Unable to load active cases. Please refresh and try again." /> : records.data?.length === 0 ? <QueryState state="empty" label="No active cases match this queue." /> : <div className="space-y-4">{(records.data ?? []).map((record: any) => <div key={record.id} className="rounded-xl border border-white/[0.07] bg-[#07111e]/65 p-4 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:justify-between"><div className="max-w-2xl"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs text-slate-500">{record.reference}</p><RiskPill level={record.riskLevel} /><PriorityPill priority={record.casePriority} />{isOverdue(record) ? <Badge variant="outline" className="border-rose-300/20 bg-rose-300/10 text-[10px] uppercase tracking-[0.1em] text-rose-200">Overdue</Badge> : null}</div><button onClick={() => setLocation(`/transactions/${record.id}`)} className="mt-3 text-left text-lg font-semibold text-slate-100 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300">{record.merchantName} · {money(record.amount)}</button><p className="mt-2 text-sm leading-6 text-slate-400">{record.llmSummary || record.deterministicExplanation}</p><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-white/[0.05] px-2.5 py-1.5 text-slate-300"><UserCheck className="mr-1.5 inline h-3.5 w-3.5 text-cyan-300" />{record.assigneeName ?? "Unassigned"}</span><span className="rounded-md bg-white/[0.05] px-2.5 py-1.5 text-slate-300"><CalendarClock className="mr-1.5 inline h-3.5 w-3.5 text-cyan-300" />{record.dueAt ? `Due ${date(record.dueAt)}` : "No due date"}</span></div></div><div className="w-full space-y-3 xl:max-w-[400px]">{canManage ? <><div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1"><select aria-label={`Assignee for ${record.reference}`} value={record.assigneeId ?? ""} disabled={busy || assignees.isLoading} onChange={(event) => updateWorkflow.mutate({ id: record.id, assigneeId: event.target.value || null, casePriority: record.casePriority, dueAt: record.dueAt ? new Date(record.dueAt) : null })} className="h-9 rounded-md border border-white/10 bg-[#0c1a28] px-2.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">Unassigned</option>{assignees.data?.map((member) => <option key={member.userId} value={member.userId}>{member.name ?? member.email ?? member.userId}</option>)}</select><select aria-label={`Priority for ${record.reference}`} value={record.casePriority} disabled={busy} onChange={(event) => updateWorkflow.mutate({ id: record.id, assigneeId: record.assigneeId, casePriority: event.target.value as CasePriority, dueAt: record.dueAt ? new Date(record.dueAt) : null })} className="h-9 rounded-md border border-white/10 bg-[#0c1a28] px-2.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="critical">Critical</option><option value="high">High</option><option value="standard">Standard</option></select><Input aria-label={`Due date for ${record.reference}`} type="date" value={dateInput(record.dueAt)} disabled={busy} onChange={(event) => updateWorkflow.mutate({ id: record.id, assigneeId: record.assigneeId, casePriority: record.casePriority, dueAt: event.target.value ? new Date(`${event.target.value}T17:00:00`) : null })} className="h-9 border-white/10 bg-[#0c1a28] text-xs text-slate-200 focus-visible:ring-cyan-300" /></div></> : !record.assigneeId ? <Button size="sm" onClick={() => claim.mutate({ id: record.id })} disabled={busy} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><UserCheck className="mr-1.5 h-3.5 w-3.5" />Claim case</Button> : null}<label htmlFor={`queue-note-${record.id}`} className="sr-only">Investigation note for {record.reference}</label><Textarea id={`queue-note-${record.id}`} value={notes[record.id] ?? record.caseNote ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [record.id]: event.target.value }))} placeholder="Add investigation note before resolving…" className="min-h-[76px] border-white/10 bg-[#0c1a28] text-sm text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300" /><select aria-label={`Resolution reason for ${record.reference}`} value={resolutionReasons[record.id] ?? ""} onChange={(event) => setResolutionReasons((current) => ({ ...current, [record.id]: event.target.value }))} disabled={busy} className="h-9 w-full rounded-md border border-white/10 bg-[#0c1a28] px-2.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">Select resolution reason</option><option value="customer_dispute">Customer dispute</option><option value="pattern_match">Pattern match</option><option value="account_takeover">Account takeover</option><option value="merchant_confirmation">Merchant confirmation</option><option value="customer_verified">Customer verified</option><option value="duplicate_alert">Duplicate alert</option><option value="low_risk_pattern">Low-risk pattern</option><option value="other">Other</option></select><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => summarize.mutate({ id: record.id })} className="border-white/10 bg-white/[0.03] text-cyan-200 hover:bg-white/[0.08]"><Bot className="mr-1.5 h-3.5 w-3.5" />Explain</Button><Button size="sm" disabled={busy} onClick={() => saveOutcome(record, "confirmed_fraud")} className="bg-rose-300 text-rose-950 hover:bg-rose-200">Confirm fraud</Button><Button size="sm" disabled={busy} onClick={() => saveOutcome(record, "legitimate")} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200">Legitimate</Button></div></div></div></div>)}</div>}</Panel>
  </Frame>;
}


function auditLabel(eventType: string) {
  return eventType.split(".").map((part) => part.replace(/_/g, " ")).join(" · ");
}

function auditTone(eventType: string) {
  if (eventType.startsWith("case.")) return "border-violet-300/20 bg-violet-300/10 text-violet-200";
  if (eventType.startsWith("administration.")) return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  return "border-cyan-300/20 bg-cyan-300/10 text-cyan-200";
}

export function AuditLogPage() {
  const { user } = useAuth();
  const [eventType, setEventType] = useState("");
  const [search, setSearch] = useState("");
  const audit = trpc.audit.list.useQuery({ limit: 200 }, { enabled: user?.role !== "analyst", refetchInterval: 30_000 });
  const events = (audit.data ?? []) as any[];
  const eventTypes = Array.from(new Set(events.map((event) => event.eventType))).sort();
  const needle = search.trim().toLowerCase();
  const filtered = events.filter((event) => {
    if (eventType && event.eventType !== eventType) return false;
    if (!needle) return true;
    return [event.summary, event.actorName, event.actorId, event.subjectId, event.eventType].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });

  if (user?.role === "analyst") {
    return <Frame><PageTitle eyebrow="Governance records" title="Audit Log" /><QueryState state="error" label="Audit records are available to managers and administrators only." /></Frame>;
  }

  return <Frame><PageTitle eyebrow="Governance records" title="Audit Log"><Button variant="outline" onClick={() => audit.refetch()} disabled={audit.isFetching} className="border-white/10 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white">{audit.isFetching ? "Refreshing…" : "Refresh log"}</Button></PageTitle>
    <Panel className="mb-6"><div className="flex items-start gap-3"><Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" /><div><p className="text-sm font-semibold text-slate-100">Append-only workspace history</p><p className="mt-1 text-sm leading-6 text-slate-500">This view is read-only. It records case workflow, authenticated workspace access, and administrator actions in the active organization.</p></div></div></Panel>
    <Panel><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-col gap-3 sm:flex-row"><select aria-label="Filter audit events by type" value={eventType} onChange={(event) => setEventType(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All event types</option>{eventTypes.map((type) => <option key={type} value={type}>{auditLabel(type)}</option>)}</select><Input aria-label="Search audit log" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actor, case, or event" className="border-white/10 bg-[#07111e] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300" /></div><p className="text-xs text-slate-500">Showing {filtered.length} of {events.length} events</p></div>
      {audit.isLoading ? <QueryState state="loading" label="Loading immutable workspace history…" /> : audit.error ? <QueryState state="error" label="Unable to load audit records. Please refresh and try again." /> : filtered.length === 0 ? <QueryState state="empty" label="No audit events match the selected filters." /> : <div className="divide-y divide-white/[0.06]">{filtered.map((event) => <div key={event.id} className="grid gap-3 py-4 sm:grid-cols-[150px_1fr_auto] sm:items-start"><div><Badge variant="outline" className={`max-w-full truncate rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${auditTone(event.eventType)}`}>{auditLabel(event.eventType)}</Badge><p className="mt-2 text-xs text-slate-500">{date(event.createdAt)}</p></div><div><p className="text-sm leading-6 text-slate-200">{event.summary}</p><p className="mt-1.5 text-xs text-slate-500">Actor: <span className="text-slate-400">{event.actorName || event.actorId || "System"}</span>{event.subjectId ? <span> · Subject: <span className="font-mono text-slate-400">{event.subjectId}</span></span> : null}</p></div><p className="font-mono text-[10px] text-slate-600">#{event.id}</p></div>)}</div>}</Panel>
  </Frame>;
}


function CaseCollaborationPanel({ caseId }: { caseId: number }) {
  const utils = trpc.useUtils();
  const [comment, setComment] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const collaboration = trpc.risk.collaboration.useQuery({ id: caseId }, { refetchInterval: 20_000 });
  const evidenceStorage = trpc.risk.evidenceStorageStatus.useQuery();
  const refresh = async () => {
    await Promise.all([
      utils.risk.collaboration.invalidate({ id: caseId }),
      utils.risk.detail.invalidate({ id: caseId }),
      utils.audit.list.invalidate(),
    ]);
  };
  const addComment = trpc.risk.addComment.useMutation({
    onSuccess: async () => { setComment(""); toast.success("Investigator comment added"); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const setTags = trpc.risk.setTags.useMutation({
    onSuccess: async () => { setTagInput(""); toast.success("Case tags updated"); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const addEvidenceLink = trpc.risk.addEvidenceLink.useMutation({
    onSuccess: async () => { setLinkLabel(""); setLinkUrl(""); toast.success("Evidence link added"); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const uploadEvidenceAttachment = trpc.risk.uploadEvidenceAttachment.useMutation({
    onSuccess: async () => { toast.success("Evidence attachment added"); void refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const data = collaboration.data;
  const tags = data?.tags ?? [];
  const busy = addComment.isPending || setTags.isPending || addEvidenceLink.isPending || uploadEvidenceAttachment.isPending;
  const storageReady = evidenceStorage.data?.configured === true;
  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    const next = Array.from(new Set([...tags.map((item) => item.tag), tag]));
    if (next.length > 12) { toast.error("Cases can have up to 12 tags."); return; }
    setTags.mutate({ id: caseId, tags: next });
  };
  const removeTag = (tag: string) => setTags.mutate({ id: caseId, tags: tags.map((item) => item.tag).filter((value) => value !== tag) });
  const submitLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) { toast.error("Provide an evidence label and HTTPS link."); return; }
    addEvidenceLink.mutate({ id: caseId, label: linkLabel.trim(), url: linkUrl.trim() });
  };
  const uploadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const acceptedTypes = ["application/pdf", "text/plain", "text/csv", "image/png", "image/jpeg"];
    if (!acceptedTypes.includes(file.type)) { toast.error("Upload PDF, TXT, CSV, PNG, or JPEG evidence only."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Evidence attachments must be 5 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onerror = () => toast.error("The selected evidence file could not be read.");
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const contentBase64 = result.includes(",") ? result.split(",")[1] : "";
      if (!contentBase64) { toast.error("The selected evidence file could not be encoded."); return; }
      uploadEvidenceAttachment.mutate({ id: caseId, label: file.name, fileName: file.name, mimeType: file.type as "application/pdf" | "text/plain" | "text/csv" | "image/png" | "image/jpeg", contentBase64 });
    };
    reader.readAsDataURL(file);
  };

  return <div className="mt-6 grid gap-5 xl:grid-cols-2">
    <Panel><div className="flex items-start gap-3"><MessageSquare className="mt-0.5 h-5 w-5 text-cyan-300" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-100">Investigator comments</p><p className="mt-1 text-xs leading-5 text-slate-500">Add decision context that stays with this case.</p></div></div>
      <Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Add a concise investigation comment…" className="mt-4 min-h-[96px] border-white/10 bg-[#07111e] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300" />
      <div className="mt-3 flex justify-between gap-3"><p className="text-xs text-slate-500">{comment.length}/2,000 characters</p><Button size="sm" onClick={() => { if (!comment.trim()) { toast.error("Enter a comment before saving."); return; } addComment.mutate({ id: caseId, comment: comment.trim() }); }} disabled={busy} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><Send className="mr-1.5 h-3.5 w-3.5" />Add comment</Button></div>
      <div className="mt-5 space-y-3">{collaboration.isLoading ? <p className="text-xs text-slate-500">Loading comments…</p> : data?.comments.length ? data.comments.map((item) => <div key={item.id} className="rounded-lg border border-white/[0.07] bg-[#07111e]/65 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-slate-300">{item.authorName || item.authorId || "Investigator"}</p><p className="text-[11px] text-slate-600">{date(item.createdAt)}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{item.note}</p></div>) : <p className="rounded-lg border border-dashed border-white/[0.1] px-3 py-4 text-center text-xs text-slate-500">No investigator comments yet.</p>}</div>
    </Panel>
    <Panel><div className="flex items-start gap-3"><Tag className="mt-0.5 h-5 w-5 text-violet-300" /><div><p className="text-sm font-semibold text-slate-100">Investigation tags</p><p className="mt-1 text-xs leading-5 text-slate-500">Use concise labels to classify case patterns.</p></div></div>
      <div className="mt-4 flex gap-2"><Input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} maxLength={48} placeholder="e.g. account-takeover" className="border-white/10 bg-[#07111e] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300" /><Button size="sm" variant="outline" onClick={addTag} disabled={busy} className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]">Add</Button></div>
      <div className="mt-4 flex min-h-10 flex-wrap gap-2">{tags.length ? tags.map((item) => <button key={item.id} type="button" onClick={() => removeTag(item.tag)} disabled={busy} className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2.5 py-1 text-xs text-violet-200 transition hover:bg-violet-300/20 focus:outline-none focus:ring-2 focus:ring-violet-300">{item.tag} <span className="ml-1 text-violet-200/70">×</span></button>) : <p className="text-xs text-slate-500">No tags applied. Add the first classification tag above.</p>}</div>
      <div className="mt-7 flex items-start gap-3"><Link2 className="mt-0.5 h-5 w-5 text-amber-200" /><div><p className="text-sm font-semibold text-slate-100">Evidence links</p><p className="mt-1 text-xs leading-5 text-slate-500">HTTPS links only. Links are retained in the active workspace.</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[0.7fr_1.3fr]"><Input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} maxLength={160} placeholder="Evidence label" className="border-white/10 bg-[#07111e] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300" /><Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" className="border-white/10 bg-[#07111e] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300" /></div>
      <Button size="sm" variant="outline" onClick={submitLink} disabled={busy} className="mt-2 border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"><Link2 className="mr-1.5 h-3.5 w-3.5" />Add evidence link</Button>
    </Panel>
    <Panel><div className="flex items-start gap-3"><Paperclip className="mt-0.5 h-5 w-5 text-amber-200" /><div><p className="text-sm font-semibold text-slate-100">Evidence attachments</p><p className="mt-1 text-xs leading-5 text-slate-500">Upload PDF, TXT, CSV, PNG, or JPEG files up to 5 MB.</p></div></div>
      <div className={`mt-4 rounded-lg border px-3 py-2 text-xs leading-5 ${storageReady ? "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100" : "border-amber-300/20 bg-amber-300/[0.05] text-amber-100"}`}>{storageReady ? "Private workspace storage is enabled. Downloads are authorized for the active organization and use short-lived links." : evidenceStorage.isLoading ? "Checking private evidence storage…" : "Private evidence storage is unavailable. Ask an administrator to verify server storage configuration."}</div>
      <label className={`mt-4 flex items-center justify-center rounded-lg border border-dashed px-4 py-4 text-sm font-medium transition focus-within:ring-2 focus-within:ring-cyan-300 ${storageReady ? "cursor-pointer border-cyan-300/25 bg-cyan-300/[0.035] text-cyan-200 hover:bg-cyan-300/[0.08]" : "cursor-not-allowed border-white/10 bg-white/[0.02] text-slate-500"}`}><Upload className="mr-2 h-4 w-4" />{uploadEvidenceAttachment.isPending ? "Uploading evidence…" : "Choose evidence file"}<input type="file" className="sr-only" accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,application/pdf,text/plain,text/csv,image/png,image/jpeg" disabled={busy || !storageReady} onChange={uploadFile} /></label>
      <div className="mt-4 space-y-2">{data?.evidence.filter((item) => item.evidenceType === "attachment").length ? data.evidence.filter((item) => item.evidenceType === "attachment").map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-[#07111e]/65 px-3 py-2.5 text-sm text-slate-300 transition hover:border-cyan-300/25 hover:text-cyan-200"><span className="min-w-0 truncate"><FileText className="mr-2 inline h-4 w-4 text-cyan-300" />{item.label}</span><span className="shrink-0 text-[11px] text-slate-600">{date(item.createdAt)}</span></a>) : <p className="text-xs text-slate-500">No files attached to this case.</p>}</div>
      <div className="mt-6"><p className="text-sm font-semibold text-slate-100">Saved evidence links</p><div className="mt-3 space-y-2">{data?.evidence.filter((item) => item.evidenceType === "link").length ? data.evidence.filter((item) => item.evidenceType === "link").map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-[#07111e]/65 px-3 py-2.5 text-sm text-slate-300 transition hover:border-cyan-300/25 hover:text-cyan-200"><span className="min-w-0 truncate"><Link2 className="mr-2 inline h-4 w-4 text-amber-200" />{item.label}</span><span className="shrink-0 text-[11px] text-slate-600">{date(item.createdAt)}</span></a>) : <p className="text-xs text-slate-500">No external evidence links saved.</p>}</div></div>
    </Panel>
    <Panel><div className="flex items-start gap-3"><History className="mt-0.5 h-5 w-5 text-cyan-300" /><div><p className="text-sm font-semibold text-slate-100">Case activity timeline</p><p className="mt-1 text-xs leading-5 text-slate-500">Chronological, append-only history for this investigation.</p></div></div>
      <div className="mt-5 space-y-4 border-l border-white/[0.09] pl-4">{data?.activity.length ? data.activity.map((item) => <div key={item.id} className="relative"><span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0c1a28] bg-cyan-300" /><p className="text-sm leading-5 text-slate-300">{item.summary}</p><p className="mt-1 text-xs text-slate-600">{item.actorName || item.actorId || "System"} · {date(item.createdAt)}</p></div>) : <p className="text-xs text-slate-500">No recorded case activity yet.</p>}</div>
    </Panel>
  </div>;
}


export function TransactionImportPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const importCsv = trpc.risk.importCsv.useMutation({
    onSuccess: (response) => {
      setResult(response);
      utils.risk.overview.invalidate();
      utils.risk.list.invalidate();
      if (response.imported) {
        toast.success("Transaction import complete", { description: `${response.imported} transaction${response.imported === 1 ? "" : "s"} scored and added to this workspace.` });
      } else {
        toast.warning("No transactions were imported", { description: "Review the row-level errors and upload a corrected CSV." });
      }
    },
    onError: (error) => toast.error("Import failed", { description: error.message }),
  });

  const chooseFile = (selected: File | null) => {
    setResult(null);
    if (!selected) { setFile(null); setFileError(null); return; }
    if (!selected.name.toLowerCase().endsWith(".csv")) { setFile(null); setFileError("Choose a CSV file with a .csv extension."); return; }
    if (selected.size === 0 || selected.size > 1_000_000) { setFile(null); setFileError("CSV files must be between 1 byte and 1 MB."); return; }
    setFile(selected);
    setFileError(null);
  };

  const readAsBase64 = (selected: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !dataUrl.includes(",")) { reject(new Error("The selected file could not be encoded.")); return; }
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(selected);
  });

  const upload = async () => {
    if (!file) { setFileError("Choose a CSV file before importing."); return; }
    try {
      const contentBase64 = await readAsBase64(file);
      importCsv.mutate({ fileName: file.name, contentBase64 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The selected file could not be read.");
    }
  };

  const downloadTemplate = () => {
    const template = "reference,amount,merchantCategory,transactionCountry,accountCountry,deviceStatus,transactionHour,recentTransactionCount\nFRD-IMPORT-001,279.99,electronics,US,US,new,2,4\n";
    const objectUrl = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "fraudlens-transaction-template.csv";
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  if (user?.role === "analyst") {
    return <Frame><PageTitle eyebrow="Transaction import" title="Manager access required" /><QueryState state="error" label="Only managers and administrators can import transaction batches." /></Frame>;
  }

  return <Frame><PageTitle eyebrow="Bulk scoring" title="Import transactions"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadTemplate} className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"><FileText className="mr-2 h-4 w-4" /> Download template</Button><Button variant="outline" onClick={() => setLocation("/transactions")} className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]">View transactions</Button></div></PageTitle>
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]"><div className="space-y-6"><Panel><div className="flex items-start gap-3"><div className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-300"><Upload className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-100">Upload a transaction CSV</p><p className="mt-1 text-sm leading-6 text-slate-500">Files are validated before scoring. Valid, non-duplicate rows are imported; rows with errors are reported without blocking the rest of the file.</p></div></div><div className="mt-6 rounded-xl border border-dashed border-white/15 bg-[#07111e]/70 p-5"><label htmlFor="transaction-csv" className="block cursor-pointer"><span className="text-sm font-medium text-slate-200">CSV file</span><span className="mt-1 block text-xs text-slate-500">UTF-8 text · up to 1 MB · maximum 500 rows recommended</span><Input id="transaction-csv" type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className="mt-4 cursor-pointer border-white/10 bg-[#0c1a28] text-slate-300 file:mr-4 file:border-0 file:bg-cyan-300 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-950 hover:file:bg-cyan-200" aria-invalid={Boolean(fileError)} /></label>{file ? <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-300/[0.07] px-3 py-2 text-sm text-emerald-100"><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span><span className="ml-auto shrink-0 text-xs text-emerald-200/70">{Math.ceil(file.size / 1024)} KB</span></div> : null}{fileError ? <p role="alert" className="mt-3 text-sm text-rose-200">{fileError}</p> : null}</div><Button onClick={upload} disabled={!file || importCsv.isPending} className="mt-5 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">{importCsv.isPending ? "Validating and scoring…" : "Validate and import transactions"}<ArrowRight className="ml-2 h-4 w-4" /></Button></Panel>
      <Panel><Eyebrow>Required columns</Eyebrow><p className="mt-2 text-sm leading-6 text-slate-400">Column names are case-insensitive. Use the template to ensure the expected structure.</p><div className="mt-4 flex flex-wrap gap-2">{["reference", "amount", "merchantCategory", "transactionCountry", "accountCountry", "deviceStatus", "transactionHour", "recentTransactionCount"].map((column) => <code key={column} className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-[11px] text-cyan-100">{column}</code>)}</div><p className="mt-5 text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-400">Duplicate handling:</span> references already present in this workspace and duplicate references within the file are skipped and reported. Identical references in another workspace remain isolated.</p></Panel></div>
      <div className="space-y-6">{result ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Panel><p className="text-xs font-medium text-slate-500">Source rows</p><p className="mt-2 text-3xl font-semibold text-slate-100">{result.totalRows}</p></Panel><Panel><p className="text-xs font-medium text-slate-500">Imported and scored</p><p className="mt-2 text-3xl font-semibold text-emerald-200">{result.imported}</p></Panel><Panel><p className="text-xs font-medium text-slate-500">Invalid rows</p><p className="mt-2 text-3xl font-semibold text-rose-200">{result.invalidRows}</p></Panel><Panel><p className="text-xs font-medium text-slate-500">Duplicates skipped</p><p className="mt-2 text-3xl font-semibold text-amber-200">{result.duplicates}</p></Panel></div><Panel><div className="flex items-start justify-between gap-4"><div><Eyebrow>Import summary</Eyebrow><h2 className="mt-2 text-xl font-semibold text-slate-100">{result.fileName}</h2><p className="mt-1 text-sm text-slate-500">Bulk risk scoring was completed only for accepted transaction rows.</p></div><div className="flex gap-2"><RiskPill level="high" /><span className="text-sm font-semibold text-slate-200">{result.riskDistribution.high}</span><RiskPill level="medium" /><span className="text-sm font-semibold text-slate-200">{result.riskDistribution.medium}</span><RiskPill level="low" /><span className="text-sm font-semibold text-slate-200">{result.riskDistribution.low}</span></div></div>{result.importedRecords.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.13em] text-slate-500"><th className="pb-3 font-medium">Reference</th><th className="pb-3 font-medium">Risk</th><th className="pb-3 text-right font-medium">Probability</th></tr></thead><tbody>{result.importedRecords.map((record: any) => <tr key={record.id} className="border-b border-white/[0.045] last:border-0"><td className="py-3 font-mono text-xs text-slate-300">{record.reference}</td><td className="py-3"><RiskPill level={record.riskLevel} /></td><td className="py-3 text-right font-semibold text-slate-200">{record.probability}%</td></tr>)}</tbody></table></div> : null}</Panel>{result.errors.length ? <Panel><div><Eyebrow>Row-level errors</Eyebrow><h2 className="mt-2 text-xl font-semibold text-slate-100">Correct and re-upload these rows</h2><p className="mt-1 text-sm text-slate-500">Showing up to 100 errors. Accepted rows do not need to be re-imported.</p></div><div className="mt-5 max-h-[420px] overflow-auto rounded-xl border border-white/[0.07]"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-[#0c1a28]"><tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.13em] text-slate-500"><th className="px-4 py-3 font-medium">Row</th><th className="px-4 py-3 font-medium">Field</th><th className="px-4 py-3 font-medium">Issue</th></tr></thead><tbody>{result.errors.map((error: any, index: number) => <tr key={`${error.row}-${error.field}-${index}`} className="border-b border-white/[0.045] last:border-0"><td className="px-4 py-3 font-mono text-xs text-slate-400">{error.row}</td><td className="px-4 py-3 font-mono text-xs text-cyan-100">{error.field}</td><td className="px-4 py-3 text-slate-300">{error.message}</td></tr>)}</tbody></table></div></Panel> : null}</> : <Panel className="flex min-h-[360px] flex-col justify-center"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-300"><Database className="h-6 w-6" /></div><h2 className="mt-5 text-xl font-semibold text-slate-100">Ready for a validated batch.</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Upload a CSV to receive a row-level validation report, duplicate checks, bulk risk scores, and a workspace-scoped import summary.</p></Panel>}</div></div>
  </Frame>;
}


type NotificationForm = {
  emailEnabled: boolean;
  toEmail: string;
  slackEnabled: boolean;
  slackWebhookUrl: string;
  teamsEnabled: boolean;
  teamsWebhookUrl: string;
  riskThreshold: number;
};

const defaultNotificationForm: NotificationForm = {
  emailEnabled: false,
  toEmail: "",
  slackEnabled: false,
  slackWebhookUrl: "",
  teamsEnabled: false,
  teamsWebhookUrl: "",
  riskThreshold: 80,
};

function NotificationChannelCard({
  title,
  description,
  enabled,
  onEnabledChange,
  inputLabel,
  inputValue,
  onInputChange,
  placeholder,
  inputType = "url",
  testLabel,
  onTest,
  isTesting,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  inputLabel: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder: string;
  inputType?: "url" | "email";
  testLabel: string;
  onTest: () => void;
  isTesting: boolean;
}) {
  return <Panel className={enabled ? "border-cyan-300/25" : ""}><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><div className={`rounded-lg p-2 ${enabled ? "bg-cyan-300/10 text-cyan-200" : "bg-white/[0.04] text-slate-500"}`}><BellRing className="h-4 w-4" /></div><p className="text-sm font-semibold text-slate-100">{title}</p></div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div><label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-full border border-white/10 bg-[#07111e] px-3 py-2 text-xs font-semibold text-slate-300"><input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} className="h-4 w-4 accent-cyan-300" /><span>{enabled ? "Enabled" : "Disabled"}</span></label></div><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><div><label className="text-xs font-medium text-slate-400" htmlFor={`${title}-destination`}>{inputLabel}</label><Input id={`${title}-destination`} type={inputType} value={inputValue} disabled={!enabled} onChange={(event) => onInputChange(event.target.value)} placeholder={placeholder} className="mt-2 border-white/10 bg-[#07111e] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-45" /></div><Button type="button" variant="outline" onClick={onTest} disabled={isTesting} className="self-end border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"><Send className="mr-2 h-4 w-4" />{isTesting ? "Sending…" : testLabel}</Button></div></Panel>;
}

export function NotificationSettingsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const preferences = trpc.notifications.get.useQuery();
  const [form, setForm] = useState<NotificationForm>(defaultNotificationForm);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!preferences.data || initialized) return;
    setForm({
      emailEnabled: preferences.data.emailEnabled,
      toEmail: preferences.data.toEmail ?? "",
      slackEnabled: preferences.data.slackEnabled,
      slackWebhookUrl: preferences.data.slackWebhookUrl ?? "",
      teamsEnabled: preferences.data.teamsEnabled,
      teamsWebhookUrl: preferences.data.teamsWebhookUrl ?? "",
      riskThreshold: preferences.data.riskThreshold,
    });
    setInitialized(true);
  }, [initialized, preferences.data]);

  const save = trpc.notifications.update.useMutation({
    onSuccess: (saved) => {
      setForm({
        emailEnabled: saved.emailEnabled,
        toEmail: saved.toEmail ?? "",
        slackEnabled: saved.slackEnabled,
        slackWebhookUrl: saved.slackWebhookUrl ?? "",
        teamsEnabled: saved.teamsEnabled,
        teamsWebhookUrl: saved.teamsWebhookUrl ?? "",
        riskThreshold: saved.riskThreshold,
      });
      utils.notifications.get.invalidate();
      toast.success("Alert settings saved", { description: `Transactions scoring ${saved.riskThreshold} or higher will be evaluated for enabled alert channels.` });
    },
    onError: (error) => toast.error("Unable to save alert settings", { description: error.message }),
  });

  const testAlert = trpc.notifications.testAlert.useMutation({
    onSuccess: ({ results }) => {
      const result = results[0];
      if (!result) { toast.warning("No alert channel was selected."); return; }
      if (result.status === "sent") toast.success(`${result.channel[0].toUpperCase()}${result.channel.slice(1)} test alert sent`);
      else toast.warning(`${result.channel[0].toUpperCase()}${result.channel.slice(1)} test alert ${result.status}`, { description: result.reason ?? "Review this channel’s configuration and try again." });
    },
    onError: (error) => toast.error("Test alert failed", { description: error.message }),
  });

  const updateForm = (values: Partial<NotificationForm>) => setForm((current) => ({ ...current, ...values }));
  const saveSettings = () => save.mutate({
    emailEnabled: form.emailEnabled,
    toEmail: form.toEmail.trim() || null,
    slackEnabled: form.slackEnabled,
    slackWebhookUrl: form.slackWebhookUrl.trim() || null,
    teamsEnabled: form.teamsEnabled,
    teamsWebhookUrl: form.teamsWebhookUrl.trim() || null,
    riskThreshold: form.riskThreshold,
  });

  if (user?.role === "analyst") return <Frame><PageTitle eyebrow="High-risk alerts" title="Manager access required" /><QueryState state="error" label="Only managers and administrators can configure workspace alert settings." /></Frame>;
  if (preferences.isLoading) return <Frame><PageTitle eyebrow="High-risk alerts" title="Alert settings" /><QueryState state="loading" label="Loading workspace alert settings…" /></Frame>;
  if (preferences.error) return <Frame><PageTitle eyebrow="High-risk alerts" title="Alert settings" /><QueryState state="error" label="Unable to load alert settings. Refresh the page and try again." /></Frame>;

  return <Frame><PageTitle eyebrow="Workspace safeguards" title="High-risk alerts"><Button onClick={saveSettings} disabled={save.isPending} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><CheckCircle2 className="mr-2 h-4 w-4" />{save.isPending ? "Saving…" : "Save alert settings"}</Button></PageTitle>
    <div className="mb-6 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-4 py-3 text-sm leading-6 text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4 text-amber-200" /><span className="font-semibold">Review remains essential.</span> Alerts surface high-risk activity quickly but do not replace investigator review. Webhook URLs are visible only to managers and administrators in this workspace.</div>
    <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]"><div className="space-y-6"><Panel><div className="flex items-start gap-3"><div className="rounded-xl bg-rose-300/10 p-2.5 text-rose-200"><ShieldAlert className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-100">Risk threshold</p><p className="mt-1 text-sm leading-6 text-slate-500">Send enabled alerts when a transaction’s risk score is equal to or greater than this value.</p></div></div><div className="mt-7"><div className="flex items-end justify-between"><label htmlFor="alert-threshold" className="text-xs font-medium text-slate-400">Minimum risk score</label><p className="text-4xl font-semibold tracking-tight text-rose-200">{form.riskThreshold}<span className="text-lg text-rose-200/60">/100</span></p></div><input id="alert-threshold" type="range" min="0" max="100" step="1" value={form.riskThreshold} onChange={(event) => updateForm({ riskThreshold: Number(event.target.value) })} className="mt-5 h-2 w-full cursor-pointer accent-cyan-300" /><div className="mt-2 flex justify-between text-[11px] text-slate-600"><span>0</span><span>50</span><span>100</span></div></div></Panel>
      <Panel><Eyebrow>Setup sequence</Eyebrow><ol className="mt-3 space-y-3 text-sm leading-6 text-slate-400"><li><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-300/10 text-xs font-semibold text-cyan-200">1</span>Enter a recipient address or incoming workflow URL.</li><li><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-300/10 text-xs font-semibold text-cyan-200">2</span>Enable the channel and save the configuration.</li><li><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-300/10 text-xs font-semibold text-cyan-200">3</span>Send a test alert to confirm the destination.</li></ol></Panel></div>
      <div className="space-y-6"><NotificationChannelCard title="Email" description="Send a concise high-risk alert through the workspace’s configured email service. A verified sending domain is recommended before production use." enabled={form.emailEnabled} onEnabledChange={(emailEnabled) => updateForm({ emailEnabled })} inputLabel="Recipient email address" inputValue={form.toEmail} onInputChange={(toEmail) => updateForm({ toEmail })} placeholder="fraud-operations@example.com" inputType="email" testLabel="Test email" onTest={() => testAlert.mutate({ channel: "email" })} isTesting={testAlert.isPending} />
        <NotificationChannelCard title="Slack" description="Post high-risk alerts to a Slack channel using an incoming webhook URL created for that channel." enabled={form.slackEnabled} onEnabledChange={(slackEnabled) => updateForm({ slackEnabled })} inputLabel="Slack incoming webhook URL" inputValue={form.slackWebhookUrl} onInputChange={(slackWebhookUrl) => updateForm({ slackWebhookUrl })} placeholder="https://hooks.slack.com/services/…" testLabel="Test Slack" onTest={() => testAlert.mutate({ channel: "slack" })} isTesting={testAlert.isPending} />
        <NotificationChannelCard title="Microsoft Teams" description="Post alerts through a Teams workflow webhook. Use a current Power Automate/Workflows URL for new configurations." enabled={form.teamsEnabled} onEnabledChange={(teamsEnabled) => updateForm({ teamsEnabled })} inputLabel="Teams workflow webhook URL" inputValue={form.teamsWebhookUrl} onInputChange={(teamsWebhookUrl) => updateForm({ teamsWebhookUrl })} placeholder="https://…logic.azure.com/…" testLabel="Test Teams" onTest={() => testAlert.mutate({ channel: "teams" })} isTesting={testAlert.isPending} />
      </div></div></Frame>;
}

function downloadReportFile(file: { fileName: string; content: string; contentType: string }) {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ReportsPage() {
  const { user } = useAuth();
  const [riskLevel, setRiskLevel] = useState("");
  const [caseStatus, setCaseStatus] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dateFrom, setDateFrom] = useState(() => { const value = new Date(); value.setDate(value.getDate() - 6); return dateInput(value); });
  const [dateTo, setDateTo] = useState(() => dateInput(new Date()));
  const filters = {
    riskLevel: (riskLevel || undefined) as RiskLevel | undefined,
    caseStatus: (caseStatus || undefined) as CaseStatus | undefined,
    assigneeId: assigneeId || undefined,
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`) : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59`) : undefined,
  };
  const report = trpc.reports.overview.useQuery(filters);
  const csvDownload = trpc.reports.downloadCsv.useMutation({
    onSuccess: (file) => { downloadReportFile(file); toast.success("CSV report downloaded"); },
    onError: () => toast.error("Unable to prepare the CSV report. Please try again."),
  });
  const summaryDownload = trpc.reports.downloadSummary.useMutation({
    onSuccess: (file) => { downloadReportFile(file); toast.success("Operational summary downloaded"); },
    onError: () => toast.error("Unable to prepare the summary report. Please try again."),
  });

  if (user?.role === "analyst") {
    return <Frame><PageTitle eyebrow="Operational reporting" title="Reporting" /><QueryState state="error" label="Operational reports are available to managers and administrators only." /></Frame>;
  }

  const data = report.data;
  const riskChart = data ? [
    { name: "High", value: data.summary.highRisk, fill: "#fb7185" },
    { name: "Medium", value: data.summary.mediumRisk, fill: "#fbbf24" },
    { name: "Low", value: data.summary.lowRisk, fill: "#5eead4" },
  ] : [];
  const workloadChart = data?.workload.investigators.slice(0, 6).map((investigator) => ({ name: investigator.name.split(" ")[0], open: investigator.openCases, critical: investigator.criticalCases, overdue: investigator.overdueCases })) ?? [];
  const assignees = data ? Array.from(new Map(data.rows.filter((row) => row.assigneeId).map((row) => [row.assigneeId!, row.assignee])).entries()) : [];
  const dateRangeError = dateFrom && dateTo && dateFrom > dateTo;
  const resetFilters = () => {
    const from = new Date();
    from.setDate(from.getDate() - 6);
    setRiskLevel(""); setCaseStatus(""); setAssigneeId(""); setDateFrom(dateInput(from)); setDateTo(dateInput(new Date()));
  };
  const exportDisabled = !data || dateRangeError || csvDownload.isPending || summaryDownload.isPending;

  return <Frame><PageTitle eyebrow="Operations intelligence" title="Reporting"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => summaryDownload.mutate(filters)} disabled={exportDisabled} className="border-white/10 bg-white/[0.035] text-slate-200 hover:bg-white/[0.08] hover:text-white"><FileText className="mr-2 h-4 w-4" />{summaryDownload.isPending ? "Preparing…" : "Download summary"}</Button><Button onClick={() => csvDownload.mutate(filters)} disabled={exportDisabled} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><FileText className="mr-2 h-4 w-4" />{csvDownload.isPending ? "Preparing…" : "Export CSV"}</Button></div></PageTitle>
    <Panel className="mb-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm font-semibold text-slate-100">Filtered operational report</p><p className="mt-1 text-sm leading-6 text-slate-500">Review assessed activity, resolution outcomes, and workload in this workspace. The report structure is ready for weekly delivery after deployment.</p></div><Button type="button" variant="ghost" onClick={resetFilters} className="text-slate-400 hover:bg-white/[0.06] hover:text-slate-100">Reset to last 7 days</Button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><select aria-label="Report risk level" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All risk levels</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option></select><select aria-label="Report case status" value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All case statuses</option><option value="under_review">Under review</option><option value="confirmed_fraud">Confirmed fraud</option><option value="legitimate">Legitimate</option></select><select aria-label="Report assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#07111e] px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-300"><option value="">All investigators</option>{assignees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Report from date" className="border-white/10 bg-[#07111e] text-slate-200 focus-visible:ring-cyan-300" /><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Report to date" className="border-white/10 bg-[#07111e] text-slate-200 focus-visible:ring-cyan-300" /></div>{dateRangeError ? <p className="mt-3 text-sm text-rose-200">The report end date must be on or after the start date.</p> : <p className="mt-3 text-xs text-slate-500">Filters apply to transaction assessments created in the selected period. Download actions are recorded in the audit log.</p>}</Panel>
    {report.isLoading ? <QueryState state="loading" label="Preparing operational reporting data…" /> : report.error || !data ? <QueryState state="error" label="Unable to load reporting data. Please refresh and try again." /> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Assessed activity", data.summary.assessed.toLocaleString(), `${money(data.summary.assessedAmount)} total amount`],
      ["High-risk alerts", data.summary.highRisk.toLocaleString(), `${data.summary.openCases} open case${data.summary.openCases === 1 ? "" : "s"}`],
      ["Resolution rate", data.summary.assessed ? `${Math.round((data.summary.resolvedCases / data.summary.assessed) * 100)}%` : "—", `${data.summary.resolvedCases} resolved case${data.summary.resolvedCases === 1 ? "" : "s"}`],
      ["Review coverage", data.summary.assessed ? `${Math.round((data.summary.reviewedOutcomes / data.summary.assessed) * 100)}%` : "—", `${data.summary.reviewedOutcomes} confirmed outcome${data.summary.reviewedOutcomes === 1 ? "" : "s"}`],
    ].map(([label, value, detail]) => <Panel key={String(label)}><p className="text-xs text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-slate-100">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></Panel>)}</div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2"><Panel><p className="text-sm font-semibold text-slate-100">Risk distribution</p><p className="mt-1 text-xs text-slate-500">Filtered assessed transactions by model risk level</p><div className="mt-5 h-[250px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={riskChart}><XAxis dataKey="name" tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#0b1724", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "#e2e8f0" }} cursor={{ fill: "rgba(255,255,255,.035)" }}/><Bar dataKey="value" radius={[6,6,0,0]}>{riskChart.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}</Bar></BarChart></ResponsiveContainer></div></Panel><Panel><p className="text-sm font-semibold text-slate-100">Analyst workload</p><p className="mt-1 text-xs text-slate-500">Open, critical, and overdue active cases by investigator</p>{workloadChart.length ? <div className="mt-5 h-[250px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={workloadChart}><XAxis dataKey="name" tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fill: "#7c8ba1", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#0b1724", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "#e2e8f0" }} cursor={{ fill: "rgba(255,255,255,.035)" }}/><Bar dataKey="open" name="Open" stackId="workload" fill="#67e8f9" radius={[4,4,0,0]} /><Bar dataKey="critical" name="Critical" stackId="workload" fill="#fb7185" /><Bar dataKey="overdue" name="Overdue" stackId="workload" fill="#fbbf24" /></BarChart></ResponsiveContainer></div> : <p className="py-20 text-center text-sm text-slate-500">Assign an active case to begin tracking investigator workload.</p>}</Panel></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"><Panel><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-100">Filtered activity</p><p className="mt-1 text-xs text-slate-500">Most recent assessed transactions in the selected report</p></div><p className="text-xs text-slate-500">Showing {Math.min(data.rows.length, 12)} of {data.rows.length}</p></div>{data.rows.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.13em] text-slate-500"><th className="pb-3 font-medium">Transaction</th><th className="pb-3 font-medium">Risk</th><th className="pb-3 font-medium">Case result</th><th className="pb-3 font-medium">Investigator</th><th className="pb-3 text-right font-medium">Amount</th></tr></thead><tbody>{data.rows.slice(0, 12).map((row) => <tr key={row.reference} className="border-b border-white/[0.045] last:border-0"><td className="py-3.5"><p className="text-sm font-medium text-slate-200">{row.merchant}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{row.reference} · {date(row.assessedAt)}</p></td><td className="py-3.5"><RiskPill level={row.riskLevel} /><p className="mt-1 text-xs text-slate-500">{row.riskScore}% score</p></td><td className="py-3.5"><StatusPill status={row.caseStatus} /><p className="mt-1 text-xs text-slate-500">{row.resolutionReason?.replaceAll("_", " ") || "Not resolved"}</p></td><td className="py-3.5 text-sm text-slate-300">{row.assignee}</td><td className="py-3.5 text-right text-sm font-medium text-slate-200">{money(row.amount)}</td></tr>)}</tbody></table></div> : <p className="py-16 text-center text-sm text-slate-500">No transactions match the active report filters.</p>}</Panel><Panel><p className="text-sm font-semibold text-slate-100">Resolution and queue summary</p><p className="mt-1 text-xs text-slate-500">Case outcomes and investigator workload in the selected activity</p><div className="mt-5 space-y-3">{[["Confirmed fraud", data.summary.confirmedFraud, "text-rose-200"], ["Confirmed legitimate", data.summary.legitimate, "text-emerald-200"], ["Overdue open cases", data.summary.overdueCases, "text-amber-200"], ["Unassigned active cases", data.workload.unassigned, "text-cyan-200"]].map(([label, value, tone]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#07111e] px-4 py-3"><span className="text-sm text-slate-400">{label}</span><span className={`text-xl font-semibold ${tone}`}>{value}</span></div>)}</div><div className="mt-6 border-t border-white/[0.06] pt-5"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Top resolution reasons</p>{data.resolutionReasons.length ? <div className="mt-3 space-y-2.5">{data.resolutionReasons.slice(0, 5).map((item) => <div key={item.reason} className="flex items-center justify-between gap-4 text-sm"><span className="capitalize text-slate-300">{item.reason.replaceAll("_", " ")}</span><span className="font-medium text-slate-100">{item.count}</span></div>)}</div> : <p className="mt-3 text-sm leading-6 text-slate-500">Resolution reasons will appear after investigators close cases in the selected period.</p>}</div></Panel></div></>}</Frame>;
}
