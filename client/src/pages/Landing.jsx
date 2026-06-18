import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Play, BookOpen, ChevronRight } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Landing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const plans = [
    {
      name: "Essentiel",
      description: "Pour les petites agences qui démarrent.",
      priceMonthly: "2 000",
      priceAnnual: "20 000",
      features: [
        "1 compte Admin",
        "1 voyage actif",
        "1 mois d'historique",
        "Support Standard (Email)"
      ],
      recommended: false,
      buttonText: "Commencer"
    },
    {
      name: "Croissance",
      description: "Pour les agences moyennes avec un flux régulier.",
      priceMonthly: "2 400",
      priceAnnual: "24 000",
      features: [
        "3 comptes (1 admin et 2 employés)",
        "4 voyages actifs",
        "4 mois d'historique",
        "Support Prioritaire (WhatsApp / Email)"
      ],
      recommended: true,
      buttonText: "Essayer gratuitement"
    },
    {
      name: "Premium",
      description: "Pour les grandes agences ou tour-opérateurs.",
      priceMonthly: "4 900",
      priceAnnual: "49 000",
      features: [
        "Comptes illimités",
        "8 voyages actifs",
        "12 mois d'historique",
        "Support Dédié (Téléphone 7j/7)"
      ],
      recommended: false,
      buttonText: "Nous contacter",
      buttonLink: "mailto:anis.haddouche@sofia-data.com"
    }
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* Navbar */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2 font-bold text-xl text-primary">
          QRtravel
        </div>
        <nav className="flex items-center gap-3 md:gap-4">
          <Link to="/login" className="hidden sm:block text-sm font-medium hover:text-primary transition-colors">
            Se connecter
          </Link>
          <Link to="/login">
            <Button className="hidden sm:flex">Essayer gratuitement</Button>
            <Button size="sm" className="sm:hidden text-xs">Essayer</Button>
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 md:px-6 text-center max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 md:mb-6 text-gray-900" style={{ lineHeight: 1.1 }}>
          Ne perdez plus jamais la trace d'un <span className="text-primary">voyageur</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-8 md:mb-10 max-w-2xl mx-auto">
          L'outil de pointage par QR code conçu pour les agences de voyages. Assurez un suivi parfait de vos groupes sur le terrain, facilitez le travail de vos guides et offrez une expérience rassurante à vos clients.
        </p>

        {/* Video Embedding */}
        <div className="mt-8 md:mt-12 rounded-2xl border bg-white shadow-2xl p-1 md:p-2 mx-auto max-w-5xl group">
          <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-video rounded-xl overflow-hidden bg-gray-100">
            {!isVideoPlaying && (
              <div 
                className="absolute inset-0 z-10 cursor-pointer bg-white flex items-center justify-center group/cover"
                onClick={() => setIsVideoPlaying(true)}
              >
                <img 
                  src={logo} 
                  alt="Cover de la vidéo" 
                  className="absolute inset-0 w-full h-full object-contain p-8 md:p-12 opacity-80 transition-opacity group-hover/cover:opacity-60"
                />
                <div className="relative z-20 bg-primary text-white p-4 md:p-5 rounded-full shadow-xl transform transition-transform group-hover/cover:scale-110 flex items-center justify-center">
                  <Play className="h-8 w-8 md:h-10 md:w-10 ml-1" />
                </div>
              </div>
            )}
            <iframe
              src="https://drive.google.com/file/d/1tZODTP6P7gC9up_6wsnsihQpKfDv0VizX0K2fc_odp0/preview"
              className="absolute top-0 left-0 w-full h-full border-0"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Vidéo de démonstration QRtravel"
            ></iframe>
          </div>
        </div>

        {/* Tester l'application button below video */}
        <div className="mt-8 md:mt-12 flex justify-center">
          <Link to="/login">
            <Button size="lg" className="text-base md:text-lg px-8 md:px-10 py-6 md:py-7 rounded-full shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
              Tester l'application <ChevronRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-gray-50 px-6 border-t">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Des tarifs simples et transparents</h2>
            <p className="text-lg text-gray-600 max-w-xl mx-auto mb-8">
              Choisissez le plan qui correspond le mieux à la taille de votre agence et à vos besoins.
            </p>

            {/* Toggle Monthly / Annual */}
            <div className="inline-flex flex-col sm:flex-row items-stretch sm:items-center bg-gray-200 p-1.5 rounded-2xl sm:rounded-full gap-1 sm:gap-0">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-4 sm:px-8 py-2.5 rounded-xl sm:rounded-full text-sm font-semibold transition-all ${!isAnnual ? 'bg-white shadow-md text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Facturation mensuelle
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-4 sm:px-8 py-2.5 rounded-xl sm:rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 ${isAnnual ? 'bg-white shadow-md text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Facturation annuelle <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">2 MOIS OFFERTS</span>
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 md:gap-10">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`flex flex-col rounded-[2rem] p-10 lg:p-12 bg-white border ${plan.recommended ? 'ring-2 ring-primary shadow-2xl relative scale-100 lg:scale-105 z-10' : 'shadow-lg'}`}
              >
                {plan.recommended && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white px-5 py-1.5 rounded-full text-sm font-bold tracking-wider shadow-sm">
                    RECOMMANDÉ
                  </div>
                )}

                <h3 className="text-2xl font-bold mb-3">{plan.name}</h3>
                <p className="text-base text-gray-500 min-h-[48px] mb-8">{plan.description}</p>

                <div className="mb-8 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight">{isAnnual ? plan.priceAnnual : plan.priceMonthly}</span>
                  <span className="text-2xl font-bold mr-1">DA</span>
                  <span className="text-gray-500 font-medium">/{isAnnual ? 'an' : 'mois'}</span>
                </div>

                {plan.buttonLink?.startsWith('mailto:') ? (
                  <a href={plan.buttonLink} className="block w-full mb-8">
                    <Button
                      variant={plan.recommended ? 'default' : 'outline'}
                      className="w-full rounded-xl py-6 text-base font-semibold"
                    >
                      {plan.buttonText}
                    </Button>
                  </a>
                ) : (
                  <Link to={plan.buttonLink || "/login"} className="block w-full mb-8">
                    <Button
                      variant={plan.recommended ? 'default' : 'outline'}
                      className="w-full rounded-xl py-6 text-base font-semibold"
                    >
                      {plan.buttonText}
                    </Button>
                  </Link>
                )}

                <ul className="space-y-4">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-start gap-3 text-sm text-gray-700">
                      <Check className="h-5 w-5 text-primary shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 border-t text-center text-gray-500 text-sm bg-white">
        <p>&copy; {new Date().getFullYear()} <a href="https://www.sofia-data.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Sofia-Data</a>. Tous droits réservés.</p>
      </footer>
    </div>
  );
}
