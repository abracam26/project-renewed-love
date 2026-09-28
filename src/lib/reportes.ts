/** Motivos de reporte de questão, usados pelo aluno e pelo painel do admin. */
export const MOTIVOS_REPORTE = [
  "gabarito",
  "enunciado",
  "alternativas",
  "material",
  "mais_de_uma",
  "outro",
] as const;
export type MotivoReporte = (typeof MOTIVOS_REPORTE)[number];

export const MOTIVO_LABEL: Record<MotivoReporte, string> = {
  gabarito: "Gabarito incorreto",
  enunciado: "Erro no enunciado",
  alternativas: "Erro nas alternativas",
  material: "Diverge do Material de Apoio",
  mais_de_uma: "Mais de uma resposta correta",
  outro: "Outro problema",
};

export const STATUS_REPORTE = ["aberto", "resolvido", "descartado"] as const;
export type StatusReporte = (typeof STATUS_REPORTE)[number];

export const STATUS_REPORTE_LABEL: Record<StatusReporte, string> = {
  aberto: "Aberto",
  resolvido: "Resolvido",
  descartado: "Descartado",
};

/** Limite de reportes por aluno em 24 horas (evita abuso). */
export const LIMITE_REPORTES_DIA = 30;
