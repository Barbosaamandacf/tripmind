import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass, FileUp, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TripMind — Planejador de viagens com IA" },
      { name: "description", content: "Envie suas reservas e a IA organiza sua viagem e monta um roteiro dia a dia." },
      { property: "og:title", content: "TripMind — Planejador de viagens com IA" },
      { property: "og:description", content: "Envie suas reservas e a IA organiza sua viagem e monta um roteiro dia a dia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const steps = [
    { icon: FileUp, t: "Envie seus documentos", d: "Passagens, reservas e ingressos em PDF ou foto." },
    { icon: ListChecks, t: "Tudo organizado", d: "A IA extrai voos, hotéis e eventos numa linha do tempo." },
    { icon: Sparkles, t: "Roteiro sob medida", d: "Um plano dia a dia com sugestões e dicas." },
  ];
  return (
    <div className="min-h-screen">
      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 py-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 text-xl font-bold font-display"><Compass className="h-7 w-7" /> TripMind</div>
          <h1 className="text-4xl font-bold md:text-6xl">Sua viagem, organizada pela IA.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg opacity-90">Mande as reservas. Receba um roteiro pronto.</p>
          <Button asChild size="lg" variant="secondary" className="mt-8"><Link to="/auth">Começar agora</Link></Button>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-16 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.t} className="rounded-xl border bg-card p-6 shadow-soft">
            <s.icon className="h-8 w-8 text-accent" />
            <h3 className="mt-4 font-semibold">{s.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
