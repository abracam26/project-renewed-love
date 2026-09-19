/**
 * Validação e hash de CPF.
 * O CPF nunca é gravado em texto claro no banco: só a versão em hash SHA-256.
 * A comparação por hash é suficiente para saber se um CPF já usou o teste grátis.
 */

/** Remove caracteres não numéricos. */
export function limparCpf(v: string): string {
  return v.replace(/\D/g, "");
}

/** Formata "12345678909" -> "123.456.789-09". */
export function formatarCpf(v: string): string {
  const s = limparCpf(v).slice(0, 11);
  const p1 = s.slice(0, 3);
  const p2 = s.slice(3, 6);
  const p3 = s.slice(6, 9);
  const p4 = s.slice(9, 11);
  let out = p1;
  if (s.length > 3) out += "." + p2;
  if (s.length > 6) out += "." + p3;
  if (s.length > 9) out += "-" + p4;
  return out;
}

/** Valida o CPF pelo algoritmo do dígito verificador. */
export function cpfValido(v: string): boolean {
  const s = limparCpf(v);
  if (s.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(s)) return false;

  const calc = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };

  const d1 = calc(s.slice(0, 9), 10);
  if (d1 !== Number(s[9])) return false;
  const d2 = calc(s.slice(0, 10), 11);
  return d2 === Number(s[10]);
}

/**
 * Calcula o hash SHA-256 do CPF, com sal fixo do ambiente para evitar
 * ataque de dicionário caso o banco vaze. Roda no servidor via Web Crypto,
 * que existe nativamente em Node 20+ e no runtime do Cloudflare.
 */
export async function hashCpf(cpf: string, sal: string): Promise<string> {
  const s = limparCpf(cpf);
  const enc = new TextEncoder().encode(`${sal}::${s}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
