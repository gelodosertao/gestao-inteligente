import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, Variants } from 'framer-motion';
import ScrollProgress from './ScrollProgress';
import ImageWithSkeleton from './ImageWithSkeleton';
import {
  Snowflake, MapPin, Phone, Instagram, Clock,
  ShieldCheck, Truck, Droplets,
  Menu, X, ChevronUp, HelpCircle, Heart, Leaf, Star, ArrowRight, Citrus
} from 'lucide-react';

const segments = [
  { name: 'Supermercados', image: '/segment-supermercados.jpg' },
  { name: 'Distribuidoras', image: '/segment-distribuidoras.jpg' },
  { name: 'Bares', image: '/segment-bares.jpg' },
  { name: 'Ambulantes', image: '/segment-ambulantes.jpg' },
  { name: 'Adegas', image: '/segment-adegas.jpg' },
];

const products = [
  { slug: 'gelo-de-sabor', name: 'Gelo de Sabor', desc: 'Carro-chefe! Gelos saborizados com frutas selecionadas. Dura 3x mais e transforma sua bebida.', icon: Citrus, highlight: true },
  { slug: 'gelo-em-cubos', name: 'Gelo em Cubos', desc: 'Ideal para drinks e copos. Cristalino e de rápido resfriamento.', icon: Snowflake, highlight: false },
  { slug: 'gelo-em-escama', name: 'Gelo em Escama', desc: 'Perfeito para conservação de alimentos. Alta superfície de contato.', icon: Droplets, highlight: false },
  { slug: 'gelo-em-barra', name: 'Gelo em Barra', desc: 'Alta durabilidade para transporte e eventos. Resistência superior.', icon: ShieldCheck, highlight: false },
];

const stats = [
  { value: '20+', label: 'Anos de experiência' },
  { value: '15+', label: 'Cidades atendidas' },
  { value: '500+', label: 'Clientes ativos' },
];

const faqData = [
  {
    q: 'O gelo é feito com água filtrada?',
    r: 'Sim. Utilizamos água 100% filtrada e purificada em todo o processo, garantindo um gelo cristalino que não altera o sabor da sua bebida.',
  },
  {
    q: 'Quais regiões vocês atendem?',
    r: 'Atendemos toda a Região Oeste da Bahia com frota própria refrigerada, a partir da nossa matriz em Ibotirama.',
  },
  {
    q: 'Atendem supermercados e distribuidoras?',
    r: 'Sim. Atendemos supermercados, distribuidoras, bares, adegas, ambulantes e todos os segmentos que precisam de gelo de qualidade para revenda ou uso próprio.',
  },
  {
    q: 'Vocês seguem as normas da vigilância sanitária?',
    r: 'Seguimos rigorosamente todas as normas, com processos de higienização certificados e controle de qualidade em todas as etapas da produção.',
  },
  {
    q: 'Como faço para me tornar revendedor?',
    r: 'Entre em contato pelo WhatsApp (77) 99812-9383 ou acesse nossa página de parceiro. Analisaremos sua região e proporemos as melhores condições.',
  },
];

const navLinks = [
  { href: '#diferenciais', label: 'Diferenciais' },
  { href: '/produtos', label: 'Nossos gelos' },
  { href: '#faq', label: 'FAQ' },
  { href: '/sobre', label: 'Sobre nós' },
  { href: '/parceiro', label: 'Quero revender' },
  { href: '#contato', label: 'Contato' },
];

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={fadeInUp}
      initial={false}
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StaggeredGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial={false}
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      className={className}
    >
      {React.Children.map(children, (child) => (
        <motion.div variants={fadeInUp}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

const VisitorLanding: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showBackTop, setShowBackTop] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    document.title = 'Gelo do Sertão - O Gelo que Refresca o Sertão | Pureza e Confiança';
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const frame = requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [location.hash]);

  useEffect(() => {
    const onScroll = () => {
      setShowBackTop(window.scrollY > 600);
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = useCallback((id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const whatsappLink = 'https://wa.me/5577998129383';
  const whatsappRevenda = `${whatsappLink}?text=Olá!%20Quero%20ser%20revendedor%20do%20Gelo%20do%20Sertão`;

  return (
    <div className="site-world visitor-world min-h-dvh w-full overflow-x-hidden">
      <ScrollProgress />
      <header className="site-header fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" aria-label="Gelo do Sertão - Página inicial">
            <img src="/logo.png" alt="" width="48" height="48" className="h-12 w-auto" aria-hidden="true" />
            <span className="font-bold text-sm tracking-tight uppercase text-blue-800 sm:tracking-widest">
              Gelo do <span className="text-blue-500">Sertão</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-6" aria-label="Navegação principal">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => { if (link.href.startsWith('#')) { e.preventDefault(); scrollTo(link.href.slice(1)); } }}
                className="text-sm text-slate-600 hover:text-blue-600 transition-colors font-semibold focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none rounded"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <a
            href={whatsappRevenda}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-green-500/25 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Phone size={16} />
            Falar com Vendas
          </a>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden min-h-11 min-w-11 p-2 text-slate-700 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none rounded"
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileOpen && (
          <nav className="md:hidden bg-white/95 backdrop-blur-md border-b border-slate-200" aria-label="Navegação mobile">
            <div className="px-4 py-4 space-y-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => { setMobileOpen(false); if (link.href.startsWith('#')) { e.preventDefault(); scrollTo(link.href.slice(1)); } }}
                  className="block text-sm text-slate-600 hover:text-blue-600 transition-colors py-2 font-medium"
                >
                  {link.label}
                </a>
              ))}
              <a
                href={whatsappRevenda}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm px-5 py-3 rounded-lg transition-all w-full"
              >
                <Phone size={16} />
                Falar com Vendas
              </a>
            </div>
          </nav>
        )}
      </header>

      <main>
        {/* HERO */}
        <section
          className="site-hero relative px-4 pt-24 overflow-hidden"
          aria-label="Apresentação"
        >
          <div className="site-hero-grid relative z-10 max-w-7xl mx-auto">
          <div className="site-hero-copy space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-7xl font-black tracking-tight text-balance leading-[1.1]">
                O Gelo que<br />
                <span className="text-cyan-300">refresca o Sertão</span>
              </h1>
              <p className="text-blue-100 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed text-pretty">
                Produção com tecnologia de ponta. Distribuindo pureza e frescor direto de Ibotirama para todo o Oeste Baiano.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <a
                href={whatsappRevenda}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg px-8 py-4 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] shadow-xl shadow-orange-500/30 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
                Quero revender
              </a>
              <button
                onClick={() => scrollTo('diferenciais')}
                className="inline-flex items-center justify-center gap-2 border-2 border-white/30 hover:border-white/50 text-white font-semibold text-lg px-8 py-4 rounded-xl transition-all duration-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Conhecer mais
              </button>
            </div>
          </div>
          <div className="site-hero-image" aria-hidden="true"><img src="/gelo-cubo.jpg" alt="" /></div>
          </div>
          <div id="numeros" className="site-fact-strip max-w-7xl mx-auto" aria-label="Nossos números">
            {stats.map((stat) => (
              <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>
            ))}
          </div>

          <button
            onClick={() => scrollTo('diferenciais')}
            className="site-scroll-cue absolute bottom-6 min-h-11 min-w-11 focus-visible:ring-2 focus-visible:outline-none"
            aria-label="Rolar para baixo"
          >
            <ChevronUp size={32} className="rotate-180" />
          </button>
        </section>

        {/* DIFERENCIAIS */}
        <section id="diferenciais" className="relative py-20 md:py-28 px-4 bg-gray-50 scroll-mt-24 overflow-hidden" aria-label="Diferenciais">
          <div className="max-w-7xl mx-auto">
            <AnimatedSection>
              <div className="text-center mb-16 space-y-4">
                <span className="inline-block bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full">Diferenciais</span>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-balance">Por que escolher o Gelo do Sertão?</h2>
                <p className="text-slate-500 text-lg max-w-2xl mx-auto">Qualidade, logística e segurança alimentar — tudo que você precisa em um só lugar.</p>
              </div>
              <StaggeredGrid className="grid md:grid-cols-3 gap-6 sm:gap-8">
                <div className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl border border-gray-100 hover:border-blue-200 transition-all duration-300">
                  <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                    <Droplets className="text-blue-600" size={28} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Qualidade Diamante</h3>
                  <p className="text-slate-500 leading-relaxed">Água 100% filtrada e purificada. Nosso gelo é cristalino e não altera o sabor da sua bebida.</p>
                </div>
                <div className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl border border-gray-100 hover:border-blue-200 transition-all duration-300">
                  <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                    <Truck className="text-blue-600" size={28} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Logística Ágil e Ampla</h3>
                  <p className="text-slate-500 leading-relaxed">A partir da nossa matriz em Ibotirama, contamos com frota própria para garantir entregas rápidas em todo o Oeste Baiano.</p>
                </div>
                <div className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl border border-gray-100 hover:border-blue-200 transition-all duration-300">
                  <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                    <ShieldCheck className="text-blue-600" size={28} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Segurança Alimentar</h3>
                  <p className="text-slate-500 leading-relaxed">Processos rigorosos de higienização seguindo todas as normas da vigilância sanitária. Sua saúde em primeiro lugar.</p>
                </div>
              </StaggeredGrid>
            </AnimatedSection>
          </div>
        </section>

        {/* PRODUTOS */}
        <section id="produtos" className="relative py-20 md:py-28 px-4 bg-white scroll-mt-24 overflow-hidden" aria-label="Nossos produtos">
          <div className="max-w-7xl mx-auto">
            <AnimatedSection>
              <div className="text-center mb-16 space-y-4">
                <span className="inline-block bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full">Nossa Produção</span>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-balance">Nossos Produtos</h2>
                <p className="text-slate-500 text-lg max-w-2xl mx-auto">Do drink à conservação de alimentos, o gelo ideal para cada necessidade.</p>
              </div>
              <StaggeredGrid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
                {products.map((prod, i) => (
                  <a href={`/produtos/${prod.slug}`} key={i} className={`group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border-2 transition-all duration-300 ${
                    prod.highlight
                      ? 'border-orange-300 hover:border-orange-400 relative'
                      : 'border-gray-100 hover:border-blue-200'
                  }`}>
                    {prod.highlight && (
                      <div className="absolute top-3 right-3 bg-gradient-to-r from-orange-400 to-orange-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full z-10 shadow-lg">
                        ⭐ Carro-Chefe
                      </div>
                    )}
                    <div className={`p-8 flex items-center justify-center ${
                      prod.highlight
                        ? 'bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100'
                        : 'bg-gradient-to-br from-blue-50 to-cyan-50'
                    }`}>
                      <prod.icon className={`w-20 h-20 transition-transform duration-300 group-hover:scale-110 ${
                        prod.highlight ? 'text-orange-500' : 'text-blue-500'
                      }`} strokeWidth={1.5} />
                    </div>
                    <div className="p-6">
                      <h3 className={`text-lg font-bold mb-2 ${
                        prod.highlight ? 'text-orange-700' : 'text-slate-900'
                      }`}>{prod.name}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{prod.desc}</p>
                    </div>
                  </a>
                ))}
              </StaggeredGrid>
            </AnimatedSection>
          </div>
        </section>

        <section className="brand-cup-feature" aria-label="Gelo de sabor">
          <div className="brand-cup-content">
            <div className="brand-cup-copy">
              <h2>Mais sabor para o seu momento.</h2>
              <p>Gelos saborizados com frutas selecionadas. Dura 3x mais e transforma sua bebida.</p>
              <a href="/produtos/gelo-de-sabor" className="brand-cup-link">Conhecer o gelo de sabor <ArrowRight size={20} aria-hidden="true" /></a>
            </div>
            <motion.img
              className="brand-cup-visual"
              src="/copao-gelo-do-sertao.svg"
              alt="Copo de bebida gelada com a marca Gelo do Sertão"
              loading="lazy"
              initial={reduceMotion ? false : { opacity: 0.92, y: 34, rotate: -3 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotate: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              whileHover={reduceMotion ? undefined : { y: -8, rotate: 2, transition: { duration: 0.28 } }}
            />
          </div>
        </section>

        {/* SOBRE */}
        <section className="relative py-20 md:py-28 px-4 bg-gray-50 scroll-mt-24 overflow-hidden" aria-label="Sobre a Gelo do Sertão">
          <div className="max-w-7xl mx-auto">
            <AnimatedSection>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                <div className="space-y-6">
                  <span className="inline-block bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full">Nossa História</span>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 text-balance">
                    Mais que gelo,{' '}
                    <span className="text-blue-600">
                      um compromisso com o Sertão
                    </span>
                  </h2>
                  <div className="space-y-4 text-slate-600 leading-relaxed">
                    <p>
                      Nascemos no sertão baiano com a missão de levar qualidade e frescor para toda a Região Oeste da Bahia.
                      O que começou como uma pequena produção hoje é referência regional em gelo cristalino.
                    </p>
                    <p>
                      Investimos constantemente em tecnologia de purificação de água, processos rigorosos de
                      higienização e logística refrigerada própria para garantir que cada bloco de gelo chegue
                      até você com a mesma pureza de quando saiu da fábrica.
                    </p>
                    <p className="text-slate-800 font-semibold">
                      Não vendemos apenas gelo. Entregamos confiança.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
                    {[
                      { icon: Droplets, text: 'Água purificada' },
                      { icon: ShieldCheck, text: 'Vigilância sanitária' },
                      { icon: Truck, text: 'Frota refrigerada' },
                      { icon: Leaf, text: 'Processo sustentável' },
                      { icon: Heart, text: 'Compromisso local' },
                      { icon: Star, text: 'Qualidade premium' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-100 rounded-xl px-3 py-2">
                        <item.icon className="text-blue-500 shrink-0" size={16} />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <div className="aspect-[4/3] rounded-[32px] overflow-hidden shadow-xl border border-slate-100 bg-slate-100">
                    <ImageWithSkeleton
                      src="/gelo-cubo.jpg"
                      alt="Produção de gelo cristalino Gelo do Sertão - pureza e qualidade"
                      className="w-full h-full object-cover"
                      containerClassName="w-full h-full"
                    />
                  </div>
                  <div className="absolute -bottom-4 -left-4 bg-white border border-slate-100 rounded-2xl p-4 md:p-6 shadow-xl">
                    <p className="text-2xl md:text-3xl font-black text-blue-600">20+</p>
                    <p className="text-xs text-slate-600 font-medium">Anos de excelência</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* SEGMENTOS */}
        <section id="segmentos" className="relative py-20 md:py-28 px-4 bg-white scroll-mt-24 overflow-hidden" aria-label="Segmentos atendidos">
          <div className="max-w-7xl mx-auto">
            <AnimatedSection>
              <div className="text-center mb-16 space-y-4">
                <span className="inline-block bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full">Segmentos</span>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-balance">Quem Confia no Nosso Gelo</h2>
                <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                  Atendemos negócios de todos os portes com soluções personalizadas de gelo.
                </p>
              </div>
              <StaggeredGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {segments.map((seg, i) => (
                  <div key={i} className="group cursor-default">
                    <div className="relative aspect-[3/4] rounded-[24px] overflow-hidden border border-slate-100 hover:border-blue-200 hover:shadow-lg transition-all duration-500 bg-slate-100">
                      <ImageWithSkeleton
                        src={seg.image}
                        alt={`Atendimento Gelo do Sertão para ${seg.name} - confiança e qualidade`}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        containerClassName="w-full h-full"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent pointer-events-none"></div>
                      <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
                        <h3 className="font-bold text-lg text-white">{seg.name}</h3>
                      </div>
                    </div>
                  </div>
                ))}
              </StaggeredGrid>
            </AnimatedSection>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="relative py-20 md:py-28 px-4 bg-gray-50 scroll-mt-24 overflow-hidden" aria-label="Perguntas frequentes">
          <div className="max-w-3xl mx-auto">
            <AnimatedSection>
              <div className="text-center mb-16 space-y-4">
                <span className="inline-block bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full">FAQ</span>
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-balance">Dúvidas Frequentes</h2>
                <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                  Tudo que você precisa saber sobre a Gelo do Sertão.
                </p>
              </div>
              <div className="space-y-3">
                {faqData.map((item, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-100 rounded-2xl overflow-hidden transition-all duration-300"
                  >
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left text-slate-800 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                      aria-expanded={openFaq === i}
                    >
                      <span className="font-bold text-sm md:text-base flex items-center gap-3">
                        <HelpCircle className="text-blue-500 shrink-0" size={18} />
                        {item.q}
                      </span>
                      <ChevronUp
                        className={`shrink-0 text-slate-400 transition-transform duration-300 ${
                          openFaq === i ? 'rotate-0' : 'rotate-180'
                        }`}
                        size={20}
                      />
                    </button>
                    <div
                      className={`transition-all duration-300 overflow-hidden ${
                        openFaq === i ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <p className="px-5 md:px-6 pb-5 md:pb-6 text-slate-600 text-sm leading-relaxed">
                        {item.r}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* CTA */}
        <section className="site-closing relative py-20 md:py-28 px-4 overflow-hidden" aria-label="Chamada para ação">
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <AnimatedSection>
              <div className="space-y-6">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white text-balance">
                  Pronto para ser um revendedor?
                </h2>
                <p className="text-blue-100 text-lg max-w-2xl mx-auto leading-relaxed">
                  Entre em contato agora e descubra as condições especiais para revendedores em toda a região do Oeste Baiano.
                </p>
                <div className="flex justify-center pt-4">
                  <a
                    href={whatsappRevenda}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg px-8 py-4 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] shadow-xl shadow-orange-500/30 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <Phone size={20} />
                    Falar com Vendas
                  </a>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </section>
      </main>

      {/* BACK TO TOP */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`fixed bottom-6 right-6 z-40 p-3 bg-[#b74336] hover:bg-[#91352c] text-white rounded-sm transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#b74336] focus-visible:ring-offset-2 focus-visible:outline-none ${
          showBackTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label="Voltar ao topo"
      >
        <ChevronUp size={20} />
      </button>

      {/* FOOTER */}
      <footer id="contato" className="py-16 md:py-20 px-4 bg-slate-900 scroll-mt-24" aria-label="Contato e informações">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div className="space-y-6">
            <img
              src="/logo.png"
              alt="Gelo do Sertão - logomarca"
              width="64"
              height="64"
              className="h-16 w-auto brightness-0 invert"
              loading="lazy"
            />
            <p className="text-slate-400 text-sm leading-relaxed">
              Referência em produção e distribuição de gelo cristalino no Oeste Baiano. Qualidade que vem da tradição.
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 hover:border-cyan-500 transition-all focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none"
                aria-label="Instagram da Gelo do Sertão"
              >
                <Instagram size={20} />
              </a>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-green-400 hover:border-green-500 transition-all focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none"
                aria-label="WhatsApp da Gelo do Sertão"
              >
                <Phone size={20} />
              </a>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="font-bold text-lg text-white">Navegação</h3>
            <nav className="space-y-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => { if (link.href.startsWith('#')) { e.preventDefault(); scrollTo(link.href.slice(1)); } }}
                  className="block text-sm text-slate-400 hover:text-blue-400 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none rounded"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="space-y-6">
            <h3 className="font-bold text-lg text-white">Informações</h3>
            <div className="space-y-4">
              <div className="flex gap-3 text-slate-400 items-start">
                <MapPin className="shrink-0 text-cyan-400 mt-0.5" size={18} aria-hidden="true" />
                <div>
                  <p className="text-sm text-slate-300"><strong className="text-white">Matriz:</strong> Ibotirama - BA</p>
                  <p className="text-xs text-slate-500">Atendemos todo o Oeste Baiano</p>
                </div>
              </div>
              <div className="flex gap-3 text-slate-400 items-center">
                <Clock className="text-cyan-400 shrink-0" size={18} aria-hidden="true" />
                <div>
                  <p className="text-sm text-slate-300"><strong className="text-white">Atendimento:</strong></p>
                  <p className="text-xs text-slate-400">Seg a Sáb: 08h às 22h | Dom: 08h às 14h</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="font-bold text-lg text-white">Fale Conosco</h3>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-green-600 hover:bg-green-500 text-white rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-green-600/20 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none"
            >
              <div className="flex items-center gap-3 mb-1">
                <Phone size={24} />
                <span className="font-bold text-lg">(77) 99812-9383</span>
              </div>
              <p className="text-green-200 text-xs">Clique para falar diretamente no WhatsApp</p>
            </a>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-slate-800 text-center">
          <a href="/termos" className="inline-block mb-4 text-sm text-blue-100 hover:text-white underline underline-offset-4">Privacidade e termos</a>
          <p className="text-slate-500 text-xs">
            &copy; {new Date().getFullYear()} Gelo do Sertão. Todos os direitos reservados.
          </p>
        </div>
      </footer>

      <style>{`
        html { scroll-behavior: smooth; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        .text-balance { text-wrap: balance; }
        .text-pretty { text-wrap: pretty; }
        .scroll-mt-24 { scroll-margin-top: 6rem; }

        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .group-hover\\:scale-110,
          .group-hover\\:scale-125,
          .hover\\:scale-105,
          .hover\\:scale-110,
          .hover\\:scale-\\[1\\.02\\],
          .hover\\:scale-\\[1\\.03\\] {
            transform: none !important;
          }
          [class*="translate-y-"],
          [class*="opacity-"] {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default VisitorLanding;
