import { createFileRoute } from "@tanstack/react-router";
import { Database, Settings, Users, Zap } from "lucide-react";
import { TrainingUploader } from "@/components/TrainingUploader";
import { adminStats, adminUsuarios } from "@/lib/mock-data";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Simulador ABT" },
      { name: "description", content: "Painel administrativo: usuários, assinaturas e banco de questões." },
      { property: "og:title", content: "Administração — Simulador ABT" },
      { property: "og:description", content: "Gerencie usuários e conteúdo da plataforma." },
    ],
  }),
  component: Admin,
});

function Admin() {
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <Settings className="size-6 text-primary" />
        Admin
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-5">
          <Users className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-bold text-card-foreground">{adminStats.usuarios}</p>
          <p className="text-xs text-muted-foreground">Usuários cadastrados</p>
        </div>
        <div className="panel p-5">
          <Zap className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-bold text-card-foreground">{adminStats.assinantesAtivos}</p>
          <p className="text-xs text-muted-foreground">Assinantes ativos</p>
        </div>
        <div className="panel p-5">
          <Database className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-bold text-card-foreground">{adminStats.simuladosHoje}</p>
          <p className="text-xs text-muted-foreground">Simulados hoje</p>
        </div>
        <div className="panel p-5">
          <Database className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-bold text-card-foreground">{adminStats.questoesCadastradas}</p>
          <p className="text-xs text-muted-foreground">Questões cadastradas</p>
        </div>
      </div>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-card-foreground">Usuários</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">E-mail</th>
                <th className="pb-2 font-medium">Plano</th>
                <th className="pb-2 font-medium">Simulados</th>
                <th className="pb-2 font-medium">Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {adminUsuarios.map((u) => (
                <tr key={u.email} className="border-b border-border/60 last:border-0">
                  <td className="py-3 text-card-foreground">{u.email}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        u.plano === "Inativo"
                          ? "bg-destructive/15 text-destructive"
                          : u.plano === "Teste Gratuito"
                            ? "bg-muted text-muted-foreground"
                            : "bg-success/15 text-success"
                      }`}
                    >
                      {u.plano}
                    </span>
                  </td>
                  <td className="py-3 text-card-foreground">{u.simulados}</td>
                  <td className="py-3 text-muted-foreground">{u.ultimoAcesso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TrainingUploader />
    </div>
  );
}
