export const currentUser = {
  username: "wallasmonteiro019",
  email: "wallasmonteiro019@gmail.com",
  id: "30048302-d0df-46da-90b2-dde325135e6f",
  createdAt: "15 de Janeiro de 2024",
  plan: "Inativo",
  rankingOptIn: false,
};

export const dashboardStats = {
  simulados: 66,
  taxaAprovacao: 26,
  melhorPontuacao: 98,
  questoes: 2190,
  tempoEstudado: "24h 31m",
  sequencia: 30,
};

export type Simulado = {
  id: string;
  titulo: string;
  data: string;
  acertos: number;
  total: number;
  aprovado: boolean;
};

export const simulados: Simulado[] = [
  { id: "s1", titulo: "Simulado Completo", data: "15/07/2026, 13:41", acertos: 5, total: 10, aprovado: false },
  { id: "s2", titulo: "Simulado Completo", data: "08/07/2026, 12:21", acertos: 4, total: 10, aprovado: false },
  { id: "s3", titulo: "Simulado Completo", data: "21/01/2026, 08:41", acertos: 10, total: 40, aprovado: false },
  { id: "s4", titulo: "Simulado Completo", data: "12/01/2026, 18:33", acertos: 8, total: 40, aprovado: false },
  { id: "s5", titulo: "Simulado Completo", data: "06/01/2026, 12:23", acertos: 9, total: 40, aprovado: false },
  { id: "s6", titulo: "Simulado Teste", data: "19/12/2025, 09:12", acertos: 28, total: 40, aprovado: true },
  { id: "s7", titulo: "Simulado Completo", data: "01/12/2025, 20:05", acertos: 16, total: 40, aprovado: false },
  { id: "s8", titulo: "Simulado Teste", data: "14/11/2025, 15:47", acertos: 4, total: 10, aprovado: false },
];

export const scorePercent = (s: Simulado) => Math.round((s.acertos / s.total) * 100);

export const relatorios = {
  melhorPerformance: { pct: 50, detalhe: "20/40 acertos" },
  mediaGeral: { pct: 31, detalhe: "18 simulados" },
  statusCertificacao: { label: "REPROVADO", detalhe: "Meta: 70% (28/40)" },
  tempoMedio: { label: "2min", detalhe: "Limite: 120min" },
  resumo: {
    totalSimulados: 18,
    testesGratuitos: 12,
    simuladosCompletos: 6,
    melhorResultado: "50%",
    mediaGeral: "31%",
    tempoMedio: "2min",
  },
};

export const planos = [
  {
    nome: "Teste Gratuito",
    preco: "R$ 0",
    periodo: "para sempre",
    destaque: false,
    beneficios: ["10 questões por simulado", "3 simulados por mês", "Histórico de 30 dias", "Suporte por e-mail"],
  },
  {
    nome: "Mensal",
    preco: "R$ 39",
    periodo: "por mês",
    destaque: true,
    beneficios: [
      "Simulados completos de 40 questões",
      "Simulados ilimitados",
      "Relatórios de desempenho",
      "Banco de PDFs completo",
      "Participação no ranking",
    ],
  },
  {
    nome: "Anual",
    preco: "R$ 349",
    periodo: "por ano",
    destaque: false,
    beneficios: [
      "Tudo do plano Mensal",
      "2 meses grátis",
      "Correção comentada",
      "Prioridade no suporte",
      "Certificado de conclusão",
    ],
  },
];

export const pdfs = [
  { nome: "Apostila ABT — Módulo 1: Fundamentos", paginas: 84, tamanho: "3,2 MB", categoria: "Apostila" },
  { nome: "Apostila ABT — Módulo 2: Normas Técnicas", paginas: 112, tamanho: "4,8 MB", categoria: "Apostila" },
  { nome: "Resumo de Legislação Aplicada", paginas: 26, tamanho: "1,1 MB", categoria: "Resumo" },
  { nome: "Caderno de Questões Comentadas 2025", paginas: 148, tamanho: "6,4 MB", categoria: "Questões" },
  { nome: "Checklist de Revisão Final", paginas: 12, tamanho: "0,6 MB", categoria: "Resumo" },
  { nome: "Simulado Impresso — Modelo Oficial", paginas: 18, tamanho: "0,9 MB", categoria: "Simulado" },
];

export const tickets: { id: string; titulo: string; categoria: string; status: string; data: string }[] = [];

export const adminStats = {
  usuarios: 1284,
  assinantesAtivos: 417,
  simuladosHoje: 92,
  questoesCadastradas: 1860,
};

export const adminUsuarios = [
  { email: "wallasmonteiro019@gmail.com", plano: "Inativo", simulados: 66, ultimoAcesso: "23/08/2026" },
  { email: "carla.souza@gmail.com", plano: "Mensal", simulados: 41, ultimoAcesso: "23/08/2026" },
  { email: "j.pereira@outlook.com", plano: "Anual", simulados: 128, ultimoAcesso: "22/08/2026" },
  { email: "marcos.lima@gmail.com", plano: "Teste Gratuito", simulados: 3, ultimoAcesso: "21/08/2026" },
  { email: "renata.alves@yahoo.com", plano: "Mensal", simulados: 57, ultimoAcesso: "20/08/2026" },
];
