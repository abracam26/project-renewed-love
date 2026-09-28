import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { abreviarNome, tokenSchema, usuarioLogado } from "@/lib/auth-servidor";
import { ehTesteGratis } from "@/lib/provas";

/**
 * Relatório do aluno (página Relatórios): números gerais, desempenho por
 * tema e por dificuldade, evolução e ranking opcional.
 */

const DIAS_RANKING = 30;

const pct = (acertos: number, total: number) =>
  total > 0 ? Math.round((1000 * acertos) / total) / 10 : 0;

export const relatorioAluno = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: tokenSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin, user } = await usuarioLogado(data.token);

    const [{ data: simulados, error }, { data: desempenho }, { data: ranking }, { data: perfil }] =
      await Promise.all([
        supabaseAdmin
          .from("simulados")
          .select(
            "id, tipo, acertos, total_questoes, aprovado, duracao_segundos, finalizado_em, nota_corte",
          )
          .eq("user_id", user.id)
          .eq("status", "finalizado")
          .order("finalizado_em", { ascending: false })
          .limit(500),
        supabaseAdmin.rpc("desempenho_aluno", { p_user_id: user.id }),
        supabaseAdmin.rpc("ranking_alunos", { p_dias: DIAS_RANKING }),
        supabaseAdmin.from("profiles").select("show_in_ranking").eq("id", user.id).maybeSingle(),
      ]);
    if (error) throw new Error(error.message);

    const lista = (simulados ?? []).map((s) => ({
      id: s.id,
      tipo: s.tipo,
      acertos: s.acertos ?? 0,
      total: s.total_questoes,
      pct: pct(s.acertos ?? 0, s.total_questoes),
      aprovado: Boolean(s.aprovado),
      duracao: s.duracao_segundos ?? 0,
      data: s.finalizado_em,
      notaCorte: s.nota_corte,
    }));

    const completos = lista.filter((s) => s.tipo === "ABT1" || s.tipo === "ABT2");
    const melhor = lista.reduce<(typeof lista)[number] | null>(
      (m, s) => (!m || s.pct > m.pct ? s : m),
      null,
    );
    const media =
      lista.length > 0
        ? Math.round((10 * lista.reduce((t, s) => t + s.pct, 0)) / lista.length) / 10
        : 0;
    const totalQuestoes = lista.reduce((t, s) => t + s.total, 0);
    const totalSegundos = lista.reduce((t, s) => t + s.duracao, 0);

    // Tema e dificuldade
    const linhas = (desempenho ?? []).map((d) => ({
      dimensao: d.dimensao,
      chave: d.chave,
      total: d.total,
      acertos: d.acertos,
      pct: pct(d.acertos, d.total),
    }));
    const temas = [1, 2, 3, 4].map((t) => {
      const l = linhas.find((x) => x.dimensao === "tema" && x.chave === String(t));
      return { tema: t, total: l?.total ?? 0, acertos: l?.acertos ?? 0, pct: l?.pct ?? 0 };
    });
    const dificuldades = (["facil", "media", "dificil"] as const).map((dif) => {
      const l = linhas.find((x) => x.dimensao === "dificuldade" && x.chave === dif);
      return { dificuldade: dif, total: l?.total ?? 0, acertos: l?.acertos ?? 0, pct: l?.pct ?? 0 };
    });
    const temaMaisFraco =
      temas.filter((t) => t.total >= 5).sort((a, b) => a.pct - b.pct)[0] ?? null;

    // Ranking: só primeiro nome e inicial; o ID do aluno não sai do servidor
    const posicoes = (ranking ?? []).map((r) => ({
      posicao: Number(r.posicao),
      nome: abreviarNome(r.nome),
      simulados: r.simulados,
      media: Number(r.media_pct),
      melhor: Number(r.melhor_pct),
      voce: r.user_id === user.id,
    }));
    const minhaPosicao = posicoes.find((p) => p.voce) ?? null;

    return {
      resumo: {
        finalizados: lista.length,
        completos: completos.length,
        gratis: lista.filter((s) => ehTesteGratis(s.tipo)).length,
        abt: lista.filter((s) => s.tipo === "ABT").length,
        aprovadosCompletos: completos.filter((s) => s.aprovado).length,
        melhor: melhor
          ? { pct: melhor.pct, acertos: melhor.acertos, total: melhor.total, tipo: melhor.tipo }
          : null,
        media,
        ultimoCompleto: completos[0]
          ? {
              tipo: completos[0].tipo,
              pct: completos[0].pct,
              aprovado: completos[0].aprovado,
              notaCorte: completos[0].notaCorte,
              data: completos[0].data,
            }
          : null,
        tempoMedioSimuladoSeg: lista.length > 0 ? Math.round(totalSegundos / lista.length) : 0,
        tempoMedioQuestaoSeg: totalQuestoes > 0 ? Math.round(totalSegundos / totalQuestoes) : 0,
      },
      temas,
      dificuldades,
      temaMaisFraco,
      evolucao: lista.slice(0, 10).reverse(),
      ranking: {
        dias: DIAS_RANKING,
        participa: Boolean(perfil?.show_in_ranking),
        top: posicoes.slice(0, 10),
        minhaPosicao,
        participantes: posicoes.length,
      },
    };
  });
