import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cpfValido, hashCpf, limparCpf } from "@/lib/cpf";
import { LETRAS, type Letra, type QuestaoRow } from "@/lib/questoes-schema";

/**
 * Motor de simulado: iniciar, buscar em andamento, responder, finalizar,
 * abandonar, histórico e relatórios do aluno. Também expõe o cadastro do
 * CPF cifrado com uso do teste grátis controlado.
 */

const tokenSchema = z.string().min(20, "Sessão inválida. Faça login novamente.");

const TIPOS_PROVA = ["ABT1", "ABT2", "GRATIS", "LIVRE"] as const;
export type TipoProva = (typeof TIPOS_PROVA)[number];

const inicioSchema = z.object({
  token: tokenSchema,
  tipo: z.enum(TIPOS_PROVA),
});

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
// Cadastro do CPF: valida, cifra e amarra ao perfil do aluno
// ---------------------------------------------------------------------
export const salvarCpf = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: tokenSchema, cpf: z.string().min(11).max(14) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);
    if (!cpfValido(data.cpf)) throw new Error("CPF inválido.");
    const sal = process.env["CPF_SAL"] || "abracam-simulador-abt";
    const hash = await hashCpf(data.cpf, sal);

    // Se este hash já está em outro perfil, bloqueia
    const { data: existente } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("cpf_hash", hash)
      .neq("id", userId)
      .maybeSingle();
    if (existente) throw new Error("Este CPF já está cadastrado em outra conta.");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ cpf_hash: hash })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

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

    // Se já existe um em andamento, retorna esse
    const { data: emAndamento } = await supabaseAdmin
      .from("simulados")
      .select("id, tipo, status")
      .eq("user_id", userId)
      .eq("status", "em_andamento")
      .maybeSingle();
    if (emAndamento) {
      if (emAndamento.tipo !== data.tipo) {
        throw new Error(
          `Você tem um simulado ${emAndamento.tipo} em andamento. Finalize ou abandone antes de começar outro.`,
        );
      }
      return { simuladoId: emAndamento.id, retomado: true as const };
    }

    // Se for GRATIS, checa se o CPF já usou
    if (data.tipo === "GRATIS") {
      const { data: perfil } = await supabaseAdmin
        .from("profiles")
        .select("cpf_hash")
        .eq("id", userId)
        .single();
      if (!perfil?.cpf_hash) {
        throw new Error("Cadastre seu CPF antes de fazer o simulado grátis.");
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

    // Cria o simulado
    const { data: sim, error: eSim } = await supabaseAdmin
      .from("simulados")
      .insert({
        user_id: userId,
        tipo: data.tipo,
        total_questoes: sorteadas.length,
        nota_corte: cfg.nota_corte,
        tempo_maximo_min: cfg.tempo_maximo_min,
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
    if (data.tipo === "GRATIS") {
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

    return { simuladoId: sim.id, retomado: false as const };
  });

// ---------------------------------------------------------------------
// Carregar simulado em andamento (para renderizar a tela de prova)
// ---------------------------------------------------------------------
export type QuestaoDoSimulado = {
  simuladoQuestaoId: string;
  ordem: number;
  enunciado: string;
  tema: number;
  tema_nome: string;
  alternativas: { posicao: number; texto: string }[]; // ordem já embaralhada, sem indicar gabarito
  resposta: number | null; // posição escolhida (0 a 3), ou null
};

export const carregarSimulado = createServerFn({ method: "POST" })
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
        ordem: r.ordem,
        enunciado: q.enunciado,
        tema: q.tema,
        tema_nome: q.tema_nome,
        alternativas,
        resposta: r.resposta ? ord.indexOf(r.resposta as Letra) : null,
      };
    });

    return { simulado: sim, questoes };
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
      .select("id, simulado_id, ordem_letras, simulados!inner(user_id, status)")
      .eq("id", data.simuladoQuestaoId)
      .single();
    if (error || !sq) throw new Error("Questão não encontrada.");
    const s = sq.simulados as unknown as { user_id: string; status: string };
    if (s.user_id !== userId) throw new Error("Simulado não pertence a você.");
    if (s.status !== "em_andamento") throw new Error("Este simulado já foi finalizado.");

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
    if (sim.status !== "em_andamento") {
      return { simulado: sim, jaEstavaFinalizado: true as const };
    }

    // Corrige cada questão
    const { data: rows, error } = await supabaseAdmin
      .from("simulado_questoes")
      .select("id, resposta, questoes(gabarito)")
      .eq("simulado_id", data.simuladoId);
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
      .eq("id", data.simuladoId)
      .select("*")
      .single();
    if (eFin) throw new Error(eFin.message);

    return { simulado: final, jaEstavaFinalizado: false as const };
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

    // Configuração para saber se pode mostrar explicação
    const { data: cfg } = await supabaseAdmin
      .from("configuracoes_prova")
      .select("mostrar_explicacao")
      .eq("tipo", sim.tipo)
      .single();
    const mostrarExplicacao = cfg?.mostrar_explicacao ?? false;

    const { data: rows, error } = await supabaseAdmin
      .from("simulado_questoes")
      .select(
        "id, ordem, ordem_letras, resposta, correta, tempo_ms, questoes(id, tema, tema_nome, enunciado, alternativas, gabarito, explicacao, fonte_norma, fonte_artigo, fonte_pagina)",
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
        tema: q.tema,
        tema_nome: q.tema_nome,
        enunciado: q.enunciado,
        alternativas: q.alternativas, // já em ordem canônica a-d
        gabarito: q.gabarito,
        respostaLetra: r.resposta as Letra | null,
        correta: r.correta,
        tempo_ms: r.tempo_ms,
        // A explicação completa continua condicionada ao flag mostrar_explicacao
        // (ligado por tipo de prova, no /admin/configuracoes).
        explicacao: mostrarExplicacao ? q.explicacao : null,
        // A referência ao material vai SEMPRE (mesmo com a explicação desligada),
        // para o aluno saber onde estudar quando errar uma questão.
        fonte_norma: q.fonte_norma,
        fonte_artigo: q.fonte_artigo,
        fonte_pagina: q.fonte_pagina,
      };
    });

    return { simulado: sim, questoes, mostrarExplicacao };
  });

// ---------------------------------------------------------------------
// Dashboard / histórico do aluno
// ---------------------------------------------------------------------
export const dashboardAluno = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);

    const [{ data: stats }, { data: perfil }, { data: recentes }, { data: emAndamento }] =
      await Promise.all([
        supabaseAdmin.rpc("estatisticas_aluno", { p_user_id: userId }).single(),
        supabaseAdmin
          .from("profiles")
          .select("username, full_name, cpf_hash, plano, plano_validade")
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
        temCpf: Boolean(perfil?.cpf_hash),
        plano: perfil?.plano ?? "gratis",
        plano_validade: perfil?.plano_validade ?? null,
      },
      recentes: recentes ?? [],
      emAndamento: emAndamento ?? null,
    };
  });

export const historicoAluno = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, userId } = await contextoAluno(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("simulados")
      .select("*")
      .eq("user_id", userId)
      .order("iniciado_em", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { simulados: rows ?? [] };
  });
