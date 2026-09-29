import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Save, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { mensagemErro } from "@/lib/erros";
import {
  FORMAS_MANUAIS,
  GATEWAY_LABEL,
  METODO_PAGAMENTO_LABEL,
  type FormaManual,
} from "@/lib/pagamentos";
import {
  obterConfigPagamento,
  salvarConfigPagamento,
  type ConfigPagamento as DadosConfig,
} from "@/lib/pagamentos.functions";
import { cn } from "@/lib/utils";

/**
 * Forma de pagamento (/admin/pagamentos): prazo do pedido, formas aceitas no
 * modo manual com as instruções que o aluno vê, e a preparação do Pagar.me.
 */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

const MAX_INSTRUCOES = 1500;
const CHAVE_PUBLICA_VALIDA = /^(pk_(test_)?[A-Za-z0-9]+)?$/;

const EXEMPLO_INSTRUCOES: Record<FormaManual, string> = {
  pix: "Chave Pix: CNPJ 00.000.000/0000-00 (ABRACAM). Envie o comprovante para financeiro@... informando o código do pedido.",
  transferencia:
    "Banco 000 – Agência 0000 – Conta corrente 00000-0 – ABRACAM – CNPJ 00.000.000/0000-00. Envie o comprovante para financeiro@... informando o código do pedido.",
  boleto: "A ABRACAM envia o boleto para o seu e-mail em até 1 dia útil.",
  cartao:
    "A ABRACAM envia um link de pagamento com cartão de crédito para o seu e-mail em até 1 dia útil.",
};

type Modo = "teste" | "producao";
const MODO_LABEL: Record<Modo, string> = { teste: "teste", producao: "produção" };

type Form = {
  prazo: string;
  formas: FormaManual[];
  instrucoes: Record<FormaManual, string>;
  chavePublica: string;
};

function formDe(c: DadosConfig): Form {
  return {
    prazo: String(c.prazoPedidoDias),
    formas: FORMAS_MANUAIS.filter((f) => c.formasManual.includes(f)),
    instrucoes: Object.fromEntries(FORMAS_MANUAIS.map((f) => [f, c.instrucoes[f] ?? ""])) as Record<
      FormaManual,
      string
    >,
    chavePublica: c.pagarmeChavePublica,
  };
}

/** Dados enviados ao servidor (também usados para saber se algo mudou). */
function payload(f: Form) {
  const instrucoes: Partial<Record<FormaManual, string>> = {};
  for (const forma of FORMAS_MANUAIS) {
    const texto = f.instrucoes[forma].trim();
    if (texto) instrucoes[forma] = texto;
  }
  return {
    gateway: "manual" as const,
    prazoPedidoDias: Number(f.prazo),
    formasManual: FORMAS_MANUAIS.filter((forma) => f.formas.includes(forma)),
    instrucoes,
    pagarmeChavePublica: f.chavePublica.trim(),
  };
}

function modoDaChavePublica(chave: string): Modo | null {
  if (!chave || !CHAVE_PUBLICA_VALIDA.test(chave)) return null;
  return chave.startsWith("pk_test_") ? "teste" : "producao";
}

export function ConfigPagamento({ token }: { token: string }) {
  const obter = useServerFn(obterConfigPagamento);
  const salvar = useServerFn(salvarConfigPagamento);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);

  const query = useQuery({
    queryKey: ["admin", "config-pagamento"],
    queryFn: () => obter({ data: { token } }),
  });

  useEffect(() => {
    if (query.data) setForm(formDe(query.data.config));
  }, [query.data]);

  const mut = useMutation({
    mutationFn: (f: Form) => salvar({ data: { token, ...payload(f) } }),
    onSuccess: async () => {
      toast.success("Forma de pagamento salva.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "config-pagamento"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const cabecalho = (
    <>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
        <Wallet className="size-5 text-primary" />
        Forma de pagamento
      </h2>
      <p className="text-xs text-muted-foreground">
        Como o aluno paga o pedido feito na página Planos. Nesta etapa, o aluno paga por fora (Pix,
        transferência etc.) e você confirma o pagamento na lista de pedidos; o acesso é liberado na
        hora.
      </p>
    </>
  );

  if (query.isError) {
    return (
      <section className="panel p-5">
        {cabecalho}
        <p className="py-6 text-sm text-destructive">{mensagemErro(query.error)}</p>
      </section>
    );
  }
  if (!query.data || !form) {
    return (
      <section className="panel p-5">
        {cabecalho}
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
        </p>
      </section>
    );
  }

  const { pagarme } = query.data;

  const set = <K extends keyof Form>(campo: K, valor: Form[K]) =>
    setForm((v) => (v ? { ...v, [campo]: valor } : v));

  const alternarForma = (forma: FormaManual, marcada: boolean) =>
    setForm((v) =>
      v
        ? {
            ...v,
            formas: FORMAS_MANUAIS.filter((x) => (x === forma ? marcada : v.formas.includes(x))),
          }
        : v,
    );

  const escreverInstrucoes = (forma: FormaManual, texto: string) =>
    setForm((v) => (v ? { ...v, instrucoes: { ...v.instrucoes, [forma]: texto } } : v));

  // Validação
  const prazo = Number(form.prazo);
  const erroPrazo =
    form.prazo.trim() === "" || !Number.isInteger(prazo) || prazo < 0 || prazo > 30
      ? "O prazo precisa ser um número de 0 a 30 dias."
      : null;
  const erroFormas = form.formas.length === 0 ? "Marque pelo menos uma forma de pagamento." : null;
  const chave = form.chavePublica.trim();
  const erroChave = CHAVE_PUBLICA_VALIDA.test(chave)
    ? null
    : chave.startsWith("sk_")
      ? "Isto é a chave secreta (sk_...). Não cole a chave secreta aqui: ela fica só no servidor."
      : "A chave pública do Pagar.me começa com pk_ (ex.: pk_test_... para teste).";
  const erro = erroPrazo ?? erroFormas ?? erroChave;

  const alterado =
    JSON.stringify(payload(form)) !== JSON.stringify(payload(formDe(query.data.config)));

  const modoPublica = modoDaChavePublica(chave);
  const modoSecreta = pagarme.modoChaveSecreta;
  const modosDiferentes = Boolean(modoPublica && modoSecreta && modoPublica !== modoSecreta);

  return (
    <section className="panel p-5">
      {cabecalho}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!erro && alterado) mut.mutate(form);
        }}
        className="mt-5 space-y-6"
      >
        {/* Gateway */}
        <fieldset>
          <legend className="text-sm font-semibold text-card-foreground">
            Como o pagamento é confirmado
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary bg-primary/10 p-4">
              <input
                type="radio"
                name="gateway"
                value="manual"
                checked
                readOnly
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold text-card-foreground">
                  {GATEWAY_LABEL.manual}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  O aluno faz o pedido e paga por fora. Você confere o pagamento e confirma na lista
                  de pedidos.
                </span>
              </span>
            </label>
            <label
              aria-disabled="true"
              className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-border p-4 opacity-60"
            >
              <input
                type="radio"
                name="gateway"
                value="pagarme"
                checked={false}
                disabled
                readOnly
                className="mt-0.5 size-4"
              />
              <span>
                <span className="block text-sm font-semibold text-card-foreground">
                  Pagar.me (pagamento online)
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Disponível na Etapa 2 da integração
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {/* Prazo */}
        <div>
          <label className="block max-w-xs text-xs text-muted-foreground">
            Prazo para pagar o pedido (dias, de 0 a 30; 0 = sem prazo)
            <input
              type="number"
              min={0}
              max={30}
              step={1}
              value={form.prazo}
              onChange={(e) => set("prazo", e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {erroPrazo ? (
            <p className="mt-1 text-xs text-destructive">{erroPrazo}</p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {prazo === 0
                ? "Sem prazo: o pedido fica aguardando pagamento até ser pago ou cancelado."
                : "Depois do prazo o pedido aparece como 'Prazo vencido'. Você ainda pode confirmar o pagamento se ele chegar depois."}
            </p>
          )}
        </div>

        {/* Formas aceitas no modo manual */}
        <fieldset>
          <legend className="text-sm font-semibold text-card-foreground">
            Formas de pagamento aceitas
          </legend>
          <p className="text-xs text-muted-foreground">
            Marque as formas que o aluno pode escolher ao fazer o pedido. Para cada uma, escreva as
            instruções de pagamento: o aluno vê este texto depois de fazer o pedido.
          </p>
          <div className="mt-3 space-y-3">
            {FORMAS_MANUAIS.map((forma) => {
              const marcada = form.formas.includes(forma);
              const texto = form.instrucoes[forma];
              return (
                <div
                  key={forma}
                  className={cn(
                    "rounded-lg border p-3",
                    marcada ? "border-primary/50 bg-secondary/30" : "border-border",
                  )}
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={(e) => alternarForma(forma, e.target.checked)}
                      className="size-4 accent-primary"
                    />
                    {METODO_PAGAMENTO_LABEL[forma]}
                  </label>
                  {marcada && (
                    <label className="mt-2 block text-xs text-muted-foreground">
                      Instruções para o aluno ({texto.length}/{MAX_INSTRUCOES})
                      <textarea
                        value={texto}
                        onChange={(e) => escreverInstrucoes(forma, e.target.value)}
                        rows={3}
                        maxLength={MAX_INSTRUCOES}
                        placeholder={EXEMPLO_INSTRUCOES[forma]}
                        className={`mt-1 resize-y ${inputClass}`}
                      />
                      {!texto.trim() && (
                        <span className="mt-1 block text-[11px] text-primary">
                          Sem instruções, o aluno não saberá como pagar por esta forma.
                        </span>
                      )}
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {erroFormas && <p className="mt-2 text-xs text-destructive">{erroFormas}</p>}
        </fieldset>

        {/* Pagar.me */}
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-card-foreground">
            Pagar.me (preparação)
          </legend>
          <p className="text-xs text-muted-foreground">
            Ainda não está em uso. Deixe as chaves prontas para quando o pagamento online for
            ligado.
          </p>

          <label className="mt-3 block text-xs text-muted-foreground">
            Chave pública
            <input
              value={form.chavePublica}
              onChange={(e) => set("chavePublica", e.target.value)}
              placeholder="pk_test_..."
              autoComplete="off"
              spellCheck={false}
              className={`mt-1 font-mono ${inputClass}`}
            />
          </label>
          {erroChave ? (
            <p className="mt-1 text-xs text-destructive">{erroChave}</p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {modoPublica
                ? `Chave pública de ${MODO_LABEL[modoPublica]}.`
                : "Nenhuma chave pública informada (opcional nesta etapa)."}
            </p>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-xs text-card-foreground">
            <KeyRound className="size-3.5 text-primary" />
            Chave secreta no servidor:{" "}
            {pagarme.chaveSecretaConfigurada ? (
              <strong className="text-success">
                configurada{modoSecreta ? ` (modo ${MODO_LABEL[modoSecreta]})` : ""}
              </strong>
            ) : (
              <strong className="text-muted-foreground">não configurada</strong>
            )}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A chave secreta nunca é digitada aqui: ela fica guardada no servidor como variável
            PAGARME_SECRET_KEY. Use primeiro as chaves de teste.
          </p>

          {modosDiferentes && modoPublica && modoSecreta && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-card-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>
                As chaves são de modos diferentes: a pública é de{" "}
                <strong>{MODO_LABEL[modoPublica]}</strong> e a secreta é de{" "}
                <strong>{MODO_LABEL[modoSecreta]}</strong>. Use as duas do mesmo modo (as duas de
                teste ou as duas de produção).
              </p>
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {alterado && erro ? (
            <span className="text-xs text-destructive">Corrija antes de salvar: {erro}</span>
          ) : !alterado ? (
            <span className="text-[11px] text-muted-foreground">
              Nenhuma alteração para salvar.
            </span>
          ) : null}
          <button
            type="submit"
            disabled={!alterado || Boolean(erro) || mut.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-50"
          >
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar forma de pagamento
          </button>
        </div>
      </form>
    </section>
  );
}
