/** Categorias e situações dos chamados de suporte. */
export const CATEGORIAS_CHAMADO = ["plano", "conteudo", "acesso", "tecnico", "outro"] as const;
export type CategoriaChamado = (typeof CATEGORIAS_CHAMADO)[number];

export const CATEGORIA_CHAMADO_LABEL: Record<CategoriaChamado, string> = {
  plano: "Plano e acesso aos simulados",
  conteudo: "Dúvida sobre conteúdo ou questões",
  acesso: "Conta, login e cadastro",
  tecnico: "Problema técnico",
  outro: "Outro assunto",
};

export const STATUS_CHAMADO = ["aberto", "respondido", "fechado"] as const;
export type StatusChamado = (typeof STATUS_CHAMADO)[number];

export const STATUS_CHAMADO_LABEL: Record<StatusChamado, string> = {
  aberto: "Aguardando resposta",
  respondido: "Respondido",
  fechado: "Encerrado",
};

/** Limite de chamados por aluno em 24 horas (evita abuso). */
export const LIMITE_CHAMADOS_DIA = 10;
