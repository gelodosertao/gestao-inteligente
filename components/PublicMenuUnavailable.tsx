import React from 'react';
import { Snowflake } from 'lucide-react';

interface PublicMenuUnavailableProps {
  featureName?: string;
  fullScreen?: boolean;
}

const PublicMenuUnavailable: React.FC<PublicMenuUnavailableProps> = ({
  featureName = 'Cardápio',
  fullScreen = false,
}) => (
  <main className={`${fullScreen ? 'min-h-dvh' : 'min-h-[60vh] rounded-2xl shadow-sm'} bg-blue-950 flex items-center justify-center p-6 text-white`}>
    <section className="w-full max-w-lg text-center">
      <Snowflake className="mx-auto mb-6 text-sky-300" size={64} aria-hidden="true" />
      <h1 className="text-3xl font-black">{featureName} temporariamente indisponível</h1>
      <p className="mt-4 text-blue-100">Estamos atualizando esta área para oferecer uma experiência mais segura. Tente novamente em breve.</p>
    </section>
  </main>
);

export default PublicMenuUnavailable;
