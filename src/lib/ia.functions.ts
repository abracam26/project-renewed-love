import { createServerFn } from "@tanstack/react-start";

export const GEMINI_MODEL = "gemini-3.6-flash";

export const testarConexaoGemini = createServerFn({ method: "POST" }).handler(async () => {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return { ok: false as const, mensagem: "GEMINI_API_KEY não configurada no projeto." };
  }

  // O 503 do Gemini é transitório (modelo sobrecarregado): tenta até 3 vezes com espera crescente.
  let res: Response | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Responda apenas: OK" }] }],
        }),
      },
    );
    if (res.status !== 503) break;
    if (tentativa < 2) await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const detalhe = res ? await res.text() : "sem resposta";
    console.error(`[Gemini] falha ${status}: ${detalhe}`);
    const mensagem =
      status === 503
        ? `O Gemini (${GEMINI_MODEL}) está temporariamente sobrecarregado. Aguarde alguns minutos e teste de novo.`
        : status === 401 || status === 403
          ? `Gemini recusou a chave (${status}). Verifique se ela é válida e tem acesso ao modelo ${GEMINI_MODEL}.`
          : `Gemini respondeu ${status}. Verifique a chave e o modelo ${GEMINI_MODEL}.`;
    return { ok: false as const, mensagem };
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  return { ok: true as const, mensagem: `Conexão com o Gemini (${GEMINI_MODEL}) funcionando.`, texto };
});
