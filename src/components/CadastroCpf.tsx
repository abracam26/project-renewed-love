import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cpfValido, formatarCpf, limparCpf } from "@/lib/cpf";
import { salvarCpf } from "@/lib/simulado.functions";

/**
 * Formulário curto para o aluno cadastrar o CPF antes de fazer o simulado
 * grátis. O CPF é validado no cliente (dígito verificador) e enviado ao
 * servidor, que o armazena cifrado (SHA-256 com sal).
 */
export function CadastroCpf({ token }: { token: string }) {
  const [cpf, setCpf] = useState("");
  const salvar = useServerFn(salvarCpf);
  const queryClient = useQueryClient();

  const cpfLimpo = limparCpf(cpf);
  const valido = cpfLimpo.length === 11 && cpfValido(cpfLimpo);

  const mut = useMutation({
    mutationFn: () => salvar({ data: { token, cpf: cpfLimpo } }),
    onSuccess: async () => {
      toast.success("CPF cadastrado. Agora você pode iniciar o simulado grátis.");
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cadastrar CPF."),
  });

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
        <ShieldCheck className="size-5 text-primary" />
        Cadastro do CPF
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Necessário para o simulado grátis. Guardamos apenas o CPF cifrado, para checar se ele já
        utilizou a gratuidade. Nunca compartilhamos nem exibimos seu CPF depois do cadastro.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) mut.mutate();
        }}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <label className="flex-1 min-w-[240px] text-xs text-muted-foreground">
          CPF
          <input
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
            className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground outline-none ${
              cpfLimpo.length === 11 && !valido
                ? "border-destructive"
                : "border-input bg-background focus:border-ring"
            }`}
          />
          {cpfLimpo.length === 11 && !valido && (
            <span className="mt-1 block text-[11px] text-destructive">
              O CPF informado não é válido.
            </span>
          )}
        </label>
        <button
          type="submit"
          disabled={!valido || mut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          {mut.isPending && <Loader2 className="size-4 animate-spin" />}
          Salvar CPF
        </button>
      </form>
    </section>
  );
}
