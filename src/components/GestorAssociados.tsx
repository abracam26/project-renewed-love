import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  excluirAssociado,
  importarAssociados,
  listarAssociados,
  salvarAssociado,
} from "@/lib/associados.functions";
import { DOMINIO_RE, normalizarDominio } from "@/lib/associados";
import { cnpjValido, formatarCnpj, limparCnpj } from "@/lib/cnpj";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";

/**
 * Lista de instituições associadas à ABRACAM (/admin/pagamentos). Quem se
 * cadastra marcando "Sou associado(a)" precisa informar um CNPJ desta lista e
 * usar um e-mail de um dos domínios da instituição; aí paga o "preço para
 * associados" de cada plano.
 */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

type Associado = Awaited<ReturnType<typeof listarAssociados>>["associados"][number];

type Form = {
  id: string | null;
  nome: string;
  cnpj: string;
  dominios: string;
  valeFiliais: boolean;
  ativo: boolean;
};

const FORM_NOVO: Form = {
  id: null,
  nome: "",
  cnpj: "",
  dominios: "",
  valeFiliais: false,
  ativo: true,
};

function formDe(a: Associado): Form {
  return {
    id: a.id,
    nome: a.nome,
    cnpj: formatarCnpj(a.cnpj),
    dominios: a.dominios.join(", "),
    valeFiliais: a.valeFiliais,
    ativo: a.ativo,
  };
}

function Selo({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function GestorAssociados({ token }: { token: string }) {
  const listar = useServerFn(listarAssociados);
  const excluir = useServerFn(excluirAssociado);
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Form | null>(null);
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState("");

  const query = useQuery({
    queryKey: ["admin", "associados"],
    queryFn: () => listar({ data: { token } }),
  });

  const mutExcluir = useMutation({
    mutationFn: (id: string) => excluir({ data: { token, id } }),
    onSuccess: async () => {
      toast.success("Instituição excluída da lista de associados.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "associados"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const lista = useMemo(() => query.data?.associados ?? [], [query.data]);
  const filtrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    const digitos = limparCnpj(termo);
    return lista.filter(
      (a) =>
        a.nome.toLowerCase().includes(termo) ||
        (digitos.length >= 2 && a.cnpj.includes(digitos)) ||
        a.dominios.some((d) => d.includes(termo.replace(/^@/, ""))),
    );
  }, [lista, busca]);

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <BadgeCheck className="size-5 text-primary" />
            Associados ABRACAM
          </h2>
          <p className="text-xs text-muted-foreground">
            Instituições com desconto de associado. No cadastro, quem marca “Sou associado(a)
            ABRACAM” precisa informar um CNPJ desta lista e usar um e-mail de um dos domínios da
            instituição. O valor com desconto é o “Preço para associados” de cada plano.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setImportando(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-card-foreground hover:bg-accent"
          >
            <FileUp className="size-4" /> Importar lista
          </button>
          <button
            type="button"
            onClick={() => setEditando(FORM_NOVO)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nova instituição
          </button>
        </div>
      </div>

      {lista.length > 5 && (
        <label className="mt-4 flex max-w-sm items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou domínio"
            aria-label="Buscar instituição associada"
            className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}

      {query.isPending ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando associados...
        </p>
      ) : query.isError ? (
        <p className="py-6 text-sm text-destructive">{mensagemErro(query.error)}</p>
      ) : lista.length === 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/50 bg-primary/10 p-3 text-sm text-card-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            <strong>Nenhuma instituição cadastrada:</strong> por enquanto ninguém consegue se
            cadastrar como associado. Use “Nova instituição” ou “Importar lista”.
          </p>
        </div>
      ) : filtrada.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma instituição encontrada para “{busca}”.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {filtrada.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-card-foreground">{a.nome}</p>
                  {a.ativo ? (
                    <Selo className="bg-success text-success-foreground">Ativa</Selo>
                  ) : (
                    <Selo className="bg-muted text-muted-foreground">Desativada</Selo>
                  )}
                  {a.valeFiliais && (
                    <Selo className="border border-border text-muted-foreground">
                      Vale para filiais
                    </Selo>
                  )}
                </div>
                <p className="text-xs text-card-foreground">
                  CNPJ {formatarCnpj(a.cnpj)} ·{" "}
                  {a.dominios.map((d) => (
                    <span
                      key={d}
                      className="mr-1 inline-block rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      @{d}
                    </span>
                  ))}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {a.alunos === 0
                    ? "Nenhum aluno vinculado"
                    : `${a.alunos} aluno${a.alunos === 1 ? "" : "s"} vinculado${a.alunos === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditando(formDe(a))}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
                >
                  <Pencil className="size-3.5" /> Editar
                </button>
                <button
                  type="button"
                  disabled={mutExcluir.isPending}
                  onClick={() => {
                    const aviso =
                      a.alunos > 0
                        ? ` ${a.alunos} aluno${a.alunos === 1 ? "" : "s"} vinculado${a.alunos === 1 ? "" : "s"} perde${a.alunos === 1 ? "" : "m"} o desconto nos próximos pedidos (pedidos já feitos não mudam). Para suspender sem perder os vínculos, use Editar > desmarcar “Ativa”.`
                        : "";
                    if (confirm(`Excluir "${a.nome}" da lista de associados?${aviso}`)) {
                      mutExcluir.mutate(a.id);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" /> Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(editando)} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card text-card-foreground sm:max-w-lg">
          {editando && (
            <EditorAssociado
              key={editando.id ?? "novo"}
              token={token}
              inicial={editando}
              onFechar={() => setEditando(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importando} onOpenChange={setImportando}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card text-card-foreground sm:max-w-2xl">
          {importando && <ImportarAssociados token={token} onFechar={() => setImportando(false)} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------
// Criar e editar uma instituição
// ---------------------------------------------------------------------
function EditorAssociado({
  token,
  inicial,
  onFechar,
}: {
  token: string;
  inicial: Form;
  onFechar: () => void;
}) {
  const salvar = useServerFn(salvarAssociado);
  const queryClient = useQueryClient();
  const [f, setF] = useState<Form>(inicial);
  const [tentou, setTentou] = useState(false);

  function set<K extends keyof Form>(campo: K, valor: Form[K]) {
    setF((v) => ({ ...v, [campo]: valor }));
  }

  const nome = f.nome.trim();
  const erroNome = nome.length < 2 ? "Informe o nome da instituição." : null;
  const cnpj = limparCnpj(f.cnpj);
  const erroCnpj =
    cnpj.length === 0 ? "Informe o CNPJ." : !cnpjValido(cnpj) ? "CNPJ inválido." : null;
  const dominios = [
    ...new Set(
      f.dominios
        .split(/[,;\s]+/)
        .map(normalizarDominio)
        .filter(Boolean),
    ),
  ];
  const dominioRuim = dominios.find((d) => !DOMINIO_RE.test(d));
  const erroDominios =
    dominios.length === 0
      ? "Informe pelo menos um domínio de e-mail da instituição."
      : dominioRuim
        ? `Domínio inválido: ${dominioRuim}`
        : dominios.length > 20
          ? "No máximo 20 domínios."
          : null;
  const erro = erroNome ?? erroCnpj ?? erroDominios;

  const mut = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          token,
          id: f.id,
          nome,
          cnpj,
          dominios,
          valeFiliais: f.valeFiliais,
          ativo: f.ativo,
        },
      }),
    onSuccess: async () => {
      toast.success("Instituição associada salva.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "associados"] });
      onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTentou(true);
        if (!erro) mut.mutate();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>
          {f.id ? "Editar instituição associada" : "Nova instituição associada"}
        </DialogTitle>
        <DialogDescription>
          O desconto vale para quem informar este CNPJ no cadastro e usar um e-mail de um dos
          domínios abaixo.
        </DialogDescription>
      </DialogHeader>

      <label className="block text-xs text-muted-foreground">
        Nome da instituição
        <input
          value={f.nome}
          onChange={(e) => set("nome", e.target.value)}
          maxLength={150}
          placeholder="Ex.: ABRACAM"
          className={`mt-1 ${inputClass}`}
        />
        {erroNome && tentou && <span className="mt-1 block text-destructive">{erroNome}</span>}
      </label>

      <label className="block text-xs text-muted-foreground">
        CNPJ
        <input
          value={f.cnpj}
          onChange={(e) => set("cnpj", formatarCnpj(e.target.value))}
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          className={`mt-1 ${inputClass}`}
        />
        {erroCnpj && (tentou || cnpj.length === 14) && (
          <span className="mt-1 block text-destructive">{erroCnpj}</span>
        )}
      </label>

      <label className="block text-xs text-muted-foreground">
        Domínios de e-mail da instituição
        <input
          value={f.dominios}
          onChange={(e) => set("dominios", e.target.value)}
          placeholder="abracam.com, abracam.org.br"
          className={`mt-1 ${inputClass}`}
        />
        {erroDominios && (tentou || f.dominios.trim()) ? (
          <span className="mt-1 block text-destructive">{erroDominios}</span>
        ) : (
          <span className="mt-1 block text-[11px]">
            O que vem depois do @ no e-mail. Separe vários com vírgula. Ex.: para
            amoraes@abracam.com, informe abracam.com.
          </span>
        )}
      </label>

      <label className="flex items-start gap-2 text-sm text-card-foreground">
        <input
          type="checkbox"
          checked={f.valeFiliais}
          onChange={(e) => set("valeFiliais", e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Aceitar também as filiais
          <span className="block text-[11px] text-muted-foreground">
            CNPJs com os mesmos 8 primeiros dígitos (
            {cnpj.length >= 8 ? formatarCnpj(cnpj).slice(0, 10) : "00.000.000"}
            /xxxx-xx).
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-card-foreground">
        <input
          type="checkbox"
          checked={f.ativo}
          onChange={(e) => set("ativo", e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          Ativa
          <span className="block text-[11px] text-muted-foreground">
            Desmarcada, ninguém novo se cadastra por ela e os vinculados pagam o preço normal até
            ela ser reativada.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onFechar}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-60"
        >
          {mut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Salvar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Importação em lote (colar a lista)
// ---------------------------------------------------------------------
function ImportarAssociados({ token, onFechar }: { token: string; onFechar: () => void }) {
  const importar = useServerFn(importarAssociados);
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim()).length;

  const mut = useMutation({
    mutationFn: () => importar({ data: { token, texto } }),
    onSuccess: async (r) => {
      const ok = r.novos + r.atualizados;
      if (ok > 0) {
        toast.success(
          `Importação concluída: ${r.novos} nova${r.novos === 1 ? "" : "s"} e ${r.atualizados} atualizada${r.atualizados === 1 ? "" : "s"}.` +
            (r.erros.length ? ` ${r.erros.length} linha(s) com erro.` : ""),
        );
      } else if (r.erros.length) {
        toast.error("Nenhuma instituição importada. Confira as linhas com erro.");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "associados"] });
      if (r.erros.length === 0) onFechar();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Importar lista de associados</DialogTitle>
        <DialogDescription>
          Uma instituição por linha: nome, CNPJ e domínio(s) de e-mail, separados por ponto e
          vírgula. Dá para colar direto de uma planilha (colunas Nome, CNPJ e Domínios). CNPJ que já
          está na lista é atualizado.
        </DialogDescription>
      </DialogHeader>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={10}
        placeholder={
          "ABRACAM; 04.634.444/0001-30; abracam.com\nInstituição Exemplo; 11.222.333/0001-81; exemplo.com.br, exemplo.org.br"
        }
        className={`resize-y font-mono text-xs ${inputClass}`}
        aria-label="Lista de instituições associadas"
      />

      {mut.data && mut.data.erros.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-card-foreground">
          <p className="font-semibold text-destructive">
            {mut.data.erros.length} linha(s) não importada(s):
          </p>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {mut.data.erros.map((e) => (
              <li key={e.linha}>
                Linha {e.linha}: {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {linhas} linha{linhas === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={mut.isPending || linhas === 0}
            onClick={() => mut.mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-60"
          >
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}
