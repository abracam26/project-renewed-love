import { useRouterState } from "@tanstack/react-router";
import { Compass, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tour de boas-vindas: caixinhas que apontam para o menu e a barra superior,
 * explicando para que serve cada parte. Aparece uma vez no primeiro acesso
 * (depois da janela "Atenção" da senha), pode ser pulado e pode ser visto de
 * novo pelo link "Ver tour" do menu.
 */

export const EVENTO_ABRIR_TOUR = "abt:abrir-tour";

type Passo = {
  /** valor do atributo data-tour do elemento destacado; sem alvo = caixa no centro */
  alvo?: string;
  titulo: string;
  texto: string;
  soAdmin?: boolean;
};

const PASSOS: Passo[] = [
  {
    titulo: "Bem-vindo ao Simulador ABT!",
    texto:
      "Em menos de um minuto mostramos onde fica cada coisa. Você pode pular agora e ver este tour de novo quando quiser, em “Ver tour”, no menu. No celular, o menu abre pelo botão no canto superior esquerdo.",
  },
  {
    alvo: "menu-/",
    titulo: "Dashboard",
    texto:
      "Sua página inicial: a situação do seu plano, o teste grátis e o botão para iniciar os simulados. Depois de iniciar, a prova precisa ser feita até o fim, sem pausa.",
  },
  {
    alvo: "menu-/historico",
    titulo: "Histórico",
    texto: "Todos os simulados que você já fez, com a nota e a revisão de cada questão.",
  },
  {
    alvo: "menu-/relatorios",
    titulo: "Relatórios",
    texto:
      "Seu desempenho por tema, calculado a partir dos simulados que você finalizou, e o ranking dos alunos que escolheram participar.",
  },
  {
    alvo: "menu-/planos",
    titulo: "Planos",
    texto:
      "Contrate um plano por tempo ou um pacote de simulados, e acompanhe seus pedidos e as instruções de pagamento.",
  },
  {
    alvo: "menu-/perfil",
    titulo: "Perfil",
    texto:
      "Seus dados, a situação do plano, a troca de senha e a opção de aparecer (ou não) no ranking.",
  },
  {
    alvo: "menu-/suporte",
    titulo: "Suporte",
    texto: "Fale com a ABRACAM. A resposta aparece nesta página, e você recebe um aviso no sino.",
  },
  {
    alvo: "menu-/pdfs",
    titulo: "PDFs",
    texto: "Materiais de estudo da ABRACAM para baixar.",
  },
  {
    alvo: "menu-/admin",
    titulo: "Admin",
    texto: "Área da equipe da ABRACAM: questões, alunos, planos, pagamentos, materiais e suporte.",
    soAdmin: true,
  },
  {
    alvo: "sino",
    titulo: "Notificações",
    texto:
      "Avisos da sua conta: pagamento confirmado, resposta do suporte, materiais novos e vencimento do plano.",
  },
  {
    titulo: "Tudo pronto!",
    texto:
      "Achou algo estranho numa questão? Use o botão “Reportar questão” na própria questão, durante o simulado ou no resultado. Bons estudos!",
  },
];

function chaveTour(userId: string) {
  return `abt:tour-visto:v1:${userId}`;
}

function jaViu(userId: string) {
  try {
    return localStorage.getItem(chaveTour(userId)) !== null;
  } catch {
    return false;
  }
}

function marcarVisto(userId: string) {
  try {
    localStorage.setItem(chaveTour(userId), new Date().toISOString());
  } catch {
    // sem armazenamento: o tour pode aparecer de novo no próximo acesso
  }
}

/** Retângulo do elemento, se ele estiver visível na tela (no celular o menu fica escondido). */
function retanguloVisivel(alvo?: string) {
  if (!alvo || typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= window.innerWidth) return null;
  return r;
}

const LARGURA_CAIXA = 320;
const MARGEM = 12;

export function TourBoasVindas({
  userId,
  isAdmin,
  podeAbrir,
}: {
  userId: string;
  isAdmin: boolean;
  /** só abre sozinho depois que a janela "Atenção" da senha foi fechada */
  podeAbrir: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const naProva = pathname.startsWith("/prova/");
  const passos = PASSOS.filter((p) => !p.soAdmin || isAdmin);
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  // Primeiro acesso: abre sozinho (nunca durante a prova)
  useEffect(() => {
    if (podeAbrir && !naProva && !jaViu(userId)) {
      setIndice(0);
      setAberto(true);
    }
  }, [podeAbrir, naProva, userId]);

  // "Ver tour" no menu
  useEffect(() => {
    const abrir = () => {
      if (window.location.pathname.startsWith("/prova/")) return;
      setIndice(0);
      setAberto(true);
    };
    window.addEventListener(EVENTO_ABRIR_TOUR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_TOUR, abrir);
  }, []);

  const passo = passos[Math.min(indice, passos.length - 1)]!;

  const medir = useCallback(() => setRect(retanguloVisivel(passo.alvo)), [passo.alvo]);

  useLayoutEffect(() => {
    if (!aberto) return;
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [aberto, medir]);

  useEffect(() => {
    if (aberto) caixaRef.current?.focus();
  }, [aberto, indice]);

  const fechar = useCallback(() => {
    marcarVisto(userId);
    setAberto(false);
  }, [userId]);

  const ultimo = indice >= passos.length - 1;
  const avancar = useCallback(() => {
    if (ultimo) fechar();
    else setIndice((i) => i + 1);
  }, [ultimo, fechar]);
  const voltar = useCallback(() => setIndice((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      else if (e.key === "ArrowRight") avancar();
      else if (e.key === "ArrowLeft") voltar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, fechar, avancar, voltar]);

  // Se a pessoa entrar numa prova com o tour aberto, ele fecha (sem marcar como visto)
  useEffect(() => {
    if (naProva) setAberto(false);
  }, [naProva]);

  if (!aberto) return null;

  // Caixa ao lado do item destacado (ou no centro, sem destaque)
  let estilo: React.CSSProperties;
  if (rect) {
    const largura = Math.min(LARGURA_CAIXA, window.innerWidth - 2 * MARGEM);
    const cabeDireita = rect.right + MARGEM + largura <= window.innerWidth - MARGEM;
    const left = cabeDireita
      ? rect.right + MARGEM
      : Math.min(Math.max(MARGEM, rect.left), window.innerWidth - largura - MARGEM);
    const top = cabeDireita
      ? Math.min(Math.max(MARGEM, rect.top - 8), window.innerHeight - 220)
      : Math.min(rect.bottom + MARGEM, window.innerHeight - 220);
    estilo = { left, top, width: largura };
  } else {
    estilo = {
      left: "50%",
      top: "50%",
      width: Math.min(LARGURA_CAIXA + 40, window.innerWidth - 2 * MARGEM),
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {rect ? (
        // Destaque: recorte claro em volta do item, com o resto da tela escurecido
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-md ring-2 ring-primary transition-all duration-200"
          style={{
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(6, 39, 53, 0.62)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(6,39,53,0.62)]" />
      )}
      {/* Clicar fora não fecha: evita perder o tour sem querer */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-titulo"
        tabIndex={-1}
        style={estilo}
        className="fixed rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <p id="tour-titulo" className="flex items-center gap-2 text-sm font-semibold">
            <Compass className="size-4 shrink-0 text-primary" />
            {passo.titulo}
          </p>
          <button
            type="button"
            onClick={fechar}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-card-foreground"
            aria-label="Fechar o tour"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-card-foreground/90">{passo.texto}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {indice + 1} de {passos.length}
          </span>
          <div className="flex items-center gap-2">
            {!ultimo && (
              <button
                type="button"
                onClick={fechar}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-card-foreground"
              >
                Pular tour
              </button>
            )}
            {indice > 0 && (
              <button
                type="button"
                onClick={voltar}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={avancar}
              className={cn(
                "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90",
              )}
            >
              {ultimo ? "Concluir" : indice === 0 ? "Começar" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
