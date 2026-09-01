import { createServerFn } from "@tanstack/react-start";

const GEMINI_MODEL = "gemini-2.5-flash";

export const testarConexaoGemini = createServerFn({ method: "POST" }).handler(async () => {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return { ok: false as const, mensagem: "GEMINI_API_KEY não configurada no projeto." };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Responda apenas: OK" }] }],
      }),
    },
  );

  if (!res.ok) {
    const detalhe = await res.text();
    console.error(`[Gemini] falha ${res.status}: ${detalhe}`);
    return {
      ok: false as const,
      mensagem: `Gemini respondeu ${res.status}. Verifique se a chave é válida e tem acesso ao modelo ${GEMINI_MODEL}.`,
    };
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  return { ok: true as const, mensagem: `Conexão com o Gemini (${GEMINI_MODEL}) funcionando.`, texto };
});
