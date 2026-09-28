import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useStatusConta } from "@/hooks/use-status-conta";
import { cnpjValido, formatarCnpj } from "@/lib/cnpj";
import { cpfValido, formatarCpf } from "@/lib/cpf";
import { mensagemErro } from "@/lib/erros";
import { completarCadastro } from "@/lib/usuarios.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Envolve as páginas logadas:
 * 1. Quem ainda não tem cadastro completo (login pelo Google ou conta antiga)
 *    vê o formulário de cadastro no lugar da página.
 * 2. A cada login, mostra o aviso de que a senha da plataforma não é a do exame.
 * Visitantes (sem login) passam direto: cada página já trata esse caso.
 */
export function ContaGate({ children }: { children: ReactNode }) {
  const { session, token, loading, status } = useStatusConta();

  if (!token || !session) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin text-primary" /> Carregando sua conta...
      </div>
    );
  }

  // Se o status falhar (rede), não trava o aluno: as funções de servidor
  // continuam exigindo cadastro e plano de qualquer forma.
  if (status && !status.cadastroCompleto) {
    return (
      <CompletarCadastro token={token} email={status.email} sugestaoNome={status.sugestaoNome} />
    );
  }

  return (
    <>
      {children}
      <AvisoSenha userId={session.user.id} ultimoLogin={session.user.last_sign_in_at ?? ""} />
    </>
  );
}

// ---------------------------------------------------------------------
// Aviso de senha, uma vez a cada login
// ---------------------------------------------------------------------
function chaveAviso(userId: string, ultimoLogin: string) {
  return `aviso-senha-exame:${userId}:${ultimoLogin}`;
}

function AvisoSenha({ userId, ultimoLogin }: { userId: string; ultimoLogin: string }) {
  const [aberto, setAberto] = useState(() => {
    try {
      return localStorage.getItem(chaveAviso(userId, ultimoLogin)) === null;
    } catch {
      return true;
    }
  });

  function confirmar() {
    try {
      localStorage.setItem(chaveAviso(userId, ultimoLogin), "1");
    } catch {
      // sem armazenamento: o aviso volta na próxima página, sem prejuízo
    }
    setAberto(false);
  }

  return (
    <AlertDialog open={aberto}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            Atenção
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            A senha que você usa nesta plataforma <strong>não é a mesma</strong> utilizada para a
            realização do exame de certificação. O Simulador ABT é um ambiente de estudo, separado
            do sistema da prova oficial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={confirmar}>Entendi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------
// Formulário de cadastro obrigatório
// ---------------------------------------------------------------------
const inputClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring";

function CompletarCadastro({
  token,
  email,
  sugestaoNome,
}: {
  token: string;
  email: string | null;
  sugestaoNome: string;
}) {
  const salvar = useServerFn(completarCadastro);
  const queryClient = useQueryClient();
  const [nome, setNome] = useState(sugestaoNome);
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [instituicao, setInstituicao] = useState("");

  const cpfInvalido = cpf.replace(/\D/g, "").length === 11 && !cpfValido(cpf);
  const cnpjInvalido = cnpj.replace(/\D/g, "").length === 14 && !cnpjValido(cnpj);

  const mut = useMutation({
    mutationFn: () => salvar({ data: { token, nome, cpf, cnpj: cnpj || null, instituicao } }),
    onSuccess: async () => {
      toast.success("Cadastro concluído!");
      await queryClient.invalidateQueries({ queryKey: ["status-conta"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });

  return (
    <div className="mx-auto max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="panel space-y-4 p-6"
      >
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-card-foreground">
            <UserCheck className="size-5 text-primary" />
            Complete seu cadastro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Para usar o simulador, precisamos de alguns dados. Você só faz isso uma vez.
          </p>
        </div>

        <label className="block text-xs font-medium text-card-foreground/80">
          E-mail
          <input value={email ?? ""} readOnly className={`${inputClass} opacity-70`} />
        </label>

        <label className="block text-xs font-medium text-card-foreground/80">
          Nome completo *
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-card-foreground/80">
            CPF *
            <input
              required
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              placeholder="000.000.000-00"
              className={inputClass}
            />
            {cpfInvalido && <span className="mt-1 block text-destructive">CPF inválido.</span>}
          </label>
          <label className="block text-xs font-medium text-card-foreground/80">
            CNPJ (opcional)
            <input
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              className={inputClass}
            />
            {cnpjInvalido && <span className="mt-1 block text-destructive">CNPJ inválido.</span>}
          </label>
        </div>

        <label className="block text-xs font-medium text-card-foreground/80">
          Instituição *
          <input
            required
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value)}
            placeholder="Empresa ou instituição em que você trabalha"
            autoComplete="organization"
            className={inputClass}
          />
        </label>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          O CPF identifica sua conta e libera um único teste grátis por pessoa. Ele fica visível
          apenas para a equipe administrativa da ABRACAM. Veja a{" "}
          <a href="/privacidade" target="_blank" className="text-primary hover:underline">
            Política de Privacidade
          </a>
          .
        </p>

        <button
          type="submit"
          disabled={mut.isPending || cpfInvalido || cnpjInvalido}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-gold hover:bg-primary/90 disabled:opacity-60"
        >
          {mut.isPending && <Loader2 className="size-4 animate-spin" />}
          Concluir cadastro
        </button>
      </form>
    </div>
  );
}
