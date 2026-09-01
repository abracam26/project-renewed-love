import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/abracam-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
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
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/", replace: true });
      }
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setEmailSent(true);
          toast.success("Confira seu e-mail para confirmar a conta.");
        } else {
          toast.success("Conta criada com sucesso!");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível concluir a operação.";
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

  async function handleGoogle() {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
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

          {emailSent ? (
            <div className="space-y-4 text-center">
              <Mail className="mx-auto size-8 text-primary" />
              <p className="text-sm text-card-foreground">
                Enviamos um link de confirmação para <strong>{email}</strong>. Confirme seu e-mail para
                acessar a plataforma.
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
                <Field label="Nome de usuário" icon={User}>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu.usuario"
                    autoComplete="username"
                    className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                  />
                </Field>
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

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {mode === "login" ? "Entrar" : "Criar minha conta"}
              </button>
            </form>
          )}

          {!emailSent && (
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
          Ao continuar você concorda com os termos de uso da plataforma.{" "}
          <Link to="/suporte" className="text-primary hover:underline">
            Precisa de ajuda?
          </Link>
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
