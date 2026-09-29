import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, IdCard, Landmark, Loader2, Lock, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import logoAsset from "@/assets/abracam-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { consumirDestinoAposLogin } from "@/lib/destino-login";
import { mensagemErro } from "@/lib/erros";
import { enviarLinkDeRecuperacao } from "@/lib/recuperacao-senha";
import { cnpjValido, formatarCnpj } from "@/lib/cnpj";
import { cpfValido, formatarCpf } from "@/lib/cpf";
import { cadastrarAluno } from "@/lib/usuarios.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — Simulador ABT" },
      {
        name: "description",
        content:
          "Acesse o Simulador ABT com e-mail e senha ou entre com sua conta Google para treinar para a certificação.",
      },
      { property: "og:title", content: "Entrar ou criar conta — Simulador ABT" },
      {
        property: "og:description",
        content: "Faça login no Simulador ABT e continue sua preparação para a certificação ABT.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const cadastrar = useServerFn(cadastrarAluno);

  const cpfInvalido = cpf.replace(/\D/g, "").length === 11 && !cpfValido(cpf);
  const cnpjInvalido = cnpj.replace(/\D/g, "").length === 14 && !cnpjValido(cnpj);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  // "Esqueci minha senha": pedir o link por e-mail
  const [recuperar, setRecuperar] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);
  const [enviandoLink, setEnviandoLink] = useState(false);

  useEffect(() => {
    // Vindo de "Pedir um novo link" (link de nova senha vencido)
    if (new URLSearchParams(window.location.search).get("recuperar") === "1") {
      setMode("login");
      setRecuperar(true);
    }
  }, []);

  useEffect(() => {
    // Já logado (ou acabou de entrar): volta para a página que tentou abrir
    let foi = false;
    const seguir = () => {
      if (foi) return;
      foi = true;
      void navigate({ href: consumirDestinoAposLogin(), replace: true });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) seguir();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) seguir();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      } else {
        // A conta é criada no servidor, que grava CPF e dados do cadastro no
        // perfil sem passá-los pelos metadados do login.
        const { sessao } = await cadastrar({
          data: {
            nome,
            cpf,
            cnpj: cnpj || null,
            instituicao,
            email,
            senha: password,
            redirectTo: window.location.origin,
          },
        });
        if (sessao) {
          const { error } = await supabase.auth.setSession(sessao);
          if (error) throw error;
          toast.success("Conta criada com sucesso!");
        } else {
          setEmailSent(true);
          toast.success("Confira seu e-mail para confirmar a conta.");
        }
      }
    } catch (err) {
      const message = mensagemErro(err);
      toast.error(
        message.includes("Invalid login credentials")
          ? "E-mail ou senha incorretos."
          : message.includes("already registered")
            ? "Este e-mail já possui uma conta."
            : message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setEnviandoLink(true);
    try {
      await enviarLinkDeRecuperacao(email);
      setLinkEnviado(true);
    } catch (err) {
      toast.error(mensagemErro(err));
    } finally {
      setEnviandoLink(false);
    }
  }

  function voltarParaLogin() {
    setRecuperar(false);
    setLinkEnviado(false);
    setEmailSent(false);
    setMode("login");
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + consumirDestinoAposLogin() },
    });
    if (error) {
      setGoogleLoading(false);
      toast.error("Não foi possível entrar com o Google. Verifique se o provedor está ativado.");
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
          <p className="mt-1 text-sm text-muted-foreground">
            Sua plataforma de preparação para a certificação ABT
          </p>
        </div>

        <div className="panel p-6">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
            {(["login", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setEmailSent(false);
                  setRecuperar(false);
                  setLinkEnviado(false);
                }}
                className={cn(
                  "rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-gold"
                    : "text-card-foreground/70 hover:text-card-foreground",
                )}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {recuperar ? (
            linkEnviado ? (
              <div className="space-y-4 text-center">
                <Mail className="mx-auto size-8 text-primary" />
                <p className="text-sm text-card-foreground">
                  Se existir uma conta com o e-mail <strong>{email}</strong>, você vai receber em
                  alguns minutos um link para criar uma nova senha.
                </p>
                <p className="text-xs text-muted-foreground">
                  Confira também a caixa de spam. O link vale por tempo limitado e só pode ser usado
                  uma vez. Se pedir mais de um, use o e-mail mais recente.
                </p>
                <button
                  type="button"
                  onClick={voltarParaLogin}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Voltar para o login
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecuperar} className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-card-foreground">Recuperar senha</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Digite o e-mail da sua conta. Vamos enviar um link para você criar uma nova
                    senha.
                  </p>
                </div>
                <Field label="E-mail" icon={Mail}>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    autoComplete="email"
                    className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                  />
                </Field>
                <button
                  type="submit"
                  disabled={enviandoLink}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {enviandoLink && <Loader2 className="size-4 animate-spin" />}
                  Enviar link
                </button>
                <button
                  type="button"
                  onClick={voltarParaLogin}
                  className="block w-full text-center text-sm font-medium text-primary hover:underline"
                >
                  Voltar para o login
                </button>
              </form>
            )
          ) : emailSent ? (
            <div className="space-y-4 text-center">
              <Mail className="mx-auto size-8 text-primary" />
              <p className="text-sm text-card-foreground">
                Enviamos um link de confirmação para <strong>{email}</strong>. Confirme seu e-mail
                para acessar a plataforma.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEmailSent(false);
                  setMode("login");
                }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Voltar para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <Field label="Nome completo" icon={User}>
                    <input
                      type="text"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Seu nome completo"
                      autoComplete="name"
                      className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </Field>

                  <Field label="CPF" icon={IdCard}>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      value={cpf}
                      onChange={(e) => setCpf(formatarCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </Field>
                  {cpfInvalido && <p className="-mt-2 text-xs text-destructive">CPF inválido.</p>}

                  <Field label="CNPJ (opcional)" icon={Landmark}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cnpj}
                      onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                      placeholder="00.000.000/0000-00"
                      className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </Field>
                  {cnpjInvalido && <p className="-mt-2 text-xs text-destructive">CNPJ inválido.</p>}

                  <Field label="Instituição" icon={Building2}>
                    <input
                      type="text"
                      required
                      value={instituicao}
                      onChange={(e) => setInstituicao(e.target.value)}
                      placeholder="Empresa ou instituição em que você trabalha"
                      autoComplete="organization"
                      className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </Field>
                </>
              )}

              <Field label="E-mail" icon={Mail}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  autoComplete="email"
                  className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                />
              </Field>

              <Field label="Senha" icon={Lock}>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                />
              </Field>
              {mode === "login" && (
                <div className="-mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setRecuperar(true);
                      setLinkEnviado(false);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (mode === "signup" && (cpfInvalido || cnpjInvalido))}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {mode === "login" ? "Entrar" : "Criar minha conta"}
              </button>
            </form>
          )}

          {!emailSent && !recuperar && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">ou</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="flex w-full items-center justify-center gap-3 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-card-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
                Continuar com o Google
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Ao continuar você concorda com os{" "}
          <Link to="/termos" className="text-primary hover:underline">
            Termos de Uso
          </Link>{" "}
          e com a{" "}
          <Link to="/privacidade" className="text-primary hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-card-foreground/80">{label}</span>
      <span className="flex items-center gap-2 rounded-md border border-input bg-background/5 px-3 py-2.5 focus-within:border-ring">
        <Icon className="size-4 shrink-0 text-primary" />
        {children}
      </span>
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}
