import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useReducer, useState } from "react";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/abracam-logo.png.asset.json";
import { useSupabaseSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";
import {
  encerrarRecuperacao,
  erroDoLink,
  EVENTO_RECUPERACAO,
  linkEmVerificacao,
  recuperacaoAtiva,
  traduzirErroSenha,
} from "@/lib/recuperacao-senha";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Criar nova senha — Simulador ABT" },
      {
        name: "description",
        content: "Crie uma nova senha para entrar no Simulador ABT.",
      },
    ],
  }),
  component: RedefinirSenha,
});

const inputClass =
  "w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground";

function RedefinirSenha() {
  const navigate = useNavigate();
  const { session, loading } = useSupabaseSession();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  // A marca e o erro do link ficam na aba; o aviso do link conferido redesenha a página
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    window.addEventListener(EVENTO_RECUPERACAO, redesenhar);
    return () => window.removeEventListener(EVENTO_RECUPERACAO, redesenhar);
  }, []);

  const pronto = Boolean(session) && recuperacaoAtiva(session?.user.id);
  const erroLink = erroDoLink();
  const verificando = !pronto && !erroLink && (loading || linkEmVerificacao());

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      toast.error("As duas senhas não são iguais. Digite a mesma senha nos dois campos.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw new Error(traduzirErroSenha(error.message));
      encerrarRecuperacao();
      toast.success("Senha alterada com sucesso!");
      void navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={logoAsset.url}
            alt="Logo ABRACAM"
            className="size-20 rounded-xl bg-white object-contain p-2 shadow-panel"
          />
          <h1 className="mt-4 font-display text-2xl font-bold text-sidebar-foreground">
            Simulador <span className="text-primary">ABT</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Criar nova senha</p>
        </div>

        <div className="panel p-6">
          {verificando ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Verificando o link...
            </div>
          ) : pronto ? (
            <form onSubmit={salvar} className="space-y-4">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" />
                <p className="text-sm text-card-foreground">
                  Crie uma nova senha para a conta <strong>{session?.user.email}</strong>. Ela passa
                  a valer assim que você salvar.
                </p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-card-foreground/80">
                  Nova senha
                </span>
                <span className="flex items-center gap-2 rounded-md border border-input bg-background/5 px-3 py-2.5 focus-within:border-ring">
                  <Lock className="size-4 shrink-0 text-primary" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    maxLength={72}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Pelo menos 6 caracteres"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-card-foreground/80">
                  Repita a nova senha
                </span>
                <span className="flex items-center gap-2 rounded-md border border-input bg-background/5 px-3 py-2.5 focus-within:border-ring">
                  <Lock className="size-4 shrink-0 text-primary" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    maxLength={72}
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                    placeholder="Digite a mesma senha"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </span>
              </label>

              <button
                type="submit"
                disabled={salvando}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {salvando && <Loader2 className="size-4 animate-spin" />}
                Salvar nova senha
              </button>
            </form>
          ) : session && !erroLink ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-card-foreground">
                Para trocar a sua senha, use o botão <strong>“Trocar minha senha”</strong> no
                Perfil. Vamos enviar um link para o seu e-mail.
              </p>
              <Link
                to="/perfil"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Ir para o Perfil
              </Link>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm font-semibold text-card-foreground">
                Link inválido ou expirado
              </p>
              <p className="text-sm text-muted-foreground">
                Este link para criar uma nova senha não vale mais. Ele pode ter expirado ou já ter
                sido usado. Peça um novo link e use sempre o e-mail mais recente.
              </p>
              {session ? (
                <Link
                  to="/perfil"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Pedir um novo link no Perfil
                </Link>
              ) : (
                <>
                  <a
                    href="/auth?recuperar=1"
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Pedir um novo link
                  </a>
                  <div>
                    <Link to="/auth" className="text-sm font-medium text-primary hover:underline">
                      Voltar para o login
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
