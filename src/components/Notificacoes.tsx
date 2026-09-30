import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  CalendarClock,
  CheckCheck,
  CreditCard,
  FileDown,
  Flag,
  Loader2,
  MessageSquare,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToken } from "@/hooks/use-token";
import { mensagemErro } from "@/lib/erros";
import {
  listarNotificacoes,
  marcarNotificacoesLidas,
  type Notificacao,
} from "@/lib/notificacoes.functions";
import { cn } from "@/lib/utils";

/** De quanto em quanto tempo o sino confere se chegou aviso novo. */
const INTERVALO_MS = 60 * 1000;

/**
 * Informações da tela que um aviso novo pode ter mudado. Nunca inclui a
 * prova em andamento: ela não pode ser recarregada no meio do simulado.
 */
const CONSULTAS_POR_ASSUNTO: [string, string[][]][] = [
  [
    "pedido",
    [
      ["status-conta"],
      ["planos-aluno"],
      ["meu-perfil"],
      ["dashboard"],
      ["admin", "pedidos"],
      ["admin", "resumo"],
      ["admin", "usuario"],
    ],
  ],
  ["plano", [["status-conta"], ["planos-aluno"], ["meu-perfil"], ["dashboard"]]],
  ["chamado", [["meus-chamados"], ["admin", "chamados"], ["admin", "resumo"]]],
  [
    "reporte",
    [
      ["admin", "reportes"],
      ["admin", "resumo"],
    ],
  ],
  ["material", [["materiais"], ["admin", "materiais"]]],
];

function iconeDoTipo(tipo: string): LucideIcon {
  if (tipo.startsWith("pedido")) return CreditCard;
  if (tipo.startsWith("chamado")) return MessageSquare;
  if (tipo.startsWith("reporte")) return Flag;
  if (tipo.startsWith("material")) return FileDown;
  if (tipo.startsWith("plano")) return CalendarClock;
  if (tipo === "boas_vindas") return PartyPopper;
  return Bell;
}

function quando(iso: string) {
  const data = new Date(iso);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  if (horas < 48) return "ontem";
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

export function Notificacoes() {
  const { token, session } = useToken();
  const userId = session?.user.id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const carregar = useServerFn(listarNotificacoes);
  const marcar = useServerFn(marcarNotificacoesLidas);
  const [aberto, setAberto] = useState(false);
  const vistas = useRef<Set<string> | null>(null);
  const chave = ["notificacoes", userId] as const;

  const query = useQuery({
    queryKey: chave,
    queryFn: () => carregar({ data: { token: token as string } }),
    enabled: Boolean(token),
    refetchInterval: INTERVALO_MS,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
    retry: 1,
  });

  // Aviso novo com a página aberta: mostra um alerta rápido e atualiza as
  // outras informações da tela (por exemplo, o plano liberado).
  useEffect(() => {
    const lista = query.data?.notificacoes;
    if (!lista) return;
    if (vistas.current === null) {
      vistas.current = new Set(lista.map((n) => n.id));
      return;
    }
    const novas = lista.filter((n) => !n.lida_em && !vistas.current!.has(n.id));
    for (const n of lista) vistas.current.add(n.id);
    if (novas.length === 0) return;
    // Durante a prova, só o número do sino muda: nada de alerta na tela
    if (!window.location.pathname.startsWith("/prova/")) {
      for (const n of novas.slice(0, 3)) {
        toast(n.titulo, { description: n.mensagem ?? undefined });
      }
    }
    const chaves = new Map<string, string[]>();
    for (const [assunto, consultas] of CONSULTAS_POR_ASSUNTO) {
      if (!novas.some((n) => n.tipo.startsWith(assunto))) continue;
      for (const c of consultas) chaves.set(c.join("/"), c);
    }
    for (const c of chaves.values()) void queryClient.invalidateQueries({ queryKey: c });
  }, [query.data, queryClient]);

  const mutMarcar = useMutation({
    mutationFn: (ids?: string[]) => marcar({ data: { token: token as string, ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: (e) => toast.error(mensagemErro(e)),
  });

  function abrir(n: Notificacao) {
    if (!n.lida_em) mutMarcar.mutate([n.id]);
    if (n.link) {
      setAberto(false);
      void navigate({ href: n.link });
    }
  }

  const naoLidas = query.data?.naoLidas ?? 0;
  const lista = query.data?.notificacoes ?? [];

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) void query.refetch();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-sidebar-foreground/80 hover:bg-sidebar-accent"
          aria-label={naoLidas > 0 ? `Notificações: ${naoLidas} não lida(s)` : "Notificações"}
        >
          <Bell className="size-4" />
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notificações</p>
          {naoLidas > 0 && (
            <button
              type="button"
              onClick={() => mutMarcar.mutate(undefined)}
              disabled={mutMarcar.isPending}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-60"
            >
              <CheckCheck className="size-3.5" />
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
            </div>
          ) : query.isError && lista.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm">
              <p className="text-destructive">Não foi possível carregar as notificações.</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-2 text-xs font-medium text-primary hover:underline"
              >
                Tentar de novo
              </button>
            </div>
          ) : lista.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação por enquanto.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((n) => {
                const Icone = iconeDoTipo(n.tipo);
                const nova = !n.lida_em;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => abrir(n)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                        nova && "bg-primary/5",
                      )}
                    >
                      <Icone
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          nova ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm leading-snug",
                            nova ? "font-semibold" : "font-medium text-muted-foreground",
                          )}
                        >
                          {n.titulo}
                        </span>
                        {n.mensagem && (
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {n.mensagem}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {quando(n.created_at)}
                        </span>
                      </span>
                      {nova && (
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                          aria-label="Não lida"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {lista.length >= 30 && (
          <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
            Mostrando os {lista.length} avisos mais recentes.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
