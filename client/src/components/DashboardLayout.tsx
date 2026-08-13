import { OrganizationSwitcher } from "@clerk/react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { Activity, BellRing, CalendarClock, ClipboardList, FileText, KeyRound, LayoutDashboard, LogOut, PanelLeft, PlusCircle, Radar, ScrollText, ShieldCheck, Upload, UsersRound } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Command Center", path: "/" },
  { icon: ClipboardList, label: "Transactions", path: "/transactions" },
  { icon: PlusCircle, label: "New Assessment", path: "/assess" },
  { icon: Upload, label: "Import Transactions", path: "/import", requiresManager: true },
  { icon: ShieldCheck, label: "Casework", path: "/casework" },
  { icon: Activity, label: "Outcome Quality", path: "/model-health", requiresManager: true },
  { icon: Radar, label: "Drift Monitor", path: "/drift", requiresManager: true },
  { icon: FileText, label: "Reporting", path: "/reports", requiresManager: true },
  { icon: KeyRound, label: "API Integrations", path: "/api", requiresManager: true },
  { icon: ScrollText, label: "Audit Log", path: "/audit", requiresManager: true },
  { icon: BellRing, label: "Alert Settings", path: "/alerts", requiresManager: true },
  { icon: CalendarClock, label: "Weekly Summaries", path: "/weekly-summaries", requiresManager: true },
  { icon: UsersRound, label: "Team Access", path: "/team", requiresAdmin: true },
];

const SIDEBAR_WIDTH_KEY = "fraudlens-sidebar-width";
const DEFAULT_WIDTH = 278;
const MIN_WIDTH = 224;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111e] p-6 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-cyan-300/15 bg-slate-950/70 p-9 shadow-2xl shadow-cyan-950/30">
          <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300 text-slate-950"><ShieldCheck className="h-6 w-6" /></div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">FraudLens workspace</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to investigate.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Access the analyst console to review risk assessments and manage investigation cases.</p>
          <Button onClick={() => window.location.assign("/sign-in")} className="mt-8 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">Sign in to FraudLens</Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const availableMenuItems = menuItems.filter((item) => {
    if (item.requiresAdmin) return user?.role === "admin";
    return !item.requiresManager || user?.role !== "analyst";
  });
  const activeMenuItem = availableMenuItems.find((item) => item.path === location);
  const displayName = user?.name || "FraudLens user";
  const roleLabel = user?.role === "admin" ? "Administrator" : user?.role === "manager" ? "Manager" : "Analyst";

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-white/[0.07] bg-[#081521] text-slate-300" disableTransition={isResizing}>
          <SidebarHeader className="h-[84px] justify-center px-3">
            <div className="flex w-full items-center gap-3 px-1">
              <button onClick={toggleSidebar} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-slate-400 transition-colors hover:bg-white/[0.09] hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4" /></button>
              {!isCollapsed && <div className="min-w-0"><div className="flex items-center gap-2"><div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-300 text-slate-950"><ShieldCheck className="h-3.5 w-3.5" /></div><span className="font-semibold tracking-tight text-slate-100">FraudLens</span></div><p className="mt-1 pl-8 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Transaction risk intelligence</p></div>}
            </div>
          </SidebarHeader>
          <SidebarContent className="gap-0 px-2 pt-3">
            {!isCollapsed && <div className="px-3 pb-4"><OrganizationSwitcher afterCreateOrganizationUrl="/" afterSelectOrganizationUrl="/" /></div>}
            {!isCollapsed && <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>}
            <SidebarMenu>
              {availableMenuItems.map((item) => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-10 rounded-lg px-3 text-slate-400 hover:bg-white/[0.07] hover:text-slate-100 data-[active=true]:bg-cyan-300/[0.11] data-[active=true]:text-cyan-200"><item.icon className="h-4 w-4" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-3">
            <div className="mb-3 rounded-lg border border-amber-200/10 bg-amber-300/[0.05] px-3 py-2.5 group-data-[collapsible=icon]:hidden"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">Portfolio preview</p><p className="mt-1 text-xs leading-4 text-slate-500">Illustrative cases. No live payment data.</p></div>
            {user ? <DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.06]"><Avatar className="h-9 w-9 border border-white/10"><AvatarFallback className="bg-cyan-300/10 text-xs font-semibold text-cyan-200">{displayName.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium text-slate-200">{displayName}</p><p className="mt-1 truncate text-xs text-slate-500">{roleLabel}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
          </SidebarFooter>
        </Sidebar>
        <div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-cyan-300/30 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} />
      </div>
      <SidebarInset className="min-h-screen bg-[#07111e] text-slate-100">
        {isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-white/[0.07] bg-[#07111e]/95 px-3 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-300" /><p className="text-sm font-semibold">{activeMenuItem?.label ?? "FraudLens"}</p></div>}
        <main className="min-h-screen p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
