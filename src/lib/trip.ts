import { Plane, BedDouble, TrainFront, Bus, Car, Ticket, UtensilsCrossed, MapPin, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const KINDS: Record<string, { label: string; icon: LucideIcon }> = {
  flight: { label: "Voo", icon: Plane },
  lodging: { label: "Hospedagem", icon: BedDouble },
  train: { label: "Trem", icon: TrainFront },
  bus: { label: "Ônibus", icon: Bus },
  car_rental: { label: "Aluguel de carro", icon: Car },
  event: { label: "Evento", icon: Ticket },
  restaurant: { label: "Restaurante", icon: UtensilsCrossed },
  other: { label: "Outro", icon: MapPin },
};

export function fmtDate(d?: string | null) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}
export function fmtDateTime(d?: string | null) {
  if (!d) return "Sem data";
  const t = d.slice(11, 16);
  return t ? `${fmtDate(d)} às ${t}` : fmtDate(d);
}
export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as any).message) : "Erro desconhecido";
}

/**
 * Chama uma Edge Function e, em caso de erro, devolve a mensagem que a própria
 * função escreveu no corpo da resposta ({ error: "..." }). Sem isso, o
 * supabase-js só informa "Edge Function returned a non-2xx status code".
 */
export async function invokeFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;

  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") {
    throw new Error("Não foi possível conectar ao serviço de IA. Tente novamente em instantes.");
  }
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try {
      const payload = await ctx.clone().json();
      if (typeof payload?.error === "string") throw new Error(payload.error);
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
    }
  }
  throw new Error(error.message);
}

export const DETAIL_LABELS: Record<string, string> = {
  airline: "Companhia",
  flight_number: "Voo",
  seat: "Assento",
  address: "Endereço",
  notes: "Observações",
};

/** Converte a coluna jsonb `details` em pares rótulo/valor seguros para exibir. */
export function readDetails(details: unknown): Record<string, string> {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}
