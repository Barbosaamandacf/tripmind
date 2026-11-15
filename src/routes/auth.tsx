import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Compass, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — TripMind" },
      { name: "description", content: "Entre ou crie sua conta no TripMind." },
      { property: "og:title", content: "Entrar — TripMind" },
      { property: "og:description", content: "Entre ou crie sua conta no TripMind." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message); return; }
    navigate({ to: "/viagens" });
  }
  async function signup(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/viagens" } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data.session) navigate({ to: "/viagens" });
    else toast.success("Conta criada! Confira seu e-mail para confirmar o cadastro.");
  }

  const form = (onSubmit: (e: React.FormEvent) => void, label: string) => (
    <form onSubmit={onSubmit} className="space-y-4 pt-4">
      <div className="space-y-2"><Label>E-mail</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="space-y-2"><Label>Senha</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <Button className="w-full" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{label}</Button>
    </form>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-soft">
        <div className="mb-6 flex items-center justify-center gap-2 font-display text-2xl font-bold text-primary"><Compass className="h-7 w-7 text-accent" />TripMind</div>
        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="login">Entrar</TabsTrigger><TabsTrigger value="signup">Cadastrar</TabsTrigger></TabsList>
          <TabsContent value="login">{form(login, "Entrar")}</TabsContent>
          <TabsContent value="signup">{form(signup, "Criar conta")}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
