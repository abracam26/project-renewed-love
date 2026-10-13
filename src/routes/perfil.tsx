import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CreditCard,
  IdCard,
  KeyRound,
  Loader2,
  Mail,
  TriangleAlert,
  Trophy,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useToken } from "@/hooks/use-token";
import { emailPessoal } from "@/lib/associados";
import { validarMeuAssociado } from "@/lib/associados.functions";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/cnpj";
import { mascararCpf } from "@/lib/cpf";
import { mensagemErro } from "@/lib/erros";
import { CONTROLADOR } from "@/lib/juridico";
import { formatarDataBR, nomeDoPlano } from "@/lib/planos";
import { enviarLinkDeRecuperacao } from "@/lib/recuperacao-senha";
import { definirParticipacaoRanking, meuPerfil } from "@/lib/usuarios.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/perfil")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Perfil — Simulador ABT" },
      {
        name: "description",
        content: "Dados da conta, preferências de ranking e status do plano.",
      },
      { property: "og:title", content: "Perfil — Simulador ABT" },
      { property: "og:description", content: "Gerencie sua conta no Simulador ABT." },
    ],
  }),
  component: Perfil,
});

function dataLonga(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function Campo({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: typeof Mail;
  rotulo: string;
  valor: string;
}) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icone className="size-3.5" />
        {rotulo}
      </span>
      <p className="mt-1 rounded-md border border-input bg-secondary px-3 py-2.5 text-sm text-card-foreground">
        {valor}
      </p>
    </div>
  );
}

function Perfil() {
  const { token, loading } = useToken();
  const carregar = useServerFn(meuPerfil);
  const definirRanking = useServerFn(definirParticipacaoRanking);
  const queryClient = useQueryClient();
  const [linkSenhaEnviado, setLinkSenhaEnviado] = useState(false);

  const mutSenha = useMutation({
    mutationFn: (email: string) => enviarLinkDeRecuperacao(email),
    onSuccess: () => setLinkSenhaEnviado(true),
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const query = useQuery({
    queryKey: ["meu-perfil", token],
    queryFn: () => carregar({ data: { token: token as string } }),
    enabled: Boolean(token),
  });

  const mutRanking = useMutation({
    mutationFn: (participar: boolean) =>
      definirRanking({ data: { token: token as string, participar } }),
    onSuccess: (r) => {
      queryClient.setQueryData(["meu-perfil", token], (antigo: typeof query.data) =>
        antigo ? { ...antigo, participaRanking: r.participar } : antigo,
      );
      toast.success(
        r.participar ? "Você vai participar do ranking." : "Seus resultados ficarão privados.",
      );
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  // Vindo de "Validar no Perfil" (página Planos): rola até o cartão de associado
  const carregado = query.isSuccess;
  useEffect(() => {
    if (carregado && window.location.hash === "#associado") {
      document.getElementById("associado")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [carregado]);

  if (loading || query.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Carregando seu perfil...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="panel p-6 text-center text-sm text-destructive">
        {mensagemErro(query.error)}
      </div>
    );
  }

  const p = query.data;
  const ranking = p.participaRanking;
  const pago = p.plano === "mensal" || p.plano === "anual";
  const loginGoogle = p.provedores.includes("google");
  const temSenha = p.provedores.includes("email");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <User className="size-4 text-primary" />
            Informações Pessoais
          </h2>
          <div className="mt-6 space-y-4">
            <Campo icone={User} rotulo="Nome completo" valor={p.nome || "—"} />
            <Campo icone={Mail} rotulo="E-mail" valor={p.email ?? "—"} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo icone={IdCard} rotulo="CPF" valor={p.cpf ? mascararCpf(p.cpf) : "—"} />
              <Campo
                icone={IdCard}
                rotulo="CNPJ"
                valor={p.cnpj ? formatarCnpj(p.cnpj) : "Não informado"}
              />
            </div>
            <Campo icone={Building2} rotulo="Instituição" valor={p.instituicao ?? "—"} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Para corrigir algum dado, fale com a ABRACAM pelo e-mail{" "}
            <a
              href={`mailto:${CONTROLADOR.emailContato}`}
              className="font-medium text-primary hover:underline"
            >
              {CONTROLADOR.emailContato}
            </a>
            .
          </p>
        </section>

        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <Trophy className="size-4 text-primary" />
            Preferências do Ranking
          </h2>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-card-foreground">Participar do Ranking</p>
              <p className="text-xs text-muted-foreground">
                {ranking
                  ? "Você aparece no ranking da página Relatórios, com o primeiro nome, a inicial do sobrenome e a sua média nos simulados ABT1 e ABT2."
                  : "Você não aparece no ranking. Ative para participar."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={ranking}
              aria-label="Participar do ranking"
              disabled={mutRanking.isPending}
              onClick={() => mutRanking.mutate(!ranking)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60",
                ranking ? "border-primary bg-primary" : "border-muted-foreground/60 bg-secondary",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-primary-foreground shadow-sm transition-all",
                  ranking ? "left-[1.625rem]" : "left-0.5",
                )}
              />
            </button>
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <CalendarDays className="size-4 text-primary" />
            Informações da Conta
          </h2>
          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Conta criada em</dt>
              <dd className="mt-0.5 text-card-foreground">{dataLonga(p.criadoEm)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Forma de login</dt>
              <dd className="mt-0.5 text-card-foreground">
                {loginGoogle ? "Conta Google" : "E-mail e senha"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Senha</dt>
              <dd className="mt-1">
                {linkSenhaEnviado ? (
                  <p className="text-xs text-card-foreground">
                    Enviamos um link para <strong>{p.email}</strong>. Abra o e-mail (veja também o
                    spam) e siga as instruções para criar a nova senha.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!p.email || mutSenha.isPending}
                      onClick={() => p.email && mutSenha.mutate(p.email)}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-card-foreground transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      {mutSenha.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="size-3.5 text-primary" />
                      )}
                      {temSenha ? "Trocar minha senha" : "Criar ou trocar minha senha"}
                    </button>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {temSenha
                        ? "Vamos enviar para o seu e-mail um link para criar a nova senha."
                        : "Você entra com a conta Google. Pelo link que vamos enviar ao seu e-mail, você cria uma senha (ou troca a que já criou) para entrar também com e-mail e senha."}
                    </p>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Teste grátis</dt>
              <dd className="mt-0.5 text-card-foreground">
                {p.gratuidadeUsada ? "Já utilizado" : "Disponível"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <CreditCard className="size-4 text-primary" />
            Plano e Acesso
          </h2>
          {p.acessoAtivo ? (
            <div className="mt-6 rounded-md border border-success/40 bg-success/10 px-4 py-4">
              <p className="text-sm font-semibold text-success">
                Plano {nomeDoPlano(p.plano, p.planoNome)} ativo
              </p>
              <p className="mt-1 text-xs text-card-foreground">
                Acesso a todos os simulados até {formatarDataBR(p.planoValidade)}.
              </p>
            </div>
          ) : p.isAdmin ? (
            <div className="mt-6 rounded-md border border-info/40 bg-info/10 px-4 py-4">
              <p className="text-sm font-semibold text-info">Conta de administrador</p>
              <p className="mt-1 text-xs text-card-foreground">Todos os simulados liberados.</p>
            </div>
          ) : (
            <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-4">
              <p className="text-sm font-semibold text-destructive">
                {p.plano === "inativo"
                  ? "Acesso bloqueado"
                  : pago && p.planoValidade
                    ? `Plano vencido em ${formatarDataBR(p.planoValidade)}`
                    : "Sem plano ativo"}
              </p>
              <p className="mt-1 text-xs text-card-foreground">
                Sem plano ativo, você pode fazer apenas o teste grátis.
              </p>
            </div>
          )}
          {p.plano === "inativo" ? (
            <a
              href={`mailto:${CONTROLADOR.emailContato}?subject=${encodeURIComponent("Plano do Simulador ABT")}`}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Mail className="size-4" />
              Falar com a ABRACAM
            </a>
          ) : (
            <Link
              to="/planos"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <CreditCard className="size-4" />
              {p.acessoAtivo ? "Renovar ou ver meus pedidos" : "Contratar plano"}
            </Link>
          )}
          {/* Conta bloqueada: um pagamento não libera o acesso, então não promete isso */}
          {p.plano !== "inativo" && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              O acesso é liberado assim que a ABRACAM confirma o pagamento.
            </p>
          )}
        </section>

        <CartaoAssociado
          token={token as string}
          associado={p.associado}
          email={p.email}
          cnpjCadastro={p.cnpj}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Associado ABRACAM: situação e validação do vínculo (CNPJ + e-mail da conta)
// ---------------------------------------------------------------------
function CartaoAssociado({
  token,
  associado,
  email,
  cnpjCadastro,
}: {
  token: string;
  associado: { nome: string } | null;
  email: string | null;
  cnpjCadastro: string | null;
}) {
  const validar = useServerFn(validarMeuAssociado);
  const queryClient = useQueryClient();
  const [cnpj, setCnpj] = useState(cnpjCadastro ? formatarCnpj(cnpjCadastro) : "");
  const digitos = limparCnpj(cnpj);
  const cnpjInvalido = digitos.length === 14 && !cnpjValido(cnpj);
  const pessoal = emailPessoal(email);

  const mut = useMutation({
    mutationFn: () => validar({ data: { token, cnpj } }),
    onSuccess: async (r) => {
      toast.success(`Vínculo validado: ${r.nome}. O desconto de associado já vale nos planos.`);
      await queryClient.invalidateQueries({ queryKey: ["meu-perfil"] });
      await queryClient.invalidateQueries({ queryKey: ["planos-aluno"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <section id="associado" className="panel scroll-mt-20 p-6 lg:col-span-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
        <BadgeCheck className="size-4 text-primary" />
        Associado ABRACAM
      </h2>
      {associado ? (
        <div className="mt-4 rounded-md border border-success/40 bg-success/10 px-4 py-4">
          <p className="text-sm font-semibold text-success">Associado(a): {associado.nome}</p>
          <p className="mt-1 text-xs text-card-foreground">
            Os planos com preço de associado já aparecem com o desconto na página Planos.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="mt-4 space-y-3"
        >
          <p className="text-sm text-card-foreground">
            Colaboradores de instituições associadas à ABRACAM têm desconto nos planos. Para
            validar, informe o CNPJ da instituição. O e-mail desta conta (
            <strong>{email ?? "—"}</strong>) precisa ser o e-mail da instituição.
          </p>
          {pessoal && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Esta conta usa um e-mail pessoal, que não dá direito ao desconto. Para ter o preço de
              associado, crie uma conta com o seu e-mail da instituição ou fale com a ABRACAM.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs font-medium text-muted-foreground">
              CNPJ da instituição associada
              <input
                value={cnpj}
                onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                required
                className="mt-1 block w-56 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              />
            </label>
            <button
              type="submit"
              disabled={mut.isPending || digitos.length !== 14 || cnpjInvalido}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {mut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Validar vínculo
            </button>
          </div>
          {cnpjInvalido && <p className="text-xs text-destructive">CNPJ inválido.</p>}
        </form>
      )}
    </section>
  );
}
