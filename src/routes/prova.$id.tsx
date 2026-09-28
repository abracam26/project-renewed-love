import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  LogOut,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { IdEReporte } from "@/components/ReportarQuestao";
import { useToken } from "@/hooks/use-token";
import { mensagemErro } from "@/lib/erros";
import { nomeProva } from "@/lib/provas";
import { lerSessaoProva, limparSessaoProva } from "@/lib/sessao-prova";
import {
  abandonarSimulado,
  carregarSimulado,
  finalizarSimulado,
  responderQuestao,
} from "@/lib/simulado.functions";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/prova/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Simulado — Simulador ABT" },
      {
        name: "description",
        content: "Realização do simulado ABT com cronômetro e navegação entre questões.",
      },
    ],
  }),
  component: Prova,
});

function Prova() {
  const { id } = useParams({ from: "/prova/$id" });
  const { token, loading: tokenLoading } = useToken();
  const navigate = useNavigate();

  if (tokenLoading || !token) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" />
        Verificando sessão...
      </div>
    );
  }
  return (
    <ProvaInterna
      key={id}
      simuladoId={id}
      token={token}
      onResultado={(sid) => navigate({ to: "/resultado/$id", params: { id: sid } })}
      onPainel={() => navigate({ to: "/" })}
    />
  );
}

function fmtTempo(seg: number) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

function ProvaInterna({
  simuladoId,
  token,
  onResultado,
  onPainel,
}: {
  simuladoId: string;
  token: string;
  onResultado: (sid: string) => void;
  onPainel: () => void;
}) {
  const carregar = useServerFn(carregarSimulado);
  const responder = useServerFn(responderQuestao);
  const finalizar = useServerFn(finalizarSimulado);
  const abandonar = useServerFn(abandonarSimulado);
  const queryClient = useQueryClient();

  // A prova só continua na aba em que começou
  const sessao = useMemo(() => lerSessaoProva(simuladoId), [simuladoId]);

  const query = useQuery({
    queryKey: ["prova", simuladoId, sessao],
    queryFn: () => carregar({ data: { token, simuladoId, sessao } }),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const [i, setI] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, number | null>>({});
  const inicioQuestaoRef = useRef<number>(Date.now());
  const [confirmarFinalizar, setConfirmarFinalizar] = useState(false);
  const [confirmarAbandonar, setConfirmarAbandonar] = useState(false);
  const [encerradoNoServidor, setEncerradoNoServidor] = useState(false);

  const status = query.data?.simulado.status;
  const perdido = Boolean(query.data?.perdido) || encerradoNoServidor || status === "abandonado";
  const emAndamento = status === "em_andamento" && !perdido;

  // Sair da prova encerra o simulado: bloqueia a navegação e pede confirmação.
  // "liberado" vira true depois de finalizar ou abandonar, para sair sem aviso.
  const liberadoRef = useRef(false);
  const ativoRef = useRef(false);
  ativoRef.current = emAndamento;
  const bloqueio = useBlocker({
    shouldBlockFn: ({ next }) =>
      ativoRef.current && !liberadoRef.current && next.pathname !== `/prova/${simuladoId}`,
    enableBeforeUnload: () => ativoRef.current && !liberadoRef.current,
    withResolver: true,
  });

  // Preenche o estado local com as respostas já salvas ao carregar
  useEffect(() => {
    if (!query.data) return;
    const r: Record<string, number | null> = {};
    for (const q of query.data.questoes) r[q.simuladoQuestaoId] = q.resposta;
    setRespostas(r);
    inicioQuestaoRef.current = Date.now();
  }, [query.data]);

  // Simulado já corrigido (ex.: tempo esgotou): vai para o resultado
  const navegouRef = useRef(false);
  useEffect(() => {
    if (status === "finalizado" && !navegouRef.current) {
      navegouRef.current = true;
      liberadoRef.current = true;
      limparSessaoProva(simuladoId);
      onResultado(simuladoId);
    }
  }, [status, simuladoId, onResultado]);

  useEffect(() => {
    if (perdido) {
      liberadoRef.current = true;
      limparSessaoProva(simuladoId);
    }
  }, [perdido, simuladoId]);

  // Cronômetro do simulado
  const inicio = query.data ? new Date(query.data.simulado.iniciado_em).getTime() : Date.now();
  const tempoMax = (query.data?.simulado.tempo_maximo_min ?? 0) * 60;
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const decorridoSeg = Math.floor((agora - inicio) / 1000);
  const restante = Math.max(0, tempoMax - decorridoSeg);
  const tempoAcabou = emAndamento && tempoMax > 0 && restante === 0;

  function tratarErroDeSessao(e: unknown) {
    const msg = mensagemErro(e);
    if (/encerrado/i.test(msg)) setEncerradoNoServidor(true);
    return msg;
  }

  const mutFinalizar = useMutation({
    mutationFn: () => finalizar({ data: { token, simuladoId, sessao } }),
    onSuccess: async () => {
      liberadoRef.current = true;
      limparSessaoProva(simuladoId);
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["historico-aluno"] });
      onResultado(simuladoId);
    },
    onError: (e) => toast.error(tratarErroDeSessao(e)),
  });

  useEffect(() => {
    if (tempoAcabou && !mutFinalizar.isPending && !mutFinalizar.isSuccess) {
      toast.info("Tempo esgotado. Finalizando o simulado...");
      mutFinalizar.mutate();
    }
  }, [tempoAcabou, mutFinalizar]);

  const mutResponder = useMutation({
    mutationFn: (v: { sqId: string; posicao: number | null; tempoMs: number }) =>
      responder({
        data: {
          token,
          simuladoQuestaoId: v.sqId,
          posicao: v.posicao,
          tempoMs: v.tempoMs,
          sessao,
        },
      }),
    onError: (e) => toast.error(tratarErroDeSessao(e)),
  });

  const mutAbandonar = useMutation({
    mutationFn: (_depois: () => void) => abandonar({ data: { token, simuladoId } }),
    onSuccess: async (_r, depois) => {
      liberadoRef.current = true;
      limparSessaoProva(simuladoId);
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["historico-aluno"] });
      toast.info("Simulado encerrado como abandonado.");
      depois();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const questoes = query.data?.questoes ?? [];
  const atual = questoes[i];
  const totalRespondidas = useMemo(
    () => Object.values(respostas).filter((v) => v !== null && v !== undefined).length,
    [respostas],
  );

  function marcar(posicao: number) {
    if (!atual) return;
    const tempoMs = Date.now() - inicioQuestaoRef.current;
    setRespostas((prev) => ({ ...prev, [atual.simuladoQuestaoId]: posicao }));
    mutResponder.mutate({ sqId: atual.simuladoQuestaoId, posicao, tempoMs });
  }

  function irPara(n: number) {
    setI(n);
    inicioQuestaoRef.current = Date.now();
  }

  if (query.isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" />
        Carregando simulado...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="panel p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-destructive" />
        <p className="mt-3 text-sm text-card-foreground">
          {query.error ? mensagemErro(query.error) : "Simulado não encontrado."}
        </p>
      </div>
    );
  }
  if (perdido) {
    return (
      <div className="panel mx-auto max-w-xl p-8 text-center">
        <TriangleAlert className="mx-auto size-9 text-destructive" />
        <h1 className="mt-4 text-lg font-semibold text-card-foreground">Simulado encerrado</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Este simulado foi encerrado porque a prova foi interrompida: a tela foi fechada, aberta em
          outra aba ou você iniciou outro simulado. Depois de iniciado, o simulado precisa ser feito
          até o fim, sem pausa. Ele ficou registrado como abandonado no seu histórico.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold"
          >
            Voltar ao painel
          </Link>
          <Link
            to="/historico"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent"
          >
            Ver histórico
          </Link>
        </div>
      </div>
    );
  }
  if (!emAndamento || !atual) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" />
        Abrindo o resultado...
      </div>
    );
  }

  const alt_atual = respostas[atual.simuladoQuestaoId] ?? null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho fixo com cronômetro */}
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">
            Simulado {nomeProva(query.data.simulado.tipo)}
          </p>
          <p className="text-sm font-semibold text-card-foreground">
            Questão {i + 1} de {questoes.length}
            <span className="ml-3 text-xs font-normal text-muted-foreground">
              {totalRespondidas} respondida{totalRespondidas === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm font-semibold",
              restante < 300
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-border bg-secondary text-card-foreground",
            )}
          >
            <Clock className="size-4" />
            {fmtTempo(restante)}
          </span>
          <button
            type="button"
            onClick={() => setConfirmarAbandonar(true)}
            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
          >
            <LogOut className="mr-1 inline size-3.5" />
            Abandonar
          </button>
          <button
            type="button"
            onClick={() => setConfirmarFinalizar(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold"
          >
            <Flag className="mr-1 inline size-3.5" />
            Finalizar
          </button>
        </div>
        <p className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground">
          <TriangleAlert className="size-3.5 shrink-0 text-primary" />
          Faça o simulado até o fim, sem sair desta tela. Fechar a aba, abrir o simulado em outra
          aba ou navegar para outra página encerra a prova.
        </p>
      </section>

      {/* Questão */}
      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Tema {atual.tema} · {atual.tema_nome}
          </p>
          <IdEReporte
            key={atual.questaoId}
            token={token}
            questaoId={atual.questaoId}
            simuladoId={simuladoId}
          />
        </div>
        <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-card-foreground">
          {atual.enunciado}
        </p>

        <ul className="mt-5 space-y-2">
          {atual.alternativas.map((a) => {
            const selecionada = alt_atual === a.posicao;
            return (
              <li key={a.posicao}>
                <button
                  type="button"
                  onClick={() => marcar(a.posicao)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    selecionada
                      ? "border-primary bg-primary/10 text-card-foreground"
                      : "border-border bg-secondary/30 text-card-foreground/80 hover:border-primary/50 hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      selecionada
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {String.fromCharCode(65 + a.posicao)}
                  </span>
                  <span className="min-w-0">{a.texto}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            disabled={i === 0}
            onClick={() => irPara(i - 1)}
            className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm font-medium text-card-foreground hover:bg-accent disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Anterior
          </button>
          <button
            type="button"
            disabled={i === questoes.length - 1}
            onClick={() => irPara(i + 1)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-40"
          >
            Próxima <ChevronRight className="size-4" />
          </button>
        </div>
      </section>

      {/* Grade de navegação entre questões */}
      <section className="panel p-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">Ir para a questão</p>
        <div className="grid grid-cols-8 gap-2 sm:grid-cols-10 lg:grid-cols-14">
          {questoes.map((q, idx) => {
            const resp = respostas[q.simuladoQuestaoId] ?? null;
            return (
              <button
                key={q.simuladoQuestaoId}
                type="button"
                onClick={() => irPara(idx)}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                  idx === i
                    ? "bg-primary text-primary-foreground shadow-gold"
                    : resp !== null
                      ? "bg-success/20 text-card-foreground hover:bg-success/30"
                      : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </section>

      <AlertDialog open={confirmarFinalizar} onOpenChange={setConfirmarFinalizar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar simulado?</AlertDialogTitle>
            <AlertDialogDescription>
              Você respondeu {totalRespondidas} de {questoes.length} questões. Questões em branco
              serão consideradas erradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutFinalizar.isPending}
              onClick={(e) => {
                e.preventDefault();
                mutFinalizar.mutate();
              }}
              className="bg-primary text-primary-foreground shadow-gold hover:bg-primary/90"
            >
              {mutFinalizar.isPending ? "Finalizando..." : "Finalizar e corrigir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarAbandonar} onOpenChange={setConfirmarAbandonar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonar simulado?</AlertDialogTitle>
            <AlertDialogDescription>
              O simulado será encerrado e ficará marcado como abandonado no seu histórico, sem
              resultado. Não é possível retomá-lo depois. Se for o teste grátis, ele conta como
              utilizado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar à prova</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutAbandonar.isPending}
              onClick={(e) => {
                e.preventDefault();
                mutAbandonar.mutate(onPainel);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mutAbandonar.isPending ? "Encerrando..." : "Abandonar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tentativa de sair pelo menu ou pelo botão voltar do navegador */}
      <AlertDialog open={bloqueio.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do simulado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se você sair agora, o simulado será encerrado e contará como abandonado. Não é
              possível voltar a ele depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => bloqueio.reset?.()}>
              Continuar no simulado
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutAbandonar.isPending}
              onClick={(e) => {
                e.preventDefault();
                const seguir = bloqueio.proceed;
                if (seguir) mutAbandonar.mutate(seguir);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mutAbandonar.isPending ? "Encerrando..." : "Sair e encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
