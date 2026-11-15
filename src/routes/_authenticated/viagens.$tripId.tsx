import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, CheckCircle2, Copy, FileText, Lightbulb, Loader2, MapPin, Pencil, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { DETAIL_LABELS, KINDS, errMsg, fmtDate, fmtDateTime, invokeFn, readDetails } from "@/lib/trip";

export const Route = createFileRoute("/_authenticated/viagens/$tripId")({
  head: () => ({
    meta: [
      { title: "Detalhes da viagem — TripMind" },
      { name: "description", content: "Documentos, itens e roteiro da sua viagem." },
      { property: "og:title", content: "Detalhes da viagem — TripMind" },
      { property: "og:description", content: "Documentos, itens e roteiro da sua viagem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripPage,
});

const ACCEPT = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX = 10 * 1024 * 1024;

function TripPage() {
  const { tripId } = Route.useParams();
  const trip = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => { const { data, error } = await supabase.from("trips").select("*").eq("id", tripId).single(); if (error) throw error; return data; },
  });
  const items = useQuery({
    queryKey: ["items", tripId],
    queryFn: async () => { const { data, error } = await supabase.from("trip_items").select("*").eq("trip_id", tripId).order("starts_at", { ascending: true, nullsFirst: false }); if (error) throw error; return data; },
  });
  if (trip.isLoading) return <Loader2 className="mx-auto mt-16 h-8 w-8 animate-spin text-primary" />;
  if (trip.error) return <p className="p-8 text-center text-destructive">Viagem não encontrada.</p>;
  const t = trip.data!;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/viagens" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Minhas viagens</Link>
      <div className="mb-6 rounded-2xl bg-hero p-6 text-primary-foreground shadow-soft">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <div className="mt-2 flex flex-wrap gap-4 text-sm opacity-90">
          {t.destination && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{t.destination}</span>}
          {t.start_date && <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />{fmtDate(t.start_date)}{t.end_date ? ` – ${fmtDate(t.end_date)}` : ""}</span>}
        </div>
      </div>
      <Tabs defaultValue="docs">
        <TabsList className="mb-4"><TabsTrigger value="docs">Documentos</TabsTrigger><TabsTrigger value="items">Itens da viagem</TabsTrigger><TabsTrigger value="itinerary">Roteiro</TabsTrigger></TabsList>
        <TabsContent value="docs"><DocsTab tripId={tripId} /></TabsContent>
        <TabsContent value="items"><ItemsTab tripId={tripId} items={items.data ?? []} loading={items.isLoading} /></TabsContent>
        <TabsContent value="itinerary"><ItineraryTab tripId={tripId} hasItems={!!items.data?.length} /></TabsContent>
      </Tabs>
    </main>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  processing: { label: "Processando", cls: "bg-warning/20 text-foreground" },
  done: { label: "Concluído", cls: "bg-success/15 text-success" },
  error: { label: "Erro", cls: "bg-destructive/15 text-destructive" },
};
const STATUS_STUCK = { label: "Parado", cls: "bg-warning/20 text-foreground" };

// Documento parado: para de recarregar e oferece "Tentar novamente".
// - "pendente" há mais de 1 min: a chamada à função falhou antes de começar.
// - "processando" há mais de 3 min: a execução foi interrompida (ela dura no máx. ~150 s).
const PENDING_STUCK_MS = 60_000;
const PROCESSING_STUCK_MS = 3 * 60_000;
type DocStatus = { status: string; created_at: string; processing_started_at?: string | null };
const ageMs = (iso: string) => Date.now() - new Date(iso).getTime();
const isStuck = (d: DocStatus) =>
  (d.status === "pending" && ageMs(d.created_at) > PENDING_STUCK_MS) ||
  (d.status === "processing" && ageMs(d.processing_started_at ?? d.created_at) > PROCESSING_STUCK_MS);
const isBusy = (d: DocStatus) => (d.status === "pending" || d.status === "processing") && !isStuck(d);

function DocsTab({ tripId }: { tripId: string }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(0);
  const docs = useQuery({
    queryKey: ["docs", tripId],
    queryFn: async () => { const { data, error } = await supabase.from("documents").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }); if (error) throw error; return data; },
    refetchInterval: (q) => (q.state.data?.some(isBusy) ? 3000 : false),
  });
  const busy = !!docs.data?.some(isBusy);
  const prevBusy = useRef(false);
  useEffect(() => {
    // Quando o processamento termina, recarrega a aba de itens.
    if (prevBusy.current && !busy) qc.invalidateQueries({ queryKey: ["items", tripId] });
    prevBusy.current = busy;
  }, [busy, qc, tripId]);

  const [retrying, setRetrying] = useState<string | null>(null);
  const retry = async (doc: { id: string; file_name: string }) => {
    setRetrying(doc.id);
    try {
      await invokeFn("process-document", { document_id: doc.id });
      toast.success(`${doc.file_name} processado!`);
    } catch (e) {
      toast.error(`Falha ao processar ${doc.file_name}: ${errMsg(e)}`);
    } finally {
      setRetrying(null);
      qc.invalidateQueries({ queryKey: ["docs", tripId] });
      qc.invalidateQueries({ queryKey: ["items", tripId] });
    }
  };

  const handle = useCallback(async (files: FileList | File[]) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Sessão expirada. Entre novamente."); return; }
    for (const file of Array.from(files)) {
      if (!ACCEPT.includes(file.type)) { toast.error(`${file.name}: formato não aceito (use PDF, JPG, PNG ou WEBP).`); continue; }
      if (file.size > MAX) { toast.error(`${file.name}: arquivo maior que 10 MB.`); continue; }
      setUploading((n) => n + 1);
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${u.user.id}/${tripId}/${Date.now()}-${safe}`;
        const up = await supabase.storage.from("travel-docs").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        const { data: doc, error } = await supabase.from("documents").insert({ trip_id: tripId, storage_path: path, file_name: file.name, mime_type: file.type } as any).select().single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["docs", tripId] });
        invokeFn("process-document", { document_id: doc.id })
          .catch((e) => toast.error(`Falha ao processar ${file.name}: ${errMsg(e)}`))
          .finally(() => {
            qc.invalidateQueries({ queryKey: ["docs", tripId] });
            qc.invalidateQueries({ queryKey: ["items", tripId] });
          });
        toast.success(`${file.name} enviado! Processando…`);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ${errMsg(e)}`);
      } finally { setUploading((n) => n - 1); }
    }
  }, [tripId, qc]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${drag ? "border-accent bg-accent/10" : "border-border bg-card hover:border-primary"}`}
      >
        {uploading > 0 ? <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /> : <Upload className="mx-auto h-10 w-10 text-accent" />}
        <p className="mt-3 font-medium">Arraste seus documentos aqui ou clique para escolher</p>
        <p className="text-sm text-muted-foreground">PDF, JPG, PNG ou WEBP — até 10 MB cada</p>
        <input ref={input} type="file" multiple hidden accept={ACCEPT.join(",")} onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }} />
      </div>
      {docs.error && <p className="text-destructive">Erro ao carregar documentos: {errMsg(docs.error)}</p>}
      <ul className="space-y-2">
        {docs.data?.map((d) => {
          const stuck = isStuck(d);
          const s = stuck ? STATUS_STUCK : (STATUS[d.status] ?? STATUS["pending"]!);
          const canRetry = d.status === "error" || stuck;
          return (
            <li key={d.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.file_name}</p>
                {d.error_message && (
                  <p className={`mt-1 text-sm ${d.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{d.error_message}</p>
                )}
                {stuck && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {d.status === "pending" ? "O processamento não começou." : "O processamento demorou demais."} Tente novamente.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canRetry && (
                  <Button size="sm" variant="outline" disabled={retrying === d.id} onClick={() => retry(d)}>
                    {retrying === d.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                    Tentar novamente
                  </Button>
                )}
                <Badge variant="outline" className={`border-0 ${s.cls}`}>{d.status === "processing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{s.label}</Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Item = { id: string; kind: string; title: string; starts_at: string | null; ends_at: string | null; location: string | null; confirmation_code: string | null; details?: unknown };

function ItemDetails({ details }: { details: unknown }) {
  const d = readDetails(details);
  const { origin, destination } = d;
  const route = origin && destination ? `${origin} → ${destination}` : null;
  const extras = Object.entries(DETAIL_LABELS).filter(([k]) => d[k]);
  if (!route && !extras.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {route && <p className="text-sm font-medium text-foreground">{route}</p>}
      {!!extras.length && (
        <div className="flex flex-wrap gap-1.5">
          {extras.map(([k, label]) => (
            <span key={k} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{label}:</span> {d[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
const empty = { kind: "other", title: "", starts_at: "", ends_at: "", location: "", confirmation_code: "" };

function ItemsTab({ tripId, items, loading }: { tripId: string; items: Item[]; loading: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const openNew = () => { setEditing(null); setF(empty); setOpen(true); };
  const openEdit = (i: Item) => { setEditing(i.id); setF({ kind: i.kind, title: i.title, starts_at: i.starts_at?.slice(0, 16) ?? "", ends_at: i.ends_at?.slice(0, 16) ?? "", location: i.location ?? "", confirmation_code: i.confirmation_code ?? "" }); setOpen(true); };
  const save = useMutation({
    mutationFn: async () => {
      const row = { kind: f.kind, title: f.title, starts_at: f.starts_at || null, ends_at: f.ends_at || null, location: f.location || null, confirmation_code: f.confirmation_code || null };
      const { error } = editing ? await supabase.from("trip_items").update(row).eq("id", editing) : await supabase.from("trip_items").insert({ ...row, trip_id: tripId } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(editing ? "Item atualizado." : "Item adicionado."); setOpen(false); qc.invalidateQueries({ queryKey: ["items", tripId] }); },
    onError: (e) => toast.error("Não foi possível salvar: " + errMsg(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("trip_items").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Item excluído."); qc.invalidateQueries({ queryKey: ["items", tripId] }); },
    onError: (e) => toast.error("Não foi possível excluir: " + errMsg(e)),
  });
  const copy = (c: string) => navigator.clipboard.writeText(c).then(() => toast.success("Código copiado!"), () => toast.error("Não foi possível copiar."));

  return (
    <div>
      <div className="mb-4 flex justify-end"><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Adicionar item</Button></div>
      {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /> : !items.length ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nenhum item ainda. Envie documentos ou adicione manualmente.</div>
      ) : (
        <ol className="relative ml-5 border-l-2 border-secondary">
          {items.map((i) => {
            const K = (KINDS[i.kind] ?? KINDS["other"])!;
            return (
              <li key={i.id} className="relative mb-4 pl-8">
                <span className="absolute -left-[19px] top-3 flex h-9 w-9 items-center justify-center rounded-full bg-hero text-primary-foreground shadow-soft"><K.icon className="h-4 w-4" /></span>
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-accent">{K.label}</p>
                      <h3 className="font-semibold">{i.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{fmtDateTime(i.starts_at)}{i.ends_at ? ` → ${fmtDateTime(i.ends_at)}` : ""}</p>
                      {i.location && <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{i.location}</p>}
                      <ItemDetails details={i.details} />
                      {i.confirmation_code && (
                        <button onClick={() => copy(i.confirmation_code!)} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 font-mono text-sm text-secondary-foreground hover:bg-secondary/70">
                          {i.confirmation_code}<Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(i)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="hover:text-destructive" aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir "{i.title}"?</AlertDialogTitle></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(i.id)}>Excluir</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle></DialogHeader>
          <form id="it" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
            <div className="space-y-2"><Label>Tipo</Label>
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Título</Label><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Início</Label><Input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></div>
              <div className="space-y-2"><Label>Fim</Label><Input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Local</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
            <div className="space-y-2"><Label>Código de confirmação</Label><Input value={f.confirmation_code} onChange={(e) => setF({ ...f, confirmation_code: e.target.value })} /></div>
          </form>
          <DialogFooter><Button form="it" disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Activity = { time?: string; title: string; description?: string; type: "fixed" | "suggestion"; item_id?: string | null };
type Content = { summary?: string; days?: { date: string; title?: string; activities?: Activity[] }[]; tips?: string[] };

function ItineraryTab({ tripId, hasItems }: { tripId: string; hasItems: boolean }) {
  const qc = useQueryClient();
  const it = useQuery({
    queryKey: ["itinerary", tripId],
    queryFn: async () => { const { data, error } = await supabase.from("itineraries").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data; },
  });
  const gen = useMutation({
    mutationFn: () => invokeFn("generate-itinerary", { trip_id: tripId }),
    onSuccess: () => { toast.success("Roteiro pronto!"); qc.invalidateQueries({ queryKey: ["itinerary", tripId] }); },
    onError: (e) => toast.error("Não foi possível gerar o roteiro: " + errMsg(e)),
  });
  const c = it.data?.content as Content | undefined;

  if (gen.isPending) return (
    <div className="rounded-2xl border bg-card p-12 text-center">
      <Sparkles className="mx-auto h-10 w-10 animate-pulse text-accent" />
      <p className="mt-4 font-semibold">Montando seu roteiro…</p>
      <p className="text-sm text-muted-foreground">A IA está organizando seus dias. Isso pode levar até 1 minuto.</p>
    </div>
  );
  if (it.isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />;
  if (!c) return (
    <div className="rounded-2xl border border-dashed p-12 text-center">
      <Sparkles className="mx-auto h-10 w-10 text-accent" />
      <p className="mt-3 text-muted-foreground">{hasItems ? "Gere um roteiro dia a dia com base nos itens da viagem." : "Adicione itens à viagem antes de gerar o roteiro."}</p>
      <Button className="mt-4" disabled={!hasItems} onClick={() => gen.mutate()}><Sparkles className="mr-2 h-4 w-4" />Gerar roteiro com IA</Button>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        {c.summary && <p className="text-muted-foreground">{c.summary}</p>}
        <Button variant="outline" className="shrink-0" disabled={!hasItems} onClick={() => gen.mutate()}><RefreshCw className="mr-2 h-4 w-4" />Gerar novamente</Button>
      </div>
      {c.days?.map((d, idx) => (
        <div key={idx} className="rounded-2xl border bg-card p-5 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Dia {idx + 1} · {fmtDate(d.date)}</p>
          {d.title && <h3 className="text-lg font-semibold">{d.title}</h3>}
          <ul className="mt-3 space-y-2">
            {d.activities?.map((a, j) => (
              <li key={j} className={`flex gap-3 rounded-lg p-3 ${a.type === "fixed" ? "border-l-4 border-primary bg-secondary" : "bg-muted/60"}`}>
                <span className="w-12 shrink-0 font-mono text-sm font-semibold text-primary">{a.time}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    {a.type === "fixed"
                      ? <Badge className="bg-primary text-primary-foreground"><CheckCircle2 className="mr-1 h-3 w-3" />Confirmado</Badge>
                      : <Badge variant="outline" className="border-accent text-accent-foreground"><Sparkles className="mr-1 h-3 w-3" />Sugestão da IA</Badge>}
                  </div>
                  {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!!c.tips?.length && (
        <div className="rounded-2xl border bg-secondary p-5">
          <h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-5 w-5 text-warning" />Dicas</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{c.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
