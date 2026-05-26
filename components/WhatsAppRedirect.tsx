import React, { useEffect } from 'react';

const WHATSAPP_URL = 'https://wa.me/5577998129383?text=Ol%C3%A1%2C%20quero%20ser%20parceiro%20Gelo%20do%20Sert%C3%A3o!';

const WhatsAppRedirect: React.FC = () => {
  useEffect(() => {
    window.location.href = WHATSAPP_URL;
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans px-4 text-center">
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Redirecionando para o WhatsApp...</h2>
      <p className="text-slate-600 mb-2">Você será redirecionado automaticamente. Se não acontecer,</p>
      <a
        href={WHATSAPP_URL}
        className="text-green-600 font-semibold underline"
      >
        clique aqui
      </a>
    </div>
  );
};

export default WhatsAppRedirect;
