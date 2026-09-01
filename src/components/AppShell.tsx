import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Clock,
  CreditCard,
  FileDown,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import logoAsset from "@/assets/abracam-logo.png.asset.json";
import { useSupabaseSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { currentUser } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const nav: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/historico", label: "Histórico", icon: Clock },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/planos", label: "Planos", icon: CreditCard },
  { to: "/perfil", label: "Perfil", icon: User },
  { to: "/suporte", label: "Suporte", icon: MessageSquare },
  { to: "/pdfs", label: "PDFs", icon: FileDown },
  { to: "/admin", label: "Admin", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSupabaseSession();

  const displayName =
    (user?.user_metadata?.["username"] as string | undefined) ??
    user?.email?.split("@")[0] ??
    currentUser.username;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }


  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <img
            src={logoAsset.url}
            alt="Logo ABRACAM"
            className="size-10 shrink-0 rounded-md bg-white object-contain p-1"
          />
          <span className="font-display text-base font-bold leading-tight tracking-tight text-sidebar-foreground">
            Simulador <span className="text-primary">ABT</span>
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className:
                  "!bg-sidebar-primary !text-sidebar-primary-foreground shadow-gold hover:!bg-sidebar-primary",
              }}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-sidebar-accent">
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-sidebar/70 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:ml-60">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-sidebar px-4 py-3 sm:px-6">
          <button
            className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            <BarChart3 className="size-4" />
          </button>
          <span className="text-sm font-medium text-sidebar-foreground">Painel de Controle</span>

          <div className="ml-auto flex items-center gap-4">
            <button className="relative rounded-md p-2 text-sidebar-foreground/80 hover:bg-sidebar-accent" aria-label="Notificações">
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
            </button>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
                <User className="size-4" />
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-medium text-sidebar-foreground">{currentUser.username}</span>
                <span className="block text-xs text-muted-foreground">Online</span>
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-foreground">
      {Icon && <Icon className="size-6 text-primary" />}
      {children}
    </h1>
  );
}
