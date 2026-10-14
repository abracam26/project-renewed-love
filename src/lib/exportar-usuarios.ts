/** Arquivos da lista de usuários do Admin (CSV, TXT e PDF), montados no navegador. */

export type TabelaUsuarios = { colunas: string[]; linhas: string[][]; total: number };
export type InfoExportacao = { filtro: string; busca: string; geradoEm: string };
export type FormatoExportacao = "csv" | "txt" | "pdf";

/** Célula de CSV separado por ";": aspas quando preciso e proteção contra fórmulas no Excel. */
function celulaCsv(valor: string): string {
  let v = valor;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function gerarCsv(t: TabelaUsuarios): Blob {
  const texto = [t.colunas, ...t.linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n");
  // BOM para o Excel reconhecer acentos (UTF-8)
  return new Blob(["﻿" + texto + "\r\n"], { type: "text/csv;charset=utf-8" });
}

function gerarTxt(t: TabelaUsuarios, info: InfoExportacao): Blob {
  const largura = Math.max(...t.colunas.map((c) => c.length));
  const cabecalho = [
    "ABRACAM - Simulador ABT",
    "Relatório de usuários cadastrados",
    `Gerado em: ${info.geradoEm}`,
    `Filtro: ${info.filtro}${info.busca ? ` | Busca: ${info.busca}` : ""}`,
    `Total: ${t.total} usuário${t.total === 1 ? "" : "s"}`,
    "=".repeat(60),
  ];
  const blocos = t.linhas.map((l, i) =>
    [
      `#${i + 1}`,
      ...t.colunas.map((c, j) => `${c.padEnd(largura)} : ${l[j] || "-"}`),
      "-".repeat(60),
    ].join("\r\n"),
  );
  return new Blob(["﻿" + [...cabecalho, "", ...blocos].join("\r\n") + "\r\n"], {
    type: "text/plain;charset=utf-8",
  });
}

/** Colunas do PDF (a página não comporta todas; o CSV e o TXT trazem a lista completa). */
const COLUNAS_PDF = [
  "Nome",
  "E-mail",
  "CPF",
  "Instituição",
  "Tipo de plano",
  "Acesso válido até",
  "Acesso ativo",
  "Saldo de simulados (pacotes)",
  "Último acesso",
  "Simulados feitos",
];
const TITULO_PDF: Record<string, string> = {
  "Saldo de simulados (pacotes)": "Saldo",
  "Acesso válido até": "Válido até",
  "Simulados feitos": "Simulados",
  "Tipo de plano": "Plano",
  "Acesso ativo": "Ativo",
};

async function gerarPdf(t: TabelaUsuarios, info: InfoExportacao): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const idx = COLUNAS_PDF.map((c) => t.colunas.indexOf(c)).filter((i) => i >= 0);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("ABRACAM · Simulador ABT — Usuários cadastrados", 36, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Gerado em ${info.geradoEm} · Filtro: ${info.filtro}${info.busca ? ` · Busca: ${info.busca}` : ""} · Total: ${t.total} usuário${t.total === 1 ? "" : "s"}`,
    36,
    56,
  );
  autoTable(doc, {
    startY: 68,
    head: [idx.map((i) => TITULO_PDF[t.colunas[i] ?? ""] ?? t.colunas[i] ?? "")],
    body: t.linhas.map((l) => idx.map((i) => l[i] ?? "")),
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [0, 35, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [242, 245, 247] },
    margin: { left: 36, right: 36 },
    didDrawPage: () => {
      const pagina = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.text(`Página ${pagina}`, largura - 36, doc.internal.pageSize.getHeight() - 20, {
        align: "right",
      });
    },
  });
  return doc.output("blob");
}

export async function baixarUsuarios(
  formato: FormatoExportacao,
  t: TabelaUsuarios,
  info: InfoExportacao,
  nomeBase: string,
) {
  const blob =
    formato === "csv"
      ? gerarCsv(t)
      : formato === "txt"
        ? gerarTxt(t, info)
        : await gerarPdf(t, info);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nomeBase}.${formato}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
