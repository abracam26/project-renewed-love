import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
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
  formatarDataBR,
  hojeSaoPaulo,
  PLANO_LABEL,
  PLANOS,
  PLANOS_PAGOS,
  somarDias,
  somarMeses,
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
 * Painel /admin/usuarios: busca, filtros, dados de cadastro de cada aluno e
 * edição de plano e prazo de acesso.
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

function provedorLabel(p: string) {
  return p === "google" ? "Google" : p === "email" ? "E-mail e senha" : p;
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
                  <th className="px-4 py-3 font-medium">Plano</th>
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
                    <td className="px-4 py-3 text-card-foreground">
                      {PLANO_LABEL[u.plano as Plano] ?? u.plano}
                    </td>
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
// Detalhe de um usuário: dados do cadastro, plano e últimos simulados
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
  if (query.isError || !query.data) {
    return <p className="p-6 text-sm text-destructive">{mensagemErro(query.error)}</p>;
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

      <DadosCadastro token={token} usuario={u} />
      <PlanoAcesso token={token} usuario={u} />

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

  const pago = (PLANOS_PAGOS as readonly string[]).includes(plano);
  const hoje = hojeSaoPaulo();
  const alterado = plano !== u.plano || (pago && validade !== (u.planoValidade ?? ""));

  function estender(tipo: "dias" | "meses", n: number) {
    // Estende a partir da validade atual (se ainda vale) ou de hoje
    const base = validade && validade >= hoje ? validade : hoje;
    setValidade(tipo === "dias" ? somarDias(base, n) : somarMeses(base, n));
    if (!pago) setPlano(tipo === "meses" && n >= 12 ? "anual" : "mensal");
  }

  const mut = useMutation({
    mutationFn: () =>
      salvar({ data: { token, userId: u.id, plano, validade: pago ? validade || null : null } }),
    onSuccess: async () => {
      toast.success("Plano atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuario", u.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">Plano e prazo de acesso</h3>
        <SeloAcesso
          plano={u.plano}
          validade={u.planoValidade}
          ativo={u.acessoAtivo}
          isAdmin={u.isAdmin}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          Plano
          <select
            value={plano}
            onChange={(e) => setPlano(e.target.value as Plano)}
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

      <p className="mt-2 text-[11px] text-muted-foreground">
        {pago
          ? "Com plano mensal ou anual, o aluno faz todos os simulados até a data escolhida. Depois dela, volta a ter só o teste grátis."
          : plano === "inativo"
            ? "Bloqueado: o aluno não faz nenhum simulado além do teste grátis, mesmo que tenha prazo."
            : "Sem plano: o aluno faz apenas o teste grátis."}
        {u.isAdmin &&
          " Administradores têm todos os simulados liberados, independentemente do plano."}
      </p>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!alterado || mut.isPending || (pago && !validade)}
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
