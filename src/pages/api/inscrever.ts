import type { APIRoute } from 'astro';
import { TEXTO_CONSENTIMENTO } from '../../config';

// Esta rota roda no servidor (na Vercel), nunca no navegador do visitante.
// E por isso que a senha secreta pode ficar aqui em seguranca.
export const prerender = false;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function responder(ok: boolean, mensagem: string, status: number, link?: string) {
  return new Response(JSON.stringify({ ok, mensagem, link }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const url = import.meta.env.PLANILHA_URL ?? process.env.PLANILHA_URL;
  const senha = import.meta.env.PLANILHA_SENHA ?? process.env.PLANILHA_SENHA;

  if (!url || !senha) {
    console.error('PLANILHA_URL ou PLANILHA_SENHA nao configuradas');
    return responder(false, 'Cadastro indisponível no momento.', 500);
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return responder(false, 'Dados inválidos.', 400);
  }

  const nome = String(corpo.nome ?? '').trim().slice(0, 80);
  const email = String(corpo.email ?? '').trim().toLowerCase().slice(0, 120);
  const consentimento = corpo.consentimento === true;
  const armadilha = String(corpo.armadilha ?? '').trim();
  const origem = String(corpo.origem ?? '').trim().slice(0, 60);

  // Robo preencheu o campo invisivel: fingimos sucesso e descartamos.
  if (armadilha) {
    return responder(true, 'ok', 200);
  }

  if (!nome) {
    return responder(false, 'Escreva seu nome.', 400);
  }
  if (!EMAIL_VALIDO.test(email)) {
    return responder(false, 'Confira o e-mail: parece que falta algo.', 400);
  }
  if (!consentimento) {
    return responder(false, 'É preciso aceitar para continuar.', 400);
  }

  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senha,
        nome,
        email,
        consentimento,
        textoAceito: TEXTO_CONSENTIMENTO,
        origem,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const resultado = (await resposta.json()) as {
      ok?: boolean;
      mensagem?: string;
      link?: string;
    };

    if (!resultado.ok) {
      console.error('Planilha recusou o cadastro:', resultado.mensagem);
      return responder(false, 'Não conseguimos salvar seu cadastro. Tente de novo.', 502);
    }

    // O link da Comunidade vem da propria planilha (aba Configuracao, B1),
    // para o Marcio poder troca-lo sem republicar o site.
    return responder(true, 'ok', 200, resultado.link);
  } catch (erro) {
    console.error('Falha ao falar com a planilha:', erro);
    return responder(false, 'Não conseguimos salvar seu cadastro. Tente de novo.', 502);
  }
};
