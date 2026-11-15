import { Plane, BedDouble, TrainFront, Bus, Car, Ticket, UtensilsCrossed, MapPin, type LucideIcon } from "lucide-react";

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
