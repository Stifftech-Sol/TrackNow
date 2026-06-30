import { useState, useCallback, useMemo, useEffect, createContext, useContext } from "react";
import {
  HashRouter, Routes, Route, Navigate,
  useNavigate, useLocation, useParams, Link
} from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import {
  LayoutDashboard, PlusCircle, ClipboardList, Search, BarChart2,
  MapPin, Download, Printer, X, ChevronRight,
  AlertTriangle, CheckCircle2, ArrowRightLeft, User,
  Stethoscope, Skull, Clock, ScanLine, FileDown, Database,
  Info, Activity, Eye, EyeOff, LogOut, Lock, Shield,
  UserCheck, Users, ChevronDown, Plus, Settings, KeyRound,
  Bell, ChevronRight as ChevronRight2, CheckCircle,
  Maximize, Minimize
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip
} from "recharts";

// ─── Auth / Role Types ────────────────────────────────────────────────────────

type Role = "administrator" | "farm_manager" | "veterinarian" | "breeder";
type Tab = "dashboard" | "register" | "activities" | "search" | "reports" | "profile";

// ─── Types ──────────────────────────────────────────────────────────────────

type Species = "cattle" | "goat" | "sheep" | "buffalo" | "camel";
type AnimalStatus =
  | "Registered at Breeder's Farm"
  | "Transferred, Pending Quarantine"
  | "In Quarantine"
  | "Cleared at Farm"
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
    tabs: ["dashboard", "register", "activities", "search", "reports", "profile"],
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
    tabs: ["dashboard", "register", "activities", "search", "reports", "profile"],
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
    tabs: ["dashboard", "register", "activities", "search", "reports", "profile"],
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
    tabs: ["dashboard", "register", "activities", "search", "reports", "profile"],
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
  recorded_by: string;       // name of staff who recorded the event
  previous_owner?: string;
  transfer_condition?: string;
  transferred_to?: string;   // destination farm/location for transfers
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SPECIES_LIST: Species[] = ["cattle", "goat", "sheep", "buffalo", "camel"];

const SPECIES_META: Record<Species, { label: string; code: string; emoji: string; male: string; female: string; colorHint: string }> = {
  cattle:  { label: "Cattle",  code: "CTL", emoji: "🐄", male: "Bull",  female: "Cow",   colorHint: "e.g. Black & White, Brown" },
  goat:    { label: "Goat",    code: "GOT", emoji: "🐐", male: "Buck",  female: "Doe",   colorHint: "e.g. White, Tan, Spotted" },
  sheep:   { label: "Sheep",   code: "SHP", emoji: "🐑", male: "Ram",   female: "Ewe",   colorHint: "e.g. White, Grey, Black" },
  buffalo: { label: "Buffalo", code: "BUF", emoji: "🐃", male: "Bull",  female: "Cow",   colorHint: "e.g. Dark Grey, Black" },
  camel:   { label: "Camel",   code: "CAM", emoji: "🐪", male: "Bull",  female: "Cow",   colorHint: "e.g. Tan, Brown, Beige" },
};

const STATUS_META: Record<AnimalStatus, { color: string; bg: string; label: string }> = {
  "Registered at Breeder's Farm":    { color: "#2D7DD2", bg: "#EBF4FF", label: "At Breeder" },
  "Transferred, Pending Quarantine": { color: "#182951", bg: "#E8EBF2", label: "Transferred" },
  "In Quarantine":                   { color: "#9E9E9E", bg: "#F5F5F5", label: "Quarantine" },
  "Cleared at Farm":                  { color: "#2FB572", bg: "#E3F8EF", label: "Cleared" },
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

// ─── Lifecycle Workflow ────────────────────────────────────────────────────────
// Animals move through these stages in order. Each transitioning event type can
// only fire from one specific status, advancing to exactly the next status.
// Health Check / Other are non-transitioning and allowed at any stage.

const STATUS_ORDER: AnimalStatus[] = [
  "Registered at Breeder's Farm",
  "Transferred, Pending Quarantine",
  "In Quarantine",
  "Cleared at Farm",
  "Sent to Slaughterhouse",
];

const NEXT_STATUS: Partial<Record<AnimalStatus, AnimalStatus>> = {
  "Registered at Breeder's Farm":    "Transferred, Pending Quarantine",
  "Transferred, Pending Quarantine": "In Quarantine",
  "In Quarantine":                   "Cleared at Farm",
  "Cleared at Farm":                  "Sent to Slaughterhouse",
};

// The single transitioning event type that advances a given status to the next stage
const TRANSITION_EVENT_FOR_STATUS: Partial<Record<AnimalStatus, EventType>> = {
  "Registered at Breeder's Farm":    "Transfer to MCF Farm",
  "Transferred, Pending Quarantine": "Quarantine Start",
  "In Quarantine":                   "Quarantine End",
  "Cleared at Farm":                  "Movement to Slaughter",
};

const NON_TRANSITIONING_EVENTS: EventType[] = ["Health Check", "Other"];

function allowedEventTypesForAnimal(status: AnimalStatus, roleAllowed?: EventType[]): EventType[] {
  const next = TRANSITION_EVENT_FOR_STATUS[status];
  const types = next ? [next, ...NON_TRANSITIONING_EVENTS] : [...NON_TRANSITIONING_EVENTS];
  return roleAllowed ? types.filter(t => roleAllowed.includes(t)) : types;
}

// ─── Seed Data ───────────────────────────────────────────────────────────────

const SEED_ANIMALS: Animal[] = [
  {
    id: "MCF-CTL-202604-001", species: "cattle", birth_date: "2026-04-12",
    breeder_name: "GreenMeadow", birth_location: "Turbat, Kech",
    birth_lat: 26.0035, birth_lng: 63.0681,
    gender: "Male", color: "Black & White", status: "Cleared at Farm",
    created_at: "2026-04-12T08:00:00Z",
  },
  {
    id: "MCF-CTL-202604-002", species: "cattle", birth_date: "2026-04-15",
    breeder_name: "RiverValley", birth_location: "Turbat, Kech",
    birth_lat: 26.0035, birth_lng: 63.0681,
    gender: "Female", color: "Brown", status: "In Quarantine",
    created_at: "2026-04-15T09:30:00Z",
  },
  {
    id: "MCF-GOT-202605-001", species: "goat", birth_date: "2026-05-03",
    breeder_name: "AlpineGlow", birth_location: "Khuzdar, Balochistan",
    birth_lat: 27.8136, birth_lng: 66.6111,
    gender: "Male", color: "White & Brown", status: "Registered at Breeder's Farm",
    created_at: "2026-05-03T07:15:00Z",
  },
  {
    id: "MCF-GOT-202605-002", species: "goat", birth_date: "2026-05-10",
    breeder_name: "DesertRose", birth_location: "Khuzdar, Balochistan",
    gender: "Female", color: "All White", status: "Transferred, Pending Quarantine",
    created_at: "2026-05-10T10:00:00Z",
  },
  {
    id: "MCF-SHP-202605-001", species: "sheep", birth_date: "2026-05-18",
    breeder_name: "GoldenFleece", birth_location: "Mastung, Balochistan",
    birth_lat: 29.7985, birth_lng: 66.8458,
    gender: "Female", color: "White", status: "Cleared at Farm",
    created_at: "2026-05-18T11:00:00Z",
  },
  {
    id: "MCF-SHP-202605-002", species: "sheep", birth_date: "2026-05-22",
    breeder_name: "RollingHills", birth_location: "Mastung, Balochistan",
    gender: "Male", color: "Grey & White", status: "Sent to Slaughterhouse",
    created_at: "2026-05-22T08:45:00Z",
  },
  {
    id: "MCF-BUF-202606-001", species: "buffalo", birth_date: "2026-06-01",
    breeder_name: "HighlandCrest", birth_location: "Dera Murad Jamali",
    birth_lat: 29.4609, birth_lng: 67.3287,
    gender: "Female", color: "Dark Grey", status: "Registered at Breeder's Farm",
    created_at: "2026-06-01T06:30:00Z",
  },
  {
    id: "MCF-CAM-202606-001", species: "camel", birth_date: "2026-06-10",
    breeder_name: "Al Marmoom", birth_location: "Sibi, Balochistan",
    birth_lat: 29.5431, birth_lng: 67.8772,
    gender: "Male", color: "Tan / Sandy Brown", status: "Registered at Breeder's Farm",
    created_at: "2026-06-10T09:00:00Z",
  },
];

const SEED_EVENTS: AnimalEvent[] = [
  // MCF-CTL-202604-001 — full lifecycle
  { id: "e1",  animal_id: "MCF-CTL-202604-001", event_type: "Birth Registered",    event_date: "2026-04-12", location: "Turbat, Kech",           lat: 26.0035, lng: 63.0681, notes: "Healthy bull calf, normal birth weight approx. 28kg.", recorded_by: "GreenMeadow", recorded_at: "2026-04-12T08:05:00Z" },
  { id: "e2",  animal_id: "MCF-CTL-202604-001", event_type: "Transfer to MCF Farm", event_date: "2026-04-28", location: "MCF Central Farm, Turbat", notes: "Animal in excellent condition on arrival.",           recorded_by: "Nasreen Mengal",    previous_owner: "GreenMeadow", transfer_condition: "Healthy - Good condition", transferred_to: "MCF Central Farm, Turbat", recorded_at: "2026-04-28T10:00:00Z" },
  { id: "e3",  animal_id: "MCF-CTL-202604-001", event_type: "Quarantine Start",     event_date: "2026-04-28", location: "MCF Quarantine Block A",   notes: "Standard 21-day quarantine initiated per protocol.",   recorded_by: "Dr. Waqar Rind",    recorded_at: "2026-04-28T11:00:00Z" },
  { id: "e4",  animal_id: "MCF-CTL-202604-001", event_type: "Quarantine End",       event_date: "2026-05-19", location: "MCF Quarantine Block A",   notes: "All tests clear — brucellosis, FMD negative. Released to main herd.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-05-19T09:00:00Z" },
  { id: "e5",  animal_id: "MCF-CTL-202604-001", event_type: "Health Check",         event_date: "2026-06-05", location: "MCF Central Farm",         notes: "Routine check. Weight 320kg. BCS 3.5/5. Vaccinations up to date.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-05T14:00:00Z" },

  // MCF-CTL-202604-002
  { id: "e6",  animal_id: "MCF-CTL-202604-002", event_type: "Birth Registered",    event_date: "2026-04-15", location: "Turbat, Kech",             lat: 26.0035, lng: 63.0681, notes: "Female calf, healthy delivery. Birth weight 25kg.", recorded_by: "RiverValley", recorded_at: "2026-04-15T09:35:00Z" },
  { id: "e7",  animal_id: "MCF-CTL-202604-002", event_type: "Transfer to MCF Farm", event_date: "2026-05-01", location: "MCF Central Farm, Turbat", notes: "Transferred with dam. Both in good health.",           recorded_by: "Nasreen Mengal",    previous_owner: "RiverValley", transfer_condition: "Healthy - Good condition", transferred_to: "MCF Central Farm, Turbat", recorded_at: "2026-05-01T10:00:00Z" },
  { id: "e8",  animal_id: "MCF-CTL-202604-002", event_type: "Quarantine Start",     event_date: "2026-05-01", location: "MCF Quarantine Block B",   notes: "Quarantine initiated. Separate pen from dam.",          recorded_by: "Dr. Waqar Rind",    recorded_at: "2026-05-01T11:30:00Z" },

  // MCF-GOT-202605-001
  { id: "e9",  animal_id: "MCF-GOT-202605-001", event_type: "Birth Registered",    event_date: "2026-05-03", location: "Khuzdar, Balochistan",      lat: 27.8136, lng: 66.6111, notes: "Buck kid, strong and active. White & brown markings.", recorded_by: "AlpineGlow", recorded_at: "2026-05-03T07:20:00Z" },
  { id: "e9b", animal_id: "MCF-GOT-202605-001", event_type: "Health Check",         event_date: "2026-05-20", location: "Khuzdar, Balochistan",      notes: "4-week check — good growth rate, no issues detected.", recorded_by: "Dr. Waqar Rind",    recorded_at: "2026-05-20T10:00:00Z" },

  // MCF-GOT-202605-002
  { id: "e10", animal_id: "MCF-GOT-202605-002", event_type: "Birth Registered",     event_date: "2026-05-10", location: "Khuzdar, Balochistan",     notes: "Doe kid, all-white fleece. Birth weight 3.8kg.",         recorded_by: "DesertRose", recorded_at: "2026-05-10T10:05:00Z" },
  { id: "e11", animal_id: "MCF-GOT-202605-002", event_type: "Transfer to MCF Farm", event_date: "2026-06-15", location: "MCF Central Farm, Turbat", notes: "Weaned and transferred. Good travel condition.",          recorded_by: "Nasreen Mengal",     previous_owner: "DesertRose", transfer_condition: "Healthy - Good condition", transferred_to: "MCF Central Farm, Turbat", recorded_at: "2026-06-15T08:00:00Z" },

  // MCF-SHP-202605-001 — full lifecycle
  { id: "e12", animal_id: "MCF-SHP-202605-001", event_type: "Birth Registered",     event_date: "2026-05-18", location: "Mastung, Balochistan",     lat: 29.7985, lng: 66.8458, notes: "Ewe lamb, white fleece. Birth weight 4.2kg.",         recorded_by: "GoldenFleece", recorded_at: "2026-05-18T11:05:00Z" },
  { id: "e13", animal_id: "MCF-SHP-202605-001", event_type: "Transfer to MCF Farm", event_date: "2026-06-01", location: "MCF Central Farm, Turbat", notes: "Transported by road — 3 hours. No stress observed.",     recorded_by: "Nasreen Mengal",    previous_owner: "GoldenFleece", transfer_condition: "Healthy - Good condition", transferred_to: "MCF Central Farm, Turbat", recorded_at: "2026-06-01T09:00:00Z" },
  { id: "e14", animal_id: "MCF-SHP-202605-001", event_type: "Quarantine Start",     event_date: "2026-06-01", location: "MCF Quarantine Block A",   notes: "Placed in small ruminant quarantine pen.",               recorded_by: "Dr. Waqar Rind",    recorded_at: "2026-06-01T10:00:00Z" },
  { id: "e15", animal_id: "MCF-SHP-202605-001", event_type: "Quarantine End",       event_date: "2026-06-22", location: "MCF Quarantine Block A",   notes: "21-day period complete. All tests cleared. Status changed to Cleared at Farm.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-22T09:00:00Z" },

  // MCF-SHP-202605-002 — sent to slaughter
  { id: "e16", animal_id: "MCF-SHP-202605-002", event_type: "Birth Registered",     event_date: "2026-05-22", location: "Mastung, Balochistan",     notes: "Ram lamb, grey & white markings. Birth weight 3.9kg.",   recorded_by: "RollingHills", recorded_at: "2026-05-22T08:50:00Z" },
  { id: "e17", animal_id: "MCF-SHP-202605-002", event_type: "Transfer to MCF Farm", event_date: "2026-06-10", location: "MCF Central Farm, Turbat", notes: "Arrived underweight — 12kg instead of expected 15kg.",   recorded_by: "Nasreen Mengal",    previous_owner: "RollingHills", transfer_condition: "Underweight", transferred_to: "MCF Central Farm, Turbat", recorded_at: "2026-06-10T10:00:00Z" },
  { id: "e17b",animal_id: "MCF-SHP-202605-002", event_type: "Health Check",         event_date: "2026-06-12", location: "MCF Central Farm",         notes: "Supplementary feeding started. Weight monitored daily.",  recorded_by: "Dr. Waqar Rind",    recorded_at: "2026-06-12T09:00:00Z" },
  { id: "e18", animal_id: "MCF-SHP-202605-002", event_type: "Movement to Slaughter",event_date: "2026-06-25", location: "Quetta Slaughterhouse",    notes: "Transferred per management schedule. Live weight 16kg.", recorded_by: "Imran Khan Baloch", transferred_to: "Quetta Slaughterhouse, Quetta", recorded_at: "2026-06-25T07:00:00Z" },

  // MCF-BUF-202606-001
  { id: "e19", animal_id: "MCF-BUF-202606-001", event_type: "Birth Registered",    event_date: "2026-06-01", location: "Dera Murad Jamali",         lat: 29.4609, lng: 67.3287, notes: "Female calf, dark grey, healthy. Dam is high-yield milker.", recorded_by: "HighlandCrest", recorded_at: "2026-06-01T06:35:00Z" },

  // MCF-CAM-202606-001
  { id: "e20", animal_id: "MCF-CAM-202606-001", event_type: "Birth Registered",    event_date: "2026-06-10", location: "Sibi, Balochistan",          lat: 29.5431, lng: 67.8772, notes: "Male calf, tan coat, good birth weight approx. 35kg.", recorded_by: "Al Marmoom",   recorded_at: "2026-06-10T09:05:00Z" },
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

const DATA_VERSION = "v6"; // bump to force re-seed when schema changes

function useDataService() {
  const [animals, setAnimals] = useState<Animal[]>(() => {
    if (loadFromStorage("mcf_data_version", "") !== DATA_VERSION) {
      saveToStorage("mcf_data_version", DATA_VERSION);
      saveToStorage("mcf_animals", SEED_ANIMALS);
      saveToStorage("mcf_events", SEED_EVENTS);
      return SEED_ANIMALS;
    }
    return loadFromStorage("mcf_animals", SEED_ANIMALS);
  });
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
      recorded_by: animal.breeder_name,
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
      "Quarantine End":        "Cleared at Farm",
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

  const updateAnimal = useCallback((animalId: string, changes: Partial<Animal>, recordedBy?: string) => {
    const now = new Date();
    setAnimals(prev => prev.map(a => {
      if (a.id !== animalId) return a;
      const updated = { ...a, ...changes };
      if (changes.status && changes.status !== a.status) {
        setEvents(evts => [{
          id: `e${Date.now()}`,
          animal_id: animalId,
          event_type: "Other",
          event_date: now.toISOString().split("T")[0],
          location: a.birth_location,
          notes: `Status updated: ${a.status} → ${changes.status}`,
          recorded_by: recordedBy || "System",
          recorded_at: now.toISOString(),
        }, ...evts]);
      }
      return updated;
    }));
  }, []);

  return { animals, events, addAnimal, addEvent, updateAnimal, getAnimalEvents, isOnline, setIsOnline };
}

// ─── Data Context (shared across all pages) ───────────────────────────────────

type DataService = ReturnType<typeof useDataService>;
const DataCtx = createContext<DataService | null>(null);
function useData(): DataService {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Brand Logo ────────────────────────────────────────────────────────────────
// White location-pin mark with a green "track" arrow at its center — used inside
// the colored rounded-square badge wherever the Track Now wordmark appears.

function AppLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C7.589 2 4 5.589 4 10c0 6.5 8 12 8 12s8-5.5 8-12c0-4.411-3.589-8-8-8z" fill="white" />
      <circle cx="12" cy="9.5" r="3.2" fill="#2FB572" />
      <path d="M13.3 7.9 L10.6 9.5 L13.3 11.1 Z" fill="white" />
    </svg>
  );
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

// ─── Bottom Sheet (mobile) / Centered Modal (desktop) ─────────────────────────

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 animate-fadeInUp"
      onClick={onClose}>
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto animate-fadeInUp"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-white z-10">
          <p className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>{title}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
                      <p className="text-xs text-accent font-semibold flex items-center gap-1 mt-0.5"><User size={10} /> {evt.recorded_by}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(evt.event_date)} · {evt.location}</p>
                      {evt.lat && <p className="text-xs font-mono text-muted-foreground mt-0.5">{evt.lat.toFixed(4)}, {evt.lng?.toFixed(4)}</p>}
                      {evt.previous_owner && (
                        <p className="text-xs text-muted-foreground">From: <span className="font-medium text-foreground">{evt.previous_owner}</span>{evt.transferred_to && <> → <span className="font-medium text-foreground">{evt.transferred_to}</span></>}</p>
                      )}
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

// ─── Animal Detail Page (/animal/:animalId) ───────────────────────────────────

function AnimalDetailPage({ canEdit, recordedBy, canRecordEvents, allowedEventTypes }: {
  canEdit: boolean;
  recordedBy: string;
  canRecordEvents: boolean;
  allowedEventTypes?: EventType[];
}) {
  const { animalId } = useParams<{ animalId: string }>();
  const navigate = useNavigate();
  const { animals, getAnimalEvents, addEvent, updateAnimal } = useData();
  const [showQR, setShowQR] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<{
    breeder_name: string; birth_location: string; color: string; notes: string; status: AnimalStatus;
  } | null>(null);

  const animal = animals.find(a => a.id === animalId);
  const events = animal ? getAnimalEvents(animal.id) : [];

  const openEdit = () => {
    if (!animal) return;
    setEditForm({
      breeder_name: animal.breeder_name,
      birth_location: animal.birth_location,
      color: animal.color,
      notes: animal.notes || "",
      status: animal.status,
    });
    setShowEdit(true);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!animal || !editForm) return;
    updateAnimal(animal.id, { ...editForm }, recordedBy);
    setShowEdit(false);
  };

  if (!animal) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 text-center pt-24 pb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--gradient-primary)" }}>
          <Search size={28} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-foreground text-lg" style={{ fontFamily: "Montserrat, sans-serif" }}>
            Animal Not Found
          </p>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{animalId}</p>
          <p className="text-sm text-muted-foreground mt-2">
            This ID doesn't exist in the current dataset.
          </p>
        </div>
        <button onClick={() => navigate("/scan")}
          className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
          <Search size={15} /> Search Animals
        </button>
      </div>
    );
  }

  const sm = SPECIES_META[animal.species];

  return (
    <>
      {/* Gradient header with back nav */}
      <div className="px-4 pt-4 pb-5 md:px-8 md:pt-6 md:pb-8 text-white" style={{ background: "var(--gradient-primary)" }}>
        <div className="md:max-w-5xl md:mx-auto">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white/70 text-xs font-semibold mb-3 hover:text-white transition-colors"
          style={{ fontFamily: "Montserrat, sans-serif" }}>
          <ChevronDown size={14} className="rotate-90" /> Back
        </button>
        <div className="flex items-start gap-3">
          <span className="text-4xl mt-0.5">{sm.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-white/70 text-xs">{animal.id}</p>
            <h1 className="text-white text-lg md:text-xl font-bold leading-tight mt-0.5"
              style={{ fontFamily: "Montserrat, sans-serif" }}>
              {sm.label} · {animal.gender === "Male" ? sm.male : sm.female}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge status={animal.status} />
              <span className="text-white/60 text-xs">{animal.color}</span>
            </div>
          </div>
        </div>

        </div>
      </div>

      <div className="px-4 py-4 pb-8 md:max-w-5xl md:mx-auto md:px-8 md:py-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className="space-y-4">
        {/* Summary card */}
        <Card>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Breeder",       value: animal.breeder_name },
              { label: "Birth Date",    value: formatDate(animal.birth_date) },
              { label: "Birth Location",value: animal.birth_location },
              { label: "Color",         value: animal.color },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium text-foreground text-sm">{value}</p>
              </div>
            ))}
            {animal.birth_lat && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">GPS Coordinates</p>
                <p className="font-mono text-xs text-accent">
                  {animal.birth_lat.toFixed(5)}, {animal.birth_lng?.toFixed(5)}
                </p>
              </div>
            )}
            {animal.notes && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm text-foreground italic">"{animal.notes}"</p>
              </div>
            )}
          </div>
        </Card>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={() => setShowQR(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
            <ScanLine size={15} /> QR Code
          </button>
          {canRecordEvents && (
            <button onClick={() => setShowEventForm(p => !p)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              style={{ background: "var(--gradient-impact)", fontFamily: "Montserrat, sans-serif" }}>
              <ClipboardList size={15} /> {showEventForm ? "Cancel" : "Add Event"}
            </button>
          )}
          {canEdit && (
            <button onClick={() => (showEdit ? setShowEdit(false) : openEdit())}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
              style={{ fontFamily: "Montserrat, sans-serif" }}>
              {showEdit ? <X size={15} /> : "Edit"}
            </button>
          )}
          <button onClick={() => navigate("/scan")}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <Search size={15} />
          </button>
        </div>

        </div>

        {/* Timeline */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Event History
            </h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-semibold"
              style={{ fontFamily: "Montserrat, sans-serif" }}>
              {events.length} events
            </span>
          </div>
          <div className="space-y-0">
            {events.map((evt, i) => {
              const em = EVENT_META[evt.event_type];
              const Icon = em.icon;
              return (
                <div key={evt.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: em.color + "20" }}>
                      <Icon size={15} style={{ color: em.color }} />
                    </div>
                    {i < events.length - 1 && <div className="w-0.5 flex-1 bg-border my-1 min-h-[12px]" />}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
                      {evt.event_type}
                    </p>
                    <p className="text-xs text-accent font-semibold flex items-center gap-1 mt-0.5">
                      <User size={11} /> {evt.recorded_by}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin size={10} className="flex-shrink-0" /> {formatDate(evt.event_date)} · {evt.location}
                    </p>
                    {evt.lat && (
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{evt.lat.toFixed(4)}, {evt.lng?.toFixed(4)}</p>
                    )}
                    {evt.previous_owner && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        From: <span className="font-medium text-foreground">{evt.previous_owner}</span>
                        {evt.transferred_to && <> → <span className="font-medium text-foreground">{evt.transferred_to}</span></>}
                      </p>
                    )}
                    {evt.transfer_condition && (
                      <span className={cn(
                        "inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5",
                        evt.transfer_condition.includes("Good") ? "bg-muted text-secondary" :
                        evt.transfer_condition === "Underweight" ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"
                      )} style={{ fontFamily: "Montserrat, sans-serif" }}>{evt.transfer_condition}</span>
                    )}
                    {evt.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">"{evt.notes}"</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50 mt-1">
                      Recorded {new Date(evt.recorded_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showEdit && editForm && (
        <BottomSheet title={`Edit Record — ${animal.id}`} onClose={() => setShowEdit(false)}>
          <form onSubmit={saveEdit} className="px-4 py-3 space-y-3">
            <InputField label="Status">
              <div className="flex items-center gap-2">
                <StatusBadge status={editForm.status} />
                {NEXT_STATUS[editForm.status] && (
                  <button type="button"
                    onClick={() => setEditForm(f => f && ({ ...f, status: NEXT_STATUS[f.status]! }))}
                    className="flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80"
                    style={{ fontFamily: "Montserrat, sans-serif" }}>
                    <ChevronRight size={13} /> Advance to {STATUS_META[NEXT_STATUS[editForm.status]!].label}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Status follows the lifecycle workflow and advances one stage at a time.
              </p>
            </InputField>
            <InputField label="Breeder Name">
              <input className={inputCls} value={editForm.breeder_name}
                onChange={e => setEditForm(f => f && ({ ...f, breeder_name: e.target.value }))} />
            </InputField>
            <InputField label="Breeder Location / Village">
              <input className={inputCls} value={editForm.birth_location}
                onChange={e => setEditForm(f => f && ({ ...f, birth_location: e.target.value }))} />
            </InputField>
            <InputField label="Color / Markings">
              <input className={inputCls} value={editForm.color}
                onChange={e => setEditForm(f => f && ({ ...f, color: e.target.value }))} />
            </InputField>
            <InputField label="Notes">
              <textarea className={cn(inputCls, "resize-none min-h-[70px]")} rows={2}
                value={editForm.notes}
                onChange={e => setEditForm(f => f && ({ ...f, notes: e.target.value }))} />
            </InputField>
            <button type="submit"
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              style={{ background: "var(--gradient-impact)", fontFamily: "Montserrat, sans-serif" }}>
              Save Changes
            </button>
          </form>
        </BottomSheet>
      )}

      {showEventForm && (
        <BottomSheet title={`Quick Event — ${animal.id}`} onClose={() => setShowEventForm(false)}>
          <QuickEventForm
            animalId={animal.id}
            status={animal.status}
            addEvent={addEvent}
            allowedEventTypes={allowedEventTypes}
            onDone={() => setShowEventForm(false)}
          />
        </BottomSheet>
      )}

      {showQR && <QRModal animalId={animal.id} onClose={() => setShowQR(false)} />}
    </>
  );
}

// Minimal inline event form used on the animal detail page
function QuickEventForm({ animalId, status, addEvent, allowedEventTypes, onDone }: {
  animalId: string;
  status: AnimalStatus;
  addEvent: DataService["addEvent"];
  allowedEventTypes?: EventType[];
  onDone: () => void;
}) {
  const availableTypes = useMemo(() => allowedEventTypesForAnimal(status, allowedEventTypes), [status, allowedEventTypes]);
  const [eventType, setEventType] = useState<EventType>(availableTypes[0]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const nextStatus = NEXT_STATUS[status];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) return;
    addEvent({ animal_id: animalId, event_type: eventType, event_date: date, location, notes, recorded_at: new Date().toISOString() });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3">
      {nextStatus && (
        <p className="text-xs text-muted-foreground">
          Current stage: <span className="font-semibold text-foreground">{STATUS_META[status].label}</span> → next: <span className="font-semibold text-foreground">{STATUS_META[nextStatus].label}</span>
        </p>
      )}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Event</label>
          <select className={cn(inputCls, "mt-1")} value={eventType} onChange={e => setEventType(e.target.value as EventType)}>
            {availableTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className="text-xs font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Date</label>
          <input type="date" className={cn(inputCls, "mt-1")} value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Location *</label>
        <input className={cn(inputCls, "mt-1")} placeholder="Where did this happen?" required
          value={location} onChange={e => setLocation(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Notes</label>
        <input className={cn(inputCls, "mt-1")} placeholder="Optional observations…"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <button type="submit"
        className="w-full py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        style={{ background: "var(--gradient-impact)", fontFamily: "Montserrat, sans-serif" }}>
        Save Event
      </button>
    </form>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function Dashboard({ animals, events, isOnline, onAnimalClick, onStatusClick }: {
  animals: Animal[]; events: AnimalEvent[]; isOnline: boolean; onAnimalClick: (a: Animal) => void;
  onStatusClick: (status: AnimalStatus) => void;
}) {
  const speciesCounts = useMemo(() => {
    const counts: Partial<Record<Species, number>> = {};
    animals.forEach(a => { counts[a.species] = (counts[a.species] || 0) + 1; });
    return counts;
  }, [animals]);

  const stats = useMemo(() => ({
    total: animals.length,
  }), [animals]);

  const workflowCounts = useMemo(() => {
    const counts: Partial<Record<AnimalStatus, number>> = {};
    animals.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    return counts;
  }, [animals]);

  const WORKFLOW_STEPS: { status: AnimalStatus; icon: typeof CheckCircle2; gradient: string; sub: string }[] = [
    { status: "Registered at Breeder's Farm",    icon: User,           gradient: "var(--gradient-brand)", sub: "Pre-transfer" },
    { status: "Transferred, Pending Quarantine", icon: ArrowRightLeft, gradient: "var(--gradient-primary)", sub: "En route to farm" },
    { status: "In Quarantine",                   icon: AlertTriangle,  gradient: "var(--gradient-impact)", sub: "Awaiting clearance" },
    { status: "Cleared at Farm",                 icon: CheckCircle2,   gradient: "linear-gradient(135deg,#2FB572 0%,#1d8a52 100%)", sub: "Healthy & settled" },
    { status: "Sent to Slaughterhouse",          icon: Skull,          gradient: "linear-gradient(135deg,#d4183d 0%,#9b1228 100%)", sub: "Final movement" },
  ];

  const recentEvents = useMemo(() =>
    [...events].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 4),
    [events]);

  return (
    <div>
      {/* Header — hidden on desktop (sidebar + topbar handle branding) */}
      <div className="md:hidden px-4 pt-5 pb-6 farm-bg-pattern-light" style={{ background: "var(--gradient-primary)" }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-xs font-medium tracking-wide uppercase" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Makuran Cattle Farm
            </p>
            <h1 className="text-white text-xl font-bold mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>Track Now</h1>
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
      </div>

      <div className="px-4 md:px-6 -mt-3 md:mt-0 md:pt-6 space-y-4 md:space-y-6 pb-6">

        {/* Total Animals — big box with per-species breakdown inside */}
        <div className="rounded-xl p-4 md:p-5 text-white shadow-sm" style={{ background: "var(--gradient-primary)" }}>
          <div className="flex items-start justify-between">
            <div>
              <Activity size={20} strokeWidth={1.5} className="opacity-80 mb-2" />
              <p className="text-2xl md:text-3xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>{stats.total}</p>
              <p className="text-xs font-semibold opacity-90 mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>Total Animals</p>
              <p className="text-xs opacity-60 mt-0.5">Across all species</p>
            </div>
          </div>
          {/* Categorized breakdown by breed/species */}
          <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-3 md:grid-cols-5 gap-2">
            {(Object.entries(speciesCounts) as [Species, number][]).map(([sp, cnt]) => (
              <div key={sp} className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-2">
                <span className="text-base">{SPECIES_META[sp].emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>{cnt}</p>
                  <p className="text-[10px] opacity-75 truncate leading-tight">{SPECIES_META[sp].label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lifecycle workflow: all 5 statuses in order, with live counts */}
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>Lifecycle Workflow</h2>
          <div className="flex md:grid md:grid-cols-5 gap-2 md:gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {WORKFLOW_STEPS.map(({ status, icon: Icon, gradient, sub }, i) => (
              <div key={status} className="flex items-center flex-shrink-0 md:contents">
                <button onClick={() => onStatusClick(status)}
                  className="rounded-xl p-3 md:p-4 text-white shadow-sm min-w-[120px] md:min-w-0 text-left hover:opacity-90 active:scale-[0.98] transition-all"
                  style={{ background: gradient }}>
                  <Icon size={18} strokeWidth={1.5} className="opacity-80 mb-1.5 md:mb-2" />
                  <p className="text-xl md:text-2xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>{workflowCounts[status] || 0}</p>
                  <p className="text-[11px] md:text-xs font-semibold opacity-90 mt-0.5 leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
                    {STATUS_META[status].label}
                  </p>
                  <p className="hidden md:block text-[11px] opacity-60 mt-0.5">{sub}</p>
                </button>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <ChevronRight size={16} className="text-muted-foreground flex-shrink-0 mx-1 md:hidden" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="md:grid md:grid-cols-2 md:gap-6">
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-foreground truncate" style={{ fontFamily: "Montserrat, sans-serif" }}>
                        {evt.event_type}
                      </p>
                      <StatusBadge status={animal.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate font-mono">{animal.id}</p>
                    <p className="text-xs text-muted-foreground truncate">{animal.breeder_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {animal.gender === "Male" ? SPECIES_META[animal.species].male : SPECIES_META[animal.species].female} · {animal.color} · {animal.birth_location}
                    </p>
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
        {/* Desktop: all-events column */}
        <div className="hidden md:block">
          <h2 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>All Animals</h2>
          <div className="space-y-2">
            {animals.slice(0, 6).map(animal => {
              const sm = SPECIES_META[animal.species];
              return (
                <Card key={animal.id} onClick={() => onAnimalClick(animal)} className="flex items-center gap-3 !p-3">
                  <span className="text-xl">{sm.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-bold text-foreground truncate">{animal.id}</p>
                    <p className="text-xs text-muted-foreground truncate">{animal.breeder_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {animal.gender === "Male" ? sm.male : sm.female} · {animal.color} · {animal.birth_location}
                    </p>
                  </div>
                  <StatusBadge status={animal.status} />
                </Card>
              );
            })}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Register Tab ─────────────────────────────────────────────────────────────

function RegisterAnimal({ addAnimal, updateAnimal, recordedBy }: {
  addAnimal: ReturnType<typeof useDataService>["addAnimal"];
  updateAnimal: ReturnType<typeof useDataService>["updateAnimal"];
  recordedBy: string;
}) {
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
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<{
    breeder_name: string; birth_location: string; color: string; notes: string; status: AnimalStatus;
  } | null>(null);
  const sm = SPECIES_META[species];

  const openEdit = () => {
    if (!submitted) return;
    setEditForm({
      breeder_name: submitted.breeder_name,
      birth_location: submitted.birth_location,
      color: submitted.color,
      notes: submitted.notes || "",
      status: submitted.status,
    });
    setShowEdit(true);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitted || !editForm) return;
    updateAnimal(submitted.id, { ...editForm }, recordedBy);
    setSubmitted({ ...submitted, ...editForm });
    setShowEdit(false);
  };

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
          <div className="mt-2 flex justify-center">
            <StatusBadge status={submitted.status} />
          </div>
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
          <button onClick={openEdit}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
            style={{ background: "var(--gradient-impact)", fontFamily: "Montserrat, sans-serif" }}>
            <ClipboardList size={16} /> Update Record
          </button>
        </div>
        <button onClick={reset}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors"
          style={{ fontFamily: "Montserrat, sans-serif" }}>
          <PlusCircle size={16} /> Register Another
        </button>

        {showEdit && editForm && (
          <div className="rounded-xl border border-border overflow-hidden animate-fadeInUp">
            <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <p className="text-xs font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
                Update Record — {submitted.id}
              </p>
              <button onClick={() => setShowEdit(false)} className="p-1 rounded-full hover:bg-muted"><X size={14} /></button>
            </div>
            <form onSubmit={saveEdit} className="px-4 py-3 space-y-3">
              <InputField label="Status">
                <div className="flex items-center gap-2">
                  <StatusBadge status={editForm.status} />
                  {NEXT_STATUS[editForm.status] && (
                    <button type="button"
                      onClick={() => setEditForm(f => f && ({ ...f, status: NEXT_STATUS[f.status]! }))}
                      className="flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80"
                      style={{ fontFamily: "Montserrat, sans-serif" }}>
                      <ChevronRight size={13} /> Advance to {STATUS_META[NEXT_STATUS[editForm.status]!].label}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Status follows the lifecycle workflow and advances one stage at a time.
                </p>
              </InputField>
              <InputField label="Breeder Name">
                <input className={inputCls} value={editForm.breeder_name}
                  onChange={e => setEditForm(f => f && ({ ...f, breeder_name: e.target.value }))} />
              </InputField>
              <InputField label="Breeder Location / Village">
                <input className={inputCls} value={editForm.birth_location}
                  onChange={e => setEditForm(f => f && ({ ...f, birth_location: e.target.value }))} />
              </InputField>
              <InputField label="Color / Markings">
                <input className={inputCls} value={editForm.color}
                  onChange={e => setEditForm(f => f && ({ ...f, color: e.target.value }))} />
              </InputField>
              <InputField label="Notes">
                <textarea className={cn(inputCls, "resize-none min-h-[70px]")} rows={2}
                  value={editForm.notes}
                  onChange={e => setEditForm(f => f && ({ ...f, notes: e.target.value }))} />
              </InputField>
              <button type="submit"
                className="w-full py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                style={{ background: "var(--gradient-impact)", fontFamily: "Montserrat, sans-serif" }}>
                Save Changes
              </button>
            </form>
          </div>
        )}

        {showQR && <QRModal animalId={submitted.id} onClose={() => setShowQR(false)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 md:px-8 pt-5 pb-4 md:hidden" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Register New Birth</h1>
        <p className="text-white/60 text-xs mt-0.5">Record a newly born animal at a breeder farm</p>
      </div>
      <form onSubmit={handleSubmit} className="px-4 md:px-0 py-4 space-y-4 pb-8 md:max-w-2xl md:mx-auto md:px-8 md:py-8">
        {/* Species */}
        <InputField label="Species">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {SPECIES_LIST.map(sp => (
              <SpeciesChip key={sp} species={sp} active={species === sp} onClick={() => setSpecies(sp)} />
            ))}
          </div>
        </InputField>

        <InputField label="Breeder Name" required>
          <input className={inputCls} placeholder="e.g. GreenMeadow" required
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

        <InputField label="Gender" required>
          <select className={inputCls} value={form.gender}
            onChange={e => setForm(f => ({ ...f, gender: e.target.value as "Male" | "Female" }))}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
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

// ─── Activities Tab ───────────────────────────────────────────────────────────
// Read-only feed of every lifecycle event across all animals, organized by
// breed/species first, newest activity first within each breed.
// Adding events still happens per-animal on the detail page.

function ActivitiesFeed({ animals, events, onAnimalClick }: {
  animals: Animal[]; events: AnimalEvent[]; onAnimalClick: (a: Animal) => void;
}) {
  const [speciesFilter, setSpeciesFilter] = useState<Species | "all">("all");

  const animalById = useMemo(() => {
    const map = new Map<string, Animal>();
    animals.forEach(a => map.set(a.id, a));
    return map;
  }, [animals]);

  // Group every event by the species/breed of the animal it belongs to
  const groupsBySpecies = useMemo(() => {
    const map = new Map<Species, AnimalEvent[]>();
    events.forEach(evt => {
      const animal = animalById.get(evt.animal_id);
      if (!animal) return;
      if (!map.has(animal.species)) map.set(animal.species, []);
      map.get(animal.species)!.push(evt);
    });
    map.forEach(list => list.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()));
    return SPECIES_LIST
      .filter(sp => map.has(sp) && (speciesFilter === "all" || speciesFilter === sp))
      .map(sp => ({ species: sp, evts: map.get(sp)! }));
  }, [events, animalById, speciesFilter]);

  const presentSpecies = useMemo(() => {
    const s = new Set(animals.map(a => a.species));
    return SPECIES_LIST.filter(sp => s.has(sp));
  }, [animals]);

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:hidden" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Activities</h1>
        <p className="text-white/60 text-xs mt-0.5">Lifecycle events grouped by breed, newest first</p>
      </div>
      <div className="hidden md:block px-6 pt-6 pb-2">
        <h1 className="text-foreground text-xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Activities</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Lifecycle events grouped by breed, newest first</p>
      </div>

      {/* Species filter */}
      <div className="flex gap-2 px-4 md:px-6 py-3 overflow-x-auto scrollbar-hide border-b border-border">
        <button
          onClick={() => setSpeciesFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
            speciesFilter === "all" ? "text-white" : "bg-white border border-border text-foreground hover:bg-muted"
          )}
          style={{ fontFamily: "Montserrat, sans-serif", background: speciesFilter === "all" ? "var(--gradient-primary)" : undefined }}>
          All ({events.length})
        </button>
        {presentSpecies.map(sp => (
          <SpeciesChip key={sp} species={sp}
            active={speciesFilter === sp}
            onClick={() => setSpeciesFilter(speciesFilter === sp ? "all" : sp)} />
        ))}
      </div>

      <div className="px-4 md:px-6 py-3 pb-8 space-y-6">
        {groupsBySpecies.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No activity yet</div>
        )}
        {groupsBySpecies.map(({ species, evts }) => {
          const sm = SPECIES_META[species];
          return (
            <div key={species}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{sm.emoji}</span>
                <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
                  {sm.label}
                </h2>
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full"
                  style={{ fontFamily: "Montserrat, sans-serif" }}>
                  {evts.length} {evts.length === 1 ? "activity" : "activities"}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {evts.map(evt => {
                  const animal = animalById.get(evt.animal_id);
                  if (!animal) return null;
                  const em = EVENT_META[evt.event_type];
                  const Icon = em.icon;
                  return (
                    <Card key={evt.id} onClick={() => onAnimalClick(animal)} className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: em.color + "18" }}>
                        <Icon size={16} style={{ color: em.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
                            {evt.event_type}
                          </p>
                          <p className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatDate(evt.event_date)} · {new Date(evt.recorded_at).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <span className="font-mono">{animal.id}</span>
                          <span>· {animal.breeder_name}</span>
                        </p>
                        <p className="text-xs text-accent font-semibold flex items-center gap-1 mt-0.5">
                          <User size={11} /> {evt.recorded_by}
                        </p>
                        {evt.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">"{evt.notes}"</p>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Search / Scan Tab ────────────────────────────────────────────────────────

function SearchScan({ animals, events, onAnimalClick }: {
  animals: Animal[]; events: AnimalEvent[]; onAnimalClick: (a: Animal) => void;
}) {
  const location = useLocation();
  const initialStatus = (location.state as { statusFilter?: AnimalStatus } | null)?.statusFilter;

  const [query, setQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState<Species | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AnimalStatus | "all">(initialStatus ?? "all");

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
      const matchStatus = statusFilter === "all" || a.status === statusFilter;
      return matchQuery && matchSpecies && matchStatus;
    });
  }, [animals, query, speciesFilter, statusFilter]);

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:hidden" style={{ background: "var(--gradient-primary)" }}>
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

      {/* Desktop search bar */}
      <div className="hidden md:block px-6 pt-6 pb-3">
        <div className="relative max-w-xl">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full bg-input-background border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search by ID, breeder name, or species…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {/* Species filter */}
      <div className="flex gap-2 px-4 md:px-6 py-3 overflow-x-auto scrollbar-hide border-b border-border">
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

      {/* Status filter */}
      <div className="flex gap-2 px-4 md:px-6 py-3 overflow-x-auto scrollbar-hide border-b border-border">
        <button
          onClick={() => setStatusFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
            statusFilter === "all" ? "text-white" : "bg-white border border-border text-foreground hover:bg-muted"
          )}
          style={{ fontFamily: "Montserrat, sans-serif", background: statusFilter === "all" ? "var(--gradient-primary)" : undefined }}>
          All Statuses
        </button>
        {(Object.keys(STATUS_META) as AnimalStatus[]).map(st => (
          <button key={st}
            onClick={() => setStatusFilter(statusFilter === st ? "all" : st)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
              statusFilter === st ? "border-transparent" : "bg-white border-border text-foreground hover:bg-muted"
            )}
            style={{
              fontFamily: "Montserrat, sans-serif",
              background: statusFilter === st ? STATUS_META[st].color : undefined,
              color: statusFilter === st ? "#fff" : undefined,
            }}>
            {STATUS_META[st].label} ({animals.filter(a => a.status === st).length})
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="px-4 md:px-6 py-3 pb-8 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No animals found</div>
        )}
        {filtered.map(animal => (
          <AnimalSearchCard
            key={animal.id}
            animal={animal}
            events={events.filter(e => e.animal_id === animal.id)
              .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())}
            onViewFull={() => onAnimalClick(animal)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Clickable summary card — navigates to the full-screen animal record ────────

function AnimalSearchCard({ animal, events, onViewFull }: {
  animal: Animal;
  events: AnimalEvent[];
  onViewFull: () => void;
}) {
  const sm = SPECIES_META[animal.species];
  const latest = events[events.length - 1];

  return (
    <button
      onClick={onViewFull}
      className="w-full flex items-start gap-3 p-4 text-left bg-card border border-border rounded-xl transition-shadow hover:shadow-md animate-fadeInUp"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted text-xl">
        {sm.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-mono text-xs font-bold text-foreground">{animal.id}</p>
          <StatusBadge status={animal.status} />
        </div>
        <p className="text-sm font-semibold text-foreground mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>
          {animal.breeder_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {animal.gender === "Male" ? sm.male : sm.female} · {animal.color} · Born {formatDate(animal.birth_date)}
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <MapPin size={10} className="flex-shrink-0" /> {animal.birth_location}
        </p>
        {latest && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Clock size={11} />
            Latest: {latest.event_type} · {formatDate(latest.event_date)} · {latest.recorded_by}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full"
          style={{ fontFamily: "Montserrat, sans-serif" }}>
          {events.length} events
        </span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>
    </button>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────────────────────

function Reports({ animals, canExport = true }: { animals: Animal[]; canExport?: boolean }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredAnimals = useMemo(() => {
    if (!startDate && !endDate) return animals;
    return animals.filter(a => {
      if (startDate && a.birth_date < startDate) return false;
      if (endDate && a.birth_date > endDate) return false;
      return true;
    });
  }, [animals, startDate, endDate]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAnimals.forEach(a => {
      const label = STATUS_META[a.status].label;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredAnimals]);

  const speciesData = useMemo(() => {
    const counts: Partial<Record<Species, number>> = {};
    filteredAnimals.forEach(a => { counts[a.species] = (counts[a.species] || 0) + 1; });
    return (Object.entries(counts) as [Species, number][]).map(([sp, count]) => ({
      name: `${SPECIES_META[sp].emoji} ${SPECIES_META[sp].label}`,
      count,
    }));
  }, [filteredAnimals]);

  const PIE_COLORS = ["#2D7DD2", "#182951", "#9E9E9E", "#2FB572", "#d4183d"];

  const exportCSV = () => {
    const headers = ["ID", "Species", "Birth Date", "Breeder", "Location", "Gender", "Color", "Status", "Created At"];
    const rows = filteredAnimals.map(a => [
      a.id, a.species, a.birth_date, a.breeder_name, a.birth_location,
      a.gender, a.color, a.status, a.created_at
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mcf-animals.csv"; a.click();
  };

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:hidden" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Reports & Analytics</h1>
        <p className="text-white/60 text-xs mt-0.5">Live summary across all animals</p>
      </div>
      <div className="px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6 pb-8">
        {/* Date range filter */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Date Range</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <InputField label="From (Birth Date)">
              <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </InputField>
            <InputField label="To (Birth Date)">
              <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </InputField>
            {(startDate || endDate) && (
              <button onClick={() => { setStartDate(""); setEndDate(""); }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors whitespace-nowrap"
                style={{ fontFamily: "Montserrat, sans-serif" }}>
                <X size={14} /> Clear
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Showing <span className="font-semibold text-foreground">{filteredAnimals.length}</span> of {animals.length} animals
            {(startDate || endDate) ? " in the selected range." : "."}
          </p>
        </Card>

        {/* Summary cards */}
        <div className="rounded-xl p-4 text-white max-w-xs" style={{ background: "var(--gradient-impact)" }}>
          <p className="text-3xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>
            {new Set(filteredAnimals.map(a => a.species)).size}
          </p>
          <p className="text-xs font-semibold mt-1 opacity-90" style={{ fontFamily: "Montserrat, sans-serif" }}>Species Tracked</p>
          <p className="text-xs opacity-60">Across all registrations</p>
        </div>

        <div className="md:grid md:grid-cols-2 md:gap-6">
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
        </div>

        {/* Export buttons */}
        {canExport ? (
          <div className="flex flex-col md:flex-row gap-2">
            <button onClick={exportCSV}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
              <FileDown size={16} /> Export All Data (CSV)
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
    <div className="bg-background md:min-h-screen md:flex">
      {/* Mobile layout — unchanged */}
      <div className="flex flex-col md:hidden">
      {/* Hero header */}
      <div className="flex-shrink-0 px-6 pt-12 pb-10 text-white relative overflow-hidden farm-bg-pattern-light"
        style={{ background: "var(--gradient-primary)" }}>
        {/* Decorative rings */}
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full border border-white/10" />
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full border border-white/10" />
        <div className="absolute right-6 top-6 w-16 h-16 rounded-full bg-white/5" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "var(--gradient-impact)" }}>
              <AppLogoIcon size={20} />
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
                        {t === "register" ? "Register" : t.charAt(0).toUpperCase() + t.slice(1)}
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

      {/* Desktop layout — split screen, branding left / form right */}
      <div className="hidden md:flex md:w-full">
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden text-white flex-col justify-between p-12 farm-bg-pattern-light"
          style={{ background: "var(--gradient-primary)" }}>
          <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full border border-white/10" />
          <div className="absolute -right-8 -top-8 w-64 h-64 rounded-full border border-white/10" />
          <div className="absolute right-12 top-12 w-32 h-32 rounded-full bg-white/5" />

          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: "var(--gradient-impact)" }}>
              <AppLogoIcon size={24} />
            </div>
            <div>
              <p className="text-white/60 text-xs font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>
                Makuran Cattle Farm
              </p>
              <p className="text-white font-bold text-lg leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
                Track Now
              </p>
            </div>
          </div>

          <div className="relative max-w-md">
            <h1 className="text-4xl font-bold leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Livestock traceability, end to end.
            </h1>
            <p className="text-white/70 text-base mt-4">
              Register births, track lifecycle events, and trace every animal from breeder farm to final destination — with GPS-tagged records and QR-based lookups.
            </p>
            <div className="flex items-center gap-2 mt-8 flex-wrap">
              {SPECIES_LIST.map(sp => (
                <div key={sp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold"
                  style={{ fontFamily: "Montserrat, sans-serif" }}>
                  <span>{SPECIES_META[sp].emoji}</span>
                  <span>{SPECIES_META[sp].label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-white/40 text-xs">Track Now · Makuran Cattle Farm · v1.0</p>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto md:max-h-screen">
          <div className="w-full max-w-md">
            <div className="mb-6 lg:hidden flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "var(--gradient-impact)" }}>
                <AppLogoIcon size={20} />
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>
                  Makuran Cattle Farm
                </p>
                <p className="text-foreground font-bold text-base leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
                  Track Now
                </p>
              </div>
            </div>

            <h1 className="text-2xl font-bold leading-tight text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Welcome back
            </h1>
            <p className="text-muted-foreground text-sm mt-1 mb-6">
              Sign in to access your livestock traceability dashboard
            </p>

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
            <div className="border border-border rounded-xl overflow-hidden mt-4">
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

            <p className="text-center text-xs text-muted-foreground mt-6">
              Track Now · Makuran Cattle Farm · v1.0
            </p>
          </div>
        </div>
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

function ProfileScreen({ user, onLogout, onPasswordChange, isFullscreen, toggleFullscreen }: {
  user: AuthUser;
  onLogout: () => void;
  onPasswordChange: (current: string, next: string) => string | null;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}) {
  const rm = ROLE_META[user.role];
  const navigate = useNavigate();
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

        {/* Reports shortcut (moved from nav) */}
        {rm.canViewReports && (
          <button onClick={() => navigate("/reports")}
            className="w-full flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3.5 hover:shadow-md transition-shadow text-left">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--gradient-impact)" }}>
              <BarChart2 size={18} className="text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Reports & Analytics</p>
              <p className="text-xs text-muted-foreground">Charts, species breakdown, and data export</p>
            </div>
            <ChevronRight2 size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        )}

        {/* Settings actions */}
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="px-4 py-3 bg-muted/40 border-b border-border">
            <p className="text-xs font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Account Settings</p>
          </div>
          {[
            { icon: KeyRound, label: "Change Password", sub: "Update your login password", action: () => setSection("password") },
            { icon: isFullscreen ? Minimize : Maximize, label: isFullscreen ? "Exit Full Screen" : "Full Screen Mode",
              sub: isFullscreen ? "Show browser bars again" : "Hide browser bars for a kiosk-style view", action: toggleFullscreen },
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

// ─── Route ↔ Tab mapping ──────────────────────────────────────────────────────

const ROUTE_TO_TAB: Record<string, Tab> = {
  "/dashboard":   "dashboard",
  "/register":    "register",
  "/activities":  "activities",
  "/scan":        "search",
  "/reports":     "reports",
  "/profile":     "profile",
};
const TAB_TO_ROUTE: Record<Tab, string> = {
  dashboard:  "/dashboard",
  register:   "/register",
  activities: "/activities",
  search:     "/scan",
  reports:    "/reports",
  profile:    "/profile",
};

// Nav layout: Home | Activities | [+FAB] | Scan | Reports | Profile
const LEFT_NAV:  { tab: Tab; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { tab: "dashboard",   path: "/dashboard",   icon: LayoutDashboard, label: "Home" },
  { tab: "activities",  path: "/activities",  icon: ClipboardList,  label: "Activities" },
];
const RIGHT_NAV: { tab: Tab; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { tab: "search",  path: "/scan",    icon: Search, label: "Scan" },
  { tab: "profile", path: "/profile", icon: Users,  label: "Profile" },
];

const GLOBAL_STYLES = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes scaleIn  { from { opacity: 0; transform: scale(0.95); }      to { opacity: 1; transform: scale(1); } }
  .animate-fadeInUp  { animation: fadeInUp 0.35s ease both; }
  .animate-scaleIn   { animation: scaleIn  0.25s ease both; }
  .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .farm-bg-pattern {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84'%3E%3Cg fill='%23182951' fill-opacity='0.05'%3E%3Cellipse cx='42' cy='49' rx='10' ry='13'/%3E%3Cellipse cx='29' cy='32' rx='4.2' ry='5.2'/%3E%3Cellipse cx='42' cy='26' rx='4.6' ry='5.6'/%3E%3Cellipse cx='55' cy='32' rx='4.2' ry='5.2'/%3E%3C/g%3E%3C/svg%3E");
    background-size: 84px 84px;
  }
  .farm-bg-pattern-light {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84'%3E%3Cg fill='%23ffffff' fill-opacity='0.07'%3E%3Cellipse cx='42' cy='49' rx='10' ry='13'/%3E%3Cellipse cx='29' cy='32' rx='4.2' ry='5.2'/%3E%3Cellipse cx='42' cy='26' rx='4.6' ry='5.6'/%3E%3Cellipse cx='55' cy='32' rx='4.2' ry='5.2'/%3E%3C/g%3E%3C/svg%3E");
    background-size: 84px 84px;
  }
`;

// ─── App Shell (uses router hooks) ───────────────────────────────────────────

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem("mcf_session");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const data = useDataService();
  const { animals, events, addAnimal, addEvent, updateAnimal, getAnimalEvents, isOnline } = data;

  // Derive active tab from current URL path
  const activeTab: Tab = ROUTE_TO_TAB[location.pathname] ?? "dashboard";

  const goTo = useCallback((tab: Tab) => {
    navigate(TAB_TO_ROUTE[tab]);
  }, [navigate]);

  const handleLogin = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    localStorage.setItem("mcf_session", JSON.stringify(user));
    navigate("/dashboard", { replace: true });
  }, [navigate]);


  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem("mcf_session");
    navigate("/", { replace: true });
  }, [navigate]);

  const handlePasswordChange = useCallback((current: string, next: string): string | null => {
    if (!currentUser) return "Not logged in.";
    const match = DEMO_USERS.find(u => u.id === currentUser.id && u.password === current);
    if (!match) return "Current password is incorrect.";
    return null;
  }, [currentUser]);

  const handleAnimalClick = useCallback((animal: Animal) => {
    navigate(`/animal/${animal.id}`);
  }, [navigate]);

  const handleStatusClick = useCallback((status: AnimalStatus) => {
    navigate("/scan", { state: { statusFilter: status } });
  }, [navigate]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // ── Not logged in → show login ──
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 md:bg-background farm-bg-pattern"
        style={{ fontFamily: "Manrope, sans-serif" }}>
        <div className="relative w-full max-w-[430px] md:max-w-none md:h-auto shadow-2xl md:shadow-none bg-background flex flex-col overflow-hidden md:my-0"
          style={{ fontFamily: "Manrope, sans-serif" }}>
          <div className="overflow-y-auto scrollbar-hide md:overflow-visible">
            <LoginScreen onLogin={handleLogin} />
          </div>
        </div>
        <style>{GLOBAL_STYLES}</style>
      </div>
    );
  }

  const rm = ROLE_META[currentUser.role];
  const allowedTabs = rm.tabs;
  const canRegister = rm.canWrite;

  // Redirect unknown paths to dashboard (/ and /login are handled by the routes below;
  // /animal/:id is a dynamic route and never appears in ROUTE_TO_TAB)
  const isLoginPath = location.pathname === "/" || location.pathname === "/login";
  const isAnimalDetailPath = location.pathname.startsWith("/animal/");
  if (!ROUTE_TO_TAB[location.pathname] && !isLoginPath && !isAnimalDetailPath) {
    return <Navigate to="/dashboard" replace />;
  }

  const PAGE_TITLES: Record<string, string> = {
    "/dashboard": "Dashboard", "/activities": "Activities", "/register": "Register Animal",
    "/scan": "Search & Scan", "/reports": "Reports", "/profile": "Profile",
  };
  const pageTitle = location.pathname.startsWith("/animal/")
    ? "Animal Record"
    : PAGE_TITLES[location.pathname] ?? "Track Now";

  const ALL_NAV = [...LEFT_NAV, ...RIGHT_NAV];

  return (
    <div className="flex h-screen bg-background overflow-hidden farm-bg-pattern" style={{ fontFamily: "Manrope, sans-serif" }}>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex md:flex-col w-60 flex-shrink-0 border-r border-border bg-white">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border" style={{ background: "var(--gradient-primary)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <AppLogoIcon size={18} />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
                Track Now
              </p>
              <p className="text-white/60 text-[10px]">Makuran Cattle Farm</p>
            </div>
          </div>
        </div>

        {/* Register CTA */}
        <div className="px-4 py-4 border-b border-border">
          <button
            onClick={() => canRegister && goTo("register")}
            disabled={!canRegister}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-bold transition-all",
              canRegister ? "hover:opacity-90 active:scale-[0.98]" : "opacity-40 cursor-not-allowed"
            )}
            style={{ background: canRegister ? "var(--gradient-brand)" : "#ccc", fontFamily: "Montserrat, sans-serif",
              boxShadow: canRegister ? "0 2px 12px rgba(47,181,114,0.35)" : undefined }}>
            <Plus size={17} strokeWidth={2.5} /> Register Animal
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          {ALL_NAV.map(({ tab, icon: Icon, label }) => {
            const active = activeTab === tab;
            const allowed = allowedTabs.includes(tab);
            const isProfile = tab === "profile";
            return (
              <button key={tab}
                onClick={() => allowed && goTo(tab)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group",
                  active ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  !allowed ? "opacity-30 cursor-not-allowed" : ""
                )}
                style={{ background: active ? "var(--gradient-primary)" : undefined, fontFamily: "Montserrat, sans-serif" }}>
                {isProfile ? (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ background: active ? "rgba(255,255,255,0.25)" : rm.bg, color: active ? "white" : rm.color }}>
                    {currentUser.avatar}
                  </div>
                ) : (
                  <Icon size={18} strokeWidth={active ? 2 : 1.5} className="flex-shrink-0" />
                )}
                <span className="text-sm font-semibold">{label}</span>
                {!allowed && <Lock size={11} className="ml-auto opacity-50" />}
              </button>
            );
          })}
          {/* Reports link in sidebar */}
          {rm.canViewReports && (
            <button onClick={() => goTo("reports")}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                activeTab === "reports" ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              style={{ background: activeTab === "reports" ? "var(--gradient-primary)" : undefined, fontFamily: "Montserrat, sans-serif" }}>
              <BarChart2 size={18} strokeWidth={activeTab === "reports" ? 2 : 1.5} className="flex-shrink-0" />
              <span className="text-sm font-semibold">Reports</span>
            </button>
          )}
        </nav>

        {/* User + sync at bottom */}
        <div className="px-4 py-4 border-t border-border space-y-3">
          <div className={cn(
            "flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg w-fit",
            isOnline ? "bg-muted text-secondary" : "bg-yellow-100 text-yellow-700"
          )} style={{ fontFamily: "Montserrat, sans-serif" }}>
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isOnline ? "bg-secondary" : "bg-yellow-400")} />
            {isOnline ? "Synced" : "Offline"}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif" }}>
              {currentUser.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate" style={{ fontFamily: "Montserrat, sans-serif" }}>
                {currentUser.name}
              </p>
              <p className="text-[10px] text-muted-foreground">{rm.label}</p>
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN COLUMN ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Desktop top bar */}
        <header className="hidden md:flex flex-shrink-0 items-center justify-between px-6 py-3.5 bg-white border-b border-border">
          <div>
            <h1 className="text-base font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
              {pageTitle}
            </h1>
            <p className="text-xs text-muted-foreground">Makuran Cattle Farm Traceability Platform</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "Enter full screen"}
              className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
            {canRegister && (
              <button onClick={() => goTo("register")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                style={{ background: "var(--gradient-brand)", fontFamily: "Montserrat, sans-serif" }}>
                <Plus size={15} strokeWidth={2.5} /> Register Animal
              </button>
            )}
          </div>
        </header>

        {/* ── Routed content ── */}
        <DataCtx.Provider value={data}>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <Dashboard animals={animals} events={events} isOnline={isOnline} onAnimalClick={handleAnimalClick} onStatusClick={handleStatusClick} />
              } />
              <Route path="/register" element={
                canRegister
                  ? <RegisterAnimal addAnimal={addAnimal} updateAnimal={updateAnimal} recordedBy={currentUser.name} />
                  : <LockedSection role={rm.label} />
              } />
              <Route path="/activities" element={
                <ActivitiesFeed animals={animals} events={events} onAnimalClick={handleAnimalClick} />
              } />
              <Route path="/scan" element={
                <SearchScan animals={animals} events={events} onAnimalClick={handleAnimalClick} />
              } />
              <Route path="/reports" element={
                rm.canViewReports
                  ? <Reports animals={animals} canExport={rm.canExport} />
                  : <LockedSection role={rm.label} />
              } />
              <Route path="/profile" element={
                <ProfileScreen user={currentUser} onLogout={handleLogout} onPasswordChange={handlePasswordChange}
                  isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />
              } />
              <Route path="/animal/:animalId" element={
                <AnimalDetailPage canEdit={rm.canWrite} recordedBy={currentUser.name}
                  canRecordEvents={rm.canRecordEvents} allowedEventTypes={rm.eventTypes} />
              } />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </DataCtx.Provider>

        {/* ── Mobile bottom nav (hidden on desktop + animal pages) ── */}
        {!location.pathname.startsWith("/animal/") && (
          <div className="md:hidden flex-shrink-0 relative bg-white"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.10)", paddingBottom: "env(safe-area-inset-bottom, 6px)" }}>
            {/* FAB */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-7 z-20">
              <button onClick={() => canRegister && goTo("register")}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95",
                  !canRegister ? "opacity-40 cursor-not-allowed" : "hover:scale-105",
                  activeTab === "register" ? "ring-4 ring-white ring-offset-2" : ""
                )}
                style={{ background: canRegister ? "var(--gradient-brand)" : "#ccc",
                  boxShadow: canRegister ? "0 4px 20px rgba(47,181,114,0.45)" : undefined }}>
                <Plus size={28} strokeWidth={2.5} className="text-white" />
              </button>
              <p className="text-center text-[9px] font-bold mt-1 text-muted-foreground"
                style={{ fontFamily: "Montserrat, sans-serif" }}>Register</p>
            </div>
            <div className="flex items-center h-16 px-2">
              {LEFT_NAV.map(({ tab, icon: Icon, label }) => {
                const active = activeTab === tab;
                const allowed = allowedTabs.includes(tab);
                return (
                  <button key={tab} onClick={() => allowed && goTo(tab)}
                    className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 py-1 relative transition-all",
                      !allowed ? "opacity-30 cursor-not-allowed" : "")}
                    style={{ fontFamily: "Montserrat, sans-serif" }}>
                    {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-secondary" />}
                    <Icon size={22} strokeWidth={active ? 2.2 : 1.5}
                      style={{ color: active ? "var(--secondary)" : "var(--muted-foreground)" }} />
                    <span className="text-[10px] font-semibold leading-none"
                      style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}>{label}</span>
                  </button>
                );
              })}
              <div className="flex-1" />
              {RIGHT_NAV.map(({ tab, icon: Icon, label }) => {
                const active = activeTab === tab;
                const allowed = allowedTabs.includes(tab);
                const isProfile = tab === "profile";
                return (
                  <button key={tab} onClick={() => allowed && goTo(tab)}
                    className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 py-1 relative transition-all",
                      !allowed ? "opacity-30 cursor-not-allowed" : "")}
                    style={{ fontFamily: "Montserrat, sans-serif" }}>
                    {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-secondary" />}
                    {isProfile ? (
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                        active ? "ring-2 ring-secondary ring-offset-1" : "")}
                        style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif" }}>
                        {currentUser.avatar}
                      </div>
                    ) : (
                      <Icon size={22} strokeWidth={active ? 2.2 : 1.5}
                        style={{ color: active ? "var(--secondary)" : "var(--muted-foreground)" }} />
                    )}
                    <span className="text-[10px] font-semibold leading-none"
                      style={{ color: active ? "var(--primary)" : "var(--muted-foreground)" }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{GLOBAL_STYLES}</style>
    </div>
  );
}


// ─── 404 Not Found Page (/#/*) ────────────────────────────────────────────────

function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background"
      style={{ fontFamily: "Manrope, sans-serif" }}>
      <div className="max-w-[320px] mx-auto">
        {/* Visual */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          <div className="w-32 h-32 rounded-3xl flex items-center justify-center"
            style={{ background: "var(--gradient-primary)" }}>
            <Search size={48} className="text-white opacity-80" strokeWidth={1.5} />
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 rounded-xl flex items-center justify-center bg-destructive shadow-md">
            <X size={18} className="text-white" />
          </div>
        </div>

        <h1 className="text-5xl font-bold text-foreground mb-2"
          style={{ fontFamily: "Montserrat, sans-serif" }}>404</h1>
        <h2 className="text-lg font-bold text-foreground mb-3"
          style={{ fontFamily: "Montserrat, sans-serif" }}>Page Not Found</h2>
        <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
          The page <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">{location.pathname}</span> doesn't exist.
        </p>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          If you were looking for an animal record, try searching by ID from the Scan tab.
        </p>

        <div className="flex flex-col gap-3">
          <button onClick={() => navigate("/dashboard")}
            className="w-full py-3.5 rounded-xl font-bold text-white text-sm hover:opacity-90 transition-opacity"
            style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
            Go to Dashboard
          </button>
          <button onClick={() => navigate("/scan")}
            className="w-full py-3.5 rounded-xl font-bold text-sm border border-border hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <span className="flex items-center justify-center gap-2">
              <Search size={15} /> Search Animals
            </span>
          </button>
          <button onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors font-semibold"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            ← Go back
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-10">Track Now · Makuran Cattle Farm</p>
      </div>
    </div>
  );
}

// ─── Site Password Gate (prototype-wide access lock) ──────────────────────────

const SITE_PASSWORD = "Abcd@4321";
const SITE_UNLOCK_KEY = "mcf_site_unlocked";

function SitePasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SITE_UNLOCK_KEY) === "true");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === SITE_PASSWORD) {
      sessionStorage.setItem(SITE_UNLOCK_KEY, "true");
      setUnlocked(true);
      setError("");
    } else {
      setError("Incorrect password.");
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-6"
      style={{ fontFamily: "Manrope, sans-serif" }}>
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--gradient-impact)" }}>
            <Lock size={20} className="text-white" />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Track Now
            </p>
            <p className="text-foreground font-bold text-base leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
              Protected Prototype
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputField label="Site Password" required>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className={cn(inputCls, "pr-11")}
                placeholder="Enter password"
                value={password}
                autoFocus
                onChange={e => { setPassword(e.target.value); setError(""); }}
                required
              />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </InputField>
          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-destructive text-sm">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <button type="submit"
            className="w-full py-3 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-opacity"
            style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Root export (provides the router) ───────────────────────────────────────

export default function App() {
  return (
    <SitePasswordGate>
      <HashRouter>
        <Routes>
          {/* Login is the home page — AppShell handles / as well as all auth routes */}
          <Route path="*" element={<AppShellWithNotFound />} />
        </Routes>
      </HashRouter>
    </SitePasswordGate>
  );
}

function AppShellWithNotFound() {
  const location = useLocation();
  const knownRoutes = [
    "/", "/login", "/dashboard", "/activities", "/register",
    "/scan", "/reports", "/profile",
  ];
  const isKnown = knownRoutes.includes(location.pathname)
    || location.pathname.startsWith("/animal/");
  if (!isKnown) return <NotFoundPage />;
  return <AppShell />;
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
