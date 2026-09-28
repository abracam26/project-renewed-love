/** Validação e formatação de CNPJ (campo opcional do cadastro). */

/** Remove caracteres não numéricos. */
export function limparCnpj(v: string): string {
  return v.replace(/\D/g, "");
}

/** Formata "11222333000181" -> "11.222.333/0001-81". */
export function formatarCnpj(v: string): string {
  const s = limparCnpj(v).slice(0, 14);
  let out = s.slice(0, 2);
  if (s.length > 2) out += "." + s.slice(2, 5);
  if (s.length > 5) out += "." + s.slice(5, 8);
  if (s.length > 8) out += "/" + s.slice(8, 12);
  if (s.length > 12) out += "-" + s.slice(12, 14);
  return out;
}

/** Valida o CNPJ pelo algoritmo do dígito verificador. */
export function cnpjValido(v: string): boolean {
  const s = limparCnpj(v);
  if (s.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(s)) return false;

  const calc = (base: string): number => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i]!;
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };

  if (calc(s.slice(0, 12)) !== Number(s[12])) return false;
  return calc(s.slice(0, 13)) === Number(s[13]);
}
