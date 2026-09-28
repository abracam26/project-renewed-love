import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  definirFeedbackResultados,
  obterFeedbackResultados,
} from "@/lib/configuracoes-prova.functions";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Interruptor global do admin: exibe ou oculta o feedback nos resultados dos
 * simulados ("Parabéns", "Onde estudar" e explicação). Certo/errado e a
 * alternativa correta continuam visíveis nos dois casos.
 */
export function FeedbackResultados({ token }: { token: string }) {
  const obter = useServerFn(obterFeedbackResultados);
  const definir = useServerFn(definirFeedbackResultados);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "feedback-resultados"],
    queryFn: () => obter({ data: { token } }),
  });

  const mut = useMutation({
    mutationFn: (ativo: boolean) => definir({ data: { token, ativo } }),
    onSuccess: (r) => {
      queryClient.setQueryData(["admin", "feedback-resultados"], {
        ativo: r.ativo,
        atualizadoEm: new Date().toISOString(),
      });
      void queryClient.invalidateQueries({ queryKey: ["resultado"] });
      toast.success(
        r.ativo
          ? "Feedback ativado: os alunos voltam a ver as mensagens nos resultados."
          : "Feedback ocultado: os alunos não veem mais as mensagens nos resultados.",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const ativo = query.data?.ativo ?? true;

  return (
    <section
      className={cn(
        "panel flex flex-wrap items-center justify-between gap-4 p-5",
        ativo ? "border-success/40" : "border-destructive/40",
      )}
    >
      <div className="flex items-start gap-3">
        {ativo ? (
          <Eye className="mt-0.5 size-5 shrink-0 text-success" />
        ) : (
          <EyeOff className="mt-0.5 size-5 shrink-0 text-destructive" />
        )}
        <div>
          <h2 className="text-base font-semibold text-card-foreground">
            Feedback nos resultados dos alunos
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {ativo
              ? "Exibindo: ao conferir o resultado, o aluno vê “Parabéns” nas questões certas e “Onde estudar” nas erradas (e a explicação, se estiver liberada nas configurações)."
              : "Oculto: o aluno vê só a nota, se acertou ou errou cada questão e qual era a alternativa correta, sem mensagens de feedback."}
          </p>
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm font-semibold text-card-foreground">
        {query.isPending || mut.isPending ? (
          <Loader2 className="size-4 animate-spin text-primary" />
        ) : null}
        <span className={ativo ? "text-success" : "text-destructive"}>
          {ativo ? "Exibindo" : "Oculto"}
        </span>
        <Switch
          checked={ativo}
          disabled={query.isPending || mut.isPending}
          onCheckedChange={(v) => mut.mutate(v)}
          aria-label="Exibir feedback nos resultados"
        />
      </label>
    </section>
  );
}
