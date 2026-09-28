import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, FileText, Loader2, Pencil, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import {
  atualizarMaterial,
  BUCKET_MATERIAIS,
  excluirMaterial,
  listarMateriaisAdmin,
  prepararEnvioMaterial,
  registrarMaterial,
  TAMANHO_MAXIMO_PDF,
} from "@/lib/materiais.functions";
import { cn } from "@/lib/utils";

/**
 * Painel /admin/materiais: envio dos PDFs que aparecem para os alunos na
 * página PDFs. Só administradores enviam.
 */

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

function fmtTamanho(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function tituloDoArquivo(nome: string) {
  return nome
    .replace(/\.pdf$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function GestorMateriais({ token }: { token: string }) {
  const listar = useServerFn(listarMateriaisAdmin);
  const query = useQuery({
    queryKey: ["admin", "materiais"],
    queryFn: () => listar({ data: { token } }),
  });

  return (
    <div className="space-y-5">
      <EnvioMaterial token={token} />

      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-card-foreground">Materiais publicados</h2>
        <p className="text-xs text-muted-foreground">
          Os ativos aparecem para todos os alunos na página PDFs, na ordem indicada.
        </p>
        {query.isPending ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
          </p>
        ) : query.isError ? (
          <p className="py-8 text-sm text-destructive">{mensagemErro(query.error)}</p>
        ) : (query.data?.materiais.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum PDF enviado ainda.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {query.data?.materiais.map((m) => (
              <ItemMaterial key={m.id} token={token} material={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EnvioMaterial({ token }: { token: string }) {
  const preparar = useServerFn(prepararEnvioMaterial);
  const registrar = useServerFn(registrarMaterial);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState("Material de Apoio");
  const [descricao, setDescricao] = useState("");
  const [etapa, setEtapa] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error("Escolha o arquivo PDF.");
      setEtapa("Preparando o envio...");
      const { caminho, tokenEnvio } = await preparar({
        data: { token, nomeArquivo: arquivo.name, tamanho: arquivo.size },
      });
      setEtapa("Enviando o arquivo...");
      const { error } = await supabase.storage
        .from(BUCKET_MATERIAIS)
        .uploadToSignedUrl(caminho, tokenEnvio, arquivo, { contentType: "application/pdf" });
      if (error) throw new Error(`Falha no envio do arquivo: ${error.message}`);
      setEtapa("Registrando...");
      await registrar({
        data: { token, caminho, nomeArquivo: arquivo.name, titulo, descricao, categoria },
      });
    },
    onSuccess: async () => {
      toast.success("PDF publicado para os alunos.");
      setArquivo(null);
      setTitulo("");
      setDescricao("");
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["admin", "materiais"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
    onSettled: () => setEtapa(""),
  });

  function escolher(f: File | null) {
    if (f && !/\.pdf$/i.test(f.name)) {
      toast.error("Escolha um arquivo PDF.");
      return;
    }
    if (f && f.size > TAMANHO_MAXIMO_PDF) {
      toast.error("O arquivo passa de 50 MB, o limite do armazenamento.");
      return;
    }
    setArquivo(f);
    if (f && !titulo) setTitulo(tituloDoArquivo(f.name));
  }

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
        <Upload className="size-5 text-primary" />
        Enviar PDF
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <label className="block text-xs text-muted-foreground md:col-span-2">
          Arquivo (PDF, até 50 MB)
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            required
            onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-card-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground"
          />
          {arquivo && (
            <span className="mt-1 block text-card-foreground">
              {arquivo.name} · {fmtTamanho(arquivo.size)}
            </span>
          )}
        </label>
        <label className="block text-xs text-muted-foreground">
          Título que o aluno vê
          <input
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={150}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Categoria
          <input
            required
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            maxLength={60}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-muted-foreground md:col-span-2">
          Descrição (opcional)
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ex.: versão atualizada em junho de 2026."
            className={`mt-1 resize-y ${inputClass}`}
          />
        </label>
        <div className="flex items-center justify-end gap-3 md:col-span-2">
          {etapa && <span className="text-xs text-muted-foreground">{etapa}</span>}
          <button
            type="submit"
            disabled={mut.isPending || !arquivo}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
          >
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Publicar PDF
          </button>
        </div>
      </form>
    </section>
  );
}

type Material = Awaited<ReturnType<typeof listarMateriaisAdmin>>["materiais"][number];

function ItemMaterial({ token, material: m }: { token: string; material: Material }) {
  const salvar = useServerFn(atualizarMaterial);
  const excluir = useServerFn(excluirMaterial);
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(m.titulo);
  const [categoria, setCategoria] = useState(m.categoria);
  const [descricao, setDescricao] = useState(m.descricao ?? "");
  const [ordem, setOrdem] = useState(m.ordem);

  const atualizarLista = () => queryClient.invalidateQueries({ queryKey: ["admin", "materiais"] });

  const mutSalvar = useMutation({
    mutationFn: (ativo: boolean) =>
      salvar({ data: { token, id: m.id, titulo, categoria, descricao, ordem, ativo } }),
    onSuccess: async () => {
      toast.success("Material atualizado.");
      setEditando(false);
      await atualizarLista();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  const mutExcluir = useMutation({
    mutationFn: () => excluir({ data: { token, id: m.id } }),
    onSuccess: async () => {
      toast.success("Material excluído.");
      await atualizarLista();
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <li className={cn("rounded-lg border border-border p-4", !m.ativo && "opacity-70")}>
      {!editando ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-card-foreground">
                {m.titulo}
                {!m.ativo && (
                  <span className="ml-2 rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    Oculto
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.categoria} · {fmtTamanho(m.tamanho_bytes)} · {m.downloads} download
                {m.downloads === 1 ? "" : "s"} · ordem {m.ordem}
              </p>
              {m.descricao && <p className="mt-1 text-xs text-card-foreground/90">{m.descricao}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-card-foreground hover:bg-accent"
            >
              <Pencil className="size-3.5" /> Editar
            </button>
            <button
              type="button"
              disabled={mutSalvar.isPending}
              onClick={() => mutSalvar.mutate(!m.ativo)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
            >
              {m.ativo ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {m.ativo ? "Ocultar" : "Mostrar"}
            </button>
            <button
              type="button"
              disabled={mutExcluir.isPending}
              onClick={() => {
                if (window.confirm(`Excluir "${m.titulo}"? O arquivo será apagado.`)) {
                  mutExcluir.mutate();
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/50 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Excluir
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutSalvar.mutate(m.ativo);
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="block text-xs text-muted-foreground">
            Título
            <input
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={150}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Categoria
            <input
              required
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              maxLength={60}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block text-xs text-muted-foreground sm:col-span-2">
            Descrição
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={500}
              rows={2}
              className={`mt-1 resize-y ${inputClass}`}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Ordem na lista (menor aparece primeiro)
            <input
              type="number"
              min={0}
              max={9999}
              value={ordem}
              onChange={(e) => setOrdem(Number(e.target.value) || 0)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutSalvar.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
            >
              <Save className="size-3.5" /> Salvar
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
