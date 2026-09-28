import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CHAVE_FEEDBACK } from "@/lib/configuracoes-prova.functions";
import { acessoAtivo } from "@/lib/planos";
import { ehTesteGratis } from "@/lib/provas";
import { LETRAS, type Letra, type QuestaoRow } from "@/lib/questoes-schema";

/**
 * Motor de simulado: iniciar, buscar em andamento, responder, finalizar,
 * abandonar, histórico e relatórios do aluno. O teste grátis é controlado
 * pelo hash do CPF; os simulados completos exigem plano ativo (admins liberados).
 *
 * Não existe "parar e retomar depois": o simulado só continua na aba em que
 * foi iniciado (sessao_prova, guardada no sessionStorage dessa aba). Abrir em
 * outra aba, fechar a aba e voltar ou iniciar outro simulado encerra o
 * anterior como abandonado.
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");

/**
 * LIVRE e GRATIS continuam no tipo só por causa do histórico: o Treino livre
 * foi substituído pelo ABT, e o teste grátis agora é escolhido por prova.
 */
const TIPOS_PROVA = [
  "ABT1",
  "ABT2",
  "ABT",
  "GRATIS_ABT1",
  "GRATIS_ABT2",
  "GRATIS_ABT",
  "GRATIS",
  "LIVRE",
] as const;
export type TipoProva = (typeof TIPOS_PROVA)[number];

const inicioSchema = z.object({
  token: tokenSchema,
  tipo: z.enum(TIPOS_PROVA),
});

/** Identificador da aba em que a prova foi iniciada. */
const sessaoSchema = z.string().uuid().nullable().default(null);

/** Tolerância além do tempo máximo (atraso de rede, relógio do aparelho). */
const TOLERANCIA_TEMPO_MS = 60 * 1000;

const MSG_ENCERRADO =
  "Este simulado foi encerrado porque foi aberto fora da tela em que começou. Não é possível retomá-lo.";

type SupabaseAdmin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

function tempoEsgotado(sim: { iniciado_em: string; tempo_maximo_min: number }) {
  const limite =
    new Date(sim.iniciado_em).getTime() + sim.tempo_maximo_min * 60 * 1000 + TOLERANCIA_TEMPO_MS;
  return Date.now() > limite;
}

/** Encerra como abandonados os simulados em andamento do aluno. */
async function encerrarEmAndamento(
  supabaseAdmin: SupabaseAdmin,
  userId: string,
  opcoes: { somenteVencidos?: boolean; simuladoId?: string } = {},
) {
  let consulta = supabaseAdmin
    .from("simulados")
    .select("id, iniciado_em, tempo_maximo_min")
    .eq("user_id", userId)
    .eq("status", "em_andamento");
  if (opcoes.simuladoId) consulta = consulta.eq("id", opcoes.simuladoId);
  const { data: abertos } = await consulta;
  const alvo = (abertos ?? []).filter((s) => !opcoes.somenteVencidos || tempoEsgotado(s));
  if (alvo.length === 0) return;
  await supabaseAdmin
    .from("simulados")
    .update({ status: "abandonado", finalizado_em: new Date().toISOString() })
    .in(
      "id",
      alvo.map((s) => s.id),
    )
    .eq("status", "em_andamento");
}

/** Remove o identificador de sessão antes de devolver o simulado ao navegador. */
function semSessao<T extends { sessao_prova?: string | null }>(sim: T) {
  const { sessao_prova, ...resto } = sim;
  void sessao_prova;
  return resto;
}

type SimuladoRow = {
  id: string;
  iniciado_em: string;
  total_questoes: number;
  nota_corte: number;
};

/** Corrige as respostas e marca o simulado como finalizado. */
async function corrigirEFinalizar(supabaseAdmin: SupabaseAdmin, sim: SimuladoRow) {
  const { data: rows, error } = await supabaseAdmin
    .from("simulado_questoes")
    .select("id, resposta, questoes(gabarito)")
    .eq("simulado_id", sim.id);
  if (error) throw new Error(error.message);

  let acertos = 0;
  for (const r of rows ?? []) {
    const g = (r.questoes as unknown as { gabarito: string }).gabarito;
    const acertou = r.resposta === g;
    if (acertou) acertos++;
    await supabaseAdmin
      .from("simulado_questoes")
      .update({ correta: r.resposta !== null ? acertou : false })
      .eq("id", r.id);
  }

  const pct = (acertos / sim.total_questoes) * 100;
  const aprovado = pct >= sim.nota_corte;
  const dur = Math.round((Date.now() - new Date(sim.iniciado_em).getTime()) / 1000);
  const { data: final, error: eFin } = await supabaseAdmin
    .from("simulados")
    .update({
      status: "finalizado",
      finalizado_em: new Date().toISOString(),
      duracao_segundos: dur,
      acertos,
      aprovado,
    })
    .eq("id", sim.id)
    .select("*")
    .single();
  if (eFin) throw new Error(eFin.message);
  return final;
}

async function contextoAluno(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return { supabaseAdmin, userId: data.user.id, email: data.user.email ?? null };
}

function embaralhar<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i]!, out[j]!] = [out[j]!, out[i]!];
  }
  return out;
}

// ---------------------------------------------------------------------
// Configurações da prova (usadas pelo aluno para saber a duração/nota)
// ---------------------------------------------------------------------
export const listarConfigsProva = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await contextoAluno(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("configuracoes_prova")
      .select("*")
      .order("tipo");
    if (error) throw new Error(error.message);
    return { configs: rows ?? [] };
  });

// ---------------------------------------------------------------------
// Iniciar simulado
// ---------------------------------------------------------------------
export const iniciarSimulado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inicioSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);
    if (data.tipo === "LIVRE") {
      throw new Error("O Treino livre foi substituído pelo simulado ABT – Correspondentes.");
    }
    if (data.tipo === "GRATIS") {
      throw new Error(
        "Escolha de qual prova será o teste grátis: ABT1, ABT2 ou ABT – Correspondentes.",
      );
    }
    const gratis = ehTesteGratis(data.tipo);

    // Cadastro completo e plano ativo (admins sempre liberados)
    const [{ data: perfil }, { data: papel }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("cpf, cpf_hash, plano, plano_validade, cadastro_completo_em")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle(),
    ]);
    const admin = Boolean(papel);
    if (!admin && !(perfil?.cadastro_completo_em && perfil.cpf)) {
      throw new Error("Complete seu cadastro antes de iniciar um simulado.");
    }
    if (!gratis && !admin && !acessoAtivo(perfil?.plano, perfil?.plano_validade)) {
      throw new Error(
        "Seu plano não está ativo. Sem plano, você pode fazer apenas o teste grátis. Fale com a ABRACAM para liberar o acesso.",
      );
    }

    // Teste grátis: uma vez por CPF, em qualquer uma das provas
    if (gratis) {
      if (!perfil?.cpf_hash) {
        throw new Error("Complete seu cadastro com o CPF antes de fazer o teste grátis.");
      }
      const { data: usada } = await supabaseAdmin
        .from("gratuidade_usada")
        .select("cpf_hash")
        .eq("cpf_hash", perfil.cpf_hash)
        .maybeSingle();
      if (usada) {
        throw new Error("O teste grátis já foi utilizado por este CPF.");
      }
    }

    // Busca a configuração
    const { data: cfg, error: eCfg } = await supabaseAdmin
      .from("configuracoes_prova")
      .select("*")
      .eq("tipo", data.tipo)
      .single();
    if (eCfg || !cfg) throw new Error("Tipo de prova não configurado.");

    // Sorteia as questões
    const { data: sorteadas, error: eSort } = await supabaseAdmin.rpc("sortear_questoes_simulado", {
      p_user_id: userId,
      p_tipo: data.tipo,
    });
    if (eSort) throw new Error(`Falha ao sortear questões: ${eSort.message}`);
    if (!sorteadas || sorteadas.length === 0) {
      throw new Error(
        "Ainda não há questões aprovadas suficientes no banco. Avise um administrador.",
      );
    }

    // Não há retomada: um simulado que ficou em andamento é encerrado
    await encerrarEmAndamento(supabaseAdmin, userId);

    // Cria o simulado, amarrado à aba que o iniciou
    const sessao = crypto.randomUUID();
    const { data: sim, error: eSim } = await supabaseAdmin
      .from("simulados")
      .insert({
        user_id: userId,
        tipo: data.tipo,
        total_questoes: sorteadas.length,
        nota_corte: cfg.nota_corte,
        tempo_maximo_min: cfg.tempo_maximo_min,
        sessao_prova: sessao,
      })
      .select("id")
      .single();
    if (eSim || !sim) throw new Error(`Falha ao criar simulado: ${eSim?.message ?? ""}`);

    // Cria as questões embaralhando as alternativas por linha
    const rows = sorteadas.map((s) => ({
      simulado_id: sim.id,
      questao_id: s.questao_id,
      ordem: s.ordem,
      ordem_letras: embaralhar(LETRAS).join(""),
    }));
    const { error: eIns } = await supabaseAdmin.from("simulado_questoes").insert(rows);
    if (eIns) {
      await supabaseAdmin.from("simulados").delete().eq("id", sim.id);
      throw new Error(`Falha ao montar simulado: ${eIns.message}`);
    }

    // Marca o CPF como tendo usado o grátis (mesmo antes de terminar, para
    // impedir múltiplos inícios abusivos)
    if (gratis) {
      const { data: perfil } = await supabaseAdmin
        .from("profiles")
        .select("cpf_hash")
        .eq("id", userId)
        .single();
      if (perfil?.cpf_hash) {
        await supabaseAdmin
          .from("gratuidade_usada")
          .upsert({ cpf_hash: perfil.cpf_hash }, { onConflict: "cpf_hash" });
      }
    }

    return { simuladoId: sim.id, sessao };
  });

// ---------------------------------------------------------------------
// Carregar simulado em andamento (para renderizar a tela de prova)
// ---------------------------------------------------------------------
export type QuestaoDoSimulado = {
  simuladoQuestaoId: string;
  /** ID da questão no banco (ex.: ABT-T1-1023), exibido de forma discreta. */
  questaoId: string;
  ordem: number;
  enunciado: string;
  tema: number;
  tema_nome: string;
  alternativas: { posicao: number; texto: string }[]; // ordem já embaralhada, sem indicar gabarito
  resposta: number | null; // posição escolhida (0 a 3), ou null
};

export const carregarSimulado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, simuladoId: z.string().uuid(), sessao: sessaoSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);

    const { data: sim, error: eSim } = await supabaseAdmin
      .from("simulados")
      .select("*")
      .eq("id", data.simuladoId)
      .eq("user_id", userId)
      .single();
    if (eSim || !sim) throw new Error("Simulado não encontrado.");

    if (sim.status === "em_andamento") {
      // Aberto fora da aba em que começou (outra aba, aba fechada e reaberta):
      // o aluno saiu da prova, então ela é encerrada.
      if (!data.sessao || data.sessao !== sim.sessao_prova) {
        await encerrarEmAndamento(supabaseAdmin, userId, { simuladoId: sim.id });
        return {
          simulado: semSessao({ ...sim, status: "abandonado" }),
          questoes: [] as QuestaoDoSimulado[],
          perdido: true,
        };
      }
      // Tempo esgotado sem finalizar (ex.: aparelho suspenso): corrige o que foi respondido
      if (tempoEsgotado(sim)) {
        const final = await corrigirEFinalizar(supabaseAdmin, sim);
        return {
          simulado: semSessao(final),
          questoes: [] as QuestaoDoSimulado[],
          perdido: false,
        };
      }
    }

    const { data: rows, error } = await supabaseAdmin
      .from("simulado_questoes")
      .select(
        "id, ordem, ordem_letras, resposta, questoes(id, enunciado, tema, tema_nome, alternativas)",
      )
      .eq("simulado_id", data.simuladoId)
      .order("ordem");
    if (error) throw new Error(error.message);

    const questoes: QuestaoDoSimulado[] = (rows ?? []).map((r) => {
      const q = r.questoes as unknown as {
        id: string;
        enunciado: string;
        tema: number;
        tema_nome: string;
        alternativas: { letra: Letra; texto: string }[];
      };
      const ord = r.ordem_letras.split("") as Letra[];
      const alternativas = ord.map((letra, i) => {
        const alt = q.alternativas.find((a) => a.letra === letra);
        return { posicao: i, texto: alt?.texto ?? "" };
      });
      return {
        simuladoQuestaoId: r.id,
        questaoId: q.id,
        ordem: r.ordem,
        enunciado: q.enunciado,
        tema: q.tema,
        tema_nome: q.tema_nome,
        alternativas,
        resposta: r.resposta ? ord.indexOf(r.resposta as Letra) : null,
      };
    });

    return { simulado: semSessao(sim), questoes, perdido: false };
  });

// ---------------------------------------------------------------------
// Registrar resposta de uma questão (auto-save)
// ---------------------------------------------------------------------
export const responderQuestao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: tokenSchema,
        simuladoQuestaoId: z.string().uuid(),
        posicao: z.number().int().min(0).max(3).nullable(),
        sessao: sessaoSchema,
        tempoMs: z
          .number()
          .int()
          .min(0)
          .max(1000 * 60 * 60)
          .default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);

    // Confirma dono
    const { data: sq, error } = await supabaseAdmin
      .from("simulado_questoes")
      .select(
        "id, simulado_id, ordem_letras, simulados!inner(user_id, status, sessao_prova, iniciado_em, tempo_maximo_min)",
      )
      .eq("id", data.simuladoQuestaoId)
      .single();
    if (error || !sq) throw new Error("Questão não encontrada.");
    const s = sq.simulados as unknown as {
      user_id: string;
      status: string;
      sessao_prova: string | null;
      iniciado_em: string;
      tempo_maximo_min: number;
    };
    if (s.user_id !== userId) throw new Error("Simulado não pertence a você.");
    if (s.status !== "em_andamento") throw new Error(MSG_ENCERRADO);
    if (!data.sessao || data.sessao !== s.sessao_prova) {
      await encerrarEmAndamento(supabaseAdmin, userId, { simuladoId: sq.simulado_id });
      throw new Error(MSG_ENCERRADO);
    }
    if (tempoEsgotado(s)) throw new Error("Tempo esgotado. O simulado será finalizado.");

    const letra = data.posicao === null ? null : (sq.ordem_letras[data.posicao] ?? null);
    const { error: eUpd } = await supabaseAdmin
      .from("simulado_questoes")
      .update({
        resposta: letra,
        respondida_em: letra ? new Date().toISOString() : null,
        tempo_ms: data.tempoMs,
      })
      .eq("id", data.simuladoQuestaoId);
    if (eUpd) throw new Error(eUpd.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Finalizar simulado (corrige e retorna resultado)
// ---------------------------------------------------------------------
export const finalizarSimulado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, simuladoId: z.string().uuid(), sessao: sessaoSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);

    const { data: sim, error: eSim } = await supabaseAdmin
      .from("simulados")
      .select("*")
      .eq("id", data.simuladoId)
      .eq("user_id", userId)
      .single();
    if (eSim || !sim) throw new Error("Simulado não encontrado.");
    if (sim.status !== "em_andamento") {
      return { simulado: semSessao(sim), jaEstavaFinalizado: true as const };
    }
    if (!data.sessao || data.sessao !== sim.sessao_prova) {
      await encerrarEmAndamento(supabaseAdmin, userId, { simuladoId: sim.id });
      throw new Error(MSG_ENCERRADO);
    }

    const final = await corrigirEFinalizar(supabaseAdmin, sim);
    return { simulado: semSessao(final), jaEstavaFinalizado: false as const };
  });

// ---------------------------------------------------------------------
// Abandonar simulado
// ---------------------------------------------------------------------
export const abandonarSimulado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, simuladoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);
    const { error } = await supabaseAdmin
      .from("simulados")
      .update({ status: "abandonado", finalizado_em: new Date().toISOString() })
      .eq("id", data.simuladoId)
      .eq("user_id", userId)
      .eq("status", "em_andamento");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------
// Resultado detalhado (revisão pós-simulado)
// ---------------------------------------------------------------------
export const resultadoSimulado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, simuladoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);

    const { data: sim, error: eSim } = await supabaseAdmin
      .from("simulados")
      .select("*")
      .eq("id", data.simuladoId)
      .eq("user_id", userId)
      .single();
    if (eSim || !sim) throw new Error("Simulado não encontrado.");

    // Feedback global (admin) e explicação por tipo de prova
    const [{ data: cfg }, { data: cfgFeedback }] = await Promise.all([
      supabaseAdmin
        .from("configuracoes_prova")
        .select("mostrar_explicacao")
        .eq("tipo", sim.tipo)
        .single(),
      supabaseAdmin.from("configuracoes").select("valor").eq("chave", CHAVE_FEEDBACK).maybeSingle(),
    ]);
    const mostrarFeedback = cfgFeedback?.valor !== "inativo";
    const mostrarExplicacao = mostrarFeedback && (cfg?.mostrar_explicacao ?? false);

    const { data: rows, error } = await supabaseAdmin
      .from("simulado_questoes")
      .select(
        "id, ordem, ordem_letras, resposta, correta, tempo_ms, questoes(id, exame, tema, tema_nome, enunciado, alternativas, gabarito, explicacao, fonte_norma, fonte_artigo, fonte_pagina)",
      )
      .eq("simulado_id", data.simuladoId)
      .order("ordem")
      .returns<
        {
          id: string;
          ordem: number;
          ordem_letras: string;
          resposta: string | null;
          correta: boolean | null;
          tempo_ms: number | null;
          questoes: QuestaoRow;
        }[]
      >();
    if (error) throw new Error(error.message);

    const questoes = (rows ?? []).map((r) => {
      const q = r.questoes;
      return {
        ordem: r.ordem,
        questaoId: q.id,
        exame: q.exame,
        tema: q.tema,
        tema_nome: q.tema_nome,
        enunciado: q.enunciado,
        alternativas: q.alternativas, // já em ordem canônica a-d
        gabarito: q.gabarito,
        respostaLetra: r.resposta as Letra | null,
        correta: r.correta,
        tempo_ms: r.tempo_ms,
        // Explicação: depende do feedback global e do flag mostrar_explicacao
        // do tipo de prova (/admin/configuracoes).
        explicacao: mostrarExplicacao ? q.explicacao : null,
        // "Onde estudar": vai sempre que o feedback estiver ligado, mesmo com a
        // explicação desligada. Com o feedback desligado, nem sai do servidor.
        fonte_norma: mostrarFeedback ? q.fonte_norma : null,
        fonte_artigo: mostrarFeedback ? q.fonte_artigo : null,
        fonte_pagina: mostrarFeedback ? q.fonte_pagina : null,
      };
    });

    return { simulado: semSessao(sim), questoes, mostrarExplicacao, mostrarFeedback };
  });

// ---------------------------------------------------------------------
// Dashboard / histórico do aluno
// ---------------------------------------------------------------------
export const dashboardAluno = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);
    await encerrarEmAndamento(supabaseAdmin, userId, { somenteVencidos: true });

    const [
      { data: stats },
      { data: perfil },
      { data: recentes },
      { data: emAndamento },
      { data: papel },
    ] = await Promise.all([
      supabaseAdmin.rpc("estatisticas_aluno", { p_user_id: userId }).single(),
      supabaseAdmin
        .from("profiles")
        .select("username, full_name, nome_completo, cpf_hash, plano, plano_validade")
        .eq("id", userId)
        .single(),
      supabaseAdmin
        .from("simulados")
        .select("id, tipo, status, iniciado_em, finalizado_em, acertos, total_questoes, aprovado")
        .eq("user_id", userId)
        .eq("status", "finalizado")
        .order("iniciado_em", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("simulados")
        .select("id, tipo, iniciado_em")
        .eq("user_id", userId)
        .eq("status", "em_andamento")
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle(),
    ]);

    return {
      stats: stats ?? {
        total_simulados: 0,
        simulados_completos: 0,
        aprovados: 0,
        melhor_pct: 0,
        media_pct: 0,
        total_questoes: 0,
        tempo_total_seg: 0,
      },
      perfil: {
        username: perfil?.username ?? null,
        full_name: perfil?.full_name ?? null,
        primeiroNome: perfil?.nome_completo?.trim().split(/\s+/)[0] ?? null,
        temCpf: Boolean(perfil?.cpf_hash),
        plano: perfil?.plano ?? "gratis",
        plano_validade: perfil?.plano_validade ?? null,
        acessoAtivo: acessoAtivo(perfil?.plano, perfil?.plano_validade),
        isAdmin: Boolean(papel),
      },
      recentes: recentes ?? [],
      emAndamento: emAndamento ?? null,
    };
  });

export const historicoAluno = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);
    await encerrarEmAndamento(supabaseAdmin, userId, { somenteVencidos: true });
    const { data: rows, error } = await supabaseAdmin
      .from("simulados")
      .select("*")
      .eq("user_id", userId)
      .order("iniciado_em", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { simulados: rows ?? [] };
  });
