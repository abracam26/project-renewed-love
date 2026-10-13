import { BadgeCheck, Info, TriangleAlert } from "lucide-react";
import { emailPessoal } from "@/lib/associados";

/**
 * Caixa "Sou associado(a) ABRACAM" dos formulários de cadastro (/auth e
 * "Complete seu cadastro"). Marcada, o CNPJ passa a ser obrigatório e o
 * servidor só deixa avançar se o CNPJ estiver na lista de associados e o
 * e-mail for de um domínio da instituição.
 */

/** Aviso para quem marcou "associado" e digitou um e-mail pessoal (gmail, hotmail...) */
export function AvisoEmailPessoal({
  marcado,
  email,
  emailFixo = false,
}: {
  marcado: boolean;
  email: string;
  emailFixo?: boolean;
}) {
  if (!marcado || !emailPessoal(email)) return null;
  return (
    <p className="flex items-start gap-2 text-xs text-destructive">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      {emailFixo
        ? "Esta conta usa um e-mail pessoal. O desconto exige o e-mail da instituição: crie a conta com ele em “Criar conta”, ou desmarque a opção para continuar com o preço normal."
        : "E-mails pessoais (Gmail, Hotmail, Outlook...) não dão direito ao desconto. Use o e-mail da sua instituição."}
    </p>
  );
}

export function CaixaAssociado({
  marcado,
  onChange,
  emailFixo = false,
}: {
  marcado: boolean;
  onChange: (marcado: boolean) => void;
  /** e-mail já definido pela conta (login pelo Google): não dá para trocar aqui */
  emailFixo?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-secondary/40 p-3">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
            <BadgeCheck className="size-4 text-primary" />
            Sou associado(a) ABRACAM
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
            Colaboradores de instituições associadas têm desconto nos planos.
          </span>
        </span>
      </label>

      {marcado && (
        <p className="flex items-start gap-2 rounded-md border border-primary/50 bg-primary/10 p-3 text-xs leading-relaxed text-card-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Para aplicação do desconto de associado, informe o <strong>CNPJ da instituição</strong>{" "}
            associada e {emailFixo ? "use uma conta com" : "faça o cadastro com"} o{" "}
            <strong>e-mail da sua instituição</strong> (ex.: nome@suainstituicao.com.br). Se os
            dados não conferirem com a lista de associados, desmarque esta opção para continuar com
            o preço normal.
          </span>
        </p>
      )}
    </div>
  );
}
