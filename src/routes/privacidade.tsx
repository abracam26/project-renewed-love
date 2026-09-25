import { createFileRoute, Link } from "@tanstack/react-router";
import { Email, LinkExterno, Lista, PaginaLegal, Secao } from "@/components/PaginaLegal";
import { CONTROLADOR } from "@/lib/juridico";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Simulador ABT" },
      {
        name: "description",
        content:
          "Quais dados pessoais o Simulador ABT da ABRACAM coleta, para que são usados e como exercer seus direitos pela LGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — Simulador ABT" },
    ],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <PaginaLegal
      titulo="Política de Privacidade"
      resumo={
        <>
          Esta política explica quais dados pessoais o Simulador ABT coleta, para que eles são
          usados e como você pode exercer os direitos previstos na Lei Geral de Proteção de Dados
          Pessoais (Lei nº 13.709/2018 – LGPD).
        </>
      }
    >
      <Secao numero={1} titulo="Quem é o responsável pelos seus dados">
        <p>
          O Simulador ABT é oferecido pela {CONTROLADOR.nome}, inscrita no CNPJ sob o nº{" "}
          {CONTROLADOR.cnpj}, com sede na {CONTROLADOR.endereco}. A ABRACAM é a controladora dos
          dados pessoais tratados no simulador.
        </p>
        <p>
          Esta política trata especificamente do Simulador ABT e complementa a{" "}
          <LinkExterno href={CONTROLADOR.politicaGeral}>
            Política de Privacidade geral da ABRACAM
          </LinkExterno>
          .
        </p>
      </Secao>

      <Secao numero={2} titulo="Quais dados coletamos">
        <Lista>
          <li>
            <strong>Dados de cadastro:</strong> nome de usuário, e-mail e senha. A senha é guardada
            de forma criptografada pelo serviço de autenticação e não fica acessível à ABRACAM.
          </li>
          <li>
            <strong>Login com Google:</strong> se você escolher entrar com sua conta Google,
            recebemos nome, e-mail e foto do perfil, conforme autorizado por você na tela do Google.
            Não temos acesso à sua senha do Google nem a outros dados da sua conta, como e-mails,
            contatos ou arquivos.
          </li>
          <li>
            <strong>CPF:</strong> solicitado somente para liberar o simulado gratuito. Guardamos
            apenas uma versão cifrada do número, usada para verificar se aquele CPF já utilizou a
            gratuidade. O CPF não é exibido na plataforma nem compartilhado.
          </li>
          <li>
            <strong>Dados de uso do simulador:</strong> simulados iniciados e concluídos, respostas
            marcadas, acertos, erros, notas, tempo gasto em cada questão, datas e horários.
          </li>
          <li>
            <strong>Dados do plano:</strong> tipo de plano e data de validade do acesso.
          </li>
          <li>
            <strong>Dados técnicos:</strong> informações necessárias ao funcionamento e à segurança
            do serviço, como endereço IP, data e hora de acesso e registros técnicos de erro,
            gerados automaticamente pelos provedores de infraestrutura.
          </li>
        </Lista>
      </Secao>

      <Secao numero={3} titulo="Para que usamos os dados">
        <Lista>
          <li>
            Criar e manter sua conta e permitir o seu acesso (execução de contrato, art. 7º, V, da
            LGPD).
          </li>
          <li>
            Montar os simulados, evitar a repetição de questões, corrigir as provas e mostrar seu
            histórico, seus resultados e as indicações de onde estudar (execução de contrato).
          </li>
          <li>
            Garantir um único simulado gratuito por CPF e prevenir fraudes e abusos (legítimo
            interesse, art. 7º, IX).
          </li>
          <li>
            Enviar comunicações sobre a conta, como confirmação de e-mail, redefinição de senha e
            avisos importantes sobre o serviço (execução de contrato).
          </li>
          <li>
            Proteger a plataforma, apurar acessos indevidos e cumprir obrigações legais ou ordens de
            autoridades (cumprimento de obrigação legal e exercício regular de direitos, art. 7º, II
            e VI).
          </li>
          <li>
            Produzir estatísticas agregadas, que não identificam ninguém, para aprimorar as questões
            e o simulador (legítimo interesse).
          </li>
        </Lista>
        <p>
          Não vendemos dados pessoais, não os usamos para publicidade de terceiros e não enviamos
          seus dados pessoais nem suas respostas a ferramentas de inteligência artificial.
        </p>
      </Secao>

      <Secao numero={4} titulo="Ranking de desempenho">
        <p>
          Quando o ranking estiver disponível, ele exibirá apenas o seu nome de usuário e o seu
          desempenho nos simulados, nunca o seu e-mail ou CPF. Você poderá desativar sua
          participação a qualquer momento na página Perfil.
        </p>
      </Secao>

      <Secao numero={5} titulo="Com quem compartilhamos">
        <Lista>
          <li>
            Provedores de tecnologia que operam o simulador em nome da ABRACAM: hospedagem da
            aplicação (Lovable) e banco de dados e autenticação (Supabase). Eles tratam os dados
            apenas para prestar esses serviços.
          </li>
          <li>
            Google, somente se você escolher entrar com a conta Google, para concluir o login.
          </li>
          <li>Autoridades públicas, quando houver obrigação legal ou ordem judicial.</li>
        </Lista>
        <p>
          Alguns desses provedores podem armazenar dados em servidores localizados fora do Brasil.
          Nesses casos, a transferência internacional segue o art. 33 da LGPD, com fornecedores que
          adotam medidas de segurança e de proteção de dados compatíveis com a lei.
        </p>
      </Secao>

      <Secao numero={6} titulo="Por quanto tempo guardamos">
        <Lista>
          <li>
            <strong>Conta e histórico de simulados:</strong> enquanto sua conta estiver ativa. Se
            você pedir a exclusão, esses dados são apagados ou anonimizados, exceto o que for
            necessário para cumprir obrigações legais ou exercer direitos.
          </li>
          <li>
            <strong>Versão cifrada do CPF:</strong> mantida mesmo após a exclusão da conta,
            exclusivamente para impedir que o mesmo CPF utilize a gratuidade novamente.
          </li>
          <li>
            <strong>Registros técnicos de acesso:</strong> pelo prazo exigido pela legislação
            aplicável.
          </li>
        </Lista>
      </Secao>

      <Secao numero={7} titulo="Seus direitos">
        <p>Pela LGPD (art. 18), você pode, a qualquer momento:</p>
        <Lista>
          <li>confirmar se tratamos seus dados e ter acesso a eles;</li>
          <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
          <li>
            pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou
            tratados em desconformidade com a lei;
          </li>
          <li>pedir a portabilidade dos seus dados;</li>
          <li>pedir a exclusão da sua conta e dos dados associados a ela;</li>
          <li>saber com quem compartilhamos seus dados;</li>
          <li>
            revogar o consentimento, quando ele for a base do tratamento, e se opor a tratamentos
            feitos com outra base legal, em caso de descumprimento da lei.
          </li>
        </Lista>
        <p>
          Para exercer esses direitos, escreva para{" "}
          <Email endereco={CONTROLADOR.emailPrivacidade} /> a partir do e-mail cadastrado no
          simulador. Poderemos pedir informações adicionais para confirmar a sua identidade. Você
          também pode apresentar reclamação à{" "}
          <LinkExterno href="https://www.gov.br/anpd">
            Autoridade Nacional de Proteção de Dados (ANPD)
          </LinkExterno>
          .
        </p>
      </Secao>

      <Secao numero={8} titulo="Segurança">
        <p>
          Adotamos medidas técnicas e administrativas para proteger seus dados, entre elas: conexão
          criptografada (HTTPS); senha e CPF armazenados de forma cifrada; regras de acesso no banco
          de dados que impedem um usuário de ver os dados de outro; e acesso às áreas
          administrativas restrito a pessoas autorizadas pela ABRACAM.
        </p>
        <p>
          Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente de segurança que
          possa acarretar risco ou dano relevante, comunicaremos os titulares afetados e a ANPD,
          conforme a LGPD.
        </p>
      </Secao>

      <Secao numero={9} titulo="Cookies e armazenamento no navegador">
        <p>
          O simulador usa o armazenamento local do navegador apenas para manter você conectado à sua
          conta. Não usamos cookies de publicidade nem ferramentas de rastreamento para fins de
          marketing. Você pode apagar esses dados nas configurações do navegador; nesse caso, será
          preciso entrar novamente.
        </p>
      </Secao>

      <Secao numero={10} titulo="Menores de idade">
        <p>
          O Simulador ABT é voltado à preparação para certificações profissionais e destina-se a
          maiores de 18 anos. Menores de 18 anos só devem utilizá-lo com autorização e
          acompanhamento do responsável legal.
        </p>
      </Secao>

      <Secao numero={11} titulo="Alterações desta política">
        <p>
          Podemos atualizar esta política para refletir mudanças no simulador ou na legislação. A
          data da última atualização fica no topo desta página e, em caso de mudança relevante,
          avisaremos na plataforma ou por e-mail.
        </p>
      </Secao>

      <Secao numero={12} titulo="Contato e encarregado de dados">
        <p>
          O Encarregado pelo Tratamento de Dados Pessoais (DPO) da ABRACAM atende pelo e-mail{" "}
          <Email endereco={CONTROLADOR.emailPrivacidade} />. Endereço para correspondência:{" "}
          {CONTROLADOR.endereco}.
        </p>
        <p>
          Consulte também os{" "}
          <Link to="/termos" className="font-medium text-primary hover:underline">
            Termos de Uso
          </Link>{" "}
          do simulador.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
