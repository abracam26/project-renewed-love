import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { gerarQuestoesIA, historicoGeracoes, listarMaterial } from "@/lib/ia-geracao.functions";
import { testarConexaoGemini } from "@/lib/ia.functions";
import { DIFICULDADES, NIVEIS, TEMAS, type Dificuldade, type Nivel } from "@/lib/questoes-schema";

const selectClass =
  "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";

export function GeradorIA({ token }: { token: string }) {
  const [tema, setTema] = useState<1 | 2 | 3 | 4>(4);
  const [nivel, setNivel] = useState<Nivel>("AMBOS");
  const [dificuldade, setDificuldade] = useState<Dificuldade | "">("");
  const [quantidade, setQuantidade] = useState(5);
  const [instrucao, setInstrucao] = useState("");
  const [trechos, setTrechos] = useState<string[]>([]);
  const [testando, setTestando] = useState(false);

  const gerar = useServerFn(gerarQuestoesIA);
  const material = useServerFn(listarMaterial);
  const historico = useServerFn(historicoGeracoes);
  const testar = useServerFn(testarConexaoGemini);
  const queryClient = useQueryClient();

  const qMaterial = useQuery({
    queryKey: ["admin", "material"],
    queryFn: () => material({ data: { token } }),
  });
  const qHistorico = useQuery({
    queryKey: ["admin", "geracoes"],
    queryFn: () => historico({ data: { token } }),
  });

  const trechosDoTema = (qMaterial.data ?? []).filter((t) => t.tema === tema);

  const mut = useMutation({
    mutationFn: () =>
      gerar({
        data: {
          token,
          tema,
          nivel,
          dificuldade: dificuldade === "" ? null : dificuldade,
          quantidade,
          instrucaoExtra: instrucao,
          trechoIds: trechos,
        },
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      if (r.geradas === 0)
        toast.error("Nenhuma questão passou na validação. Veja os motivos abaixo.");
      else toast.success(`${r.geradas} questão(ões) enviada(s) para a fila de revisão.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na geração."),
  });

  async function testarChave() {
    setTestando(true);
    try {
      const r = await testar();
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    } catch {
      toast.error("Não foi possível testar a conexão com o Gemini.");
    } finally {
      setTestando(false);
    }
  }

  const r = mut.data;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-card-foreground">
            <Wand2 className="size-5 text-primary" />
            Gerar questões com IA
          </h2>
          <p className="text-xs text-muted-foreground">
            A IA usa somente o material de referência do tema e as regras de geração. As questões
            geradas entram na fila de revisão e só valem para simulados depois de aprovadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void testarChave()}
          disabled={testando}
          className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-accent disabled:opacity-50"
        >
          <Sparkles className="size-3.5 text-primary" />
          {testando ? "Testando..." : "Testar chave do Gemini"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted-foreground">
          Tema
          <select
            value={tema}
            onChange={(e) => {
              setTema(Number(e.target.value) as 1 | 2 | 3 | 4);
              setTrechos([]);
            }}
            className={`mt-1 w-full ${selectClass}`}
          >
            {([1, 2, 3, 4] as const).map((t) => (
              <option key={t} value={t}>
                Tema {t} · {TEMAS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Nível
          <select
            value={nivel}
            onChange={(e) => setNivel(e.target.value as Nivel)}
            className={`mt-1 w-full ${selectClass}`}
          >
            {NIVEIS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Dificuldade
          <select
            value={dificuldade}
            onChange={(e) => setDificuldade(e.target.value as Dificuldade | "")}
            className={`mt-1 w-full ${selectClass}`}
          >
            <option value="">Mista (40% fácil, 40% média, 20% difícil)</option>
            {DIFICULDADES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Quantidade (1 a 20)
          <input
            type="number"
            min={1}
            max={20}
            value={quantidade}
            onChange={(e) => setQuantidade(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            className={`mt-1 w-full ${selectClass}`}
          />
        </label>
      </div>

      <div className="mt-3">
        <p className="text-xs text-muted-foreground">
          Trechos do material a usar (nenhum marcado = todos do tema)
        </p>
        {qMaterial.isPending ? (
          <p className="mt-1 text-xs text-muted-foreground">Carregando material...</p>
        ) : trechosDoTema.length === 0 ? (
          <p className="mt-1 flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5" />
            Não há material cadastrado para este tema. Cadastre em "Material de referência".
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            {trechosDoTema.map((t) => {
              const on = trechos.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setTrechos((prev) => (on ? prev.filter((x) => x !== t.id) : [...prev, t.id]))
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    on
                      ? "border-primary bg-primary/15 text-card-foreground"
                      : "border-border text-muted-foreground hover:border-primary/60"
                  }`}
                  title={`${Math.round(t.caracteres / 1000)} mil caracteres`}
                >
                  {t.titulo}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <label className="mt-3 block text-xs text-muted-foreground">
        Instrução adicional (opcional)
        <textarea
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder='Ex.: "foque em prazos e valores da Resolução BCB 277" ou "evite questões sobre ativos virtuais"'
          className={`mt-1 w-full resize-y ${selectClass}`}
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={mut.isPending || trechosDoTema.length === 0}
          onClick={() => mut.mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold transition-opacity disabled:opacity-50"
        >
          {mut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Wand2 className="size-4" />
          )}
          {mut.isPending ? "Gerando... (pode levar até um minuto)" : `Gerar ${quantidade} questões`}
        </button>
        <span className="text-xs text-muted-foreground">
          Modelo: Gemini. Chave protegida no servidor.
        </span>
      </div>

      {r && (
        <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
          <p className="font-semibold text-card-foreground">
            {r.geradas} geradas · {r.descartadas} descartadas na validação ·{" "}
            {Math.round(r.duracaoMs / 1000)}s
            {r.tokens.entrada !== null
              ? ` · ${r.tokens.entrada} tokens de entrada, ${r.tokens.saida ?? 0} de saída`
              : ""}
          </p>
          {r.erros.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-destructive">
              {r.erros.map((e) => (
                <li key={e.indice}>
                  Questão {e.indice}: {e.erro}
                </li>
              ))}
            </ul>
          )}
          {r.geradas > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              As questões estão na fila de revisão abaixo, com IDs {r.questoes[0]?.id} a{" "}
              {r.questoes[r.questoes.length - 1]?.id}.
            </p>
          )}
        </div>
      )}

      {(qHistorico.data?.geracoes.length ?? 0) > 0 && (
        <details className="mt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-card-foreground">
            Últimas gerações ({qHistorico.data?.geracoes.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {qHistorico.data?.geracoes.map((g) => (
              <li key={g.id}>
                {new Date(g.created_at).toLocaleString("pt-BR")} · Tema {g.tema} · {g.nivel}
                {g.dificuldade ? ` · ${g.dificuldade}` : ""} · pedidas {g.quantidade}, geradas{" "}
                {g.geradas}, descartadas {g.descartadas}
                {g.duracao_ms ? ` · ${Math.round(g.duracao_ms / 1000)}s` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
