import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { mensagemErro } from "@/lib/erros";
import { guardarSessaoProva } from "@/lib/sessao-prova";
import { iniciarSimulado, listarConfigsProva, type TipoProva } from "@/lib/simulado.functions";
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

const LABEL: Record<TipoProva, string> = {
  ABT1: "Simulado ABT1",
  ABT2: "Simulado ABT2",
  GRATIS: "Teste grátis",
  LIVRE: "Treino livre",
};

const DESCRICAO: Record<TipoProva, string> = {
  ABT1: "40 questões · 120 minutos · nota mínima 70%. Nível para profissionais de operação, compliance, riscos e backoffice.",
  ABT2: "40 questões · 120 minutos · nota mínima 70%. Nível para gestores e diretores; distratores mais sutis.",
  GRATIS:
    "10 questões · 30 minutos · uma tentativa por CPF. Amostra do simulador para você experimentar.",
  LIVRE:
    "20 questões · 60 minutos. Sem controle de tentativas; ideal para estudar entre um simulado e outro.",
};

export function SelecaoSimulado({
  token,
  temCpf,
  liberado,
  temSimuladoAberto,
}: {
  token: string;
  temCpf: boolean;
  /** Plano ativo ou admin: libera ABT1, ABT2 e Treino livre. */
  liberado: boolean;
  /** Há um simulado que ficou em andamento (será encerrado ao iniciar outro). */
  temSimuladoAberto: boolean;
}) {
  const listar = useServerFn(listarConfigsProva);
  const iniciar = useServerFn(iniciarSimulado);
  const navigate = useNavigate();
  const [confirmar, setConfirmar] = useState<TipoProva | null>(null);

  const query = useQuery({
    queryKey: ["configs-prova"],
    queryFn: () => listar({ data: { token } }),
  });

  const mut = useMutation({
    mutationFn: (tipo: TipoProva) => iniciar({ data: { token, tipo } }),
    onSuccess: (r) => {
      // A prova fica presa a esta aba: sem a sessão, não há como continuar
      guardarSessaoProva(r.simuladoId, r.sessao);
      void navigate({ to: "/prova/$id", params: { id: r.simuladoId } });
    },
    onError: (e) => {
      setConfirmar(null);
      toast.error(mensagemErro(e));
    },
  });

  const tipos: TipoProva[] = ["ABT1", "ABT2", "GRATIS", "LIVRE"];
  const cfgConfirmar = confirmar ? query.data?.configs.find((c) => c.tipo === confirmar) : null;

  return (
    <section className="panel p-5">
      <h2 className="text-lg font-semibold text-card-foreground">Iniciar simulado</h2>
      <p className="text-xs text-muted-foreground">
        Escolha o tipo de prova. Depois de iniciado, o simulado precisa ser feito até o fim, sem
        pausa.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {tipos.map((tipo) => {
          const cfg = query.data?.configs.find((c) => c.tipo === tipo);
          const semCpf = tipo === "GRATIS" && !temCpf;
          const semPlano = tipo !== "GRATIS" && !liberado;
          const desabilitado = semCpf || semPlano;
          const emCarga = mut.isPending && mut.variables === tipo;
          return (
            <div key={tipo} className="rounded-lg border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-card-foreground">{LABEL[tipo]}</p>
                {cfg && (
                  <span className="text-[11px] text-muted-foreground">
                    {cfg.total_questoes} questões
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{DESCRICAO[tipo]}</p>
              {semCpf && (
                <p className="mt-2 text-[11px] text-destructive">
                  Complete seu cadastro com o CPF para liberar o teste grátis.
                </p>
              )}
              {semPlano && (
                <p className="mt-2 text-[11px] text-destructive">
                  Disponível com plano ativo. Fale com a ABRACAM para liberar.
                </p>
              )}
              <button
                type="button"
                disabled={desabilitado || mut.isPending || query.isPending}
                onClick={() => setConfirmar(tipo)}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
              >
                {emCarga ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                Iniciar
              </button>
            </div>
          );
        })}
      </div>

      <AlertDialog open={Boolean(confirmar)} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-primary" />
              Iniciar {confirmar ? LABEL[confirmar] : "simulado"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm leading-relaxed">
                {cfgConfirmar && (
                  <p>
                    {cfgConfirmar.total_questoes} questões em até {cfgConfirmar.tempo_maximo_min}{" "}
                    minutos.
                  </p>
                )}
                <p>
                  Depois de iniciar, faça o simulado <strong>até o fim, sem pausa</strong>. Fechar a
                  aba, abrir o simulado em outra aba ou sair para outra página encerra a prova, e
                  ela conta como abandonada.
                </p>
                {confirmar === "GRATIS" && (
                  <p>O teste grátis conta como utilizado assim que você iniciar.</p>
                )}
                {temSimuladoAberto && (
                  <p className="font-medium text-destructive">
                    Você tem um simulado que não foi finalizado. Ele será encerrado como abandonado.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mut.isPending}>Agora não</AlertDialogCancel>
            <AlertDialogAction
              disabled={mut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmar) mut.mutate(confirmar);
              }}
              className="bg-primary text-primary-foreground shadow-gold hover:bg-primary/90"
            >
              {mut.isPending ? "Iniciando..." : "Iniciar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
