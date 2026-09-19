import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { iniciarSimulado, listarConfigsProva, type TipoProva } from "@/lib/simulado.functions";

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
  simuladoEmAndamentoId,
}: {
  token: string;
  temCpf: boolean;
  simuladoEmAndamentoId: string | null;
}) {
  const listar = useServerFn(listarConfigsProva);
  const iniciar = useServerFn(iniciarSimulado);
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState<TipoProva | null>(null);

  const query = useQuery({
    queryKey: ["configs-prova"],
    queryFn: () => listar({ data: { token } }),
  });

  const mut = useMutation({
    mutationFn: (tipo: TipoProva) => iniciar({ data: { token, tipo } }),
    onMutate: (tipo) => setCarregando(tipo),
    onSuccess: (r, tipo) => {
      if (r.retomado) toast.info(`Retomando seu ${LABEL[tipo]} em andamento.`);
      void navigate({ to: "/prova/$id", params: { id: r.simuladoId } });
    },
    onError: (e) => {
      setCarregando(null);
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar simulado.");
    },
  });

  const tipos: TipoProva[] = ["ABT1", "ABT2", "GRATIS", "LIVRE"];

  return (
    <section className="panel p-5">
      <h2 className="text-lg font-semibold text-card-foreground">Iniciar simulado</h2>
      <p className="text-xs text-muted-foreground">
        Escolha o tipo de prova. Você pode manter apenas um simulado em andamento por vez.
      </p>

      {simuladoEmAndamentoId && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/10 p-4 text-sm">
          <p className="text-foreground">
            Você tem um simulado em andamento. Retome de onde parou ou finalize antes de iniciar
            outro.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/prova/$id", params: { id: simuladoEmAndamentoId } })}
            className="rounded-md bg-info px-3 py-1.5 text-xs font-semibold text-info-foreground"
          >
            Retomar simulado
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {tipos.map((tipo) => {
          const cfg = query.data?.configs.find((c) => c.tipo === tipo);
          const desabilitado = tipo === "GRATIS" && !temCpf;
          const emCarga = carregando === tipo || mut.isPending;
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
              {desabilitado && (
                <p className="mt-2 text-[11px] text-destructive">
                  Cadastre seu CPF para liberar o teste grátis.
                </p>
              )}
              <button
                type="button"
                disabled={desabilitado || emCarga || query.isPending}
                onClick={() => mut.mutate(tipo)}
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
    </section>
  );
}
