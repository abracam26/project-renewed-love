import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  History,
  Loader2,
  Pencil,
  Receipt,
  Save,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { mensagemErro } from "@/lib/erros";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cnpjValido, formatarCnpj } from "@/lib/cnpj";
import { cpfValido, formatarCpf } from "@/lib/cpf";
import {
  centavosParaTexto,
  descreverDuracao,
  formatarReais,
  mascararDocumento,
  METODO_PAGAMENTO_LABEL,
  METODOS_PAGAMENTO,
  reaisParaCentavos,
  STATUS_PEDIDO_LABEL,
  type MetodoPagamento,
  type StatusPedido,
} from "@/lib/pagamentos";
import { listarPlanosAdmin, pedidosDoUsuario, registrarVenda } from "@/lib/pagamentos.functions";
import {
  formatarDataBR,
  hojeSaoPaulo,
  nomeDoPlano,
  novaValidade,
  PLANO_LABEL,
  PLANOS,
  PLANOS_PAGOS,
  type Plano,
} from "@/lib/planos";
import {
  atualizarCadastroUsuario,
  atualizarPlano,
  detalheUsuario,
  listarUsuarios,
  type FiltroUsuarios,
} from "@/lib/usuarios.functions";
import { nomeProva } from "@/lib/provas";
import { cn } from "@/lib/utils";

/**
 * Painel /admin/usuarios: busca, filtros, dados de cadastro de cada aluno,
 * edição de plano e prazo de acesso, pedidos, histórico de acesso e registro
 * de venda feita por fora do site.
 */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

const FILTRO_LABEL: Record<FiltroUsuarios, string> = {
  todos: "Todos os usuários",
  ativos: "Com plano ativo",
  vencendo: "Vencem em até 7 dias",
  vencidos: "Plano vencido",
  sem_plano: "Sem plano / bloqueados",
  incompletos: "Cadastro incompleto",
  admins: "Administradores",
};

const POR_PAGINA = 25;

function dataHora(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function dataCurta(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

function provedorLabel(p: string) {
  return p === "google" ? "Google" : p === "email" ? "E-mail e senha" : p;
}

/** Tipo de plano na lista (o nome do plano comprado aparece na ficha do aluno). */
function planoDaLinha(u: { plano: string }) {
  return PLANO_LABEL[u.plano as Plano] ?? u.plano;
}

/** Frase para o aviso de pedidos aguardando pagamento que foram cancelados. */
function avisoCancelados(codigos: readonly string[]) {
  if (codigos.length === 0) return "";
  return codigos.length === 1
    ? ` O pedido ${codigos[0]}, que aguardava pagamento, foi cancelado.`
    : ` Os pedidos ${codigos.join(", ")}, que aguardavam pagamento, foram cancelados.`;
}

export function GestorUsuarios({ token }: { token: string }) {
  const listar = useServerFn(listarUsuarios);
  const [termo, setTermo] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroUsuarios>("todos");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin", "usuarios", busca, filtro, pagina],
    queryFn: () => listar({ data: { token, busca, filtro, pagina, porPagina: POR_PAGINA } }),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPagina(0);
            setBusca(termo.trim());
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <label className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome, e-mail, CPF, CNPJ ou instituição"
              className={`${inputClass} py-2 pl-8`}
            />
          </label>
          <select
            value={filtro}
            onChange={(e) => {
              setPagina(0);
              setFiltro(e.target.value as FiltroUsuarios);
            }}
            className={`${inputClass} w-auto py-2`}
          >
            {(Object.keys(FILTRO_LABEL) as FiltroUsuarios[]).map((f) => (
              <option key={f} value={f}>
                {FILTRO_LABEL[f]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
          >
            Buscar
          </button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          {query.isPending
            ? "Carregando..."
            : `${total} usuário${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}`}
        </p>
      </section>

      <section className="panel overflow-hidden">
        {query.isError ? (
          <p className="p-6 text-center text-sm text-destructive">{mensagemErro(query.error)}</p>
        ) : query.isPending ? (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Carregando usuários...
          </p>
        ) : (query.data?.usuarios.length ?? 0) === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nenhum usuário encontrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Aluno</th>
                  <th className="px-4 py-3 font-medium">Instituição</th>
                  <th className="px-4 py-3 font-medium">Tipo de plano</th>
                  <th className="px-4 py-3 font-medium">Acesso</th>
                  <th className="px-4 py-3 font-medium">Último acesso</th>
                  <th className="px-4 py-3 font-medium">Simulados</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {query.data?.usuarios.map((u) => (
                  <tr
                    key={u.user_id}
                    onClick={() => setAberto(u.user_id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1.5 font-medium text-card-foreground">
                        {u.nome || "(sem nome)"}
                        {u.is_admin && <ShieldCheck className="size-3.5 text-success" />}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      {!u.cadastro_completo && (
                        <p className="text-[11px] font-medium text-destructive">
                          Cadastro incompleto
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-card-foreground">{u.instituicao ?? "—"}</td>
                    <td className="px-4 py-3 text-card-foreground">{planoDaLinha(u)}</td>
                    <td className="px-4 py-3">
                      <SeloAcesso
                        plano={u.plano}
                        validade={u.plano_validade}
                        ativo={u.acesso_ativo}
                        isAdmin={u.is_admin}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {dataHora(u.ultimo_acesso)}
                    </td>
                    <td className="px-4 py-3 text-card-foreground">{u.simulados}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <Pencil className="size-3.5" /> Ver / editar
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {paginas > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" /> Anterior
            </button>
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <button
              type="button"
              disabled={pagina + 1 >= paginas}
              onClick={() => setPagina((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Próxima <ChevronRight className="size-3.5" />
            </button>
          </div>
        )}
      </section>

      <Dialog open={Boolean(aberto)} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {aberto && <DetalheUsuario key={aberto} token={token} userId={aberto} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeloAcesso({
  plano,
  validade,
  ativo,
  isAdmin,
}: {
  plano: string;
  validade: string | null;
  ativo: boolean;
  isAdmin: boolean;
}) {
  const [texto, classe] = ativo
    ? [`Até ${formatarDataBR(validade)}`, "bg-success/15 text-success"]
    : isAdmin
      ? ["Admin (liberado)", "bg-info/15 text-info"]
      : plano === "inativo"
        ? ["Bloqueado", "bg-destructive/15 text-destructive"]
        : (plano === "mensal" || plano === "anual") && validade
          ? [`Venceu ${formatarDataBR(validade)}`, "bg-destructive/15 text-destructive"]
          : ["Só teste grátis", "bg-muted text-muted-foreground"];
  return (
    <span className={cn("inline-block rounded px-2 py-0.5 text-[11px] font-semibold", classe)}>
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------------
// Detalhe de um usuário: dados do cadastro, plano, pedidos e últimos simulados
// ---------------------------------------------------------------------
function DetalheUsuario({ token, userId }: { token: string; userId: string }) {
  const carregar = useServerFn(detalheUsuario);
  const query = useQuery({
    queryKey: ["admin", "usuario", userId],
    queryFn: () => carregar({ data: { token, userId } }),
  });

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
      </p>
    );
  }
  const tentarDeNovo = (
    <button
      type="button"
      onClick={() => void query.refetch()}
      disabled={query.isFetching}
      className="font-semibold text-primary underline underline-offset-2 disabled:opacity-50"
    >
      {query.isFetching ? "Carregando..." : "Tentar de novo"}
    </button>
  );
  // Tela de erro só quando ainda não há dados. Se uma nova busca falhar com a ficha já
  // carregada, ela continua montada (com o diálogo de venda aberto e a chave da venda).
  if (!query.data) {
    return (
      <div className="space-y-2 p-6 text-sm">
        <p className="text-destructive">{mensagemErro(query.error)}</p>
        <p>{tentarDeNovo}</p>
      </div>
    );
  }
  const u = query.data;

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserRound className="size-5 text-primary" />
          {u.nome || "(sem nome)"}
          {u.isAdmin && (
            <span className="rounded bg-info/15 px-2 py-0.5 text-[11px] font-semibold text-info">
              Admin
            </span>
          )}
        </DialogTitle>
        <DialogDescription>{u.email}</DialogDescription>
      </DialogHeader>

      {query.isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível atualizar a ficha: {mensagemErro(query.error)} {tentarDeNovo}
        </p>
      )}

      <DadosCadastro token={token} usuario={u} />
      {/* Recomeça o formulário sempre que o acesso gravado mudar (pagamento, venda, ajuste) */}
      <PlanoAcesso key={`${u.plano}|${u.planoValidade ?? ""}`} token={token} usuario={u} />
      <PedidosPagamentos token={token} usuario={u} />

      <section>
        <h3 className="text-sm font-semibold text-card-foreground">Últimos simulados</h3>
        {u.simulados.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Nenhum simulado realizado.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-xs">
            {u.simulados.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/40 px-3 py-2"
              >
                <span className="font-medium text-card-foreground">
                  {nomeProva(s.tipo)} · {dataHora(s.iniciado_em)}
                </span>
                <span className="text-muted-foreground">
                  {s.status === "finalizado"
                    ? `${s.acertos ?? 0}/${s.total_questoes} · ${s.aprovado ? "aprovado" : "reprovado"}`
                    : s.status === "em_andamento"
                      ? "em andamento"
                      : "abandonado"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Usuario = Awaited<ReturnType<typeof detalheUsuario>>;

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <p className="text-sm text-card-foreground">{valor}</p>
    </div>
  );
}

function DadosCadastro({ token, usuario: u }: { token: string; usuario: Usuario }) {
  const salvar = useServerFn(atualizarCadastroUsuario);
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(u.nome);
  const [cpf, setCpf] = useState(u.cpf ? formatarCpf(u.cpf) : "");
  const [cnpj, setCnpj] = useState(u.cnpj ? formatarCnpj(u.cnpj) : "");
  const [instituicao, setInstituicao] = useState(u.instituicao ?? "");

  const cpfInvalido = cpf.replace(/\D/g, "").length === 11 && !cpfValido(cpf);
  const cnpjInvalido = cnpj.replace(/\D/g, "").length === 14 && !cnpjValido(cnpj);

  const mut = useMutation({
    mutationFn: () =>
      salvar({ data: { token, userId: u.id, nome, cpf, cnpj: cnpj || null, instituicao } }),
    onSuccess: async () => {
      toast.success("Dados do cadastro atualizados.");
      setEditando(false);
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuario", u.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">Dados do cadastro</h3>
        {!editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Pencil className="size-3.5" /> Editar
          </button>
        )}
      </div>

      {!editando ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Info rotulo="Nome completo" valor={u.nome || "—"} />
          <Info rotulo="CPF" valor={u.cpf ? formatarCpf(u.cpf) : "Não informado"} />
          <Info rotulo="CNPJ" valor={u.cnpj ? formatarCnpj(u.cnpj) : "Não informado"} />
          <Info rotulo="Instituição" valor={u.instituicao ?? "Não informada"} />
          <Info
            rotulo="E-mail"
            valor={`${u.email ?? "—"}${u.emailConfirmado ? "" : " (não confirmado)"}`}
          />
          <Info rotulo="Forma de login" valor={u.provedores.map(provedorLabel).join(", ")} />
          <Info rotulo="Conta criada em" valor={dataHora(u.criadoEm)} />
          <Info
            rotulo="Cadastro completo em"
            valor={u.cadastroCompleto ? dataHora(u.cadastroCompletoEm) : "Ainda não completou"}
          />
          <Info rotulo="Último acesso" valor={dataHora(u.ultimoAcesso)} />
          <Info rotulo="Teste grátis" valor={u.gratuidadeUsada ? "Já utilizado" : "Disponível"} />
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="mt-3 space-y-3"
        >
          <label className="block text-xs text-muted-foreground">
            Nome completo
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              CPF
              <input
                required
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
                className={`mt-1 ${inputClass}`}
              />
              {cpfInvalido && <span className="text-destructive">CPF inválido.</span>}
            </label>
            <label className="block text-xs text-muted-foreground">
              CNPJ (opcional)
              <input
                value={cnpj}
                onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                className={`mt-1 ${inputClass}`}
              />
              {cnpjInvalido && <span className="text-destructive">CNPJ inválido.</span>}
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            Instituição
            <input
              required
              value={instituicao}
              onChange={(e) => setInstituicao(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Trocar o CPF também troca o controle do teste grátis desta conta.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mut.isPending || cpfInvalido || cnpjInvalido}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
            >
              {mut.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Salvar dados
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function PlanoAcesso({ token, usuario: u }: { token: string; usuario: Usuario }) {
  const salvar = useServerFn(atualizarPlano);
  const queryClient = useQueryClient();
  const [plano, setPlano] = useState<Plano>(u.plano as Plano);
  const [validade, setValidade] = useState(u.planoValidade ?? "");
  const [confirmaPerda, setConfirmaPerda] = useState(false);

  const pago = (PLANOS_PAGOS as readonly string[]).includes(plano);
  const hoje = hojeSaoPaulo();
  const alterado = plano !== u.plano || (pago && validade !== (u.planoValidade ?? ""));
  // Grátis ou Bloqueado apagam a validade e o nome do plano comprado (o banco grava null)
  const apagaAcesso = u.acessoAtivo && !pago;
  // Bloquear também cancela os pedidos aguardando pagamento
  const bloqueando = plano === "inativo" && u.plano !== "inativo";
  // Trocar Mensal por Anual (ou o contrário) mantém a data, mas apaga o nome do plano comprado
  const perdeNome = pago && plano !== u.plano && Boolean(u.planoNome);

  function escolherPlano(p: Plano) {
    setPlano(p);
    setConfirmaPerda(false);
  }

  function estender(tipo: "dias" | "meses", n: number) {
    // Mesma regra dos pedidos (novaValidade): começa no dia seguinte ao fim do
    // acesso atual, se ele ainda vale, ou hoje, que já conta como o 1º dia.
    // Com Grátis/Bloqueado no select, o "acesso atual" é o gravado, não o do formulário:
    // desistir do bloqueio clicando em Estender não pode encurtar um acesso que ainda vale.
    setValidade(
      pago
        ? novaValidade(plano, validade || null, n, tipo, hoje)
        : novaValidade(u.plano, u.planoValidade, n, tipo, hoje),
    );
    if (!pago) {
      // Volta ao plano gravado se ele ainda vale (não troca um Anual ativo por Mensal,
      // o que apagaria o nome do plano comprado)
      const gravadoPago = (PLANOS_PAGOS as readonly string[]).includes(u.plano);
      escolherPlano(
        gravadoPago && u.acessoAtivo
          ? (u.plano as Plano)
          : tipo === "meses" && n >= 12
            ? "anual"
            : "mensal",
      );
    }
  }

  const mut = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          token,
          userId: u.id,
          plano,
          validade: pago ? validade || null : null,
          // O que a ficha mostrava ao abrir: o servidor recusa se o acesso mudou no meio
          planoEsperado: u.plano,
          validadeEsperada: u.planoValidade,
        },
      }),
    onSuccess: async (r) => {
      toast.success(`Plano atualizado.${avisoCancelados(r.pedidosCancelados)}`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuario", u.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuarios"] });
      if (r.pedidosCancelados.length > 0) {
        await queryClient.invalidateQueries({ queryKey: ["admin", "pedidos"] });
      }
    },
    onError: async (e) => {
      const msg = mensagemErro(e);
      toast.error(
        msg.includes("mudou desde que a ficha foi aberta")
          ? "O acesso deste aluno mudou enquanto a ficha estava aberta (por exemplo, um pagamento confirmado). A ficha foi atualizada com os dados novos: confira e, se ainda precisar, salve de novo."
          : msg,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuario", u.id] });
    },
  });

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">Plano e prazo de acesso</h3>
        <div className="flex flex-wrap items-center gap-2">
          {u.planoNome && (
            <span className="text-xs text-muted-foreground">
              Plano comprado:{" "}
              <strong className="font-semibold text-card-foreground">{u.planoNome}</strong>
            </span>
          )}
          <SeloAcesso
            plano={u.plano}
            validade={u.planoValidade}
            ativo={u.acessoAtivo}
            isAdmin={u.isAdmin}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          Plano
          <select
            value={plano}
            onChange={(e) => escolherPlano(e.target.value as Plano)}
            className={`mt-1 ${inputClass}`}
          >
            {PLANOS.map((p) => (
              <option key={p} value={p}>
                {PLANO_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Acesso válido até (inclusive)
          <input
            type="date"
            value={pago ? validade : ""}
            disabled={!pago}
            onChange={(e) => setValidade(e.target.value)}
            className={`mt-1 ${inputClass} disabled:opacity-50`}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarPlus className="size-3.5" /> Estender:
        </span>
        {(
          [
            ["+30 dias", "dias", 30],
            ["+3 meses", "meses", 3],
            ["+6 meses", "meses", 6],
            ["+1 ano", "meses", 12],
          ] as const
        ).map(([rotulo, tipo, n]) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => estender(tipo, n)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-card-foreground hover:bg-accent"
          >
            {rotulo}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Estender soma a partir do fim do acesso atual, se ele ainda vale; se não, a partir de hoje,
        que já conta como o 1º dia (ex.: +30 dias hoje vai até{" "}
        {formatarDataBR(novaValidade(null, null, 30, "dias", hoje))}).
      </p>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {pago
          ? "Com plano mensal ou anual, o aluno faz todos os simulados até a data escolhida. Depois dela, volta a ter só o teste grátis."
          : plano === "inativo"
            ? "Bloqueado: o aluno não faz nenhum simulado além do teste grátis. O prazo de acesso atual é apagado; ao desbloquear, informe a data de novo (a data antiga fica no Histórico de acesso)."
            : "Sem plano: o aluno faz apenas o teste grátis. Se havia prazo de acesso, ele é apagado."}
        {perdeNome &&
          ` O nome do plano comprado (${u.planoNome}) deixa de aparecer, porque o tipo de plano muda.`}
        {u.isAdmin &&
          " Administradores têm todos os simulados liberados, independentemente do plano."}
      </p>

      {(apagaAcesso || bloqueando) && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-card-foreground">
          {apagaAcesso && (
            <p>
              <strong className="text-destructive">Atenção:</strong> a validade atual (
              <strong>{formatarDataBR(u.planoValidade)}</strong>) e o nome do plano comprado
              {u.planoNome ? ` (${u.planoNome})` : ""} serão apagados.{" "}
              {plano === "inativo"
                ? "Ao desbloquear, será preciso informar a data de novo."
                : "Para devolver o acesso depois, será preciso informar a data de novo."}{" "}
              A data antiga fica registrada no Histórico de acesso, mais abaixo.
            </p>
          )}
          {bloqueando && (
            <p className={cn(apagaAcesso && "mt-1.5")}>
              Os pedidos deste aluno que estão aguardando pagamento serão cancelados, para que ele
              não pague por um acesso bloqueado.
            </p>
          )}
          {apagaAcesso && (
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={confirmaPerda}
                onChange={(e) => setConfirmaPerda(e.target.checked)}
                className="size-4 accent-primary"
              />
              Confirmo: apagar a validade atual e salvar como “{PLANO_LABEL[plano]}”
            </label>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={
            !alterado || mut.isPending || (pago && !validade) || (apagaAcesso && !confirmaPerda)
          }
          onClick={() => mut.mutate()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          {mut.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Salvar plano
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Pedidos, histórico de acesso e venda registrada pelo admin
// ---------------------------------------------------------------------
const COR_PEDIDO: Record<StatusPedido, string> = {
  pendente: "bg-primary/15 text-primary",
  pago: "bg-success/15 text-success",
  cancelado: "bg-muted text-muted-foreground",
  expirado: "bg-muted text-muted-foreground",
  estornado: "bg-destructive/15 text-destructive",
};

const ORIGEM_HISTORICO: Record<"pedido" | "estorno" | "admin", string> = {
  pedido: "Pedido",
  estorno: "Estorno",
  admin: "Ajuste do admin",
};

const PLANO_CURTO: Record<Plano, string> = {
  gratis: "Grátis",
  mensal: "Mensal",
  anual: "Anual",
  inativo: "Bloqueado",
};

function planoCurto(p: string | null) {
  if (!p) return "—";
  return PLANO_CURTO[p as Plano] ?? p;
}

// Chave da venda guardada na aba (sessionStorage): sobrevive a fechar e reabrir a ficha
// ou recarregar a página. Vale só para esta aba; em outra aba ou aparelho, só a lista de
// pedidos atualizada protege contra registrar a mesma venda duas vezes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lerChaveVenda(userId: string): string | null {
  try {
    const v = sessionStorage.getItem(`venda:${userId}`);
    return v && UUID_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

function gravarChaveVenda(userId: string, chave: string | null) {
  try {
    if (chave) sessionStorage.setItem(`venda:${userId}`, chave);
    else sessionStorage.removeItem(`venda:${userId}`);
  } catch {
    // Sem sessionStorage (modo privado, bloqueado): a chave fica só na memória
  }
}

/**
 * Falha sem resposta do servidor ou do banco (rede, Worker fora do ar, tempo esgotado).
 * Nesses casos a venda pode ter sido gravada; os erros do banco (RAISE) e da validação
 * chegam como mensagem própria e não passam por aqui.
 */
function falhaSemResposta(e: unknown) {
  if (!(e instanceof Error) || e instanceof TypeError || e.name === "AbortError") return true;
  const msg = mensagemErro(e);
  return (
    msg.trim() === "" ||
    /failed to fetch|fetch failed|fetcherror|networkerror|network ?error|network request failed|load failed|timed? ?out|aborted|econn|socket|upstream|bad gateway|service unavailable|internal server error|worker|<!doctype|<html/i.test(
      msg,
    )
  );
}

function PedidosPagamentos({ token, usuario: u }: { token: string; usuario: Usuario }) {
  const carregar = useServerFn(pedidosDoUsuario);
  const [vendaAberta, setVendaAberta] = useState(false);
  // Refaz a busca dos pedidos ao abrir a venda: o aviso do pedido pendente não usa lista antiga
  const [conferindoPedidos, setConferindoPedidos] = useState(false);
  // Chave da venda: criada ao abrir o diálogo e mantida (também na aba) até a venda
  // terminar. Se a resposta de uma tentativa se perder, a nova tentativa não registra a
  // venda duas vezes. Não é apagada ao fechar o diálogo nem quando a tentativa dá erro.
  const [chaveVenda, setChaveVenda] = useState<string | null>(() => lerChaveVenda(u.id));
  const query = useQuery({
    queryKey: ["admin", "usuario", u.id, "pedidos"],
    queryFn: () => carregar({ data: { token, userId: u.id } }),
  });

  function abrirVenda() {
    if (!chaveVenda) {
      const nova = crypto.randomUUID();
      setChaveVenda(nova);
      gravarChaveVenda(u.id, nova);
    }
    setVendaAberta(true);
    setConferindoPedidos(true);
    void query.refetch().finally(() => setConferindoPedidos(false));
  }

  const pedidos = query.data?.pedidos ?? [];
  const historico = query.data?.historico ?? [];
  const pendenteCodigo = query.data?.pendenteCodigo ?? null;
  // Pagamento já recebido num pedido que não liberou acesso: libera com ele, não registra outra venda
  const recebido = pedidos.find(
    (p) =>
      p.status !== "pago" &&
      p.status !== "estornado" &&
      p.pagamentos.some((g) => g.status === "pago"),
  );

  // A chave guardada já foi usada por uma venda que aparece na lista: descarta
  useEffect(() => {
    if (!chaveVenda) return;
    const usada = query.data?.pedidos.find((p) => p.chaveVenda === chaveVenda);
    if (!usada) return;
    setChaveVenda(null);
    gravarChaveVenda(u.id, null);
    if (vendaAberta) {
      setVendaAberta(false);
      toast.info(`A venda ${usada.codigo} já foi registrada. Confira a lista de pedidos.`);
    }
  }, [query.data, chaveVenda, vendaAberta, u.id]);

  const impedimento =
    u.plano === "inativo"
      ? "Conta bloqueada: para registrar uma venda, primeiro tire o bloqueio em “Plano e prazo de acesso”."
      : !u.cpf
        ? "Cadastro incompleto: informe o CPF do aluno em “Dados do cadastro” antes de registrar uma venda."
        : recebido
          ? `O pedido ${recebido.codigo} já tem um pagamento recebido. Use “Liberar acesso com este pagamento” em Planos e pagamentos em vez de registrar outra venda.`
          : null;

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
          <Receipt className="size-4 text-primary" /> Pedidos e pagamentos
        </h3>
        <button
          type="button"
          // Só com a lista de pedidos carregada: o admin precisa ver se há pedido pendente
          disabled={Boolean(impedimento) || !query.isSuccess}
          onClick={abrirVenda}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-50"
        >
          <HandCoins className="size-3.5" /> Registrar venda
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        “Registrar venda” serve para vendas combinadas por fora do site (paga pela empresa, por
        transferência sem pedido no site etc.). O acesso é liberado assim que você confirma.
      </p>
      {impedimento && (
        <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {impedimento}
        </p>
      )}

      {query.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" /> Carregando pedidos...
        </p>
      ) : query.isError ? (
        <div className="mt-3 text-xs text-destructive">
          <p>{mensagemErro(query.error)}</p>
          <p className="mt-1">
            Sem a lista de pedidos não é possível registrar uma venda.{" "}
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="font-semibold text-primary underline underline-offset-2 disabled:opacity-50"
            >
              {query.isFetching ? "Carregando..." : "Tentar de novo"}
            </button>
          </p>
        </div>
      ) : (
        <>
          <h4 className="mt-4 text-xs font-semibold text-card-foreground">Pedidos</h4>
          {pedidos.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">Nenhum pedido deste aluno.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5 text-xs">
              {pedidos.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    "rounded-md px-3 py-2",
                    p.status === "pendente"
                      ? "border border-primary/50 bg-primary/10"
                      : "bg-secondary/40",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono font-semibold text-card-foreground">
                        {p.codigo}
                      </span>
                      <span className="text-card-foreground">{p.planoNome}</span>
                      <span className="text-muted-foreground">· {formatarReais(p.valorTotal)}</span>
                      <span className="text-muted-foreground">· {dataCurta(p.criadoEm)}</span>
                      {p.status === "pago" && (
                        <span className="font-medium text-success">
                          · até {formatarDataBR(p.validadeConcedida)}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {p.teste && (
                        <span className="rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-info">
                          Teste
                        </span>
                      )}
                      {p.precisaRevisao && (
                        <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          Precisa de revisão
                        </span>
                      )}
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-semibold",
                          COR_PEDIDO[p.status],
                        )}
                      >
                        {STATUS_PEDIDO_LABEL[p.status]}
                      </span>
                    </span>
                  </div>

                  {p.status === "pendente" ? (
                    <p className="mt-1.5 font-medium text-card-foreground">
                      Aguardando pagamento — confirme em{" "}
                      <Link
                        to="/admin/pagamentos"
                        className="font-semibold text-primary underline underline-offset-2"
                      >
                        Planos e pagamentos
                      </Link>
                      {p.expiraEm && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · prazo para pagar: {dataHora(p.expiraEm)}
                        </span>
                      )}
                    </p>
                  ) : p.status === "pago" ? (
                    <p className="mt-0.5 text-muted-foreground">
                      {p.metodo ? METODO_PAGAMENTO_LABEL[p.metodo] : "Forma não informada"}
                      {p.origem === "admin" ? " · venda registrada pelo admin" : ""}
                    </p>
                  ) : p.status === "estornado" ? (
                    <p className="mt-0.5 text-muted-foreground">
                      {p.acessoRemovido ? "Dias de acesso retirados" : "Acesso mantido"}
                      {p.motivoEstorno ? ` · ${p.motivoEstorno}` : ""}
                    </p>
                  ) : p.motivoCancelamento ? (
                    <p className="mt-0.5 text-muted-foreground">{p.motivoCancelamento}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h4 className="mt-4 flex items-center gap-1 text-xs font-semibold text-card-foreground">
            <History className="size-3.5 text-muted-foreground" /> Histórico de acesso
          </h4>
          {historico.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Nenhuma mudança de acesso registrada.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5 text-xs">
              {historico.map((h) => (
                <li key={h.id} className="rounded-md bg-secondary/40 px-3 py-2">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-card-foreground">
                      {ORIGEM_HISTORICO[h.origem]}
                    </span>{" "}
                    · {dataHora(h.criadoEm)}
                  </p>
                  <p className="mt-0.5 text-card-foreground">
                    {planoCurto(h.planoAntes)} até {formatarDataBR(h.validadeAntes)} →{" "}
                    {planoCurto(h.planoDepois)} até {formatarDataBR(h.validadeDepois)}
                  </p>
                  {h.observacao && <p className="mt-0.5 text-muted-foreground">{h.observacao}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={vendaAberta} onOpenChange={setVendaAberta}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card text-card-foreground sm:max-w-lg">
          {vendaAberta && chaveVenda && (
            <RegistrarVenda
              token={token}
              usuario={u}
              impedimento={impedimento}
              chave={chaveVenda}
              pendenteCodigo={pendenteCodigo}
              conferindoPedidos={conferindoPedidos || query.isFetching}
              erroPedidos={query.isError ? mensagemErro(query.error) : null}
              aoFechar={() => setVendaAberta(false)}
              aoConcluir={() => {
                setVendaAberta(false);
                setChaveVenda(null);
                gravarChaveVenda(u.id, null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RegistrarVenda({
  token,
  usuario: u,
  impedimento,
  chave,
  pendenteCodigo,
  conferindoPedidos,
  erroPedidos,
  aoFechar,
  aoConcluir,
}: {
  token: string;
  usuario: Usuario;
  impedimento: string | null;
  /** Mesma chave em cada nova tentativa: o servidor não registra a venda duas vezes */
  chave: string;
  /** Código do pedido aguardando pagamento que a ficha mostra (a venda vai substituí-lo) */
  pendenteCodigo: string | null;
  /** A lista de pedidos está sendo buscada de novo */
  conferindoPedidos: boolean;
  erroPedidos: string | null;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const listar = useServerFn(listarPlanosAdmin);
  const registrar = useServerFn(registrarVenda);
  const queryClient = useQueryClient();
  const hoje = hojeSaoPaulo();
  const [planoId, setPlanoId] = useState("");
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState<MetodoPagamento>("pix");
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [comprador, setComprador] = useState<"cpf" | "cnpj">("cpf");
  const [observacao, setObservacao] = useState("");
  const [aceitarDiferente, setAceitarDiferente] = useState(false);

  const planosQuery = useQuery({
    queryKey: ["admin", "planos"],
    queryFn: () => listar({ data: { token } }),
  });
  const planos = planosQuery.data?.planos ?? [];
  const plano = planos.find((p) => p.id === planoId);

  const valorCentavos = reaisParaCentavos(valor);
  const valorOk = valorCentavos !== null && valorCentavos > 0;
  // Valor diferente do preço do plano: exige confirmação e explicação (o banco confere de novo)
  const preco = plano?.precoCentavos ?? 0;
  const diferente = Boolean(plano) && valorOk && preco > 0 && valorCentavos !== preco;
  const menor = diferente && (valorCentavos ?? 0) < preco;
  const muitoDiferente =
    diferente && ((valorCentavos ?? 0) >= preco * 2 || (valorCentavos ?? 0) * 2 <= preco);
  const obsSuficiente = observacao.trim().length >= 5;
  const dataOk =
    /^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) &&
    dataPagamento <= hoje &&
    dataPagamento >= "2024-01-01";
  const validadeNova = plano
    ? novaValidade(u.plano, u.planoValidade, plano.duracaoQuantidade, plano.duracaoUnidade, hoje)
    : null;
  const acessoAtual = u.acessoAtivo
    ? `${nomeDoPlano(u.plano, u.planoNome)} até ${formatarDataBR(u.planoValidade)}`
    : (u.plano === "mensal" || u.plano === "anual") && u.planoValidade
      ? `vencido em ${formatarDataBR(u.planoValidade)}`
      : "sem plano pago";

  async function atualizarFicha() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "usuario", u.id] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "usuarios"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "pedidos"] }),
      // Preço do plano pode ter mudado em outra janela: com o preço novo, a tela mostra a
      // confirmação de valor diferente que o banco passou a exigir
      queryClient.invalidateQueries({ queryKey: ["admin", "planos"] }),
    ]);
  }

  const mut = useMutation({
    // Recebe o pedido pendente que a ficha mostrava ao confirmar
    mutationFn: (pendenteEsperado: string | null) => {
      if (!plano || valorCentavos === null) throw new Error("Preencha os dados da venda.");
      return registrar({
        data: {
          token,
          userId: u.id,
          planoId: plano.id,
          metodo,
          valorCentavos,
          data: dataPagamento,
          comprador,
          observacao: observacao.trim(),
          chave,
          pendenteEsperado,
          aceitarValorDiferente: diferente && aceitarDiferente,
        },
      });
    },
    onSuccess: async (r, pendenteEsperado) => {
      const ate = r.validade ? ` Acesso até ${formatarDataBR(r.validade)}.` : "";
      if (r.situacao === "ja_registrado") {
        // A tentativa anterior já tinha gravado a venda (a resposta se perdeu)
        toast.warning(
          `Esta venda já tinha sido registrada${r.codigo ? ` (${r.codigo})` : ""}. Nada foi registrado de novo.${ate}`,
        );
      } else if (r.situacao === "revisao") {
        toast.warning(
          `Venda ${r.codigo ?? ""} registrada, mas o pagamento ficou para revisão em Planos e pagamentos.`,
        );
      } else {
        const cancelados = [
          ...new Set([
            ...(pendenteEsperado ? [pendenteEsperado] : []),
            ...(r.pedidos_cancelados ?? []),
          ]),
        ];
        toast.success(`Venda ${r.codigo ?? ""} registrada.${ate}${avisoCancelados(cancelados)}`);
      }
      if (r.alerta) toast.warning(r.alerta);
      aoConcluir();
      await atualizarFicha();
    },
    onError: async (e) => {
      if (falhaSemResposta(e)) {
        toast.error(
          "A resposta não chegou; a venda pode ter sido registrada. Confira a lista de pedidos antes de tentar de novo — se tentar nesta mesma janela, ela não será registrada duas vezes.",
          { duration: 12000 },
        );
      } else {
        toast.error(mensagemErro(e));
      }
      // A venda desta janela foi estornada: descarta a chave (abrir de novo gera outra)
      if (mensagemErro(e).includes("foi estornada")) aoConcluir();
      // Mostra o estado real (a venda pode ter sido gravada) e o preço atual dos planos
      // antes de tentar de novo. A chave da venda continua a mesma.
      await atualizarFicha();
    },
  });

  function escolherPlano(id: string) {
    setPlanoId(id);
    setAceitarDiferente(false);
    const escolhido = planos.find((p) => p.id === id);
    setValor(
      escolhido && escolhido.precoCentavos > 0 ? centavosParaTexto(escolhido.precoCentavos) : "",
    );
  }

  const podeConfirmar =
    !impedimento &&
    Boolean(plano) &&
    valorOk &&
    dataOk &&
    !mut.isPending &&
    !conferindoPedidos &&
    !erroPedidos &&
    (!diferente || (aceitarDiferente && obsSuficiente));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (podeConfirmar) mut.mutate(pendenteCodigo);
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HandCoins className="size-5 text-primary" /> Registrar venda
        </DialogTitle>
        <DialogDescription>
          Para vendas combinadas por fora do site, como plano pago pela empresa ou por transferência
          sem pedido. Ao confirmar, o acesso de {u.nome || "este aluno"} é liberado na hora.
        </DialogDescription>
      </DialogHeader>

      {impedimento && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {impedimento}
        </p>
      )}
      {erroPedidos ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Não foi possível conferir os pedidos do aluno: {erroPedidos} Feche esta janela e tente de
          novo.
        </p>
      ) : conferindoPedidos ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" /> Conferindo os pedidos do
          aluno...
        </p>
      ) : (
        pendenteCodigo && (
          <p className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-xs text-card-foreground">
            O pedido <span className="font-mono font-semibold">{pendenteCodigo}</span> está
            aguardando pagamento e será cancelado ao registrar esta venda. Se o aluno pagou esse
            pedido, confirme o pagamento em{" "}
            <Link
              to="/admin/pagamentos"
              className="font-semibold text-primary underline underline-offset-2"
            >
              Planos e pagamentos
            </Link>{" "}
            em vez de registrar uma venda nova.
          </p>
        )
      )}

      <label className="block text-xs text-muted-foreground">
        Plano vendido
        <select
          required
          value={planoId}
          onChange={(e) => escolherPlano(e.target.value)}
          disabled={planosQuery.isPending}
          className={`mt-1 ${inputClass} disabled:opacity-50`}
        >
          <option value="">
            {planosQuery.isPending ? "Carregando planos..." : "Escolha o plano"}
          </option>
          {planos.map((p) => (
            <option key={p.id} value={p.id}>
              {`${p.nome} — ${descreverDuracao(p.duracaoQuantidade, p.duracaoUnidade)} · ${formatarReais(p.precoCentavos)}${p.ativo ? "" : " (desativado)"}`}
            </option>
          ))}
        </select>
        {planosQuery.isError && (
          <span className="text-destructive">{mensagemErro(planosQuery.error)}</span>
        )}
        {planosQuery.isSuccess && planos.length === 0 && (
          <span className="text-destructive">
            Nenhum plano cadastrado. Crie um em Planos e pagamentos.
          </span>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          Valor recebido (R$)
          <input
            required
            inputMode="decimal"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setAceitarDiferente(false);
            }}
            placeholder="Ex.: 49,90"
            className={`mt-1 ${inputClass}`}
          />
          {valor.trim() !== "" && !valorOk && (
            <span className="text-destructive">Informe um valor maior que zero, ex.: 49,90.</span>
          )}
        </label>
        <label className="block text-xs text-muted-foreground">
          Forma de pagamento
          <select
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}
            className={`mt-1 ${inputClass}`}
          >
            {METODOS_PAGAMENTO.map((m) => (
              <option key={m} value={m}>
                {METODO_PAGAMENTO_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {diferente && plano && valorCentavos !== null && (
        <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-xs text-card-foreground">
          <p>
            O valor recebido (<strong>{formatarReais(valorCentavos)}</strong>) é{" "}
            {menor ? "menor" : "maior"} que o preço do plano {plano.nome} (
            <strong>{formatarReais(plano.precoCentavos)}</strong>).
          </p>
          {muitoDiferente && (
            <p className="mt-1 font-medium text-destructive">
              A diferença é grande: confira se o valor foi digitado certo.
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={aceitarDiferente}
              onChange={(e) => setAceitarDiferente(e.target.checked)}
              className="size-4 accent-primary"
            />
            Confirmo o valor diferente do preço do plano
          </label>
          <p className="mt-1 text-muted-foreground">
            {aceitarDiferente
              ? "Explique o motivo na observação (desconto, negociação etc.)."
              : "Sem marcar esta opção não é possível registrar a venda com este valor."}
          </p>
        </div>
      )}

      <label className="block text-xs text-muted-foreground">
        Data do pagamento
        <input
          type="date"
          required
          value={dataPagamento}
          min="2024-01-01"
          max={hoje}
          onChange={(e) => setDataPagamento(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
        {!dataOk && (
          <span className="text-destructive">Informe uma data válida, que não seja no futuro.</span>
        )}
      </label>

      <fieldset className="space-y-1.5 text-xs text-muted-foreground">
        <legend className="mb-1">Comprar em nome de</legend>
        <label className="flex items-center gap-2 text-card-foreground">
          <input
            type="radio"
            name="comprador"
            checked={comprador === "cpf"}
            onChange={() => setComprador("cpf")}
          />
          CPF {mascararDocumento(u.cpf)} ({u.nome || "aluno"})
        </label>
        {u.cnpj && (
          <label className="flex items-center gap-2 text-card-foreground">
            <input
              type="radio"
              name="comprador"
              checked={comprador === "cnpj"}
              onChange={() => setComprador("cnpj")}
            />
            CNPJ {mascararDocumento(u.cnpj)}
            {u.instituicao ? ` (${u.instituicao})` : ""}
          </label>
        )}
      </fieldset>

      <label className="block text-xs text-muted-foreground">
        Observação {diferente ? "(obrigatória)" : "(opcional)"}
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={
            diferente
              ? "Ex.: desconto de 10% combinado com a empresa X"
              : "Ex.: pago pela empresa X, nota fiscal 123"
          }
          className={`mt-1 ${inputClass} resize-y`}
        />
        {diferente && aceitarDiferente && !obsSuficiente && (
          <span className="mt-1 block text-destructive">
            Explique na observação por que o valor é diferente (pelo menos 5 caracteres).
          </span>
        )}
      </label>

      <div className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-card-foreground">
        {plano && validadeNova ? (
          <>
            <p>
              Acesso atual: <strong>{acessoAtual}</strong> → vai até{" "}
              <strong className="text-success">{formatarDataBR(validadeNova)}</strong>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {u.acessoAtivo
                ? "Os dias do plano são somados ao fim do acesso atual."
                : "O prazo começa hoje, e o dia de hoje já conta como o 1º dia."}
              {u.isAdmin && " Esta conta é de administrador: a venda fica marcada como teste."}
            </p>
          </>
        ) : (
          <p>
            Acesso atual: <strong>{acessoAtual}</strong>. Escolha o plano para ver até quando o
            acesso vai.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!podeConfirmar}
          title={conferindoPedidos ? "Aguarde a conferência dos pedidos do aluno." : undefined}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-50"
        >
          {mut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <HandCoins className="size-4" />
          )}
          Confirmar venda e liberar acesso
        </button>
      </div>
    </form>
  );
}
