import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@shared/schema";
import {
  Home, ListOrdered, UserCheck, Gauge, Play, Flag,
  AlertTriangle, BarChart3, Tv, FileUp, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

const nav = [
  { href: "/", label: "Import / Setup", icon: FileUp },
  { href: "/runlist", label: "Run List", icon: ListOrdered },
  { href: "/checkin", label: "Check-In", icon: UserCheck },
  { href: "/ops", label: "Operations", icon: Gauge },
  { href: "/starter", label: "Starter", icon: Play },
  { href: "/finish", label: "Finish", icon: Flag },
  { href: "/exceptions", label: "Exceptions", icon: AlertTriangle },
  { href: "/results", label: "Results / Export", icon: BarChart3 },
  { href: "/display", label: "Live Display", icon: Tv },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: event } = useQuery<Event | null>({ queryKey: ["/api/event"] });

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-60 border-r border-sidebar-border bg-sidebar flex flex-col" data-testid="sidebar">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2v20M2 12h20" strokeWidth="1.5" opacity="0.5" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
            <div className="font-semibold text-sm leading-tight">RNG Ops</div>
          </div>
          {event && (
            <div className="mt-3 text-xs text-muted-foreground" data-testid="text-event-name">
              <div className="font-medium text-foreground truncate">{event.name}</div>
              <div>{event.startDate} → {event.endDate}</div>
            </div>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map(item => {
            const Icon = item.icon;
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
                data-testid={`link-nav-${item.href.replace("/", "") || "home"}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">v1.0</div>
          <ThemeToggle />
        </div>
      </aside>
      <main className="flex-1 overflow-auto" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="border-b border-border px-8 py-5 flex items-center justify-between bg-card/30">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-8", className)} data-testid="page-body">{children}</div>;
}
