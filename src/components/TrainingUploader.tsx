import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { testarConexaoGemini } from "@/lib/ia.functions";


type Material = {
  id: string;
  nome: string;
  tamanho: string;
  categoria: string;
  status: "Pendente" | "Processado";
  data: string;
};

const categorias = ["Apostila", "Legislação", "Resumo", "Questões", "Outro"];

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function TrainingUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [categoria, setCategoria] = useState(categorias[0]!);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [testando, setTestando] = useState(false);
  const testarIA = useServerFn(testarConexaoGemini);

  async function testarChave() {
    setTestando(true);
    try {
      const r = await testarIA();
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    } catch {
      toast.error("Não foi possível testar a conexão com o Gemini.");
    } finally {
      setTestando(false);
    }
  }



  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const novos: Material[] = Array.from(files).map((f) => ({
      id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
      nome: f.name,
      tamanho: formatSize(f.size),
      categoria,
      status: "Pendente",
      data: new Date().toLocaleDateString("pt-BR"),
    }));
    setMateriais((prev) => [...novos, ...prev]);
    toast.success(
      novos.length === 1
        ? "Arquivo adicionado à fila de treinamento."
        : `${novos.length} arquivos adicionados à fila de treinamento.`,
    );
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">Materiais de Treinamento da I.A.</h2>
          <p className="text-xs text-muted-foreground">
            Envie apostilas, legislações e provas antigas que servirão de base para a geração de questões.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Categoria
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
        }`}
      >
        <UploadCloud className="mx-auto size-8 text-primary" />
        <p className="mt-3 text-sm font-medium text-card-foreground">
          Arraste os arquivos aqui ou clique para selecionar
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT ou CSV — até 50 MB por arquivo</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-card-foreground">Fila de treinamento</h3>
        {materiais.length === 0 ? (
          <p className="mt-3 rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum material enviado ainda.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {materiais.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <FileText className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-card-foreground">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.categoria} · {m.tamanho} · {m.data}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {m.status}
                </span>
                <button
                  onClick={() => setMateriais((prev) => prev.filter((x) => x.id !== m.id))}
                  aria-label={`Remover ${m.nome}`}
                  className="rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        disabled={materiais.length === 0}
        onClick={() => toast.info("Treinamento ainda não configurado — envie as regras e a chave de API.")}
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
      >
        Enviar para treinamento
      </button>
    </section>
  );
}
