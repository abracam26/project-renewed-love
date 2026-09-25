import { createFileRoute, Link } from "@tanstack/react-router";
import { Email, Lista, PaginaLegal, Secao } from "@/components/PaginaLegal";
import { CONTROLADOR } from "@/lib/juridico";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Simulador ABT" },
      {
        name: "description",
        content:
          "Regras de uso do Simulador ABT, a plataforma de simulados da ABRACAM para as certificações ABT1 e ABT2.",
      },
      { property: "og:title", content: "Termos de Uso — Simulador ABT" },
    ],
  }),
  component: Termos,
});

const linkClass = "font-medium text-primary hover:underline";

function Termos() {
  return (
    <PaginaLegal
      titulo="Termos de Uso"
      resumo={
        <>
          Estes Termos de Uso regem o acesso e o uso do Simulador ABT, a plataforma de simulados da
          ABRACAM para as certificações ABT1 e ABT2. Ao criar uma conta ou usar o simulador, você
          declara que leu e concorda com estes termos e com a{" "}
          <Link to="/privacidade" className={linkClass}>
            Política de Privacidade
          </Link>
          .
        </>
      }
    >
      <Secao numero={1} titulo="Sobre o Simulador ABT">
        <p>
          O Simulador ABT é uma ferramenta de estudo oferecida pela {CONTROLADOR.nome}, CNPJ{" "}
          {CONTROLADOR.cnpj}. Os simulados usam questões elaboradas a partir do Material de Apoio da
          ABRACAM para as certificações ABT1 e ABT2.
        </p>
        <p>
          O simulador não é a prova oficial de certificação. O desempenho nos simulados não garante
          aprovação e não substitui o estudo do Material de Apoio e da regulamentação vigente. As
          questões podem ser revisadas a qualquer tempo, conforme atualizações do material ou das
          normas.
        </p>
      </Secao>

      <Secao numero={2} titulo="Cadastro e conta">
        <Lista>
          <li>
            Para usar o simulador, você precisa criar uma conta com e-mail e senha ou entrar com sua
            conta Google.
          </li>
          <li>Você deve fornecer informações verdadeiras e mantê-las atualizadas.</li>
          <li>
            A conta é pessoal e intransferível. Não compartilhe sua senha nem permita que outras
            pessoas usem o seu acesso.
          </li>
          <li>
            Você é responsável pelas atividades realizadas na sua conta. Se suspeitar de uso
            indevido, avise a ABRACAM imediatamente.
          </li>
        </Lista>
      </Secao>

      <Secao numero={3} titulo="Simulado gratuito">
        <Lista>
          <li>Cada pessoa tem direito a um único simulado gratuito, vinculado ao CPF.</li>
          <li>
            O CPF informado deve ser o seu. É proibido usar o CPF de outra pessoa ou criar contas
            adicionais para obter novas gratuidades.
          </li>
          <li>
            O descumprimento dessas regras pode levar ao bloqueio da gratuidade e à suspensão da
            conta.
          </li>
        </Lista>
      </Secao>

      <Secao numero={4} titulo="Planos de acesso">
        <p>
          O acesso completo ao simulador pode depender da contratação de um plano. Preço, prazo de
          validade, forma de pagamento e condições de renovação e cancelamento serão informados
          antes da contratação. Nas contratações feitas pela internet, você pode desistir em até 7
          (sete) dias a contar da contratação, conforme o art. 49 do Código de Defesa do Consumidor.
        </p>
      </Secao>

      <Secao numero={5} titulo="Propriedade intelectual">
        <p>
          As questões, alternativas e explicações, o Material de Apoio, a marca e o logotipo da
          ABRACAM e o próprio software do simulador são protegidos por direitos de propriedade
          intelectual e pertencem à ABRACAM ou a seus licenciantes.
        </p>
        <p>
          O acesso é concedido apenas para uso pessoal e não comercial, com a finalidade de estudo.
          Sem autorização prévia e por escrito da ABRACAM, é proibido:
        </p>
        <Lista>
          <li>copiar, reproduzir, gravar ou capturar a tela das questões para distribuí-las;</li>
          <li>
            publicar ou compartilhar questões e gabaritos em sites, redes sociais, grupos de
            mensagens, cursos, apostilas ou bancos de questões;
          </li>
          <li>vender, alugar ou ceder o acesso ou o conteúdo do simulador;</li>
          <li>
            extrair conteúdo por meios automatizados, como robôs, scripts ou raspagem de dados, ou
            usá-lo para treinar sistemas de inteligência artificial.
          </li>
        </Lista>
      </Secao>

      <Secao numero={6} titulo="Condutas proibidas">
        <p>Também é proibido:</p>
        <Lista>
          <li>
            tentar burlar o sorteio de questões, o cronômetro ou os limites do plano e da
            gratuidade;
          </li>
          <li>
            acessar ou tentar acessar áreas administrativas, contas ou dados de outras pessoas;
          </li>
          <li>
            explorar falhas de segurança, fazer engenharia reversa ou interferir no funcionamento da
            plataforma;
          </li>
          <li>usar o simulador para qualquer finalidade ilícita ou contrária a estes termos.</li>
        </Lista>
      </Secao>

      <Secao numero={7} titulo="Disponibilidade e mudanças no serviço">
        <p>
          A ABRACAM se empenha para manter o simulador disponível e funcionando corretamente, mas
          podem ocorrer interrupções para manutenção, atualizações ou por falhas de terceiros, como
          provedores de internet e de hospedagem. Funcionalidades, questões e configurações dos
          simulados podem ser alteradas, corrigidas, substituídas ou removidas a qualquer tempo,
          para manter o conteúdo atualizado e adequado ao material de estudo.
        </p>
      </Secao>

      <Secao numero={8} titulo="Responsabilidades">
        <p>
          O conteúdo do simulador tem finalidade exclusivamente educacional e não constitui
          consultoria jurídica, regulatória ou de compliance. Na extensão permitida pela legislação,
          a ABRACAM não se responsabiliza por:
        </p>
        <Lista>
          <li>resultados obtidos em exames oficiais de certificação;</li>
          <li>decisões tomadas com base exclusivamente no conteúdo do simulador;</li>
          <li>
            falhas causadas pelo equipamento, pela conexão à internet ou pelo navegador do usuário;
          </li>
          <li>uso da conta por terceiros a quem o próprio usuário tenha fornecido a senha.</li>
        </Lista>
      </Secao>

      <Secao numero={9} titulo="Suspensão e encerramento">
        <p>
          Você pode encerrar sua conta a qualquer momento, pedindo a exclusão pelo e-mail{" "}
          <Email endereco={CONTROLADOR.emailPrivacidade} />. A ABRACAM pode suspender ou encerrar
          contas que violem estes termos, sempre que possível com aviso prévio, sem prejuízo das
          medidas legais cabíveis.
        </p>
      </Secao>

      <Secao numero={10} titulo="Privacidade">
        <p>
          O tratamento dos seus dados pessoais está descrito na{" "}
          <Link to="/privacidade" className={linkClass}>
            Política de Privacidade
          </Link>
          , que faz parte destes termos.
        </p>
      </Secao>

      <Secao numero={11} titulo="Alterações destes termos">
        <p>
          Estes termos podem ser atualizados. A data da última atualização fica no topo desta página
          e, em caso de mudança relevante, avisaremos na plataforma ou por e-mail. Se você continuar
          usando o simulador depois do aviso, estará de acordo com a nova versão.
        </p>
      </Secao>

      <Secao numero={12} titulo="Legislação e foro">
        <p>
          Estes termos são regidos pelas leis brasileiras. Fica eleito o foro do domicílio do
          usuário para resolver eventuais controvérsias, conforme o Código de Defesa do Consumidor.
        </p>
      </Secao>

      <Secao numero={13} titulo="Contato">
        <p>
          Dúvidas sobre estes termos: <Email endereco={CONTROLADOR.emailContato} />. Assuntos de
          privacidade e proteção de dados: <Email endereco={CONTROLADOR.emailPrivacidade} />.
          Endereço: {CONTROLADOR.endereco}.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
