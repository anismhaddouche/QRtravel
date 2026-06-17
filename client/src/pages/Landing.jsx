import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Play, BookOpen, ChevronRight } from 'lucide-react';

export default function Landing() {
  const [isAnnual, setIsAnnual] = useState(false);

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
      <header className="flex items-center justify-between px-6 py-4 border-b bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2 font-bold text-xl text-primary">
          <div className="bg-primary/10 p-1.5 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L3 8l5 5-3 3-3-1-1 1 2.5 3.5L11 17l1-1-1-3 3-3 5 5 1.2-.7c.4-.2.7-.6.6-1.1z"/></svg>
          </div>
          QRtravel
        </div>
        <nav className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium hover:text-primary transition-colors">
            Se connecter
          </Link>
          <Link to="/login">
            <Button>Essayer gratuitement</Button>
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="py-24 px-6 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 text-gray-900" style={{ lineHeight: 1.1 }}>
          Gérez votre agence de voyages avec <span className="text-primary">QRtravel</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Centralisez la gestion de vos voyages, suivez vos voyageurs en temps réel, et offrez une expérience premium. Développez votre activité sans vous soucier de la logistique.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" variant="secondary" className="w-full sm:w-auto text-base shadow-sm hover:shadow-md transition-all">
            <Play className="mr-2 h-4 w-4" /> Vidéo de démonstration
          </Button>
        </div>
        
        {/* Video Embedding */}
        <div className="mt-12 rounded-2xl border bg-white shadow-2xl p-2 mx-auto aspect-video max-w-5xl relative overflow-hidden group">
          <iframe 
            src="https://drive.google.com/file/d/19awbcnzfZZp7aijovvVek8ADNm8xlFqXyU3gffsE_54/preview" 
            className="w-full h-full rounded-xl bg-gray-100"
            allow="autoplay; encrypted-media" 
            allowFullScreen
            title="Vidéo de démonstration QRtravel"
          ></iframe>
        </div>

        {/* Tester l'application button below video */}
        <div className="mt-12 flex justify-center">
          <Link to="/login">
            <Button size="lg" className="text-lg px-10 py-7 rounded-full shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
              Tester l'application <ChevronRight className="ml-2 h-5 w-5" />
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
            <div className="inline-flex items-center bg-gray-200 p-1.5 rounded-full">
              <button 
                onClick={() => setIsAnnual(false)}
                className={`px-8 py-2.5 rounded-full text-sm font-semibold transition-all ${!isAnnual ? 'bg-white shadow-md text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Facturation mensuelle
              </button>
              <button 
                onClick={() => setIsAnnual(true)}
                className={`px-8 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${isAnnual ? 'bg-white shadow-md text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Facturation annuelle <span className="text-[10px] bg-primary/20 text-primary px-2.5 py-1 rounded-full font-bold">2 MOIS OFFERTS</span>
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
