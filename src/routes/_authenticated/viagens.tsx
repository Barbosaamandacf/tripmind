import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fmtDate } from "@/lib/trip";

export const Route = createFileRoute("/_authenticated/viagens")({
  head: () => ({
    meta: [
      { title: "Minhas viagens — TripMind" },
      { name: "description", content: "Suas viagens planejadas com IA." },
      { property: "og:title", content: "Minhas viagens — TripMind" },
      { property: "og:description", content: "Suas viagens planejadas com IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Layout,
});

function Layout() {
  const match = useMatchRoute();
  const isDetail = match({ to: "/viagens/$tripId", fuzzy: true });
  return (
    <div className="min-h-screen">
      <AppHeader />
      {isDetail ? <Outlet /> : <TripsList />}
    </div>
  );
}

function TripsList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", destination: "", start_date: "", end_date: "" });
  const trips = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*").order("start_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      if (f.start_date && f.end_date && f.end_date < f.start_date) throw new Error("A data de fim deve ser depois do início.");
      const { error } = await supabase.from("trips").insert({ title: f.title, destination: f.destination || null, start_date: f.start_date || null, end_date: f.end_date || null } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Viagem criada!"); setOpen(false); setF({ title: "", destination: "", start_date: "", end_date: "" }); qc.invalidateQueries({ queryKey: ["trips"] }); },
    onError: (e) => toast.error("Não foi possível criar a viagem: " + errMsg(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("trips").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Viagem excluída."); qc.invalidateQueries({ queryKey: ["trips"] }); },
    onError: (e) => toast.error("Não foi possível excluir: " + errMsg(e)),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Minhas viagens</h1>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova viagem</Button>
      </div>
      {trips.isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /> :
       trips.error ? <p className="text-destructive">Erro ao carregar viagens: {errMsg(trips.error)}</p> :
       !trips.data?.length ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhuma viagem ainda. Crie a primeira!</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.data.map((t) => (
            <div key={t.id} className="group relative overflow-hidden rounded-2xl border bg-card shadow-soft transition hover:-translate-y-0.5">
              <div className="h-2 bg-hero" />
              <Link to="/viagens/$tripId" params={{ tripId: t.id }} className="block p-5">
                <h3 className="text-lg font-semibold">{t.title}</h3>
                {t.destination && <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{t.destination}</p>}
                {(t.start_date || t.end_date) && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{fmtDate(t.start_date)}{t.end_date ? ` – ${fmtDate(t.end_date)}` : ""}</p>}
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="absolute right-2 top-4 text-muted-foreground hover:text-destructive" aria-label="Excluir viagem"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Excluir "{t.title}"?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(t.id)}>Excluir</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova viagem</DialogTitle></DialogHeader>
          <form id="nt" onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
            <div className="space-y-2"><Label>Título</Label><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Férias em Lisboa" /></div>
            <div className="space-y-2"><Label>Destino</Label><Input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} placeholder="Lisboa, Portugal" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Início</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>Fim</Label><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
            </div>
          </form>
          <DialogFooter><Button form="nt" disabled={create.isPending}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar viagem</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
