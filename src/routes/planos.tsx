import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Mail, Sparkle } from "lucide-react";
import { useToken } from "@/hooks/use-token";
import { mensagemErro } from "@/lib/erros";
import { CONTROLADOR } from "@/lib/juridico";
import { formatarDataBR } from "@/lib/planos";
import { obterPlanosInfo } from "@/lib/planos-info.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Planos — Simulador ABT" },
      {
        name: "description",
        content: "O que cada plano do Simulador ABT libera e como contratar com a ABRACAM.",
      },
    ],
  }),
  component: Planos,
});

// Benefícios reais do sistema (o que cada plano libera de fato)
const BENEFICIOS_PAGOS = [
  "Simulados ABT1 e ABT2 completos (40 questões, 120 minutos)",
  "Treino livre de 20 questões",
  "Quantos simulados quiser durante a validade",
  "Questões sem repetição até esgotar o banco de cada tema",
  "Relatórios de desempenho por tema e dificuldade",
  "Participação opcional no ranking",
];

function contato(assunto: string) {
  return `mailto:${CONTROLADOR.emailContato}?subject=${encodeURIComponent(assunto)}`;
}

function Planos() {
  const { token, loading } = useToken();
  const carregar = useServerFn(obterPlanosInfo);
  const query = useQuery({
    queryKey: ["planos-info", token],
    queryFn: () => carregar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });

  if (loading || query.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Carregando planos...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="panel p-6 text-center text-sm text-destructive">
        {mensagemErro(query.error)}
      </div>
    );
  }

  const { info, atual } = query.data;
  const planos = [
    {
      id: "gratis",
      nome: "Teste grátis",
      preco: "R$ 0",
      periodo: "uma vez por CPF",
      descricao: "Para conhecer o simulador antes de contratar.",
      beneficios: [
        "1 simulado de 10 questões",
        "30 minutos para responder",
        "Resultado com as questões certas e erradas",
      ],
      destaque: false,
      atual: !atual.acessoAtivo,
    },
    {
      id: "mensal",
      nome: "Mensal",
      preco: info.mensal.preco || "Consulte a ABRACAM",
      periodo: info.mensal.preco ? "por mês" : "",
      descricao: info.mensal.descricao || "Acesso completo por 1 mês.",
      beneficios: BENEFICIOS_PAGOS,
      destaque: true,
      atual: atual.acessoAtivo && atual.plano === "mensal",
    },
    {
      id: "anual",
      nome: "Anual",
      preco: info.anual.preco || "Consulte a ABRACAM",
      periodo: info.anual.preco ? "por ano" : "",
      descricao: info.anual.descricao || "Acesso completo por 12 meses.",
      beneficios: BENEFICIOS_PAGOS,
      destaque: false,
      atual: atual.acessoAtivo && atual.plano === "anual",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Planos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A contratação e a renovação são feitas diretamente com a ABRACAM. Depois da confirmação, o
          acesso é liberado na sua conta.
        </p>
      </div>

      <div
        className={cn(
          "panel p-4 text-sm",
          atual.acessoAtivo ? "border-success/40" : "border-border",
        )}
      >
        {atual.acessoAtivo ? (
          <>
            Seu plano <strong>{atual.plano === "anual" ? "anual" : "mensal"}</strong> está ativo até{" "}
            <strong>{formatarDataBR(atual.planoValidade)}</strong>.
          </>
        ) : atual.isAdmin ? (
          <>Conta de administrador: todos os simulados liberados.</>
        ) : (
          <>
            Você não tem plano ativo.{" "}
            {atual.gratuidadeUsada
              ? "Seu teste grátis já foi utilizado."
              : "Seu teste grátis ainda está disponível no painel."}
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {planos.map((p) => (
          <div
            key={p.id}
            className={cn("panel flex flex-col p-6", p.destaque && "border-primary shadow-gold")}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-card-foreground">{p.nome}</h2>
              {p.atual ? (
                <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  Seu plano
                </span>
              ) : p.destaque ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  <Sparkle className="size-3" /> Mais escolhido
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-2xl font-bold text-card-foreground">{p.preco}</p>
            {p.periodo && <p className="text-xs text-muted-foreground">{p.periodo}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{p.descricao}</p>

            <ul className="mt-5 flex-1 space-y-2">
              {p.beneficios.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-card-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {b}
                </li>
              ))}
            </ul>

            {p.id === "gratis" ? (
              <p className="mt-6 rounded-md bg-muted/40 px-4 py-2.5 text-center text-xs text-muted-foreground">
                {atual.gratuidadeUsada ? "Teste grátis já utilizado" : "Disponível no painel"}
              </p>
            ) : (
              <a
                href={contato(`Contratar plano ${p.nome} — Simulador ABT`)}
                className={cn(
                  "mt-6 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors",
                  p.destaque
                    ? "bg-primary text-primary-foreground shadow-gold hover:bg-primary/90"
                    : "border border-border text-card-foreground hover:bg-accent",
                )}
              >
                <Mail className="size-4" />
                {p.atual ? "Renovar com a ABRACAM" : "Contratar com a ABRACAM"}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
