import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mensagemErro } from "@/lib/erros";
import { MOTIVO_LABEL, MOTIVOS_REPORTE, type MotivoReporte } from "@/lib/reportes";
import { reportarQuestao } from "@/lib/reportes.functions";
import { cn } from "@/lib/utils";

/**
 * ID discreto da questão + botão para o aluno reportar um problema.
 * Usado na prova e na revisão do resultado.
 */
export function IdEReporte({
  token,
  questaoId,
  simuladoId,
  className,
}: {
  token: string;
  questaoId: string;
  simuladoId: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [enviado, setEnviado] = useState(false);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className="select-all font-mono text-[10px] text-muted-foreground/70"
        title="Código da questão"
      >
        {questaoId}
      </span>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={enviado}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary disabled:text-success"
      >
        {enviado ? <Check className="size-3" /> : <Flag className="size-3" />}
        {enviado ? "Reportada" : "Reportar questão"}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          {aberto && (
            <FormReporte
              token={token}
              questaoId={questaoId}
              simuladoId={simuladoId}
              onEnviado={() => {
                setEnviado(true);
                setAberto(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormReporte({
  token,
  questaoId,
  simuladoId,
  onEnviado,
}: {
  token: string;
  questaoId: string;
  simuladoId: string;
  onEnviado: () => void;
}) {
  const enviar = useServerFn(reportarQuestao);
  const [motivo, setMotivo] = useState<MotivoReporte>("material");
  const [descricao, setDescricao] = useState("");

  const mut = useMutation({
    mutationFn: () => enviar({ data: { token, questaoId, simuladoId, motivo, descricao } }),
    onSuccess: () => {
      toast.success("Obrigado! A equipe da ABRACAM vai analisar esta questão.");
      onEnviado();
    },
    onError: (e) => {
      const msg = mensagemErro(e);
      toast.error(msg);
      if (/já reportou/.test(msg)) onEnviado();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Flag className="size-4 text-primary" />
          Reportar questão
        </DialogTitle>
        <DialogDescription>
          Questão <span className="font-mono">{questaoId}</span>. O reporte vai para a equipe da
          ABRACAM, que confere com o Material de Apoio e corrige se for o caso.
        </DialogDescription>
      </DialogHeader>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs font-medium text-card-foreground/80">
          Qual é o motivo do reporte?
        </legend>
        {MOTIVOS_REPORTE.map((m) => (
          <label
            key={m}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
              motivo === m ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
            )}
          >
            <input
              type="radio"
              name="motivo"
              value={m}
              checked={motivo === m}
              onChange={() => setMotivo(m)}
              className="accent-primary"
            />
            {MOTIVO_LABEL[m]}
          </label>
        ))}
      </fieldset>

      <label className="block text-xs font-medium text-card-foreground/80">
        Descreva o que você notou {motivo === "outro" ? "*" : "(opcional)"}
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Ex.: o material, na página 43, diz que o prazo é de dois dias úteis."
          className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-60"
        >
          {mut.isPending && <Loader2 className="size-4 animate-spin" />}
          Enviar reporte
        </button>
      </div>
    </form>
  );
}
