import { useState, useCallback, useMemo, useEffect } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  LayoutDashboard, PlusCircle, ClipboardList, Search, BarChart2,
  MapPin, Download, Printer, X, ChevronRight,
  AlertTriangle, CheckCircle2, ArrowRightLeft, User,
  Stethoscope, Skull, Clock, ScanLine, FileDown, Database,
  Info, Activity, Eye, EyeOff, LogOut, Lock, Shield,
  UserCheck, Users, ChevronDown, Plus, Settings, KeyRound,
  Bell, ChevronRight as ChevronRight2, CheckCircle
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip
} from "recharts";

// ─── Auth / Role Types ────────────────────────────────────────────────────────

type Role = "administrator" | "farm_manager" | "veterinarian" | "breeder";
type Tab = "dashboard" | "register" | "event" | "search" | "reports" | "profile";

// ─── Types ──────────────────────────────────────────────────────────────────

type Species = "cattle" | "goat" | "sheep" | "donkey" | "buffalo" | "camel";
type AnimalStatus =
  | "Registered at Breeder's Farm"
  | "Transferred, Pending Quarantine"
  | "In Quarantine"
  | "Active at Farm"
  | "Sent to Slaughterhouse";
type EventType =
  | "Birth Registered"
  | "Transfer to MCF Farm"
  | "Quarantine Start"
  | "Quarantine End"
  | "Movement to Slaughter"
  | "Health Check"
  | "Other";
interface AuthUser {
  id: string;
  name: string;
  role: Role;
  email: string;
  avatar: string; // initials
}

interface RoleMeta {
  label: string;
  description: string;
  color: string;
  bg: string;
  tabs: Tab[];
  canWrite: boolean;        // register births
  canRecordEvents: boolean; // log lifecycle events
  canExport: boolean;       // reports export
  canViewReports: boolean;  // analytics tab
  eventTypes?: EventType[]; // restrict which events a role can log (undefined = all)
}

const ROLE_META: Record<Role, RoleMeta> = {
  administrator: {
    label: "Administrator",
    description: "Full system access — animals, events, reports, exports, and user management",
    color: "#ffffff",
    bg: "#182951",
    tabs: ["dashboard", "event", "register", "search", "reports", "profile"],
    canWrite: true,
    canRecordEvents: true,
    canExport: true,
    canViewReports: true,
  },
  farm_manager: {
    label: "Farm Manager",
    description: "Manage all animals and events, view and export full reports",
    color: "#ffffff",
    bg: "#2D7DD2",
    tabs: ["dashboard", "event", "register", "search", "reports", "profile"],
    canWrite: true,
    canRecordEvents: true,
    canExport: true,
    canViewReports: true,
  },
  veterinarian: {
    label: "Veterinarian",
    description: "Record health checks, quarantine start/end, and view animal histories",
    color: "#182951",
    bg: "#E3F8EF",
    tabs: ["dashboard", "event", "register", "search", "reports", "profile"],
    canWrite: false,
    canRecordEvents: true,
    canExport: false,
    canViewReports: true,
    eventTypes: ["Health Check", "Quarantine Start", "Quarantine End", "Other"],
  },
  breeder: {
    label: "Breeder",
    description: "Register births for your farm and view your own animals only",
    color: "#ffffff",
    bg: "#2FB572",
    tabs: ["dashboard", "event", "register", "search", "reports", "profile"],
    canWrite: true,
    canRecordEvents: false,
    canExport: false,
    canViewReports: false,
  },
};

// Demo credentials — username:password → user profile
const DEMO_USERS: Array<AuthUser & { password: string }> = [
  { id: "u1", name: "Imran Khan Baloch", email: "admin@mcfarm.pk",     password: "admin123",   role: "administrator", avatar: "IK" },
  { id: "u2", name: "Nasreen Mengal",    email: "manager@mcfarm.pk",   password: "manager123", role: "farm_manager",  avatar: "NM" },
  { id: "u3", name: "Dr. Waqar Rind",    email: "vet@mcfarm.pk",       password: "vet123",     role: "veterinarian",  avatar: "WR" },
  { id: "u4", name: "Haji Kareem Baloch",email: "breeder@mcfarm.pk",   password: "breeder123", role: "breeder",       avatar: "HK" },
];

interface Animal {
  id: string;
  species: Species;
  birth_date: string;
  breeder_name: string;
  birth_location: string;
  birth_lat?: number;
  birth_lng?: number;
  gender: "Male" | "Female";
  color: string;
  status: AnimalStatus;
  notes?: string;
  created_at: string;
}

interface AnimalEvent {
  id: string;
  animal_id: string;
  event_type: EventType;
  event_date: string;
  location: string;
  lat?: number;
  lng?: number;
  notes: string;
  recorded_at: string;
  previous_owner?: string;
  transfer_condition?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SPECIES_LIST: Species[] = ["cattle", "goat", "sheep", "donkey", "buffalo", "camel"];

const SPECIES_META: Record<Species, { label: string; code: string; emoji: string; male: string; female: string; colorHint: string }> = {
  cattle:  { label: "Cattle",  code: "CTL", emoji: "🐄", male: "Bull",  female: "Cow",   colorHint: "e.g. Black & White, Brown" },
  goat:    { label: "Goat",    code: "GOT", emoji: "🐐", male: "Buck",  female: "Doe",   colorHint: "e.g. White, Tan, Spotted" },
  sheep:   { label: "Sheep",   code: "SHP", emoji: "🐑", male: "Ram",   female: "Ewe",   colorHint: "e.g. White, Grey, Black" },
  donkey:  { label: "Donkey",  code: "DON", emoji: "🫏", male: "Jack",  female: "Jenny", colorHint: "e.g. Grey, Brown" },
  buffalo: { label: "Buffalo", code: "BUF", emoji: "🐃", male: "Bull",  female: "Cow",   colorHint: "e.g. Dark Grey, Black" },
  camel:   { label: "Camel",   code: "CAM", emoji: "🐪", male: "Bull",  female: "Cow",   colorHint: "e.g. Tan, Brown, Beige" },
};

const STATUS_META: Record<AnimalStatus, { color: string; bg: string; label: string }> = {
  "Registered at Breeder's Farm":    { color: "#2D7DD2", bg: "#EBF4FF", label: "At Breeder" },
  "Transferred, Pending Quarantine": { color: "#182951", bg: "#E8EBF2", label: "Transferred" },
  "In Quarantine":                   { color: "#9E9E9E", bg: "#F5F5F5", label: "Quarantine" },
  "Active at Farm":                  { color: "#2FB572", bg: "#E3F8EF", label: "Active" },
  "Sent to Slaughterhouse":          { color: "#d4183d", bg: "#FDEAEE", label: "Slaughter" },
};

const EVENT_META: Record<EventType, { icon: typeof CheckCircle2; color: string }> = {
  "Birth Registered":      { icon: PlusCircle,      color: "#2FB572" },
  "Transfer to MCF Farm":  { icon: ArrowRightLeft,  color: "#2D7DD2" },
  "Quarantine Start":      { icon: AlertTriangle,   color: "#9E9E9E" },
  "Quarantine End":        { icon: CheckCircle2,    color: "#2FB572" },
  "Movement to Slaughter": { icon: Skull,           color: "#d4183d" },
  "Health Check":          { icon: Stethoscope,     color: "#182951" },
  "Other":                 { icon: Info,            color: "#9E9E9E" },
};

const TRANSFER_CONDITIONS = [
  "Healthy - Good condition",
  "Healthy - Minor injuries",
  "Requires attention",
  "Underweight",
];

// ─── Seed Data ───────────────────────────────────────────────────────────────

const SEED_ANIMALS: Animal[] = [
  {
    id: "MCF-CTL-202604-001", species: "cattle", birth_date: "2026-04-12",
    breeder_name: "Haji Kareem Baloch", birth_location: "Turbat, Kech",
    birth_lat: 26.0035, birth_lng: 63.0681,
    gender: "Male", color: "Black & White", status: "Active at Farm",
    created_at: "2026-04-12T08:00:00Z",
  },
  {
    id: "MCF-CTL-202604-002", species: "cattle", birth_date: "2026-04-15",
    breeder_name: "Haji Kareem Baloch", birth_location: "Turbat, Kech",
    birth_lat: 26.0035, birth_lng: 63.0681,
    gender: "Female", color: "Brown", status: "In Quarantine",
    created_at: "2026-04-15T09:30:00Z",
  },
  {
    id: "MCF-GOT-202605-001", species: "goat", birth_date: "2026-05-03",
    breeder_name: "Saeed Ahmed Mengal", birth_location: "Khuzdar, Balochistan",
    birth_lat: 27.8136, birth_lng: 66.6111,
    gender: "Male", color: "White & Brown", status: "Registered at Breeder's Farm",
    created_at: "2026-05-03T07:15:00Z",
  },
  {
    id: "MCF-GOT-202605-002", species: "goat", birth_date: "2026-05-10",
    breeder_name: "Saeed Ahmed Mengal", birth_location: "Khuzdar, Balochistan",
    gender: "Female", color: "All White", status: "Transferred, Pending Quarantine",
    created_at: "2026-05-10T10:00:00Z",
  },
  {
    id: "MCF-SHP-202605-001", species: "sheep", birth_date: "2026-05-18",
    breeder_name: "Abdul Rahim Zehri", birth_location: "Mastung, Balochistan",
    birth_lat: 29.7985, birth_lng: 66.8458,
    gender: "Female", color: "White", status: "Active at Farm",
    created_at: "2026-05-18T11:00:00Z",
  },
  {
    id: "MCF-SHP-202605-002", species: "sheep", birth_date: "2026-05-22",
    breeder_name: "Abdul Rahim Zehri", birth_location: "Mastung, Balochistan",
    gender: "Male", color: "Grey & White", status: "Sent to Slaughterhouse",
    created_at: "2026-05-22T08:45:00Z",
  },
  {
    id: "MCF-BUF-202606-001", species: "buffalo", birth_date: "2026-06-01",
    breeder_name: "Ghulam Rasool Noor", birth_location: "Dera Murad Jamali",
    birth_lat: 29.4609, birth_lng: 67.3287,
    gender: "Female", color: "Dark Grey", status: "Registered at Breeder's Farm",
    created_at: "2026-06-01T06:30:00Z",
  },
  {
    id: "MCF-CAM-202606-001", species: "camel", birth_date: "2026-06-10",
    breeder_name: "Mir Naseer Marri", birth_location: "Sibi, Balochistan",
    birth_lat: 29.5431, birth_lng: 67.8772,
    gender: "Male", color: "Tan / Sandy Brown", status: "Registered at Breeder's Farm",
    created_at: "2026-06-10T09:00:00Z",
  },
];

const SEED_EVENTS: AnimalEvent[] = [
  { id: "e1", animal_id: "MCF-CTL-202604-001", event_type: "Birth Registered", event_date: "2026-04-12", location: "Turbat, Kech", lat: 26.0035, lng: 63.0681, notes: "Healthy calf, normal birth weight.", recorded_at: "2026-04-12T08:05:00Z" },
  { id: "e2", animal_id: "MCF-CTL-202604-001", event_type: "Transfer to MCF Farm", event_date: "2026-04-28", location: "MCF Central Farm, Turbat", notes: "Transferred in good health.", previous_owner: "Haji Kareem Baloch", transfer_condition: "Healthy - Good condition", recorded_at: "2026-04-28T10:00:00Z" },
  { id: "e3", animal_id: "MCF-CTL-202604-001", event_type: "Quarantine Start", event_date: "2026-04-28", location: "MCF Quarantine Block A", notes: "Standard 21-day quarantine initiated.", recorded_at: "2026-04-28T11:00:00Z" },
  { id: "e4", animal_id: "MCF-CTL-202604-001", event_type: "Quarantine End", event_date: "2026-05-19", location: "MCF Quarantine Block A", notes: "All tests clear. Released to main herd.", recorded_at: "2026-05-19T09:00:00Z" },
  { id: "e5", animal_id: "MCF-CTL-202604-001", event_type: "Health Check", event_date: "2026-06-05", location: "MCF Central Farm", notes: "Routine check by Dr. Waqar. Weight 320kg, healthy.", recorded_at: "2026-06-05T14:00:00Z" },
  { id: "e6", animal_id: "MCF-CTL-202604-002", event_type: "Birth Registered", event_date: "2026-04-15", location: "Turbat, Kech", lat: 26.0035, lng: 63.0681, notes: "Female calf, healthy delivery.", recorded_at: "2026-04-15T09:35:00Z" },
  { id: "e7", animal_id: "MCF-CTL-202604-002", event_type: "Transfer to MCF Farm", event_date: "2026-05-01", location: "MCF Central Farm", notes: "Transferred.", previous_owner: "Haji Kareem Baloch", transfer_condition: "Healthy - Good condition", recorded_at: "2026-05-01T10:00:00Z" },
  { id: "e8", animal_id: "MCF-CTL-202604-002", event_type: "Quarantine Start", event_date: "2026-05-01", location: "MCF Quarantine Block B", notes: "Quarantine initiated.", recorded_at: "2026-05-01T11:30:00Z" },
  { id: "e9", animal_id: "MCF-GOT-202605-001", event_type: "Birth Registered", event_date: "2026-05-03", location: "Khuzdar, Balochistan", lat: 27.8136, lng: 66.6111, notes: "Buck kid, strong and active.", recorded_at: "2026-05-03T07:20:00Z" },
  { id: "e10", animal_id: "MCF-GOT-202605-002", event_type: "Birth Registered", event_date: "2026-05-10", location: "Khuzdar, Balochistan", notes: "Doe kid, healthy.", recorded_at: "2026-05-10T10:05:00Z" },
  { id: "e11", animal_id: "MCF-GOT-202605-002", event_type: "Transfer to MCF Farm", event_date: "2026-06-15", location: "MCF Central Farm", notes: "Transferred from Mengal farm.", previous_owner: "Saeed Ahmed Mengal", transfer_condition: "Healthy - Good condition", recorded_at: "2026-06-15T08:00:00Z" },
  { id: "e12", animal_id: "MCF-SHP-202605-001", event_type: "Birth Registered", event_date: "2026-05-18", location: "Mastung, Balochistan", lat: 29.7985, lng: 66.8458, notes: "Ewe lamb, white fleece.", recorded_at: "2026-05-18T11:05:00Z" },
  { id: "e13", animal_id: "MCF-SHP-202605-001", event_type: "Transfer to MCF Farm", event_date: "2026-06-01", location: "MCF Central Farm", notes: "", previous_owner: "Abdul Rahim Zehri", transfer_condition: "Healthy - Good condition", recorded_at: "2026-06-01T09:00:00Z" },
  { id: "e14", animal_id: "MCF-SHP-202605-001", event_type: "Quarantine Start", event_date: "2026-06-01", location: "MCF Quarantine Block A", notes: "", recorded_at: "2026-06-01T10:00:00Z" },
  { id: "e15", animal_id: "MCF-SHP-202605-001", event_type: "Quarantine End", event_date: "2026-06-22", location: "MCF Quarantine Block A", notes: "Cleared.", recorded_at: "2026-06-22T09:00:00Z" },
  { id: "e16", animal_id: "MCF-SHP-202605-002", event_type: "Birth Registered", event_date: "2026-05-22", location: "Mastung, Balochistan", notes: "Ram lamb, grey markings.", recorded_at: "2026-05-22T08:50:00Z" },
  { id: "e17", animal_id: "MCF-SHP-202605-002", event_type: "Transfer to MCF Farm", event_date: "2026-06-10", location: "MCF Central Farm", notes: "", previous_owner: "Abdul Rahim Zehri", transfer_condition: "Underweight", recorded_at: "2026-06-10T10:00:00Z" },
  { id: "e18", animal_id: "MCF-SHP-202605-002", event_type: "Movement to Slaughter", event_date: "2026-06-25", location: "Quetta Slaughterhouse", notes: "Transferred per schedule.", recorded_at: "2026-06-25T07:00:00Z" },
  { id: "e19", animal_id: "MCF-BUF-202606-001", event_type: "Birth Registered", event_date: "2026-06-01", location: "Dera Murad Jamali", lat: 29.4609, lng: 67.3287, notes: "Buffalo calf, dark grey, healthy.", recorded_at: "2026-06-01T06:35:00Z" },
  { id: "e20", animal_id: "MCF-CAM-202606-001", event_type: "Birth Registered", event_date: "2026-06-10", location: "Sibi, Balochistan", lat: 29.5431, lng: 67.8772, notes: "Male calf camel, good weight.", recorded_at: "2026-06-10T09:05:00Z" },
];

// ─── Data Service (easy to swap to Supabase) ─────────────────────────────────

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function useDataService() {
  const [animals, setAnimals] = useState<Animal[]>(() =>
    loadFromStorage("mcf_animals", SEED_ANIMALS)
  );
  const [events, setEvents] = useState<AnimalEvent[]>(() =>
    loadFromStorage("mcf_events", SEED_EVENTS)
  );
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    saveToStorage("mcf_animals", animals);
  }, [animals]);
  useEffect(() => {
    saveToStorage("mcf_events", events);
  }, [events]);

  // Counters per species+month for ID generation
  const getNextCounter = useCallback((species: Species, yyyymm: string) => {
    const prefix = `MCF-${SPECIES_META[species].code}-${yyyymm}-`;
    const existing = animals
      .filter(a => a.id.startsWith(prefix))
      .map(a => parseInt(a.id.split("-").pop() || "0", 10));
    return (existing.length > 0 ? Math.max(...existing) : 0) + 1;
  }, [animals]);

  const addAnimal = useCallback((animal: Omit<Animal, "id" | "created_at">) => {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const counter = getNextCounter(animal.species, yyyymm);
    const id = `MCF-${SPECIES_META[animal.species].code}-${yyyymm}-${String(counter).padStart(3, "0")}`;
    const newAnimal: Animal = { ...animal, id, created_at: now.toISOString() };

    const birthEvent: AnimalEvent = {
      id: `e${Date.now()}`,
      animal_id: id,
      event_type: "Birth Registered",
      event_date: animal.birth_date,
      location: animal.birth_location,
      lat: animal.birth_lat,
      lng: animal.birth_lng,
      notes: animal.notes || "",
      recorded_at: now.toISOString(),
    };

    setAnimals(prev => [newAnimal, ...prev]);
    setEvents(prev => [birthEvent, ...prev]);
    return newAnimal;
  }, [getNextCounter]);

  const addEvent = useCallback((evt: Omit<AnimalEvent, "id" | "recorded_at">) => {
    const now = new Date();
    const newEvent: AnimalEvent = { ...evt, id: `e${Date.now()}`, recorded_at: now.toISOString() };

    const statusMap: Partial<Record<EventType, AnimalStatus>> = {
      "Transfer to MCF Farm":  "Transferred, Pending Quarantine",
      "Quarantine Start":      "In Quarantine",
      "Quarantine End":        "Active at Farm",
      "Movement to Slaughter": "Sent to Slaughterhouse",
    };
    const newStatus = statusMap[evt.event_type];

    setEvents(prev => [newEvent, ...prev]);
    if (newStatus) {
      setAnimals(prev => prev.map(a => a.id === evt.animal_id ? { ...a, status: newStatus } : a));
    }
    return newEvent;
  }, []);

  const getAnimalEvents = useCallback((animalId: string) =>
    events.filter(e => e.animal_id === animalId).sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    ), [events]);

  return { animals, events, addAnimal, addEvent, getAnimalEvents, isOnline, setIsOnline };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Shared Components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AnimalStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: m.color, backgroundColor: m.bg, fontFamily: "Montserrat, sans-serif" }}>
      {m.label}
    </span>
  );
}

function SpeciesChip({ species, count, active, onClick }: { species: Species; count?: number; active?: boolean; onClick?: () => void }) {
  const m = SPECIES_META[species];
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all",
        active
          ? "text-white shadow-sm"
          : "bg-white border border-border text-foreground hover:bg-muted"
      )}
      style={{
        fontFamily: "Montserrat, sans-serif",
        background: active ? "var(--gradient-brand)" : undefined,
      }}
    >
      <span>{m.emoji}</span>
      <span>{m.label}{count !== undefined ? ` ${count}` : ""}</span>
    </button>
  );
}

function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-xl p-4 transition-shadow",
        onClick ? "cursor-pointer hover:shadow-md active:scale-[0.99]" : "",
        className
      )}
    >
      {children}
    </div>
  );
}

function InputField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-input-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground";

// ─── QR Modal ────────────────────────────────────────────────────────────────

function QRModal({ animalId, onClose }: { animalId: string; onClose: () => void }) {
  const downloadQR = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${animalId}-qr.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-fadeInUp" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>QR Code</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted"><X size={18} /></button>
        </div>
        <div id="qr-canvas" className="flex flex-col items-center gap-4">
          <div className="p-3 bg-white border-2 border-border rounded-xl">
            <QRCodeCanvas value={animalId} size={200} level="H" includeMargin={false} />
          </div>
          <p className="font-mono text-sm text-center text-foreground bg-muted px-3 py-1.5 rounded-lg">{animalId}</p>
          <p className="text-xs text-muted-foreground text-center">Scan to look up this animal's full trace history</p>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={downloadQR}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <Download size={16} /> Download PNG
          </button>
          <button onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <Printer size={16} /> Print Label
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Animal Detail Modal ──────────────────────────────────────────────────────

function AnimalDetailModal({ animal, events, onClose }: { animal: Animal; events: AnimalEvent[]; onClose: () => void }) {
  const [showQR, setShowQR] = useState(false);
  const sm = SPECIES_META[animal.species];

  return (
    <>
      <div className="fixed inset-0 z-40 flex flex-col bg-white animate-fadeInUp" style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border"
          style={{ background: "var(--gradient-primary)" }}>
          <div>
            <p className="text-white/70 text-xs font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>Animal Record</p>
            <h2 className="text-white font-bold text-base" style={{ fontFamily: "Montserrat, sans-serif" }}>{animal.id}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Summary card */}
          <Card>
            <div className="flex items-start gap-3">
              <span className="text-4xl">{sm.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>{sm.label}</span>
                  <StatusBadge status={animal.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{animal.gender === "Male" ? sm.male : sm.female} · {animal.color}</p>
                <p className="text-sm text-muted-foreground">Born {formatDate(animal.birth_date)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Breeder</p><p className="font-medium text-foreground">{animal.breeder_name}</p></div>
              <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium text-foreground">{animal.birth_location}</p></div>
              {animal.birth_lat && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">GPS</p>
                  <p className="font-mono text-xs text-accent">{animal.birth_lat.toFixed(4)}, {animal.birth_lng?.toFixed(4)}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => setShowQR(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
              <ScanLine size={16} /> View QR Code
            </button>
            <button onClick={() => setShowQR(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
              style={{ fontFamily: "Montserrat, sans-serif" }}>
              <ScanLine size={16} /> Simulate Scan
            </button>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Event History ({events.length})
            </h3>
            <div className="space-y-0">
              {events.map((evt, i) => {
                const em = EVENT_META[evt.event_type];
                const Icon = em.icon;
                return (
                  <div key={evt.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: em.color + "20" }}>
                        <Icon size={16} style={{ color: em.color }} />
                      </div>
                      {i < events.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
                    </div>
                    <div className={cn("pb-4 flex-1", i === events.length - 1 ? "" : "")}>
                      <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>{evt.event_type}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(evt.event_date)} · {evt.location}</p>
                      {evt.lat && <p className="text-xs font-mono text-accent mt-0.5">{evt.lat.toFixed(4)}, {evt.lng?.toFixed(4)}</p>}
                      {evt.transfer_condition && <p className="text-xs text-muted-foreground">Condition: {evt.transfer_condition}</p>}
                      {evt.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">"{evt.notes}"</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {showQR && <QRModal animalId={animal.id} onClose={() => setShowQR(false)} />}
    </>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function Dashboard({ animals, events, isOnline, onAnimalClick }: {
  animals: Animal[]; events: AnimalEvent[]; isOnline: boolean; onAnimalClick: (a: Animal) => void;
}) {
  const speciesCounts = useMemo(() => {
    const counts: Partial<Record<Species, number>> = {};
    animals.forEach(a => { counts[a.species] = (counts[a.species] || 0) + 1; });
    return counts;
  }, [animals]);

  const stats = useMemo(() => ({
    total: animals.length,
    quarantine: animals.filter(a => a.status === "In Quarantine").length,
    breeders: animals.filter(a => a.status === "Registered at Breeder's Farm").length,
    slaughter: animals.filter(a => a.status === "Sent to Slaughterhouse").length,
  }), [animals]);

  const recentEvents = useMemo(() =>
    [...events].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 4),
    [events]);

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-5 pb-6" style={{ background: "var(--gradient-primary)" }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-xs font-medium tracking-wide uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Makuran Cattle Farm
            </p>
            <h1 className="text-white text-xl font-bold mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Track Now
            </h1>
            <p className="text-white/60 text-xs mt-0.5">Livestock Traceability Platform</p>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
            isOnline ? "bg-secondary/20 text-white" : "bg-yellow-400/20 text-yellow-200"
          )} style={{ fontFamily: "Montserrat, sans-serif" }}>
            <span className={cn("w-2 h-2 rounded-full", isOnline ? "bg-secondary animate-pulse" : "bg-yellow-400")} />
            {isOnline ? "Synced" : "Offline"}
          </div>
        </div>

        {/* Species strip */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
          {(Object.entries(speciesCounts) as [Species, number][]).map(([sp, cnt]) => (
            <div key={sp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold whitespace-nowrap"
              style={{ fontFamily: "Montserrat, sans-serif" }}>
              <span>{SPECIES_META[sp].emoji}</span>
              <span>{cnt} {SPECIES_META[sp].label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Animals", value: stats.total, icon: Activity, gradient: "var(--gradient-primary)", sub: "Across all species" },
            { label: "In Quarantine", value: stats.quarantine, icon: AlertTriangle, gradient: "var(--gradient-impact)", sub: "Awaiting clearance" },
            { label: "At Breeders", value: stats.breeders, icon: User, gradient: "var(--gradient-brand)", sub: "Pre-transfer" },
            { label: "Slaughtered", value: stats.slaughter, icon: Skull, gradient: "linear-gradient(135deg,#d4183d 0%,#9b1228 100%)", sub: "Final movement" },
          ].map(({ label, value, icon: Icon, gradient, sub }) => (
            <div key={label} className="rounded-xl p-4 text-white shadow-sm" style={{ background: gradient }}>
              <Icon size={20} strokeWidth={1.5} className="opacity-80 mb-2" />
              <p className="text-2xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>{value}</p>
              <p className="text-xs font-semibold opacity-90 mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>{label}</p>
              <p className="text-xs opacity-60 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>Recent Activity</h2>
          <div className="space-y-2">
            {recentEvents.map(evt => {
              const animal = animals.find(a => a.id === evt.animal_id);
              if (!animal) return null;
              const em = EVENT_META[evt.event_type];
              const Icon = em.icon;
              return (
                <Card key={evt.id} onClick={() => onAnimalClick(animal)}
                  className="flex items-center gap-3 !p-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: em.color + "15" }}>
                    <span className="text-lg">{SPECIES_META[animal.species].emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate" style={{ fontFamily: "Montserrat, sans-serif" }}>
                      {evt.event_type}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-mono">{animal.id}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground">{formatDate(evt.event_date)}</p>
                    <ChevronRight size={14} className="text-muted-foreground ml-auto mt-0.5" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Register Tab ─────────────────────────────────────────────────────────────

function RegisterAnimal({ addAnimal }: { addAnimal: ReturnType<typeof useDataService>["addAnimal"] }) {
  const [species, setSpecies] = useState<Species>("cattle");
  const [form, setForm] = useState({
    breeder_name: "",
    birth_date: new Date().toISOString().split("T")[0],
    birth_location: "",
    birth_lat: undefined as number | undefined,
    birth_lng: undefined as number | undefined,
    gender: "Male" as "Male" | "Female",
    color: "",
    notes: "",
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitted, setSubmitted] = useState<Animal | null>(null);
  const [showQR, setShowQR] = useState(false);
  const sm = SPECIES_META[species];

  const captureGPS = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({ ...f, birth_lat: pos.coords.latitude, birth_lng: pos.coords.longitude }));
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.breeder_name || !form.birth_date || !form.birth_location) return;
    const animal = addAnimal({ species, ...form, status: "Registered at Breeder's Farm" });
    setSubmitted(animal);
  };

  const reset = () => {
    setSubmitted(null);
    setShowQR(false);
    setForm({ breeder_name: "", birth_date: new Date().toISOString().split("T")[0], birth_location: "", birth_lat: undefined, birth_lng: undefined, gender: "Male", color: "", notes: "" });
  };

  if (submitted) {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="rounded-xl p-5 text-white text-center" style={{ background: "var(--gradient-brand)" }}>
          <CheckCircle2 size={40} className="mx-auto mb-2 opacity-90" />
          <h2 className="text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Animal Registered!</h2>
          <p className="text-sm opacity-80 mt-1">ID assigned and QR code ready</p>
        </div>
        <Card className="text-center">
          <p className="text-xs text-muted-foreground mb-1" style={{ fontFamily: "Montserrat, sans-serif" }}>Traceability ID</p>
          <p className="font-mono text-base font-bold text-foreground">{submitted.id}</p>
          <p className="text-sm text-muted-foreground mt-1">{sm.emoji} {sm.label} · {submitted.gender === "Male" ? sm.male : sm.female}</p>
        </Card>
        <div className="flex flex-col items-center gap-3 bg-muted rounded-xl p-4">
          <QRCodeCanvas value={submitted.id} size={180} level="H" />
          <p className="text-xs text-muted-foreground text-center">Scan to access full trace record</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowQR(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
            style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
            <Download size={16} /> Download QR
          </button>
          <button onClick={reset}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <PlusCircle size={16} /> Register Another
          </button>
        </div>
        {showQR && <QRModal animalId={submitted.id} onClose={() => setShowQR(false)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 pt-5 pb-4" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Register New Birth</h1>
        <p className="text-white/60 text-xs mt-0.5">Record a newly born animal at a breeder farm</p>
      </div>
      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4 pb-8">
        {/* Species */}
        <InputField label="Species">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {SPECIES_LIST.map(sp => (
              <SpeciesChip key={sp} species={sp} active={species === sp} onClick={() => setSpecies(sp)} />
            ))}
          </div>
        </InputField>

        <InputField label="Breeder Name" required>
          <input className={inputCls} placeholder="e.g. Haji Kareem Baloch" required
            value={form.breeder_name} onChange={e => setForm(f => ({ ...f, breeder_name: e.target.value }))} />
        </InputField>

        <InputField label="Birth Date" required>
          <input type="date" className={inputCls} required
            value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
        </InputField>

        <InputField label="Breeder Location / Village" required>
          <input className={inputCls} placeholder="e.g. Turbat, Kech District" required
            value={form.birth_location} onChange={e => setForm(f => ({ ...f, birth_location: e.target.value }))} />
          <button type="button" onClick={captureGPS}
            className="flex items-center gap-1.5 mt-1 text-accent text-xs font-semibold"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <MapPin size={14} />
            {gpsLoading ? "Getting location…" : form.birth_lat ? `GPS: ${form.birth_lat.toFixed(4)}, ${form.birth_lng?.toFixed(4)}` : "Use GPS Location"}
          </button>
        </InputField>

        <InputField label={`Gender (${sm.label})`} required>
          <select className={inputCls} value={form.gender}
            onChange={e => setForm(f => ({ ...f, gender: e.target.value as "Male" | "Female" }))}>
            <option value="Male">Male ({sm.male})</option>
            <option value="Female">Female ({sm.female})</option>
          </select>
        </InputField>

        <InputField label="Color / Markings">
          <input className={inputCls} placeholder={sm.colorHint}
            value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
        </InputField>

        <InputField label="Notes (Optional)">
          <textarea className={cn(inputCls, "resize-none min-h-[80px]")} rows={3}
            placeholder="Any observations at birth…"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </InputField>

        <button type="submit"
          className="w-full py-3.5 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-opacity"
          style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
          Register Animal & Generate QR
        </button>
      </form>
    </div>
  );
}

// ─── Record Event Tab ─────────────────────────────────────────────────────────

function RecordEvent({ animals, addEvent, allowedEventTypes }: {
  animals: Animal[];
  addEvent: ReturnType<typeof useDataService>["addEvent"];
  allowedEventTypes?: EventType[];
}) {
  const [animalId, setAnimalId] = useState("");
  const [eventType, setEventType] = useState<EventType>("Health Check");
  const [form, setForm] = useState({
    event_date: new Date().toISOString().split("T")[0],
    location: "",
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    notes: "",
    previous_owner: "",
    transfer_condition: TRANSFER_CONDITIONS[0],
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const isTransfer = eventType === "Transfer to MCF Farm";

  const captureGPS = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setForm(f => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude })); setGpsLoading(false); },
      () => setGpsLoading(false), { timeout: 8000 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!animalId || !form.event_date || !form.location) return;
    addEvent({
      animal_id: animalId,
      event_type: eventType,
      event_date: form.event_date,
      location: form.location,
      lat: form.lat,
      lng: form.lng,
      notes: form.notes,
      previous_owner: isTransfer ? form.previous_owner : undefined,
      transfer_condition: isTransfer ? form.transfer_condition : undefined,
    });
    setSubmitted(true);
  };

  const selectedAnimal = animals.find(a => a.id === animalId);

  if (submitted) {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="rounded-xl p-5 text-white text-center" style={{ background: "var(--gradient-impact)" }}>
          <CheckCircle2 size={40} className="mx-auto mb-2 opacity-90" />
          <h2 className="text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Event Recorded</h2>
          <p className="text-sm opacity-80 mt-1">History updated · immutable record added</p>
        </div>
        {selectedAnimal && (isTransfer || eventType === "Quarantine Start") && (
          <Card className="text-center">
            <p className="text-sm text-muted-foreground mb-3">Generate updated QR for this animal?</p>
            <button onClick={() => setShowQR(true)}
              className="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
              <ScanLine size={16} /> View QR Code
            </button>
          </Card>
        )}
        <button onClick={() => { setSubmitted(false); setAnimalId(""); setEventType("Health Check"); setForm({ event_date: new Date().toISOString().split("T")[0], location: "", lat: undefined, lng: undefined, notes: "", previous_owner: "", transfer_condition: TRANSFER_CONDITIONS[0] }); }}
          className="w-full py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors"
          style={{ fontFamily: "Montserrat, sans-serif" }}>
          Record Another Event
        </button>
        {showQR && selectedAnimal && <QRModal animalId={selectedAnimal.id} onClose={() => setShowQR(false)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 pt-5 pb-4" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Record Event</h1>
        <p className="text-white/60 text-xs mt-0.5">
          {allowedEventTypes
            ? `Veterinarian access · ${allowedEventTypes.join(", ")}`
            : "Log a lifecycle event for an existing animal"}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4 pb-8">
        <InputField label="Select Animal" required>
          <select className={inputCls} value={animalId} onChange={e => setAnimalId(e.target.value)} required>
            <option value="">— Choose an animal —</option>
            {animals.map(a => (
              <option key={a.id} value={a.id}>
                {SPECIES_META[a.species].emoji} {a.id} · {STATUS_META[a.status].label}
              </option>
            ))}
          </select>
          {selectedAnimal && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedAnimal.breeder_name} · {selectedAnimal.color}
            </p>
          )}
        </InputField>

        <InputField label="Event Type" required>
          <select className={inputCls} value={eventType}
            onChange={e => setEventType(e.target.value as EventType)}>
            {(Object.keys(EVENT_META) as EventType[])
              .filter(t => t !== "Birth Registered")
              .filter(t => !allowedEventTypes || allowedEventTypes.includes(t))
              .map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </InputField>

        {isTransfer && (
          <>
            <InputField label="Previous Owner / Breeder">
              <input className={inputCls} placeholder="Name of previous breeder"
                value={form.previous_owner} onChange={e => setForm(f => ({ ...f, previous_owner: e.target.value }))} />
            </InputField>
            <InputField label="Animal Condition on Transfer">
              <select className={inputCls} value={form.transfer_condition}
                onChange={e => setForm(f => ({ ...f, transfer_condition: e.target.value }))}>
                {TRANSFER_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </InputField>
          </>
        )}

        <InputField label="Event Date" required>
          <input type="date" className={inputCls} required
            value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
        </InputField>

        <InputField label="Location" required>
          <input className={inputCls} placeholder="e.g. MCF Central Farm, Turbat" required
            value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          <button type="button" onClick={captureGPS}
            className="flex items-center gap-1.5 mt-1 text-accent text-xs font-semibold"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <MapPin size={14} />
            {gpsLoading ? "Getting location…" : form.lat ? `GPS: ${form.lat.toFixed(4)}, ${form.lng?.toFixed(4)}` : "Use GPS Location"}
          </button>
        </InputField>

        <InputField label="Notes / Observations">
          <textarea className={cn(inputCls, "resize-none min-h-[80px]")} rows={3}
            placeholder="Observations, vet notes, conditions…"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </InputField>

        <button type="submit"
          className="w-full py-3.5 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-opacity"
          style={{ background: "var(--gradient-impact)", fontFamily: "Montserrat, sans-serif" }}>
          Record Event & Update History
        </button>
      </form>
    </div>
  );
}

// ─── Search / Scan Tab ────────────────────────────────────────────────────────

function SearchScan({ animals, events, onAnimalClick }: {
  animals: Animal[]; events: AnimalEvent[]; onAnimalClick: (a: Animal) => void;
}) {
  const [query, setQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState<Species | "all">("all");

  const presentSpecies = useMemo(() => {
    const s = new Set(animals.map(a => a.species));
    return SPECIES_LIST.filter(sp => s.has(sp));
  }, [animals]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return animals.filter(a => {
      const matchQuery = !q || a.id.toLowerCase().includes(q) ||
        a.breeder_name.toLowerCase().includes(q) || a.species.includes(q);
      const matchSpecies = speciesFilter === "all" || a.species === speciesFilter;
      return matchQuery && matchSpecies;
    });
  }, [animals, query, speciesFilter]);

  return (
    <div>
      <div className="px-4 pt-5 pb-4" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Search & Scan</h1>
        <p className="text-white/60 text-xs mt-0.5">Find animals by ID, breeder, or species</p>
        <div className="relative mt-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder:text-white/50 text-sm focus:outline-none focus:border-white/40"
            placeholder="Search ID, breeder, species…"
            value={query} onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Species filter */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-border">
        <button
          onClick={() => setSpeciesFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
            speciesFilter === "all" ? "text-white" : "bg-white border border-border text-foreground hover:bg-muted"
          )}
          style={{ fontFamily: "Montserrat, sans-serif", background: speciesFilter === "all" ? "var(--gradient-primary)" : undefined }}>
          All ({animals.length})
        </button>
        {presentSpecies.map(sp => (
          <SpeciesChip key={sp} species={sp}
            count={animals.filter(a => a.species === sp).length}
            active={speciesFilter === sp}
            onClick={() => setSpeciesFilter(speciesFilter === sp ? "all" : sp)} />
        ))}
      </div>

      {/* Results */}
      <div className="px-4 py-3 space-y-2 pb-6">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No animals found</div>
        )}
        {filtered.map(animal => {
          const sm = SPECIES_META[animal.species];
          const animalEvents = events.filter(e => e.animal_id === animal.id);
          const latest = animalEvents.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0];
          return (
            <Card key={animal.id} onClick={() => onAnimalClick(animal)} className="animate-fadeInUp">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted text-xl">
                  {sm.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-bold text-foreground">{animal.id}</p>
                    <StatusBadge status={animal.status} />
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>
                    {animal.breeder_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {animal.gender === "Male" ? sm.male : sm.female} · {animal.color}
                  </p>
                  {latest && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock size={11} />
                      {latest.event_type} · {formatDate(latest.event_date)}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{animalEvents.length} events</p>
                  <ChevronRight size={16} className="text-muted-foreground mt-1" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────────────────────

function Reports({ animals, canExport = true }: { animals: Animal[]; canExport?: boolean }) {
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    animals.forEach(a => {
      const label = STATUS_META[a.status].label;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [animals]);

  const speciesData = useMemo(() => {
    const counts: Partial<Record<Species, number>> = {};
    animals.forEach(a => { counts[a.species] = (counts[a.species] || 0) + 1; });
    return (Object.entries(counts) as [Species, number][]).map(([sp, count]) => ({
      name: `${SPECIES_META[sp].emoji} ${SPECIES_META[sp].label}`,
      count,
    }));
  }, [animals]);

  const PIE_COLORS = ["#2D7DD2", "#182951", "#9E9E9E", "#2FB572", "#d4183d"];

  const exportCSV = () => {
    const headers = ["ID", "Species", "Birth Date", "Breeder", "Location", "Gender", "Color", "Status", "Created At"];
    const rows = animals.map(a => [
      a.id, a.species, a.birth_date, a.breeder_name, a.birth_location,
      a.gender, a.color, a.status, a.created_at
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mcf-animals.csv"; a.click();
  };

  const exportJSON = () => {
    const data = JSON.stringify({ animals, exported_at: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mcf-backup.json"; a.click();
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-4" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Reports & Analytics</h1>
        <p className="text-white/60 text-xs mt-0.5">Live summary across all animals</p>
      </div>
      <div className="px-4 py-4 space-y-4 pb-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4 text-white" style={{ background: "var(--gradient-impact)" }}>
            <p className="text-3xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>
              {new Set(animals.map(a => a.species)).size}
            </p>
            <p className="text-xs font-semibold mt-1 opacity-90" style={{ fontFamily: "Montserrat, sans-serif" }}>Species Tracked</p>
            <p className="text-xs opacity-60">Across all registrations</p>
          </div>
          <div className="rounded-xl p-4 text-white" style={{ background: "var(--gradient-brand)" }}>
            <p className="text-3xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>100%</p>
            <p className="text-xs font-semibold mt-1 opacity-90" style={{ fontFamily: "Montserrat, sans-serif" }}>Traceability</p>
            <p className="text-xs opacity-60">Every animal has QR + history</p>
          </div>
        </div>

        {/* Status donut */}
        <Card>
          <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                labelLine={false}>
                {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {statusData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name} ({d.value})
              </div>
            ))}
          </div>
        </Card>

        {/* Species bar chart */}
        <Card>
          <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>Animals by Species</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={speciesData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#2D7DD2" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Export buttons */}
        {canExport ? (
          <div className="flex flex-col gap-2">
            <button onClick={exportCSV}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
              <FileDown size={16} /> Export All Data (CSV)
            </button>
            <button onClick={exportJSON}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors"
              style={{ fontFamily: "Montserrat, sans-serif" }}>
              <Database size={16} /> Backup Data (JSON)
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-muted/50 border border-border rounded-xl px-4 py-3">
            <Lock size={16} className="text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Export is restricted to Admin and Farm Manager roles.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      const match = DEMO_USERS.find(
        u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
      );
      if (match) {
        const { password: _, ...user } = match;
        onLogin(user);
      } else {
        setError("Invalid email or password. Try a demo account below.");
      }
      setLoading(false);
    }, 700);
  };

  const loginAs = (user: typeof DEMO_USERS[number]) => {
    setEmail(user.email);
    setPassword(user.password);
    setShowDemo(false);
    setError("");
  };

  return (
    <div className="flex flex-col bg-background">
      {/* Hero header */}
      <div className="flex-shrink-0 px-6 pt-12 pb-10 text-white relative overflow-hidden"
        style={{ background: "var(--gradient-primary)" }}>
        {/* Decorative rings */}
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full border border-white/10" />
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full border border-white/10" />
        <div className="absolute right-6 top-6 w-16 h-16 rounded-full bg-white/5" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "var(--gradient-impact)" }}>
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white/60 text-xs font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>
                Makuran Cattle Farm
              </p>
              <p className="text-white font-bold text-base leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
                Track Now
              </p>
            </div>
          </div>
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
            Welcome back
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Sign in to access your livestock traceability dashboard
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="px-6 py-6 space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputField label="Email Address" required>
            <input
              type="email"
              className={inputCls}
              placeholder="your@email.com"
              value={email}
              autoComplete="username"
              onChange={e => { setEmail(e.target.value); setError(""); }}
              required
            />
          </InputField>

          <InputField label="Password" required>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className={cn(inputCls, "pr-11")}
                placeholder="Enter your password"
                value={password}
                autoComplete="current-password"
                onChange={e => { setPassword(e.target.value); setError(""); }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </InputField>

          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-destructive text-sm animate-fadeInUp">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Demo accounts */}
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowDemo(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}
          >
            <span className="flex items-center gap-2">
              <Users size={15} />
              Demo Accounts
            </span>
            <ChevronDown size={15} className={cn("transition-transform", showDemo ? "rotate-180" : "")} />
          </button>

          {showDemo && (
            <div className="border-t border-border divide-y divide-border animate-fadeInUp">
              {DEMO_USERS.map(u => {
                const rm = ROLE_META[u.role];
                return (
                  <button
                    key={u.id}
                    onClick={() => loginAs(u)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif" }}>
                      {u.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: "Montserrat, sans-serif" }}>
                        {u.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <RoleBadge role={u.role} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Role permissions legend */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-0.5"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            Access Levels
          </p>
          {(Object.entries(ROLE_META) as [Role, RoleMeta][]).map(([role, rm]) => (
            <div key={role} className="flex items-start gap-3 bg-muted/40 rounded-xl px-3 py-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: rm.bg }}>
                <RoleIcon role={role} size={15} color={rm.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
                    {rm.label}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    {rm.tabs.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-border text-muted-foreground font-medium capitalize"
                        style={{ fontFamily: "Montserrat, sans-serif" }}>
                        {t === "event" ? "Events" : t === "register" ? "Register" : t.charAt(0).toUpperCase() + t.slice(1)}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{rm.description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Track Now · Makuran Cattle Farm · v1.0
        </p>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const rm = ROLE_META[role];
  return (
    <span className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full"
      style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif" }}>
      {rm.label}
    </span>
  );
}

function RoleIcon({ role, size = 16, color }: { role: Role; size?: number; color?: string }) {
  const props = { size, strokeWidth: 1.5, style: { color: color || "currentColor" } };
  if (role === "administrator") return <Shield {...props} />;
  if (role === "farm_manager")  return <UserCheck {...props} />;
  if (role === "veterinarian")  return <Stethoscope {...props} />;
  return <Users {...props} />;
}

// ─── Profile Screen ───────────────────────────────────────────────────────────

function ProfileScreen({ user, onLogout, onPasswordChange }: {
  user: AuthUser;
  onLogout: () => void;
  onPasswordChange: (current: string, next: string) => string | null;
}) {
  const rm = ROLE_META[user.role];
  const [section, setSection] = useState<"main" | "password" | "notifications">("main");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (pwForm.next.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError("Passwords do not match."); return; }
    const err = onPasswordChange(pwForm.current, pwForm.next);
    if (err) { setPwError(err); return; }
    setPwSuccess(true);
    setPwForm({ current: "", next: "", confirm: "" });
    setTimeout(() => { setPwSuccess(false); setSection("main"); }, 1800);
  };

  if (section === "password") {
    return (
      <div>
        <div className="px-4 pt-5 pb-4" style={{ background: "var(--gradient-primary)" }}>
          <button onClick={() => setSection("main")} className="flex items-center gap-1.5 text-white/70 text-xs mb-3 font-semibold" style={{ fontFamily: "Montserrat, sans-serif" }}>
            <ChevronDown size={14} className="rotate-90" /> Back
          </button>
          <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Change Password</h1>
          <p className="text-white/60 text-xs mt-0.5">Update your account password</p>
        </div>
        <form onSubmit={handlePwSubmit} className="px-4 py-5 space-y-4 pb-8">
          {(["current", "next", "confirm"] as const).map((field) => (
            <InputField key={field} label={field === "current" ? "Current Password" : field === "next" ? "New Password" : "Confirm New Password"} required>
              <div className="relative">
                <input type={showPw[field] ? "text" : "password"} className={cn(inputCls, "pr-11")}
                  placeholder={field === "current" ? "Your current password" : field === "next" ? "At least 6 characters" : "Repeat new password"}
                  value={pwForm[field]} onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))} required />
                <button type="button" onClick={() => setShowPw(p => ({ ...p, [field]: !p[field] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw[field] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </InputField>
          ))}
          {pwError && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-destructive text-sm animate-fadeInUp">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />{pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="flex items-center gap-2 bg-muted border border-secondary/30 rounded-lg px-3 py-2.5 text-secondary text-sm animate-fadeInUp">
              <CheckCircle size={14} /> Password updated successfully!
            </div>
          )}
          <button type="submit" className="w-full py-3.5 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-opacity"
            style={{ background: "var(--gradient-brand)", fontFamily: "Montserrat, sans-serif" }}>
            Update Password
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      {/* Profile hero */}
      <div className="px-4 pt-8 pb-6 text-center relative overflow-hidden"
        style={{ background: "var(--gradient-primary)" }}>
        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full border border-white/10" />
        <div className="absolute -left-4 bottom-0 w-24 h-24 rounded-full border border-white/10" />
        <div className="relative">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-3 shadow-lg"
            style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif",
              boxShadow: "0 0 0 4px rgba(255,255,255,0.2)" }}>
            {user.avatar}
          </div>
          <h2 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>{user.name}</h2>
          <p className="text-white/60 text-sm mt-0.5">{user.email}</p>
          <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full bg-white/15">
            <RoleIcon role={user.role} size={13} color="white" />
            <span className="text-white text-xs font-semibold" style={{ fontFamily: "Montserrat, sans-serif" }}>{rm.label}</span>
          </div>
        </div>
      </div>

      {/* Role permissions */}
      <div className="px-4 py-4 space-y-4 pb-8">
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="px-4 py-3 bg-muted/40 border-b border-border">
            <p className="text-xs font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Role Permissions</p>
          </div>
          {[
            { label: "Register Animals", allowed: rm.canWrite },
            { label: "Record Events", allowed: rm.canRecordEvents },
            { label: "View Reports", allowed: rm.canViewReports },
            { label: "Export Data", allowed: rm.canExport },
          ].map(({ label, allowed }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0">
              <span className="text-sm text-foreground" style={{ fontFamily: "Manrope, sans-serif" }}>{label}</span>
              <span className={cn("flex items-center gap-1 text-xs font-semibold", allowed ? "text-secondary" : "text-muted-foreground")}
                style={{ fontFamily: "Montserrat, sans-serif" }}>
                {allowed ? <CheckCircle size={13} /> : <Lock size={13} />}
                {allowed ? "Allowed" : "Restricted"}
              </span>
            </div>
          ))}
          {rm.eventTypes && (
            <div className="px-4 py-2.5 bg-muted/20">
              <p className="text-xs text-muted-foreground mb-1.5">Permitted event types:</p>
              <div className="flex flex-wrap gap-1.5">
                {rm.eventTypes.map(t => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-border text-foreground font-medium"
                    style={{ fontFamily: "Montserrat, sans-serif" }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings actions */}
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="px-4 py-3 bg-muted/40 border-b border-border">
            <p className="text-xs font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Account Settings</p>
          </div>
          {[
            { icon: KeyRound, label: "Change Password", sub: "Update your login password", action: () => setSection("password") },
            { icon: Bell,     label: "Notifications",   sub: "Manage alerts and sync notifications", action: () => {} },
            { icon: Settings, label: "App Preferences", sub: "Language, display, and field defaults", action: () => {} },
          ].map(({ icon: Icon, label, sub, action }) => (
            <button key={label} onClick={action}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors text-left">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted">
                <Icon size={17} strokeWidth={1.5} className="text-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
              <ChevronRight2 size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* App info */}
        <div className="rounded-xl border border-border px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Track Now</p>
            <p className="text-xs text-muted-foreground">Makuran Cattle Farm · v1.0</p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground font-semibold"
            style={{ fontFamily: "Montserrat, sans-serif" }}>Production</span>
        </div>

        {/* Sign out */}
        <button onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-destructive/30 text-destructive font-bold text-sm hover:bg-destructive/5 transition-colors"
          style={{ fontFamily: "Montserrat, sans-serif" }}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

// Nav layout: Dashboard | Event | [+FAB] | Scan | Reports  (Profile via bottom-right)
const LEFT_NAV:  { tab: Tab; icon: typeof LayoutDashboard; label: string }[] = [
  { tab: "dashboard", icon: LayoutDashboard, label: "Home" },
  { tab: "event",     icon: ClipboardList,   label: "Events" },
];
const RIGHT_NAV: { tab: Tab; icon: typeof LayoutDashboard; label: string }[] = [
  { tab: "search",  icon: Search,   label: "Scan" },
  { tab: "reports", icon: BarChart2, label: "Reports" },
  { tab: "profile", icon: Users,    label: "Profile" },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem("mcf_session");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const { animals, events, addAnimal, addEvent, getAnimalEvents, isOnline } = useDataService();

  const handleLogin = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    localStorage.setItem("mcf_session", JSON.stringify(user));
    setActiveTab("dashboard");
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setActiveTab("dashboard");
    localStorage.removeItem("mcf_session");
  }, []);

  const handlePasswordChange = useCallback((current: string, next: string): string | null => {
    if (!currentUser) return "Not logged in.";
    const match = DEMO_USERS.find(u => u.id === currentUser.id && u.password === current);
    if (!match) return "Current password is incorrect.";
    // In a real app: call API. Here we just succeed.
    return null;
  }, [currentUser]);

  const handleAnimalClick = useCallback((animal: Animal) => {
    setSelectedAnimal(animal);
  }, []);

  const GLOBAL_STYLES = `
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn  { from { opacity: 0; transform: scale(0.95); }      to { opacity: 1; transform: scale(1); } }
    .animate-fadeInUp  { animation: fadeInUp 0.35s ease both; }
    .animate-scaleIn   { animation: scaleIn  0.25s ease both; }
    .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
    .scrollbar-hide::-webkit-scrollbar { display: none; }
  `;

  // ── Login ──
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="relative w-full max-w-[430px] h-screen max-h-[900px] bg-background flex flex-col overflow-hidden shadow-2xl"
          style={{ fontFamily: "Manrope, sans-serif" }}>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <LoginScreen onLogin={handleLogin} />
          </div>
        </div>
        <style>{GLOBAL_STYLES}</style>
      </div>
    );
  }

  const rm = ROLE_META[currentUser.role];
  const allowedTabs = rm.tabs;
  const safeTab = allowedTabs.includes(activeTab) ? activeTab : "dashboard";
  const canRegister = rm.canWrite;

  const navTabActive = (tab: Tab) => safeTab === tab;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="relative w-full max-w-[430px] h-screen max-h-[900px] bg-background flex flex-col overflow-hidden shadow-2xl"
        style={{ fontFamily: "Manrope, sans-serif" }}>

        {/* ── Status bar strip ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-white border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
              style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif" }}>
              {currentUser.avatar}
            </div>
            <div className="leading-tight">
              <p className="text-xs font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
                {currentUser.name}
              </p>
              <p className="text-[10px] text-muted-foreground">{rm.label}</p>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full",
            isOnline ? "bg-muted text-secondary" : "bg-yellow-100 text-yellow-700"
          )} style={{ fontFamily: "Montserrat, sans-serif" }}>
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isOnline ? "bg-secondary" : "bg-yellow-400")} />
            {isOnline ? "Synced" : "Offline"}
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {safeTab === "dashboard" && <Dashboard animals={animals} events={events} isOnline={isOnline} onAnimalClick={handleAnimalClick} />}
          {safeTab === "event"     && rm.canRecordEvents && <RecordEvent animals={animals} addEvent={addEvent} allowedEventTypes={rm.eventTypes} />}
          {safeTab === "event"     && !rm.canRecordEvents && <LockedSection role={rm.label} />}
          {safeTab === "register"  && canRegister && <RegisterAnimal addAnimal={addAnimal} />}
          {safeTab === "register"  && !canRegister && <LockedSection role={rm.label} />}
          {safeTab === "search"    && <SearchScan animals={animals} events={events} onAnimalClick={handleAnimalClick} />}
          {safeTab === "reports"   && <Reports animals={animals} canExport={rm.canExport} />}
          {safeTab === "profile"   && (
            <ProfileScreen user={currentUser} onLogout={handleLogout} onPasswordChange={handlePasswordChange} />
          )}
        </div>

        {/* ── Fixed bottom nav ── */}
        <div className="flex-shrink-0 relative bg-white"
          style={{
            boxShadow: "0 -4px 24px rgba(0,0,0,0.10)",
            paddingBottom: "env(safe-area-inset-bottom, 6px)",
          }}>
          {/* FAB — Register */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-7 z-20">
            <button
              onClick={() => setActiveTab("register")}
              title={!canRegister ? "Not available for your role" : "Register new animal"}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95",
                !canRegister ? "opacity-40 cursor-not-allowed" : "hover:scale-105"
              )}
              style={{ background: canRegister ? "var(--gradient-brand)" : "#ccc",
                boxShadow: canRegister ? "0 4px 20px rgba(47,181,114,0.45)" : undefined }}
            >
              <Plus size={28} strokeWidth={2.5} className="text-white" />
            </button>
            <p className="text-center text-[9px] font-bold mt-1 text-muted-foreground"
              style={{ fontFamily: "Montserrat, sans-serif" }}>Register</p>
          </div>

          <div className="flex items-center h-16 px-2">
            {/* Left 2 */}
            {LEFT_NAV.map(({ tab, icon: Icon, label }) => {
              const active = navTabActive(tab);
              const allowed = allowedTabs.includes(tab);
              return (
                <button key={tab} onClick={() => allowed && setActiveTab(tab)}
                  className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 py-1 relative transition-all",
                    !allowed ? "opacity-30 cursor-not-allowed" : "")}
                  style={{ fontFamily: "Montserrat, sans-serif" }}>
                  {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-secondary" />}
                  <Icon size={22} strokeWidth={active ? 2.2 : 1.5}
                    style={{ color: active ? "var(--secondary)" : "var(--muted-foreground)" }} />
                  <span className="text-[10px] font-semibold leading-none"
                    style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}>
                    {label}
                  </span>
                </button>
              );
            })}

            {/* Center spacer for FAB — same flex-1 weight as one nav item */}
            <div className="flex-1" />

            {/* Right 2 */}
            {RIGHT_NAV.map(({ tab, icon: Icon, label }) => {
              const active = navTabActive(tab);
              const allowed = allowedTabs.includes(tab);
              const isProfile = tab === "profile";
              return (
                <button key={tab} onClick={() => allowed && setActiveTab(tab)}
                  className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 py-1 relative transition-all",
                    !allowed ? "opacity-30 cursor-not-allowed" : "")}
                  style={{ fontFamily: "Montserrat, sans-serif" }}>
                  {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-secondary" />}
                  {isProfile ? (
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                      active ? "ring-2 ring-secondary ring-offset-1" : ""
                    )} style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif" }}>
                      {currentUser.avatar}
                    </div>
                  ) : (
                    <Icon size={22} strokeWidth={active ? 2.2 : 1.5}
                      style={{ color: active ? "var(--secondary)" : "var(--muted-foreground)" }} />
                  )}
                  <span className="text-[10px] font-semibold leading-none"
                    style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Animal detail overlay */}
      {selectedAnimal && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full max-w-[430px] h-screen max-h-[900px] pointer-events-auto">
            <AnimalDetailModal
              animal={selectedAnimal}
              events={getAnimalEvents(selectedAnimal.id)}
              onClose={() => setSelectedAnimal(null)}
            />
          </div>
        </div>
      )}

      <style>{GLOBAL_STYLES}</style>
    </div>
  );
}

function LockedSection({ role }: { role: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 text-center pt-24">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--gradient-primary)" }}>
        <Lock size={28} className="text-white" />
      </div>
      <div>
        <p className="font-bold text-foreground text-base" style={{ fontFamily: "Montserrat, sans-serif" }}>
          Access Restricted
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          The <strong>{role}</strong> role does not have permission for this section.
        </p>
      </div>
    </div>
  );
}
