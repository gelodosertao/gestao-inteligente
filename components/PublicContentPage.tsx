import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react';

const whatsapp = 'https://wa.me/5577998129383';
const revenda = `${whatsapp}?text=Ol%C3%A1!%20Quero%20ser%20revendedor%20do%20Gelo%20do%20Sert%C3%A3o`;

const products = [
  { slug: 'gelo-de-sabor', name: 'Gelo de Sabor', description: 'Gelos saborizados com frutas selecionadas. Dura 3x mais e transforma sua bebida.', use: 'Para drinks e bebidas', image: '/linha-de-gelos-campanha.png' },
  { slug: 'gelo-em-cubos', name: 'Gelo em Cubos', description: 'Ideal para drinks e copos. Cristalino e de rápido resfriamento.', use: 'Para servir e refrescar', image: '/gelo-cubo.jpg' },
  { slug: 'gelo-em-escama', name: 'Gelo em Escama', description: 'Perfeito para conservação de alimentos. Alta superfície de contato.', use: 'Para conservação', image: '/linha-de-gelos-campanha.png' },
  { slug: 'gelo-em-barra', name: 'Gelo em Barra', description: 'Alta durabilidade para transporte e eventos. Resistência superior.', use: 'Para transporte e eventos', image: '/linha-de-gelos-campanha.png' },
] as const;

const nav = [
  { to: '/produtos', label: 'Nossos gelos' },
  { to: '/#diferenciais', label: 'Benefícios' },
  { to: '/#faq', label: 'FAQ' },
  { to: '/sobre', label: 'Sobre nós' },
  { to: '/parceiro', label: 'Quero revender' },
];

export const PublicHeader: React.FC = () => {
  const [open, setOpen] = useState(false);
  return <header className="brand-header">
    <div className="brand-header-inner">
      <Link className="brand-mark" to="/" onClick={() => setOpen(false)} aria-label="Gelo do Sertão, página inicial"><img src="/logo.png" alt="" /><span>Gelo do Sertão</span></Link>
      <nav className="brand-desktop-nav" aria-label="Navegação principal">{nav.map(item => <Link key={item.to} to={item.to}>{item.label}</Link>)}</nav>
      <a className="brand-header-cta" href={revenda} target="_blank" rel="noopener noreferrer">Fale com a gente <ArrowUpRight size={16} /></a>
      <button type="button" className="brand-menu-toggle" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    </div>
    {open && <nav className="brand-mobile-nav" aria-label="Navegação mobile">{nav.map(item => <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>{item.label}</Link>)}<a href={revenda} target="_blank" rel="noopener noreferrer">Fale com a gente</a></nav>}
  </header>;
};

export const PublicFooter: React.FC = () => <footer className="brand-footer"><div className="brand-footer-inner">
  <div><img src="/logo.png" alt="Gelo do Sertão" /><p>Pureza e frescor direto de Ibotirama para o Oeste Baiano.</p></div>
  <nav aria-label="Links do site"><Link to="/produtos">Nossos gelos</Link><Link to="/sobre">Sobre nós</Link><Link to="/parceiro">Quero revender</Link><Link to="/termos">Privacidade e termos</Link></nav>
  <div><strong>Fale com a gente</strong><a href={whatsapp} target="_blank" rel="noopener noreferrer">(77) 99812-9383</a><span>Ibotirama · Bahia</span></div>
</div><div className="brand-footer-bottom">© {new Date().getFullYear()} Gelo do Sertão</div></footer>;

const ProductCard: React.FC<{ product: typeof products[number] }> = ({ product }) => <Link className={`brand-product-card brand-product-${product.slug}`} to={`/produtos/${product.slug}`}>
  <div className="brand-product-image"><img src={product.image} alt="" loading="lazy" /></div>
  <div className="brand-product-info"><span>{product.use}</span><h2>{product.name}</h2><p>{product.description}</p><span className="brand-product-link">Conhecer produto <ArrowUpRight size={18} /></span></div>
</Link>;

const AboutPage: React.FC = () => <><div className="brand-page-hero brand-about-hero"><div className="brand-page-hero-content"><p className="brand-section-note">Nossa história</p><h1>Um compromisso com o Sertão.</h1><p>Nascemos no sertão baiano com a missão de levar qualidade e frescor para toda a Região Oeste da Bahia.</p></div><img src="/home-site.svg" alt="Gelo para drink e copo Gelo do Sertão em destaque" /></div>
  <section className="brand-reading-section"><div className="brand-reading-heading"><span>Gelo do Sertão</span><h2>Qualidade que chega até você.</h2></div><div className="brand-reading-copy"><p>O que começou como uma pequena produção hoje é referência regional em gelo cristalino.</p><p>Investimos constantemente em tecnologia de purificação de água, processos rigorosos de higienização e logística refrigerada própria para garantir que cada bloco de gelo chegue até você com a mesma pureza de quando saiu da fábrica.</p><p>Não vendemos apenas gelo. Entregamos confiança.</p></div></section>
  <section className="brand-about-values"><div><h2>Do Sertão para o seu negócio.</h2><p>Água purificada, cuidado na produção e frota refrigerada fazem parte do nosso trabalho diário.</p><Link to="/parceiro" className="brand-button-orange">Seja um parceiro <ArrowRight size={18} /></Link></div><img src="/segment-distribuidoras.jpg" alt="Atendimento a distribuidoras" loading="lazy" /></section></>;

const ProductsPage: React.FC = () => <><div className="brand-page-hero brand-products-hero"><div className="brand-page-hero-content"><p className="brand-section-note">Nossa produção</p><h1>Um gelo para cada momento.</h1><p>Do drink à conservação de alimentos, conheça as linhas da Gelo do Sertão.</p></div><img src="/home-site.svg" alt="Gelo para drink e copo Gelo do Sertão em destaque" /></div>
  <section className="brand-catalog" aria-label="Linhas de gelo"><div className="brand-section-heading"><h2>Conheça nossos gelos</h2><p>Encontre a linha certa para seu uso ou seu negócio.</p></div><div className="brand-product-grid">{products.map(product => <ProductCard key={product.slug} product={product} />)}</div></section>
  <section className="brand-wide-cta"><h2>Quer levar Gelo do Sertão para o seu negócio?</h2><Link to="/parceiro" className="brand-button-orange">Conheça as opções para revenda <ArrowRight size={18} /></Link></section></>;

const ProductDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const product = products.find(item => item.slug === slug);
  if (!product) return <section className="brand-not-found"><h1>Produto não encontrado</h1><Link to="/produtos">Ver nossos gelos</Link></section>;
  return <><div className={`brand-detail-hero brand-product-${product.slug}`}><div className="brand-detail-image"><img src={product.image} alt={`Composição visual de ${product.name.toLowerCase()}`} /></div><div className="brand-detail-copy"><Link to="/produtos" className="brand-back-link">← Todos os gelos</Link><span>{product.use}</span><h1>{product.name}</h1><p>{product.description}</p><a href={revenda} target="_blank" rel="noopener noreferrer" className="brand-button-orange">Consultar disponibilidade <ArrowUpRight size={18} /></a></div></div>
    <section className="brand-catalog" aria-label="Outras linhas"><div className="brand-section-heading"><h2>Conheça também</h2></div><div className="brand-product-grid">{products.filter(item => item.slug !== slug).map(item => <ProductCard key={item.slug} product={item} />)}</div></section></>;
};

const PublicContentPage: React.FC<{ page: 'about' | 'products' | 'detail' }> = ({ page }) => {
  const { slug } = useParams();
  React.useEffect(() => { window.scrollTo(0, 0); document.title = `${page === 'about' ? 'Sobre nós' : page === 'products' ? 'Nossos gelos' : products.find(item => item.slug === slug)?.name || 'Produto'} | Gelo do Sertão`; }, [page, slug]);
  return <div className="brand-site brand-content-page"><PublicHeader /><main id="conteudo">{page === 'about' ? <AboutPage /> : page === 'products' ? <ProductsPage /> : <ProductDetailPage slug={slug || ''} />}</main><PublicFooter /></div>;
};

export default PublicContentPage;
