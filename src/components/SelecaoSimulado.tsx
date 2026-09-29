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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LABEL: Record<TipoProva, string> = {
  ABT1: "Simulado ABT1",
  ABT2: "Simulado ABT2",
  ABT: "Simulado ABT – Correspondentes",
  GRATIS_ABT1: "Teste grátis ABT1",
  GRATIS_ABT2: "Teste grátis ABT2",
  GRATIS_ABT: "Teste grátis ABT – Correspondentes",
  GRATIS: "Teste grátis",
  LIVRE: "Treino livre",
};

/** Opções do teste grátis (um por CPF, em qualquer uma das provas). */
const OPCOES_GRATIS = ["GRATIS_ABT1", "GRATIS_ABT2", "GRATIS_ABT"] as const;

const DESCRICAO: Record<TipoProva, string> = {
  ABT1: "40 questões · 120 minutos · nota mínima 70%. Nível para profissionais de operação, compliance, riscos e backoffice.",
  ABT2: "40 questões · 120 minutos · nota mínima 70%. Nível para gestores e diretores; distratores mais sutis.",
  ABT: "20 questões · 120 minutos · nota mínima 70%. Certificação ABT dos Correspondentes, com questões do e-book da ABRACAM.",
  GRATIS_ABT1: "Nível para profissionais de operação, compliance, riscos e backoffice.",
  GRATIS_ABT2: "Nível para gestores e diretores; distratores mais sutis.",
  GRATIS_ABT: "Certificação dos correspondentes cambiais, com questões do e-book.",
  GRATIS:
    "10 questões · 30 minutos · uma tentativa por CPF. Escolha a prova: ABT1, ABT2 ou ABT – Correspondentes.",
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
  /** Plano ativo ou admin: libera ABT1, ABT2 e ABT – Correspondentes. */
  liberado: boolean;
  /** Há um simulado que ficou em andamento (será encerrado ao iniciar outro). */
  temSimuladoAberto: boolean;
}) {
  const listar = useServerFn(listarConfigsProva);
  const iniciar = useServerFn(iniciarSimulado);
  const navigate = useNavigate();
  const [confirmar, setConfirmar] = useState<TipoProva | null>(null);
  const [escolhendoGratis, setEscolhendoGratis] = useState(false);

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

  const tipos: TipoProva[] = ["ABT1", "ABT2", "ABT", "GRATIS"];
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
          const cfg = query.data?.configs.find(
            (c) => c.tipo === (tipo === "GRATIS" ? "GRATIS_ABT1" : tipo),
          );
          const semCpf = tipo === "GRATIS" && !temCpf;
          const semPlano = tipo !== "GRATIS" && !liberado;
          const desabilitado = semCpf || semPlano;
          const emCarga =
            mut.isPending &&
            (mut.variables === tipo ||
              (tipo === "GRATIS" && (mut.variables ?? "").startsWith("GRATIS_")));
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
                onClick={() => (tipo === "GRATIS" ? setEscolhendoGratis(true) : setConfirmar(tipo))}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
              >
                {emCarga ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {tipo === "GRATIS" ? "Escolher e iniciar" : "Iniciar"}
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={escolhendoGratis} onOpenChange={setEscolhendoGratis}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Teste grátis: qual prova?</DialogTitle>
            <DialogDescription className="text-popover-foreground/85">
              Você tem direito a um único teste grátis, de 10 questões. Escolha a prova que quer
              experimentar.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {OPCOES_GRATIS.map((opcao) => {
              const cfg = query.data?.configs.find((c) => c.tipo === opcao);
              return (
                <li key={opcao}>
                  <button
                    type="button"
                    onClick={() => {
                      setEscolhendoGratis(false);
                      setConfirmar(opcao);
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-secondary px-4 py-3 text-left text-secondary-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-secondary-foreground">
                        {LABEL[opcao].replace("Teste grátis ", "")}
                      </span>
                      <span className="mt-0.5 block text-xs text-secondary-foreground/85">
                        {DESCRICAO[opcao]}
                      </span>
                    </span>
                    {cfg && (
                      <span className="shrink-0 text-[11px] font-medium text-secondary-foreground/85">
                        {cfg.total_questoes} questões · {cfg.tempo_maximo_min} min
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmar)} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-primary" />
              Iniciar {confirmar ? LABEL[confirmar] : "simulado"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
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
                {confirmar?.startsWith("GRATIS") && (
                  <p>
                    O teste grátis conta como utilizado assim que você iniciar. Ele vale uma única
                    vez por CPF, em qualquer uma das provas.
                  </p>
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
