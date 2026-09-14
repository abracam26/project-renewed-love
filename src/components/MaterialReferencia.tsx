import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookText, FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { excluirMaterial, listarMaterial, salvarMaterial } from "@/lib/ia-geracao.functions";
import { TEMAS } from "@/lib/questoes-schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

type Form = {
  id: string | null;
  tema: 1 | 2 | 3 | 4;
  ordem: number;
  titulo: string;
  conteudo: string;
  versao: string;
};

export function MaterialReferencia({ token }: { token: string }) {
  const listar = useServerFn(listarMaterial);
  const salvar = useServerFn(salvarMaterial);
  const excluir = useServerFn(excluirMaterial);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["admin", "material"],
    queryFn: () => listar({ data: { token } }),
  });
  const trechos = query.data ?? [];

  const mutSalvar = useMutation({
    mutationFn: (f: Form) => salvar({ data: { token, ...f } }),
    onSuccess: () => {
      toast.success("Material salvo.");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "material"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const mutExcluir = useMutation({
    mutationFn: (id: string) => excluir({ data: { token, id } }),
    onSuccess: () => {
      toast.success("Trecho removido.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "material"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao remover."),
  });

  function novo(tema: 1 | 2 | 3 | 4) {
    const ordem = Math.max(0, ...trechos.filter((t) => t.tema === tema).map((t) => t.ordem)) + 1;
    setForm({ id: null, tema, ordem, titulo: "", conteudo: "", versao: "junho/2026" });
  }

  async function lerTxt(file: File) {
    if (!form) return;
    const texto = await file.text();
    setForm({ ...form, conteudo: texto, titulo: form.titulo || file.name.replace(/\.txt$/i, "") });
    toast.success(`${file.name} carregado (${Math.round(texto.length / 1000)} mil caracteres).`);
  }

  return (
    <section className="panel p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
          <BookText className="size-5 text-primary" />
          Material de referência
        </h2>
        <p className="text-xs text-muted-foreground">
          Texto do Material de Apoio ABRACAM separado por tema. É a única fonte que a IA usa. Quando
          o material for atualizado, substitua o trecho correspondente (texto puro, .txt).
        </p>
      </div>

      {query.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" /> Carregando...
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {([1, 2, 3, 4] as const).map((tema) => {
            const doTema = trechos.filter((t) => t.tema === tema);
            const total = doTema.reduce((s, t) => s + t.caracteres, 0);
            return (
              <div key={tema} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-card-foreground">
                    Tema {tema} · {TEMAS[tema]}
                  </p>
                  <button
                    type="button"
                    onClick={() => novo(tema)}
                    className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2 py-1 text-[11px] font-medium text-card-foreground hover:bg-accent"
                  >
                    <Plus className="size-3" /> Trecho
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {doTema.length} trecho(s) · {Math.round(total / 1000)} mil caracteres
                </p>
                {doTema.length === 0 ? (
                  <p className="mt-2 text-xs text-destructive">
                    Sem material. A geração deste tema fica bloqueada.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {doTema.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-xs">
                        <span
                          className="min-w-0 flex-1 truncate text-card-foreground"
                          title={t.previa}
                        >
                          {t.ordem}. {t.titulo}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {Math.round(t.caracteres / 1000)}k · {t.versao}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              id: t.id,
                              tema,
                              ordem: t.ordem,
                              titulo: t.titulo,
                              conteudo: "",
                              versao: t.versao,
                            })
                          }
                          title="Substituir conteúdo"
                          className="rounded-md p-1 text-primary hover:bg-accent"
                        >
                          <FileUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Remover "${t.titulo}"?`)) mutExcluir.mutate(t.id);
                          }}
                          title="Remover"
                          className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {form && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutSalvar.mutate(form);
              }}
              className="space-y-3"
            >
              <DialogHeader>
                <DialogTitle>
                  {form.id ? "Substituir trecho" : "Novo trecho"} · Tema {form.tema}
                </DialogTitle>
                <DialogDescription>
                  Cole o texto ou envie um arquivo .txt. O conteúdo anterior será substituído.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-[1fr_90px_130px]">
                <label className="text-xs text-muted-foreground">
                  Título
                  <input
                    required
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Ordem
                  <input
                    type="number"
                    min={1}
                    value={form.ordem}
                    onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 1 })}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Versão
                  <input
                    value={form.versao}
                    onChange={(e) => setForm({ ...form, versao: e.target.value })}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
                >
                  <FileUp className="size-3.5 text-primary" /> Enviar .txt
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void lerTxt(f);
                    e.target.value = "";
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {Math.round(form.conteudo.length / 1000)} mil caracteres
                </span>
              </div>
              <textarea
                required
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                rows={14}
                placeholder="Cole aqui o texto do trecho do material..."
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={mutSalvar.isPending}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-50"
                >
                  {mutSalvar.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
