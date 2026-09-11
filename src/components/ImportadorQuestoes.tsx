import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { importarQuestoes } from "@/lib/questoes.functions";
import {
  COLUNAS_CSV,
  TEMAS,
  lerCsv,
  lerJson,
  validarLinhas,
  type Questao,
  type ResultadoValidacao,
} from "@/lib/questoes-schema";

type Formato = "json" | "csv";

type Leitura = {
  arquivo: string;
  formato: Formato;
  resultados: ResultadoValidacao[];
};

type Retorno = Awaited<ReturnType<typeof importarQuestoes>>;

const EXEMPLO_JSON: Questao[] = [
  {
    id: "ABT-T1-0001",
    tema: 1,
    tema_nome: "Mercado de câmbio",
    subtema: "Guarda de documentos",
    nivel: "ABT2",
    dificuldade: "media",
    enunciado:
      "Nos termos da Resolução BCB nº 277, de 2022, a instituição autorizada a operar no mercado de câmbio deve manter à disposição do Banco Central do Brasil a comprovação do consentimento do cliente às condições pactuadas e os documentos comprobatórios coletados pelo período mínimo de:",
    alternativas: [
      { letra: "a", texto: "cinco anos, contados da data da contratação da operação de câmbio." },
      {
        letra: "b",
        texto:
          "dez anos, contados do término do exercício em que ocorra o evento de contratação ou, se houver, de liquidação, cancelamento ou baixa da operação de câmbio.",
      },
      {
        letra: "c",
        texto:
          "dez anos, contados da data da liquidação da operação de câmbio, exceto nas operações de até US$ 10.000,00 (dez mil dólares dos Estados Unidos), dispensadas de guarda.",
      },
      {
        letra: "d",
        texto: "cinco anos, contados do encerramento do relacionamento com o cliente.",
      },
    ],
    gabarito: "b",
    explicacao:
      "O art. 8º da Res. BCB 277 fixa prazo mínimo de dez anos, contados do término do exercício em que ocorra a contratação ou, se houver, a liquidação, o cancelamento ou a baixa.",
    fonte: { norma: "Resolução BCB nº 277/2022", artigo: "art. 8º", pagina_material: 33 },
    tags: ["prazo", "guarda de documentos"],
    versao_material: "junho/2026",
    status: "aprovada",
  },
];

function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string) {
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function ImportadorQuestoes({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const importar = useServerFn(importarQuestoes);
  const queryClient = useQueryClient();

  const validas =
    leitura?.resultados.filter((r): r is Extract<ResultadoValidacao, { ok: true }> => r.ok) ?? [];
  const invalidas =
    leitura?.resultados.filter((r): r is Extract<ResultadoValidacao, { ok: false }> => !r.ok) ?? [];

  async function lerArquivo(file: File) {
    setRetorno(null);
    const ext = file.name.toLowerCase().split(".").pop();
    const formato: Formato | null = ext === "json" ? "json" : ext === "csv" ? "csv" : null;
    if (!formato) {
      toast.error("Envie um arquivo .json ou .csv.");
      return;
    }
    try {
      const texto = await file.text();
      const linhas = formato === "json" ? lerJson(texto) : lerCsv(texto);
      if (linhas.length === 0) {
        toast.error("O arquivo não contém questões.");
        return;
      }
      const resultados = validarLinhas(linhas);
      setLeitura({ arquivo: file.name, formato, resultados });
      const ok = resultados.filter((r) => r.ok).length;
      toast.success(`${resultados.length} questões lidas, ${ok} válidas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  }

  async function enviar() {
    if (!leitura || validas.length === 0) return;
    setEnviando(true);
    try {
      const r = await importar({
        data: {
          token,
          arquivo: leitura.arquivo,
          formato: leitura.formato,
          questoes: validas.map((v) => v.questao),
        },
      });
      setRetorno(r);
      setLeitura(null);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      if (r.erros.length === 0)
        toast.success(`Importação concluída: ${r.inseridas} novas, ${r.atualizadas} atualizadas.`);
      else toast.warning(`Importação concluída com ${r.erros.length} erro(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setEnviando(false);
    }
  }

  function baixarModeloJson() {
    baixarArquivo(
      "modelo_questoes.json",
      JSON.stringify(EXEMPLO_JSON, null, 2),
      "application/json",
    );
  }

  function baixarModeloCsv() {
    const q = EXEMPLO_JSON[0]!;
    const linha = [
      q.id,
      String(q.tema),
      q.nivel,
      q.dificuldade,
      q.subtema ?? "",
      q.enunciado,
      ...q.alternativas.map((a) => a.texto),
      q.gabarito,
      q.explicacao ?? "",
      q.fonte?.norma ?? "",
      q.fonte?.artigo ?? "",
      String(q.fonte?.pagina_material ?? ""),
      q.tags.join(";"),
    ].map(csvEscape);
    baixarArquivo(
      "modelo_questoes.csv",
      `${COLUNAS_CSV.join(",")}\n${linha.join(",")}\n`,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">Importar questões</h2>
          <p className="text-xs text-muted-foreground">
            Envie um lote em JSON ou CSV. As questões são validadas antes de entrar no banco; IDs já
            existentes são atualizados.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={baixarModeloJson}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
          >
            <FileJson className="size-3.5 text-primary" /> Modelo JSON
          </button>
          <button
            type="button"
            onClick={baixarModeloCsv}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent"
          >
            <FileSpreadsheet className="size-3.5 text-primary" /> Modelo CSV
          </button>
        </div>
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
          const f = e.dataTransfer.files[0];
          if (f) void lerArquivo(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
        }`}
      >
        <UploadCloud className="mx-auto size-8 text-primary" />
        <p className="mt-3 text-sm font-medium text-card-foreground">
          Arraste o arquivo aqui ou clique para selecionar
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          JSON (array de questões) ou CSV com cabeçalho. Até 2.000 questões por lote.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void lerArquivo(f);
            e.target.value = "";
          }}
        />
      </div>

      {leitura && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Resumo icone={Download} valor={leitura.resultados.length} rotulo="Lidas" />
            <Resumo
              icone={CheckCircle2}
              valor={validas.length}
              rotulo="Válidas"
              cor="text-success"
            />
            <Resumo
              icone={XCircle}
              valor={invalidas.length}
              rotulo="Com erro"
              cor={invalidas.length ? "text-destructive" : undefined}
            />
          </div>

          {validas.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {([1, 2, 3, 4] as const).map((t) => {
                const n = validas.filter((v) => v.questao.tema === t).length;
                return (
                  <span key={t} className="rounded-full bg-muted px-2.5 py-0.5">
                    Tema {t} · {TEMAS[t]}:{" "}
                    <span className="font-semibold text-card-foreground">{n}</span>
                  </span>
                );
              })}
            </div>
          )}

          {invalidas.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
                <AlertTriangle className="size-4 text-destructive" />
                Questões com erro (não serão importadas)
              </p>
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
                {invalidas.map((r) => (
                  <li key={r.indice} className="rounded-md bg-background/60 p-2">
                    <span className="font-semibold text-card-foreground">
                      Linha {r.indice}
                      {r.id ? ` · ${r.id}` : ""}
                    </span>
                    <ul className="mt-1 list-disc pl-5 text-destructive">
                      {r.erros.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Tema</th>
                    <th className="px-3 py-2 font-medium">Nível</th>
                    <th className="px-3 py-2 font-medium">Dific.</th>
                    <th className="px-3 py-2 font-medium">Enunciado</th>
                    <th className="px-3 py-2 font-medium">Gab.</th>
                  </tr>
                </thead>
                <tbody>
                  {validas.slice(0, 50).map((v) => (
                    <tr key={v.questao.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-card-foreground">{v.questao.id}</td>
                      <td className="px-3 py-2 text-card-foreground">{v.questao.tema}</td>
                      <td className="px-3 py-2 text-card-foreground">{v.questao.nivel}</td>
                      <td className="px-3 py-2 text-card-foreground">{v.questao.dificuldade}</td>
                      <td className="max-w-[380px] truncate px-3 py-2 text-card-foreground">
                        {v.questao.enunciado}
                      </td>
                      <td className="px-3 py-2 font-semibold uppercase text-primary">
                        {v.questao.gabarito}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validas.length > 50 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Mostrando 50 de {validas.length} questões válidas.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={validas.length === 0 || enviando}
              onClick={() => void enviar()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold transition-opacity disabled:opacity-50"
            >
              {enviando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              {enviando ? "Importando..." : `Importar ${validas.length} questões`}
            </button>
            <button
              type="button"
              onClick={() => setLeitura(null)}
              className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {retorno && (
        <div className="mt-5 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-foreground">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-4 text-success" />
            Importação concluída
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {retorno.lidas} lidas · {retorno.inseridas} novas · {retorno.atualizadas} atualizadas ·{" "}
            {retorno.erros.length} erros
          </p>
          {retorno.erros.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-destructive">
              {retorno.erros.map((e) => (
                <li key={e.id}>
                  {e.id}: {e.erro}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Resumo({
  icone: Icone,
  valor,
  rotulo,
  cor,
}: {
  icone: typeof Download;
  valor: number;
  rotulo: string;
  cor?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <Icone className={`size-4 ${cor ?? "text-primary"}`} />
      <p className={`mt-2 text-xl font-bold ${cor ?? "text-card-foreground"}`}>{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}
