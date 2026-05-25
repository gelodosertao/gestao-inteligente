import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TermsAndPrivacy: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <nav className="bg-slate-900 py-4 px-6 sticky top-0 z-50 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <img src="/logo.png" alt="Gelo do Sertão Logo" className="h-10 w-auto object-contain" />
          <span className="font-black text-lg tracking-wider uppercase hidden sm:block">
            Gelo do Sertão
          </span>
        </div>
        <button 
          onClick={() => navigate(-1)} 
          className="text-white hover:text-cyan-400 flex items-center gap-2 font-semibold transition-colors"
        >
          <ArrowLeft size={20} />
          Voltar
        </button>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-slate-100 prose prose-slate max-w-none">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-8">Políticas de Privacidade e Termos de Uso</h1>
          
          <p className="text-sm text-slate-500 mb-8">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4">1. Introdução</h2>
          <p>
            Bem-vindo ao <strong>Gelo do Sertão</strong>. Nós respeitamos a sua privacidade e garantimos o total sigilo das informações 
            que você nos fornece. Esta Política de Privacidade foi elaborada em conformidade com a Lei Geral de Proteção de Dados 
            Pessoais (Lei Federal nº 13.709/2018 - LGPD).
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4">2. Coleta de Dados</h2>
          <p>
            Ao utilizar nossos serviços ou entrar em contato através de nossos canais (como WhatsApp e formulários do site), 
            podemos coletar informações básicas, como:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Nome completo ou razão social da sua empresa;</li>
            <li>Número de telefone / WhatsApp;</li>
            <li>Endereço de e-mail e endereço físico (para entregas);</li>
            <li>CNPJ ou CPF para emissão de faturamento.</li>
          </ul>

          <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4">3. Uso das Informações</h2>
          <p>
            Os dados coletados são utilizados exclusivamente para:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Atendimento comercial e negociações (envio de tabelas de preços, propostas);</li>
            <li>Processamento, faturamento e entrega de pedidos;</li>
            <li>Comunicações sobre novidades, lançamentos de sabores ou promoções exclusivas para parceiros;</li>
            <li>Melhoria contínua de nossa logística e qualidade de atendimento.</li>
          </ul>
          <p className="mt-4">
            Não vendemos, alugamos ou transferimos seus dados para terceiros sob nenhuma circunstância, exceto mediante 
            exigência legal ou judicial.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4">4. Armazenamento e Segurança</h2>
          <p>
            Implementamos medidas de segurança técnicas e administrativas rigorosas para proteger seus dados pessoais 
            de acessos não autorizados e de situações acidentais de destruição, perda ou alteração. Seus dados são 
            mantidos em nossos servidores seguros pelo tempo necessário para cumprir as finalidades aqui descritas.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4">5. Direitos do Titular (LGPD)</h2>
          <p>
            A qualquer momento, você pode exercer seus direitos previstos pela LGPD (Art. 18), tais como:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Confirmar a existência de tratamento de dados;</li>
            <li>Acessar ou solicitar a correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>Solicitar a eliminação dos seus dados pessoais tratados com seu consentimento;</li>
            <li>Revogar o consentimento para o recebimento de mensagens promocionais.</li>
          </ul>

          <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4">6. Termos de Uso e Parcerias B2B</h2>
          <p>
            Ao se tornar um parceiro revendedor do <strong>Gelo do Sertão</strong>, você concorda em seguir as diretrizes 
            de armazenamento e revenda dos produtos, prezando pela qualidade do gelo (manutenção em freezers adequados) e 
            preservação das embalagens, garantindo assim a excelência na ponta final para o consumidor.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-8 mb-4">7. Contato</h2>
          <p>
            Em caso de dúvidas sobre nossa Política de Privacidade ou para o exercício de qualquer direito sob a LGPD, 
            entre em contato conosco através do nosso WhatsApp oficial: <strong>(77) 99812-9383</strong> ou presencialmente 
            em nossa sede em Ibotirama - BA.
          </p>
        </div>
      </main>
    </div>
  );
};

export default TermsAndPrivacy;
