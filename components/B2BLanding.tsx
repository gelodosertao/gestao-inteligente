import React, { useEffect, useState, useRef } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, Play, Snowflake, Truck, MapPin, Phone, Instagram } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SegmentCard from './SegmentCard';

const FLAVORS = [
  { src: '/morango.png', name: 'Morango' },
  { src: '/melancia.png', name: 'Melancia' },
  { src: '/maracuja.png', name: 'Maracujá' },
  { src: '/coco.png', name: 'Água de Coco' },
  { src: '/laranja.png', name: 'Laranja' },
  { src: '/maca-verde.png', name: 'Maçã Verde' },
];

const FEATURES = [
  { title: "Alta Margem de Lucro", desc: "Produto de alto valor agregado. Compre no atacado e multiplique seus ganhos no varejo." },
  { title: "Venda por Impulso", desc: "Embalagens premium e chamativas que vendem sozinhas assim que o cliente bate o olho no freezer." },
  { title: "O Combo Perfeito", desc: "Aumente o ticket médio do seu cliente ao vender a bebida junto com o gelo de sabor ideal." }
];

const SEGMENTS = [
  { title: 'Adegas e Bebidas', desc: 'Venda o combo completo: destilado + gelo de sabor. Aumente o ticket médio instantaneamente.', img: '/segment-adega.png' },
  { title: 'Conveniências', desc: 'Gere vendas por impulso com embalagens super atrativas no freezer.', img: '/' },
  { title: 'Distribuidoras', desc: 'Abasteça o pequeno varejo com o produto sensação do momento, com alta demanda e rotatividade.', img: '/segment-distribuidoras.svg' },
  { title: 'Bares e Eventos', desc: 'Praticidade total: padronize seus drinks, agilize o preparo e ofereça uma experiência premium.', img: '/' },
  { title: 'Supermercados', desc: 'Um diferencial na sua gôndola gelada. Produto de altíssimo giro para o final de semana.', img: '/segment-supermercados.svg' },
  { title: 'Ambulantes e Festas', desc: 'Portátil, prático e pronto para turbinar o copão da galera.', img: '/segment-ambulantes.svg' },
];
const B2BLanding: React.FC = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  <meta name="facebook-domain-verification" content="hx5km5h2i8bu37bbhgb4y347pbpxgz" />
  // Efeito de rolagem do menu
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Efeito de Auto-Play do Carrossel
  useEffect(() => {
    const interval = setInterval(() => {
      if (carouselRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
        // Se chegou no final (com uma margem de erro de 10px), volta pro começo
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          carouselRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          // Rola um pedaço pra frente; o CSS "snap-mandatory" cuida de encaixar no próximo item perfeitamente
          carouselRef.current.scrollBy({ left: 300, behavior: 'smooth' });
        }
      }
    }, 2500); // Troca a cada 2.5 segundos

    return () => clearInterval(interval);
  }, []);

  // Efeito de Auto-Play do Carrossel de Segmentos
  useEffect(() => {
    const interval = setInterval(() => {
      if (segmentRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = segmentRef.current;
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          segmentRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          segmentRef.current.scrollBy({ left: 350, behavior: 'smooth' });
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-500 selection:text-white">
      {/* Navbar (Glassmorphism) */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-slate-900/80 backdrop-blur-md shadow-lg py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Gelo do Sertão Logo" className="h-12 w-auto object-contain drop-shadow-md" />
            <span className="font-black text-xl tracking-wider uppercase hidden sm:block text-white drop-shadow-md">
              Gelo do Sertão
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#produtos" className="text-sm font-semibold text-white drop-shadow-md hover:text-cyan-400 transition-colors">Produtos</a>
            <a href="#vantagens" className="text-sm font-semibold text-white drop-shadow-md hover:text-cyan-400 transition-colors">Por que nós?</a>
            <a href="#logistica" className="text-sm font-semibold text-white drop-shadow-md hover:text-cyan-400 transition-colors">Logística</a>
          </div>
          <button
            onClick={() => window.open('https://wa.me/5577998129383', '_blank')}
            className="bg-white text-slate-900 px-6 py-2.5 rounded-full font-bold text-sm hover:bg-slate-100 hover:scale-105 transition-all shadow-xl flex items-center gap-2"
          >
            Seja um Revendedor
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Placeholder for Video/Image Background */}
        <div className="absolute inset-0 bg-slate-900 z-0">
          {/* <video autoPlay loop muted playsInline className="w-full h-full object-cover opacity-60">
                <source src="/seu-video-hero.mp4" type="video/mp4" />
              </video> 
          */}
          <img src="/fundo-headline.png" alt="Gelo do Sertão Capa" className="w-full h-full object-cover" fetchPriority="high" />
          {/* Overlay escuro para garantir leitura */}
          <div className="absolute inset-0 bg-slate-900/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 text-center mt-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-cyan-300 font-semibold text-sm mb-8 animate-fade-in-up">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            Atacado de Gelo Saborizado
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-white mb-6 tracking-tight leading-tight drop-shadow-2xl">
            O Gelo de Sabor que <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Dobra o Faturamento</span> <br className="hidden md:block" />
            da Sua Adega.
          </h1>

          <p className="text-lg md:text-xl text-white mb-12 max-w-2xl mx-auto font-medium leading-relaxed drop-shadow-lg">
            Embalagens premium, 7 sabores irresistíveis e alta lucratividade.
            Transforme seu freezer em uma máquina de vendas por impulso.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => window.open('https://wa.me/5577998129383', '_blank')}
              className="w-full sm:w-auto bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:shadow-lg hover:shadow-cyan-500/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
            >
              Falar com Consultor
              <ArrowRight size={20} />
            </button>
            <button
              onClick={() => document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto bg-white/10 backdrop-blur-md text-white border border-white/20 px-8 py-4 rounded-full font-bold text-lg hover:bg-white/20 transition-all flex items-center justify-center gap-2"
            >
              <Play size={20} className="fill-current" />
              Ver Produtos
            </button>
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section id="produtos" className="py-32 bg-slate-900 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">A Sensação do Momento</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">O gelo saborizado que virou tendência absoluta. Praticidade para os clientes, lucro garantido para o seu negócio.</p>
          </div>

          <div className="grid grid-cols-1 gap-8">
            {/* Produto 1 - Sabor */}
            <div className="group relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-700/50 hover:border-cyan-500/50 transition-all shadow-2xl">
              <div className="bg-slate-950 relative overflow-hidden p-8 md:p-12">
                {/* Linha de Sabores (Embalagens) Carrossel */}
                <div className="relative w-full">
                  {/* Dica de Scroll no Desktop/Mobile */}
                  <div className="absolute -top-6 right-0 text-slate-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2 md:hidden">
                    Deslize <ArrowRight size={14} />
                  </div>

                  <div
                    ref={carouselRef}
                    className="flex overflow-x-auto snap-x snap-mandatory gap-8 md:gap-12 mb-12 pb-12 pt-6 px-4 md:px-12 w-full"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <style>{`
                      .overflow-x-auto::-webkit-scrollbar { display: none; }
                    `}</style>
                    {FLAVORS.map((flavor, idx) => (
                      <div key={idx} className="snap-center shrink-0 relative group/pack hover:-translate-y-4 transition-transform duration-500 cursor-grab active:cursor-grabbing">
                        <img src={flavor.src} alt={`Gelo de ${flavor.name}`} className="h-56 md:h-80 w-auto object-contain drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)]" fetchPriority="high" />
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 md:opacity-0 group-hover/pack:opacity-100 transition-opacity bg-slate-800 text-white text-xs md:text-sm font-bold px-4 py-2 rounded-full whitespace-nowrap shadow-xl border border-slate-700">
                          {flavor.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent pointer-events-none" />
              </div>

              <div className="p-8 w-full flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 z-10 relative">
                <div>
                  <div className="inline-block px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-bold uppercase tracking-wider mb-3 backdrop-blur-sm">O Novo Padrão B2B</div>
                  <h3 className="text-4xl md:text-5xl font-black text-white mb-2">Linha Drink <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Premium</span></h3>
                  <p className="text-slate-300 max-w-2xl text-lg mt-4">
                    As embalagens mais bonitas e resistentes do mercado, em <strong>7 sabores incríveis</strong>. 
                    Seus clientes não vão comprar apenas um, vão querer experimentar todos.
                  </p>
                </div>
                <button
                  onClick={() => window.open('https://wa.me/5577998129383', '_blank')}
                  className="shrink-0 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:shadow-lg hover:shadow-cyan-500/30 hover:-translate-y-1 transition-all"
                >
                  Garantir Estoque
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features/B2B Value Section */}
      <section id="vantagens" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 leading-tight">
                Gelo saborizado que <br />
                <span className="text-blue-600">vende sozinho.</span>
              </h2>
              <p className="text-lg text-slate-600 mb-10">
                O Gelo de Sabor deixou de ser uma novidade para se tornar um produto obrigatório no pequeno varejo. Nós oferecemos a qualidade premium que seus clientes buscam.
              </p>

              <div className="space-y-6">
                {FEATURES.map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex-shrink-0 mt-1">
                      <CheckCircle2 className="text-cyan-500" size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-900">{item.title}</h4>
                      <p className="text-slate-600 mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="aspect-square rounded-[3rem] overflow-hidden bg-slate-100 relative shadow-2xl">
                <img src="/freezer-gelo.svg" alt="Equipe Gelo do Sertão" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/60 to-transparent pointer-events-none" />
              </div>

              {/* Floating Stat Card */}
              <div className="absolute -bottom-8 -left-8 bg-white p-6 rounded-3xl shadow-xl border border-slate-100 max-w-xs animate-bounce-slow">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                    <Truck size={24} />
                  </div>
                  <div>
                    <div className="text-3xl font-black text-slate-900">+500</div>
                    <div className="text-sm font-semibold text-slate-500">Empresas Parceiras</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Segmentos Carousel */}
      <section id="segmentos" className="py-32 bg-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 text-center">Para quem somos a solução</h2>
          <div className="relative">
            <div
              ref={segmentRef}
              className="flex overflow-x-auto snap-x snap-mandatory gap-8 md:gap-12 pb-12 pt-6 px-4 md:px-12 w-full"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style>{`\n                  .overflow-x-auto::-webkit-scrollbar { display: none; }\n                `}</style>
              {SEGMENTS.map((seg, idx) => (
                <SegmentCard key={idx} title={seg.title} desc={seg.desc} img={seg.img} />
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-blue-900 to-slate-900 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black text-white mb-8">
            Pronto para aumentar suas margens de lucro?
          </h2>
          <p className="text-xl text-slate-300 mb-12">
            Cadastre seu negócio e receba nossa tabela de preços para atacado. Condições exclusivas para novos parceiros.
          </p>
          <button
            onClick={() => window.open('https://wa.me/5577998129383', '_blank')}
            className="bg-cyan-400 text-slate-900 px-10 py-5 rounded-full font-black text-xl hover:bg-cyan-300 hover:scale-105 transition-all shadow-xl shadow-cyan-500/30 flex items-center justify-center gap-3 mx-auto"
          >
            Quero a Tabela de Preços
            <ChevronRight size={24} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3 text-white">
              <img src="/logo.png" alt="Gelo do Sertão Logo" className="h-16 w-auto object-contain" />
              <span className="font-black tracking-wider uppercase">Gelo do Sertão</span>
            </div>
            <p className="text-slate-500 text-sm font-medium">CNPJ: 47.026.674/0001-29</p>
            <a href="/termos" className="text-slate-400 hover:text-cyan-400 transition-colors text-sm">Termos de Uso & Privacidade</a>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-6 text-slate-400 text-sm font-medium">
            <span className="flex items-center gap-2"><MapPin size={16} /> Ibotirama - BA</span>
            <span className="flex items-center gap-2"><Phone size={16} /> (77) 99812-9383</span>
            <a
              href="https://www.instagram.com/gelodosertao_bahia/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-cyan-400 transition-colors bg-slate-900 px-4 py-2 rounded-full border border-slate-800"
            >
              <Instagram size={16} />
              <span>@gelodosertao_bahia</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default B2BLanding;
