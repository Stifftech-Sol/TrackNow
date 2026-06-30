import { useState, useCallback, useMemo, useEffect, useRef, createContext, useContext } from "react";
import {
  HashRouter, Routes, Route, Navigate,
  useNavigate, useLocation, useParams, Link
} from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import {
  LayoutDashboard, PlusCircle, ClipboardList, Search, BarChart2,
  MapPin, Download, Printer, X, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle2, ArrowRightLeft, User,
  Stethoscope, Skull, Clock, ScanLine, FileDown, Database,
  Info, Activity, Eye, EyeOff, LogOut, Lock, Shield,
  UserCheck, Users, ChevronDown, Plus, Settings, KeyRound,
  Bell, ChevronRight as ChevronRight2, CheckCircle,
  Maximize, Minimize, Trash2, Building2
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip
} from "recharts";

// ─── Auth / Role Types ────────────────────────────────────────────────────────

type Role = "administrator" | "farm_manager" | "veterinarian" | "breeder";
type Tab = "dashboard" | "register" | "activities" | "search" | "reports" | "profile" | "farms";

// ─── Types ──────────────────────────────────────────────────────────────────

type Species = "donkey";
type AnimalStatus =
  | "Registered at Breeder's Farm"
  | "Transferred to Farm"
  | "Health Checked"
  | "In Quarantine"
  | "Cleared at Farm"
  | "Sent to Slaughterhouse";
type EventType =
  | "Birth Registered"
  | "Transfer to Farm"
  | "Health Check"
  | "Quarantine Started"
  | "Quarantine Ended"
  | "Slaughter";
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
    tabs: ["dashboard", "register", "activities", "search", "reports", "farms", "profile"],
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
    eventTypes: ["Health Check", "Quarantine Started", "Quarantine Ended"],
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
  { id: "u1", name: "Imran Khan Baloch", email: "admin@tracknow.pk",     password: "admin123",   role: "administrator", avatar: "IK" },
  { id: "u2", name: "Nasreen Mengal",    email: "manager@tracknow.pk",   password: "manager123", role: "farm_manager",  avatar: "NM" },
  { id: "u3", name: "Dr. Waqar Rind",    email: "vet@tracknow.pk",       password: "vet123",     role: "veterinarian",  avatar: "WR" },
  { id: "u4", name: "Haji Kareem Baloch",email: "breeder@tracknow.pk",   password: "breeder123", role: "breeder",       avatar: "HK" },
];

interface Animal {
  id: string;
  species: Species;
  birth_date: string;
  breeder_name: string;
  breeder_cnic?: string;
  registered_farm?: string;
  birth_location: string;
  birth_lat?: number;
  birth_lng?: number;
  gender: "Male" | "Female";
  color: string;
  status: AnimalStatus;
  notes?: string;
  created_at: string;
}

interface RegisteredFarm {
  id: string;
  name: string;
  code: string;  // short uppercase prefix used in animal IDs
  location: string;
  lat?: number;
  lng?: number;
  owner_name: string;
  owner_cnic?: string;
  phone?: string;
  created_at: string;
}

function maskCnic(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

function farmCodeFromName(name: string): string {
  const skip = new Set(["and", "or", "the", "of", "&", "-", "e"]);
  const words = name.split(/[\s\-&]+/).filter(w => w.length > 1 && !skip.has(w.toLowerCase()));
  return words.slice(0, 3).map(w => w[0].toUpperCase()).join("") || "FRM";
}

interface AnimalEvent {
  id: string;
  animal_id: string;
  event_type: EventType;
  event_date: string;
  location?: string;
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

const SPECIES_LIST: Species[] = ["donkey"];

const SPECIES_META: Record<Species, { label: string; code: string; emoji: string; male: string; female: string; colorHint: string }> = {
  donkey: { label: "Donkey", code: "DNK", emoji: "🫏", male: "Jack", female: "Jenny", colorHint: "e.g. Grey, Brown, Black & White" },
};

const STATUS_META: Record<AnimalStatus, { color: string; bg: string; label: string }> = {
  "Registered at Breeder's Farm": { color: "#2D7DD2", bg: "#EBF4FF", label: "At Breeder" },
  "Transferred to Farm":          { color: "#7B5EA7", bg: "#F0EBF9", label: "Transferred" },
  "Health Checked":               { color: "#E07B30", bg: "#FEF3EA", label: "Health Checked" },
  "In Quarantine":                { color: "#9E9E9E", bg: "#F5F5F5", label: "In Quarantine" },
  "Cleared at Farm":              { color: "#2FB572", bg: "#E3F8EF", label: "Cleared" },
  "Sent to Slaughterhouse":       { color: "#d4183d", bg: "#FDEAEE", label: "Slaughter" },
};

const EVENT_META: Record<EventType, { icon: typeof CheckCircle2; color: string }> = {
  "Birth Registered":  { icon: PlusCircle,     color: "#2FB572" },
  "Transfer to Farm":  { icon: ArrowRightLeft,  color: "#7B5EA7" },
  "Health Check":      { icon: Stethoscope,     color: "#E07B30" },
  "Quarantine Started":{ icon: AlertTriangle,   color: "#9E9E9E" },
  "Quarantine Ended":  { icon: CheckCircle2,    color: "#2FB572" },
  "Slaughter":         { icon: Skull,           color: "#d4183d" },
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
  "Transferred to Farm",
  "Health Checked",
  "In Quarantine",
  "Cleared at Farm",
  "Sent to Slaughterhouse",
];

const NEXT_STATUS: Partial<Record<AnimalStatus, AnimalStatus>> = {
  "Registered at Breeder's Farm": "Transferred to Farm",
  "Transferred to Farm":          "Health Checked",
  "Health Checked":               "In Quarantine",
  "In Quarantine":                "Cleared at Farm",
  "Cleared at Farm":              "Sent to Slaughterhouse",
};

// The single transitioning event type that advances a given status to the next stage
const TRANSITION_EVENT_FOR_STATUS: Partial<Record<AnimalStatus, EventType>> = {
  "Registered at Breeder's Farm": "Transfer to Farm",
  "Transferred to Farm":          "Health Check",
  "Health Checked":               "Quarantine Started",
  "In Quarantine":                "Quarantine Ended",
  "Cleared at Farm":              "Slaughter",
};

const NON_TRANSITIONING_EVENTS: EventType[] = [];

function allowedEventTypesForAnimal(status: AnimalStatus, roleAllowed?: EventType[]): EventType[] {
  const next = TRANSITION_EVENT_FOR_STATUS[status];
  const types = next ? [next, ...NON_TRANSITIONING_EVENTS] : [...NON_TRANSITIONING_EVENTS];
  return roleAllowed ? types.filter(t => roleAllowed.includes(t)) : types;
}

// ─── Seed Data ───────────────────────────────────────────────────────────────

const SEED_FARMS: RegisteredFarm[] = [
  { id: "FARM-001", name: "Government Dairy & Cattle Farm", code: "GDC", location: "Quetta, Balochistan",           lat: 30.1798, lng: 66.9750, owner_name: "Government of Balochistan", owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-002", name: "Sibi Bhagnari Cattle Farm",      code: "SBC", location: "Sibi, Balochistan",             lat: 29.5431, lng: 67.8772, owner_name: "Haji Bhagnari",            owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-003", name: "Hub Livestock Farm",             code: "HLF", location: "Hub, Balochistan",              lat: 25.0572, lng: 66.9895, owner_name: "Abdul Karim Hub",          owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-004", name: "Nizam Cattle & Dairy Farm",      code: "NCD", location: "Turbat, Kech",                  lat: 26.0035, lng: 63.0681, owner_name: "Nizam ud Din",             owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-005", name: "Irfan Shahwani Agro & Livestock",code: "ISA", location: "Khuzdar, Balochistan",          lat: 27.8136, lng: 66.6111, owner_name: "Irfan Shahwani",           owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-006", name: "Karakh Livestock Farm",          code: "KLF", location: "Mastung, Balochistan",          lat: 29.7985, lng: 66.8458, owner_name: "Khan Gul Karakhi",         owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-007", name: "Munchi and Sons Livestock",      code: "MSL", location: "Dera Murad Jamali, Balochistan",lat: 29.4609, lng: 67.3287, owner_name: "Munchi Khan",              owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-008", name: "Chiltan Cattle Farm",            code: "CCF", location: "Quetta, Balochistan",           lat: 30.2200, lng: 66.8800, owner_name: "Raza Chiltan",             owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-009", name: "Suleiman Range Livestock",       code: "SRL", location: "Dera Bugti, Balochistan",       lat: 29.0369, lng: 69.1581, owner_name: "Sardar Bugti",             owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-010", name: "Bolan Pass Pastures",            code: "BPP", location: "Bolan, Balochistan",            lat: 29.8500, lng: 67.2000, owner_name: "Ghulam Bolan",             owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-011", name: "Hingol Organic Dairy",           code: "HOD", location: "Lasbela, Balochistan",          lat: 25.5078, lng: 65.3270, owner_name: "Hamid Hingol",             owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-012", name: "Mehergarh Cattle & Dairy",       code: "MCD", location: "Bolan, Balochistan",            lat: 29.4667, lng: 67.6167, owner_name: "Sardar Mehergarh",         owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-013", name: "Zhob Valley Livestock Producers",code: "ZVL", location: "Zhob, Balochistan",             lat: 31.3417, lng: 69.4481, owner_name: "Khan Zhob",                owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-014", name: "Dasht Plain Cattle Ranch",       code: "DPC", location: "Dasht, Balochistan",            lat: 26.5000, lng: 62.5000, owner_name: "Ali Dasht",                owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-015", name: "Sibi Bull Breeders",             code: "SBB", location: "Sibi, Balochistan",             lat: 29.5500, lng: 67.8900, owner_name: "Muhammad Sibi",            owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-016", name: "Royal Bhagnari Farms",           code: "RBF", location: "Sibi, Balochistan",             lat: 29.5600, lng: 67.9000, owner_name: "Raja Bhagnari",            owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-017", name: "Lohani Cattle Breeders",         code: "LCB", location: "Loralai, Balochistan",          lat: 30.3703, lng: 68.5997, owner_name: "Haji Lohani",              owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-018", name: "Baloch Heritage Livestock",      code: "BHL", location: "Kalat, Balochistan",            lat: 29.0225, lng: 66.5900, owner_name: "Sardar Baloch",            owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-019", name: "Pak-Baloch Livestock Enterprise",code: "PBL", location: "Quetta, Balochistan",           lat: 30.1900, lng: 67.0100, owner_name: "Pak Baloch Group",         owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
  { id: "FARM-020", name: "Koh-e-Suleiman Dairy Farm",      code: "KSD", location: "Dera Bugti, Balochistan",       lat: 30.0000, lng: 69.8000, owner_name: "Suleiman Khan",            owner_cnic: "", phone: "", created_at: "2026-01-01T00:00:00Z" },
];

const SEED_ANIMALS: Animal[] = [
  // Government Dairy & Cattle Farm (GDC)
  { id: "GDC-DNK-202603-001", species: "donkey", birth_date: "2026-03-05", breeder_name: "Muhammad Aslam", breeder_cnic: "54301-1234567-1", registered_farm: "Government Dairy & Cattle Farm", birth_location: "Quetta, Balochistan", birth_lat: 30.1798, birth_lng: 66.9750, gender: "Male",   color: "Grey",          status: "Cleared at Farm",                created_at: "2026-03-05T08:00:00Z" },
  { id: "GDC-DNK-202603-002", species: "donkey", birth_date: "2026-03-18", breeder_name: "Fatima Baloch",   breeder_cnic: "54301-7654321-2", registered_farm: "Government Dairy & Cattle Farm", birth_location: "Quetta, Balochistan", birth_lat: 30.1798, birth_lng: 66.9750, gender: "Female", color: "Light Brown",    status: "Sent to Slaughterhouse",       created_at: "2026-03-18T09:00:00Z" },
  { id: "GDC-DNK-202604-001", species: "donkey", birth_date: "2026-04-02", breeder_name: "Abdul Rahim",     breeder_cnic: "54301-2345678-3", registered_farm: "Government Dairy & Cattle Farm", birth_location: "Quetta, Balochistan", birth_lat: 30.1798, birth_lng: 66.9750, gender: "Male",   color: "Dark Grey",     status: "In Quarantine",                created_at: "2026-04-02T07:30:00Z" },

  // Sibi Bhagnari Cattle Farm (SBC)
  { id: "SBC-DNK-202603-001", species: "donkey", birth_date: "2026-03-10", breeder_name: "Haji Bhagnari",   breeder_cnic: "52101-3456789-1", registered_farm: "Sibi Bhagnari Cattle Farm",       birth_location: "Sibi, Balochistan",   birth_lat: 29.5431, birth_lng: 67.8772, gender: "Male",   color: "Brown",         status: "Cleared at Farm",                created_at: "2026-03-10T08:00:00Z" },
  { id: "SBC-DNK-202604-001", species: "donkey", birth_date: "2026-04-15", breeder_name: "Zubair Bhagnari", breeder_cnic: "52101-4567890-2", registered_farm: "Sibi Bhagnari Cattle Farm",       birth_location: "Sibi, Balochistan",   birth_lat: 29.5431, birth_lng: 67.8772, gender: "Female", color: "Reddish Brown", status: "Registered at Breeder's Farm",  created_at: "2026-04-15T09:30:00Z" },

  // Hub Livestock Farm (HLF)
  { id: "HLF-DNK-202604-001", species: "donkey", birth_date: "2026-04-08", breeder_name: "Abdul Karim Hub", breeder_cnic: "43201-5678901-1", registered_farm: "Hub Livestock Farm",              birth_location: "Hub, Balochistan",    birth_lat: 25.0572, birth_lng: 66.9895, gender: "Male",   color: "Black & White", status: "Transferred to Farm", created_at: "2026-04-08T07:00:00Z" },
  { id: "HLF-DNK-202605-001", species: "donkey", birth_date: "2026-05-03", breeder_name: "Naseem Hub",      breeder_cnic: "43201-6789012-2", registered_farm: "Hub Livestock Farm",              birth_location: "Hub, Balochistan",    birth_lat: 25.0572, birth_lng: 66.9895, gender: "Female", color: "Grey",          status: "Registered at Breeder's Farm",  created_at: "2026-05-03T10:00:00Z" },

  // Nizam Cattle & Dairy Farm (NCD)
  { id: "NCD-DNK-202604-001", species: "donkey", birth_date: "2026-04-20", breeder_name: "Nizam ud Din",    breeder_cnic: "52401-7890123-1", registered_farm: "Nizam Cattle & Dairy Farm",       birth_location: "Turbat, Kech",        birth_lat: 26.0035, birth_lng: 63.0681, gender: "Female", color: "Light Grey",    status: "Cleared at Farm",                created_at: "2026-04-20T08:30:00Z" },
  { id: "NCD-DNK-202605-001", species: "donkey", birth_date: "2026-05-11", breeder_name: "Salma Nizam",     breeder_cnic: "52401-8901234-2", registered_farm: "Nizam Cattle & Dairy Farm",       birth_location: "Turbat, Kech",        birth_lat: 26.0035, birth_lng: 63.0681, gender: "Male",   color: "Brown",         status: "In Quarantine",                created_at: "2026-05-11T09:00:00Z" },

  // Irfan Shahwani Agro & Livestock (ISA)
  { id: "ISA-DNK-202605-001", species: "donkey", birth_date: "2026-05-01", breeder_name: "Irfan Shahwani",  breeder_cnic: "53201-9012345-1", registered_farm: "Irfan Shahwani Agro & Livestock", birth_location: "Khuzdar, Balochistan",birth_lat: 27.8136, birth_lng: 66.6111, gender: "Male",   color: "Dark Brown",    status: "Registered at Breeder's Farm",  created_at: "2026-05-01T07:15:00Z" },
  { id: "ISA-DNK-202605-002", species: "donkey", birth_date: "2026-05-18", breeder_name: "Rehana Shahwani", breeder_cnic: "53201-0123456-2", registered_farm: "Irfan Shahwani Agro & Livestock", birth_location: "Khuzdar, Balochistan",birth_lat: 27.8136, birth_lng: 66.6111, gender: "Female", color: "Black",         status: "Transferred to Farm", created_at: "2026-05-18T10:00:00Z" },

  // Karakh Livestock Farm (KLF)
  { id: "KLF-DNK-202605-001", species: "donkey", birth_date: "2026-05-07", breeder_name: "Khan Gul Karakhi",breeder_cnic: "54101-1122334-1", registered_farm: "Karakh Livestock Farm",           birth_location: "Mastung, Balochistan",birth_lat: 29.7985, birth_lng: 66.8458, gender: "Male",   color: "Grey & White",  status: "Cleared at Farm",                created_at: "2026-05-07T08:00:00Z" },
  { id: "KLF-DNK-202606-001", species: "donkey", birth_date: "2026-06-01", breeder_name: "Amina Karakhi",   breeder_cnic: "54101-2233445-2", registered_farm: "Karakh Livestock Farm",           birth_location: "Mastung, Balochistan",birth_lat: 29.7985, birth_lng: 66.8458, gender: "Female", color: "Brown & White", status: "Registered at Breeder's Farm",  created_at: "2026-06-01T09:30:00Z" },

  // Munchi and Sons Livestock (MSL)
  { id: "MSL-DNK-202605-001", species: "donkey", birth_date: "2026-05-22", breeder_name: "Munchi Khan",     breeder_cnic: "54401-3344556-1", registered_farm: "Munchi and Sons Livestock",       birth_location: "Dera Murad Jamali",   birth_lat: 29.4609, birth_lng: 67.3287, gender: "Male",   color: "Spotted Grey",  status: "Sent to Slaughterhouse",       created_at: "2026-05-22T08:45:00Z" },
  { id: "MSL-DNK-202606-001", species: "donkey", birth_date: "2026-06-05", breeder_name: "Rafiq Munchi",    breeder_cnic: "54401-4455667-2", registered_farm: "Munchi and Sons Livestock",       birth_location: "Dera Murad Jamali",   birth_lat: 29.4609, birth_lng: 67.3287, gender: "Female", color: "Light Brown",   status: "Registered at Breeder's Farm",  created_at: "2026-06-05T07:00:00Z" },

  // Chiltan Cattle Farm (CCF)
  { id: "CCF-DNK-202606-001", species: "donkey", birth_date: "2026-06-03", breeder_name: "Raza Chiltan",    breeder_cnic: "54302-5566778-1", registered_farm: "Chiltan Cattle Farm",             birth_location: "Quetta, Balochistan", birth_lat: 30.2200, birth_lng: 66.8800, gender: "Male",   color: "Grey",          status: "In Quarantine",                created_at: "2026-06-03T10:00:00Z" },
  { id: "CCF-DNK-202606-002", species: "donkey", birth_date: "2026-06-10", breeder_name: "Zainab Chiltan",  breeder_cnic: "54302-6677889-2", registered_farm: "Chiltan Cattle Farm",             birth_location: "Quetta, Balochistan", birth_lat: 30.2200, birth_lng: 66.8800, gender: "Female", color: "Dark Grey",     status: "Cleared at Farm",                created_at: "2026-06-10T09:00:00Z" },

  // Suleiman Range Livestock (SRL)
  { id: "SRL-DNK-202606-001", species: "donkey", birth_date: "2026-06-08", breeder_name: "Sardar Bugti",    breeder_cnic: "52301-7788990-1", registered_farm: "Suleiman Range Livestock",        birth_location: "Dera Bugti, Balochistan", birth_lat: 29.0369, birth_lng: 69.1581, gender: "Male", color: "Brown",         status: "Registered at Breeder's Farm",  created_at: "2026-06-08T08:00:00Z" },

  // Bolan Pass Pastures (BPP)
  { id: "BPP-DNK-202606-001", species: "donkey", birth_date: "2026-06-12", breeder_name: "Ghulam Bolan",    breeder_cnic: "53101-8899001-1", registered_farm: "Bolan Pass Pastures",             birth_location: "Bolan, Balochistan",  birth_lat: 29.8500, birth_lng: 67.2000, gender: "Female", color: "Black & Grey",  status: "Registered at Breeder's Farm",  created_at: "2026-06-12T07:30:00Z" },
  { id: "BPP-DNK-202606-002", species: "donkey", birth_date: "2026-06-18", breeder_name: "Kiran Bolan",     breeder_cnic: "53101-9900112-2", registered_farm: "Bolan Pass Pastures",             birth_location: "Bolan, Balochistan",  birth_lat: 29.8500, birth_lng: 67.2000, gender: "Male",   color: "Light Grey",    status: "Transferred to Farm", created_at: "2026-06-18T09:00:00Z" },

  // Hingol Organic Dairy (HOD)
  { id: "HOD-DNK-202606-001", species: "donkey", birth_date: "2026-06-14", breeder_name: "Hamid Hingol",    breeder_cnic: "43101-0011223-1", registered_farm: "Hingol Organic Dairy",            birth_location: "Lasbela, Balochistan",birth_lat: 25.5078, birth_lng: 65.3270, gender: "Male",   color: "Cream White",   status: "Registered at Breeder's Farm",  created_at: "2026-06-14T08:00:00Z" },

  // Mehergarh Cattle & Dairy (MCD)
  { id: "MCD-DNK-202606-001", species: "donkey", birth_date: "2026-06-16", breeder_name: "Sardar Mehergarh",breeder_cnic: "53102-1122334-1", registered_farm: "Mehergarh Cattle & Dairy",        birth_location: "Bolan, Balochistan",  birth_lat: 29.4667, birth_lng: 67.6167, gender: "Female", color: "Brown",         status: "Cleared at Farm",                created_at: "2026-06-16T09:30:00Z" },

  // Sibi Bull Breeders (SBB)
  { id: "SBB-DNK-202606-001", species: "donkey", birth_date: "2026-06-20", breeder_name: "Muhammad Sibi",   breeder_cnic: "52102-2233445-1", registered_farm: "Sibi Bull Breeders",              birth_location: "Sibi, Balochistan",   birth_lat: 29.5500, birth_lng: 67.8900, gender: "Male",   color: "Dark Brown",    status: "Registered at Breeder's Farm",  created_at: "2026-06-20T07:00:00Z" },
  { id: "SBB-DNK-202606-002", species: "donkey", birth_date: "2026-06-22", breeder_name: "Aisha Sibi",      breeder_cnic: "52102-3344556-2", registered_farm: "Sibi Bull Breeders",              birth_location: "Sibi, Balochistan",   birth_lat: 29.5500, birth_lng: 67.8900, gender: "Female", color: "Grey",          status: "In Quarantine",                created_at: "2026-06-22T08:00:00Z" },

  // Royal Bhagnari Farms (RBF)
  { id: "RBF-DNK-202606-001", species: "donkey", birth_date: "2026-06-24", breeder_name: "Raja Bhagnari",   breeder_cnic: "52103-4455667-1", registered_farm: "Royal Bhagnari Farms",            birth_location: "Sibi, Balochistan",   birth_lat: 29.5600, birth_lng: 67.9000, gender: "Male",   color: "Black",         status: "Registered at Breeder's Farm",  created_at: "2026-06-24T09:00:00Z" },

  // Lohani Cattle Breeders (LCB)
  { id: "LCB-DNK-202606-001", species: "donkey", birth_date: "2026-06-15", breeder_name: "Haji Lohani",     breeder_cnic: "53401-5566778-1", registered_farm: "Lohani Cattle Breeders",          birth_location: "Loralai, Balochistan",birth_lat: 30.3703, birth_lng: 68.5997, gender: "Female", color: "Tan",           status: "Transferred to Farm", created_at: "2026-06-15T08:30:00Z" },

  // Baloch Heritage Livestock (BHL)
  { id: "BHL-DNK-202606-001", species: "donkey", birth_date: "2026-06-17", breeder_name: "Sardar Baloch",   breeder_cnic: "54201-6677889-1", registered_farm: "Baloch Heritage Livestock",       birth_location: "Kalat, Balochistan",  birth_lat: 29.0225, birth_lng: 66.5900, gender: "Male",   color: "Grey & Brown",  status: "Registered at Breeder's Farm",  created_at: "2026-06-17T07:00:00Z" },

  // Pak-Baloch Livestock Enterprise (PBL)
  { id: "PBL-DNK-202606-001", species: "donkey", birth_date: "2026-06-19", breeder_name: "Pak Baloch CEO",  breeder_cnic: "54303-7788990-1", registered_farm: "Pak-Baloch Livestock Enterprise", birth_location: "Quetta, Balochistan", birth_lat: 30.1900, birth_lng: 67.0100, gender: "Female", color: "White & Grey",  status: "Cleared at Farm",                created_at: "2026-06-19T09:00:00Z" },

  // Koh-e-Suleiman Dairy Farm (KSD)
  { id: "KSD-DNK-202606-001", species: "donkey", birth_date: "2026-06-21", breeder_name: "Suleiman Khan",   breeder_cnic: "52302-8899001-1", registered_farm: "Koh-e-Suleiman Dairy Farm",      birth_location: "Dera Bugti, Balochistan", birth_lat: 30.0000, birth_lng: 69.8000, gender: "Male", color: "Brown",         status: "Registered at Breeder's Farm",  created_at: "2026-06-21T08:00:00Z" },
];

const SEED_EVENTS: AnimalEvent[] = [
  // GDC-DNK-202603-001 — Govt Farm, Cleared at Farm
  { id: "e1",  animal_id: "GDC-DNK-202603-001", event_type: "Birth Registered",      event_date: "2026-03-05", notes: "Grey jack foal, healthy birth weight 22kg. Breeder: Muhammad Aslam, CNIC: 54301-1234567-1. Color: Grey. Farm: Government Dairy & Cattle Farm, Quetta.", recorded_by: "Muhammad Aslam",  recorded_at: "2026-03-05T08:05:00Z" },
  { id: "e2",  animal_id: "GDC-DNK-202603-001", event_type: "Transfer to Farm",   event_date: "2026-03-28", notes: "Transferred in excellent condition. Previous owner: Muhammad Aslam. Destination: Central Farm, Quetta.", recorded_by: "Nasreen Mengal", previous_owner: "Muhammad Aslam", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Quetta", recorded_at: "2026-03-28T10:00:00Z" },
  { id: "e2b", animal_id: "GDC-DNK-202603-001", event_type: "Health Check",       event_date: "2026-03-28", notes: "Pre-quarantine health check completed. Temperature normal, no signs of illness. Cleared for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-03-28T10:30:00Z" },
  { id: "e3",  animal_id: "GDC-DNK-202603-001", event_type: "Quarantine Started", event_date: "2026-03-28", notes: "Standard 21-day quarantine initiated. Block A assigned.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-03-28T11:00:00Z" },
  { id: "e4",  animal_id: "GDC-DNK-202603-001", event_type: "Quarantine Ended",        event_date: "2026-04-18", notes: "All tests clear. Released to main holding pen.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-04-18T09:00:00Z" },
  { id: "e5",  animal_id: "GDC-DNK-202603-001", event_type: "Health Check",          event_date: "2026-05-10", notes: "Routine check. Weight 115kg. BCS 3.5/5. No abnormalities.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-05-10T14:00:00Z" },

  // GDC-DNK-202603-002 — Govt Farm, Sent to Slaughterhouse
  { id: "e6",  animal_id: "GDC-DNK-202603-002", event_type: "Birth Registered",      event_date: "2026-03-18", notes: "Jenny foal, light brown, healthy delivery. 20kg. Breeder: Fatima Baloch, CNIC: 54301-9876543-2. Color: Light Brown. Farm: Government Dairy & Cattle Farm.", recorded_by: "Fatima Baloch",   recorded_at: "2026-03-18T09:05:00Z" },
  { id: "e7",  animal_id: "GDC-DNK-202603-002", event_type: "Transfer to Farm",   event_date: "2026-04-10", notes: "Transferred in good health. Previous owner: Fatima Baloch.", recorded_by: "Nasreen Mengal", previous_owner: "Fatima Baloch", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Quetta", recorded_at: "2026-04-10T10:00:00Z" },
  { id: "e7b", animal_id: "GDC-DNK-202603-002", event_type: "Health Check",       event_date: "2026-04-10", notes: "Pre-quarantine health check. Body condition score 3/5. No infectious signs. Approved for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-04-10T10:30:00Z" },
  { id: "e8",  animal_id: "GDC-DNK-202603-002", event_type: "Quarantine Started", event_date: "2026-04-10", notes: "Quarantine Block B initiated.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-04-10T11:00:00Z" },
  { id: "e9",  animal_id: "GDC-DNK-202603-002", event_type: "Quarantine Ended",        event_date: "2026-05-01", notes: "All clear. Animal released from quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-05-01T09:00:00Z" },
  { id: "e10", animal_id: "GDC-DNK-202603-002", event_type: "Slaughter", event_date: "2026-06-01", notes: "Transferred per management schedule. Live weight 105kg.", recorded_by: "Imran Khan Baloch", transferred_to: "Quetta Slaughterhouse", recorded_at: "2026-06-01T07:00:00Z" },

  // GDC-DNK-202604-001 — Govt Farm, In Quarantine
  { id: "e11", animal_id: "GDC-DNK-202604-001", event_type: "Birth Registered",      event_date: "2026-04-02", notes: "Jack foal, dark grey, strong build. 23kg. Breeder: Abdul Rahim, CNIC: 54301-5544332-3. Color: Dark Grey. Farm: Government Dairy & Cattle Farm.", recorded_by: "Abdul Rahim",     recorded_at: "2026-04-02T07:35:00Z" },
  { id: "e12",  animal_id: "GDC-DNK-202604-001", event_type: "Transfer to Farm",   event_date: "2026-05-15", notes: "Good travel condition. Previous owner: Abdul Rahim.", recorded_by: "Nasreen Mengal", previous_owner: "Abdul Rahim", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Quetta", recorded_at: "2026-05-15T10:00:00Z" },
  { id: "e12b", animal_id: "GDC-DNK-202604-001", event_type: "Health Check",       event_date: "2026-05-15", notes: "Health check on arrival. Weight 110kg. No visible injuries or illness. Cleared for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-05-15T10:30:00Z" },
  { id: "e13",  animal_id: "GDC-DNK-202604-001", event_type: "Quarantine Started", event_date: "2026-05-15", notes: "Quarantine started on arrival. Block A assigned.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-05-15T11:00:00Z" },

  // SBC-DNK-202603-001 — Sibi Bhagnari, Cleared
  { id: "e14", animal_id: "SBC-DNK-202603-001", event_type: "Birth Registered",      event_date: "2026-03-10", notes: "Brown jack foal, alert and active. 21kg. Breeder: Haji Bhagnari, CNIC: 42101-3344556-5. Color: Brown. Farm: Sibi Bhagnari Cattle Farm.", recorded_by: "Haji Bhagnari",   recorded_at: "2026-03-10T08:05:00Z" },
  { id: "e15",  animal_id: "SBC-DNK-202603-001", event_type: "Transfer to Farm",   event_date: "2026-04-05", notes: "Excellent road condition. Previous owner: Haji Bhagnari.", recorded_by: "Nasreen Mengal", previous_owner: "Haji Bhagnari", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Sibi", recorded_at: "2026-04-05T10:00:00Z" },
  { id: "e15b", animal_id: "SBC-DNK-202603-001", event_type: "Health Check",       event_date: "2026-04-05", notes: "Pre-quarantine health check. Good body condition, alert and responsive. Approved for quarantine entry.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-04-05T10:30:00Z" },
  { id: "e16",  animal_id: "SBC-DNK-202603-001", event_type: "Quarantine Started", event_date: "2026-04-05", notes: "Quarantine initiated at Block A.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-04-05T11:00:00Z" },
  { id: "e17", animal_id: "SBC-DNK-202603-001", event_type: "Quarantine Ended",        event_date: "2026-04-26", notes: "All clear. Moved to main herd.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-04-26T09:00:00Z" },

  // HLF-DNK-202604-001 — Hub Farm, Transferred
  { id: "e18", animal_id: "HLF-DNK-202604-001", event_type: "Birth Registered",      event_date: "2026-04-08", notes: "Black & white jack foal. 22kg at birth. Breeder: Abdul Karim Hub, CNIC: 43201-7788990-1. Color: Black & White. Farm: Hub Livestock Farm.", recorded_by: "Abdul Karim Hub", recorded_at: "2026-04-08T07:05:00Z" },
  { id: "e19", animal_id: "HLF-DNK-202604-001", event_type: "Transfer to Farm",      event_date: "2026-05-20", notes: "Weaned and transferred in good condition. Previous owner: Abdul Karim Hub.", recorded_by: "Nasreen Mengal", previous_owner: "Abdul Karim Hub", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Hub", recorded_at: "2026-05-20T10:00:00Z" },

  // NCD-DNK-202604-001 — Nizam Farm, Cleared
  { id: "e20", animal_id: "NCD-DNK-202604-001", event_type: "Birth Registered",      event_date: "2026-04-20", notes: "Light grey jenny foal, healthy dam. 20kg. Breeder: Nizam ud Din, CNIC: 52101-6677889-0. Color: Light Grey. Farm: Nizam Cattle & Dairy Farm, Turbat.", recorded_by: "Nizam ud Din",    recorded_at: "2026-04-20T08:35:00Z" },
  { id: "e21",  animal_id: "NCD-DNK-202604-001", event_type: "Transfer to Farm",   event_date: "2026-05-12", notes: "Good arrival condition. Previous owner: Nizam ud Din.", recorded_by: "Nasreen Mengal", previous_owner: "Nizam ud Din", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Turbat", recorded_at: "2026-05-12T10:00:00Z" },
  { id: "e21b", animal_id: "NCD-DNK-202604-001", event_type: "Health Check",       event_date: "2026-05-12", notes: "Health check on arrival. Weight 98kg. Vitals normal. Coat condition good. Cleared for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-05-12T10:30:00Z" },
  { id: "e22",  animal_id: "NCD-DNK-202604-001", event_type: "Quarantine Started", event_date: "2026-05-12", notes: "Standard quarantine initiated. Block A.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-05-12T11:00:00Z" },
  { id: "e23", animal_id: "NCD-DNK-202604-001", event_type: "Quarantine Ended",        event_date: "2026-06-02", notes: "Released. All tests passed.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-02T09:00:00Z" },

  // KLF-DNK-202605-001 — Karakh Farm, Cleared
  { id: "e24", animal_id: "KLF-DNK-202605-001", event_type: "Birth Registered",      event_date: "2026-05-07", notes: "Grey & white jack foal, calm temperament. 21kg. Breeder: Khan Gul Karakhi, CNIC: 54501-2233445-7. Color: Grey & White. Farm: Karakh Livestock Farm.", recorded_by: "Khan Gul Karakhi", recorded_at: "2026-05-07T08:05:00Z" },
  { id: "e25",  animal_id: "KLF-DNK-202605-001", event_type: "Transfer to Farm",   event_date: "2026-06-01", notes: "4-hour road transport. No stress observed. Previous owner: Khan Gul Karakhi.", recorded_by: "Nasreen Mengal", previous_owner: "Khan Gul Karakhi", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Mastung", recorded_at: "2026-06-01T10:00:00Z" },
  { id: "e25b", animal_id: "KLF-DNK-202605-001", event_type: "Health Check",       event_date: "2026-06-01", notes: "Post-transport health check. No injuries. Temperature 37.8°C. Weight 108kg. Cleared for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-01T10:30:00Z" },
  { id: "e26",  animal_id: "KLF-DNK-202605-001", event_type: "Quarantine Started", event_date: "2026-06-01", notes: "Quarantine started at Block A on arrival.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-01T11:00:00Z" },
  { id: "e27", animal_id: "KLF-DNK-202605-001", event_type: "Quarantine Ended",        event_date: "2026-06-22", notes: "Cleared all tests. Moved to main area.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-22T09:00:00Z" },

  // MSL-DNK-202605-001 — Munchi Farm, Slaughter
  { id: "e28", animal_id: "MSL-DNK-202605-001", event_type: "Birth Registered",      event_date: "2026-05-22", notes: "Spotted grey jack foal. 20kg. Breeder: Munchi Khan, CNIC: 43401-9988776-3. Color: Spotted Grey. Farm: Munchi and Sons Livestock, Dera Murad Jamali.", recorded_by: "Munchi Khan",     recorded_at: "2026-05-22T08:50:00Z" },
  { id: "e29",  animal_id: "MSL-DNK-202605-001", event_type: "Transfer to Farm",   event_date: "2026-06-10", notes: "Arrived underweight at 90kg. Previous owner: Munchi Khan. Transfer condition: Underweight.", recorded_by: "Nasreen Mengal", previous_owner: "Munchi Khan", transfer_condition: "Underweight", transferred_to: "Central Farm", recorded_at: "2026-06-10T10:00:00Z" },
  { id: "e29b", animal_id: "MSL-DNK-202605-001", event_type: "Health Check",       event_date: "2026-06-10", notes: "Health check on arrival. Underweight at 90kg, BCS 1.5/5. Supplementary feeding plan prescribed. Approved for quarantine with monitoring.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-10T10:30:00Z" },
  { id: "e30",  animal_id: "MSL-DNK-202605-001", event_type: "Quarantine Started", event_date: "2026-06-10", notes: "Quarantine Block B. Monitoring weight and health.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-10T11:00:00Z" },
  { id: "e32", animal_id: "MSL-DNK-202605-001", event_type: "Quarantine Ended",        event_date: "2026-06-24", notes: "Weight improved to 97kg. Released from quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-24T09:00:00Z" },
  { id: "e33", animal_id: "MSL-DNK-202605-001", event_type: "Slaughter", event_date: "2026-06-28", notes: "Per management schedule. Live weight 97kg at dispatch.", recorded_by: "Imran Khan Baloch", transferred_to: "Quetta Slaughterhouse", recorded_at: "2026-06-28T07:00:00Z" },

  // Remaining animals — Birth Registered events only
  { id: "e34", animal_id: "SBC-DNK-202604-001", event_type: "Birth Registered", event_date: "2026-04-15", notes: "Reddish brown jenny foal. 19kg. Breeder: Zubair Bhagnari, CNIC: 42101-1122334-4. Color: Reddish Brown. Farm: Sibi Bhagnari Cattle Farm.", recorded_by: "Zubair Bhagnari",  recorded_at: "2026-04-15T09:35:00Z" },
  { id: "e35", animal_id: "HLF-DNK-202605-001", event_type: "Birth Registered", event_date: "2026-05-03", notes: "Grey jenny foal, calm temperament. 20kg. Breeder: Naseem Hub, CNIC: 43201-4455667-8. Color: Grey. Farm: Hub Livestock Farm.", recorded_by: "Naseem Hub",       recorded_at: "2026-05-03T10:05:00Z" },
  { id: "e36", animal_id: "NCD-DNK-202605-001", event_type: "Birth Registered", event_date: "2026-05-11", notes: "Brown jack foal. 21kg. Breeder: Salma Nizam, CNIC: 52101-3344556-9. Color: Brown. Farm: Nizam Cattle & Dairy Farm.", recorded_by: "Salma Nizam",      recorded_at: "2026-05-11T09:05:00Z" },
  { id: "e37", animal_id: "ISA-DNK-202605-001", event_type: "Birth Registered", event_date: "2026-05-01", notes: "Dark brown jack foal. 22kg. Breeder: Irfan Shahwani, CNIC: 44301-6677889-2. Color: Dark Brown. Farm: Irfan Shahwani Agro & Livestock.", recorded_by: "Irfan Shahwani",   recorded_at: "2026-05-01T07:20:00Z" },
  { id: "e38", animal_id: "ISA-DNK-202605-002", event_type: "Birth Registered", event_date: "2026-05-18", notes: "Black jenny foal. 19kg. Breeder: Rehana Shahwani, CNIC: 44301-7788990-6. Color: Black. Farm: Irfan Shahwani Agro & Livestock.", recorded_by: "Rehana Shahwani",  recorded_at: "2026-05-18T10:05:00Z" },
  { id: "e39", animal_id: "KLF-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-01", notes: "Brown & white jenny foal. 20kg. Breeder: Amina Karakhi, CNIC: 54501-8899001-3. Color: Brown & White. Farm: Karakh Livestock Farm.", recorded_by: "Amina Karakhi",    recorded_at: "2026-06-01T09:35:00Z" },
  { id: "e40", animal_id: "MSL-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-05", notes: "Light brown jenny foal. 21kg. Breeder: Rafiq Munchi, CNIC: 43401-5566778-1. Color: Light Brown. Farm: Munchi and Sons Livestock.", recorded_by: "Rafiq Munchi",     recorded_at: "2026-06-05T07:05:00Z" },
  { id: "e41", animal_id: "CCF-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-03", notes: "Grey jack foal. 23kg. Breeder: Raza Chiltan, CNIC: 54301-2211334-0. Color: Grey. Farm: Chiltan Cattle Farm, Quetta.", recorded_by: "Raza Chiltan",     recorded_at: "2026-06-03T10:05:00Z" },
  { id: "e42",  animal_id: "CCF-DNK-202606-001", event_type: "Transfer to Farm",   event_date: "2026-06-20", notes: "Transferred in good condition. Previous owner: Raza Chiltan.", recorded_by: "Nasreen Mengal", previous_owner: "Raza Chiltan", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Quetta", recorded_at: "2026-06-20T10:00:00Z" },
  { id: "e42b", animal_id: "CCF-DNK-202606-001", event_type: "Health Check",       event_date: "2026-06-20", notes: "Health check on arrival. Weight 105kg. Temperature normal. No abnormalities detected. Cleared for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-20T10:30:00Z" },
  { id: "e43",  animal_id: "CCF-DNK-202606-001", event_type: "Quarantine Started", event_date: "2026-06-20", notes: "Quarantine started. Block A assigned.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-20T11:00:00Z" },
  { id: "e44", animal_id: "CCF-DNK-202606-002", event_type: "Birth Registered", event_date: "2026-06-10", notes: "Dark grey jenny foal. 20kg. Breeder: Zainab Chiltan, CNIC: 54301-3322115-6. Color: Dark Grey. Farm: Chiltan Cattle Farm.", recorded_by: "Zainab Chiltan",   recorded_at: "2026-06-10T09:05:00Z" },
  { id: "e45",  animal_id: "CCF-DNK-202606-002", event_type: "Transfer to Farm",   event_date: "2026-06-25", notes: "Good arrival condition. Previous owner: Zainab Chiltan.", recorded_by: "Nasreen Mengal", previous_owner: "Zainab Chiltan", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Quetta", recorded_at: "2026-06-25T10:00:00Z" },
  { id: "e45b", animal_id: "CCF-DNK-202606-002", event_type: "Health Check",       event_date: "2026-06-25", notes: "Health check completed. Weight 100kg. BCS 3/5. No signs of disease. Cleared for quarantine placement.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-25T10:30:00Z" },
  { id: "e46",  animal_id: "CCF-DNK-202606-002", event_type: "Quarantine Started", event_date: "2026-06-25", notes: "Quarantine Block B assigned.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-25T11:00:00Z" },
  { id: "e47", animal_id: "CCF-DNK-202606-002", event_type: "Quarantine Ended",    event_date: "2026-06-28", notes: "Cleared all checks. Released.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-28T09:00:00Z" },
  { id: "e48", animal_id: "SRL-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-08", notes: "Brown jack foal. 22kg. Breeder: Sardar Bugti, CNIC: 43501-9988776-2. Color: Brown. Farm: Suleiman Range Livestock, Dera Bugti.", recorded_by: "Sardar Bugti",     recorded_at: "2026-06-08T08:05:00Z" },
  { id: "e49", animal_id: "BPP-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-12", notes: "Black & grey jenny foal. 19kg. Breeder: Ghulam Bolan, CNIC: 54601-1122334-7. Color: Black & Grey. Farm: Bolan Pass Pastures.", recorded_by: "Ghulam Bolan",     recorded_at: "2026-06-12T07:35:00Z" },
  { id: "e50", animal_id: "BPP-DNK-202606-002", event_type: "Birth Registered", event_date: "2026-06-18", notes: "Light grey jack foal. 21kg. Breeder: Kiran Bolan, CNIC: 54601-2233445-9. Color: Light Grey. Farm: Bolan Pass Pastures.", recorded_by: "Kiran Bolan",      recorded_at: "2026-06-18T09:05:00Z" },
  { id: "e51", animal_id: "BPP-DNK-202606-002", event_type: "Transfer to Farm",  event_date: "2026-06-28", notes: "Transferred in good condition. Previous owner: Kiran Bolan.", recorded_by: "Nasreen Mengal", previous_owner: "Kiran Bolan", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Bolan", recorded_at: "2026-06-28T10:00:00Z" },
  { id: "e52", animal_id: "HOD-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-14", notes: "Cream white jack foal. 22kg. Breeder: Hamid Hingol, CNIC: 43101-8877665-4. Color: Cream White. Farm: Hingol Organic Dairy, Lasbela.", recorded_by: "Hamid Hingol",     recorded_at: "2026-06-14T08:05:00Z" },
  { id: "e53", animal_id: "MCD-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-16", notes: "Brown jenny foal. 20kg. Breeder: Sardar Mehergarh, CNIC: 54601-6655443-1. Color: Brown. Farm: Mehergarh Cattle & Dairy, Bolan.", recorded_by: "Sardar Mehergarh", recorded_at: "2026-06-16T09:35:00Z" },
  { id: "e54",  animal_id: "MCD-DNK-202606-001", event_type: "Transfer to Farm",   event_date: "2026-06-27", notes: "Good condition on arrival. Previous owner: Sardar Mehergarh.", recorded_by: "Nasreen Mengal", previous_owner: "Sardar Mehergarh", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm", recorded_at: "2026-06-27T10:00:00Z" },
  { id: "e54b", animal_id: "MCD-DNK-202606-001", event_type: "Health Check",       event_date: "2026-06-27", notes: "Arrival health check. Weight 103kg. Temperature 38.1°C. No abnormalities. Approved for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-27T10:30:00Z" },
  { id: "e55",  animal_id: "MCD-DNK-202606-001", event_type: "Quarantine Started", event_date: "2026-06-27", notes: "Quarantine started. Block A assigned.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-27T11:00:00Z" },
  { id: "e56", animal_id: "MCD-DNK-202606-001", event_type: "Quarantine Ended",    event_date: "2026-06-28", notes: "Cleared all tests. Released.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-28T09:00:00Z" },
  { id: "e57", animal_id: "SBB-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-20", notes: "Dark brown jack foal. 23kg. Breeder: Muhammad Sibi, CNIC: 42101-7766554-8. Color: Dark Brown. Farm: Sibi Bull Breeders.", recorded_by: "Muhammad Sibi",    recorded_at: "2026-06-20T07:05:00Z" },
  { id: "e58", animal_id: "SBB-DNK-202606-002", event_type: "Birth Registered", event_date: "2026-06-22", notes: "Grey jenny foal. 20kg. Breeder: Aisha Sibi, CNIC: 42101-8877665-5. Color: Grey. Farm: Sibi Bull Breeders.", recorded_by: "Aisha Sibi",       recorded_at: "2026-06-22T08:05:00Z" },
  { id: "e59",  animal_id: "SBB-DNK-202606-002", event_type: "Transfer to Farm",   event_date: "2026-06-28", notes: "Transferred in good condition. Previous owner: Aisha Sibi.", recorded_by: "Nasreen Mengal", previous_owner: "Aisha Sibi", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Sibi", recorded_at: "2026-06-28T10:00:00Z" },
  { id: "e59b", animal_id: "SBB-DNK-202606-002", event_type: "Health Check",       event_date: "2026-06-28", notes: "Health check completed post-transfer. Weight 97kg. No signs of stress or illness. Cleared for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-28T10:30:00Z" },
  { id: "e60",  animal_id: "SBB-DNK-202606-002", event_type: "Quarantine Started", event_date: "2026-06-28", notes: "Quarantine started. Block A.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-28T11:00:00Z" },
  { id: "e61", animal_id: "RBF-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-24", notes: "Black jack foal. 22kg. Breeder: Raja Bhagnari, CNIC: 42101-5544332-9. Color: Black. Farm: Royal Bhagnari Farms, Sibi.", recorded_by: "Raja Bhagnari",    recorded_at: "2026-06-24T09:05:00Z" },
  { id: "e62", animal_id: "LCB-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-15", notes: "Tan jenny foal. 19kg. Breeder: Haji Lohani, CNIC: 44201-3344556-6. Color: Tan. Farm: Lohani Cattle Breeders, Loralai.", recorded_by: "Haji Lohani",      recorded_at: "2026-06-15T08:35:00Z" },
  { id: "e63", animal_id: "LCB-DNK-202606-001", event_type: "Transfer to Farm",  event_date: "2026-06-28", notes: "Transferred in good health. Previous owner: Haji Lohani.", recorded_by: "Nasreen Mengal", previous_owner: "Haji Lohani", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm", recorded_at: "2026-06-28T10:00:00Z" },
  { id: "e64", animal_id: "BHL-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-17", notes: "Grey & brown jack foal. 21kg. Breeder: Sardar Baloch, CNIC: 54201-1133224-0. Color: Grey & Brown. Farm: Baloch Heritage Livestock, Kalat.", recorded_by: "Sardar Baloch",    recorded_at: "2026-06-17T07:05:00Z" },
  { id: "e65", animal_id: "PBL-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-19", notes: "White & grey jenny foal. 20kg. Breeder: Pak Baloch CEO, CNIC: 54301-4455667-7. Color: White & Grey. Farm: Pak-Baloch Livestock Enterprise, Quetta.", recorded_by: "Pak Baloch CEO",   recorded_at: "2026-06-19T09:05:00Z" },
  { id: "e66",  animal_id: "PBL-DNK-202606-001", event_type: "Transfer to Farm",   event_date: "2026-06-27", notes: "Good condition. Previous owner: Pak Baloch CEO.", recorded_by: "Nasreen Mengal", previous_owner: "Pak Baloch CEO", transfer_condition: "Healthy - Good condition", transferred_to: "Central Farm, Quetta", recorded_at: "2026-06-27T10:00:00Z" },
  { id: "e66b", animal_id: "PBL-DNK-202606-001", event_type: "Health Check",       event_date: "2026-06-27", notes: "Health check on arrival. Weight 101kg. Vitals within normal range. No injuries. Cleared for quarantine.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-27T10:30:00Z" },
  { id: "e67",  animal_id: "PBL-DNK-202606-001", event_type: "Quarantine Started", event_date: "2026-06-27", notes: "Quarantine started. Block A.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-27T11:00:00Z" },
  { id: "e68", animal_id: "PBL-DNK-202606-001", event_type: "Quarantine Ended",    event_date: "2026-06-28", notes: "Cleared all checks. Released.", recorded_by: "Dr. Waqar Rind", recorded_at: "2026-06-28T09:00:00Z" },
  { id: "e69", animal_id: "KSD-DNK-202606-001", event_type: "Birth Registered", event_date: "2026-06-21", notes: "Brown jack foal. 22kg. Breeder: Suleiman Khan, CNIC: 43501-6677889-3. Color: Brown. Farm: Koh-e-Suleiman Dairy Farm, Dera Bugti.", recorded_by: "Suleiman Khan",    recorded_at: "2026-06-21T08:05:00Z" },
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

const DATA_VERSION = "v12"; // bump to force re-seed when schema changes

function useDataService() {
  const [animals, setAnimals] = useState<Animal[]>(() => {
    if (loadFromStorage("mcf_data_version", "") !== DATA_VERSION) {
      saveToStorage("mcf_data_version", DATA_VERSION);
      saveToStorage("mcf_animals", SEED_ANIMALS);
      saveToStorage("mcf_events", SEED_EVENTS);
      saveToStorage("mcf_farms", SEED_FARMS);
      return SEED_ANIMALS;
    }
    return loadFromStorage("mcf_animals", SEED_ANIMALS);
  });
  const [events, setEvents] = useState<AnimalEvent[]>(() =>
    loadFromStorage("mcf_events", SEED_EVENTS)
  );
  const [farms, setFarms] = useState<RegisteredFarm[]>(() =>
    loadFromStorage("mcf_farms", SEED_FARMS)
  );
  useEffect(() => { saveToStorage("mcf_farms", farms); }, [farms]);

  const addFarm = useCallback((farm: Omit<RegisteredFarm, "id" | "created_at">) => {
    const code = farm.code || farmCodeFromName(farm.name);
    const newFarm: RegisteredFarm = { ...farm, code, id: `FARM-${Date.now()}`, created_at: new Date().toISOString() };
    setFarms(prev => [newFarm, ...prev]);
    return newFarm;
  }, []);

  const deleteFarm = useCallback((id: string) => {
    setFarms(prev => prev.filter(f => f.id !== id));
  }, []);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    saveToStorage("mcf_animals", animals);
  }, [animals]);
  useEffect(() => {
    saveToStorage("mcf_events", events);
  }, [events]);

  // Counters per farm+month for ID generation
  const getNextCounter = useCallback((farmCode: string, yyyymm: string) => {
    const prefix = `${farmCode}-DNK-${yyyymm}-`;
    const existing = animals
      .filter(a => a.id.startsWith(prefix))
      .map(a => parseInt(a.id.split("-").pop() || "0", 10));
    return (existing.length > 0 ? Math.max(...existing) : 0) + 1;
  }, [animals]);

  const addAnimal = useCallback((animal: Omit<Animal, "id" | "created_at">, farmList?: RegisteredFarm[]) => {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const farm = (farmList || []).find(f => f.name === animal.registered_farm);
    const farmCode = farm?.code || farmCodeFromName(animal.registered_farm || "TRK");
    const counter = getNextCounter(farmCode, yyyymm);
    const id = `${farmCode}-DNK-${yyyymm}-${String(counter).padStart(3, "0")}`;
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
      "Transfer to Farm":  "Transferred to Farm",
      "Health Check":      "Health Checked",
      "Quarantine Started":"In Quarantine",
      "Quarantine Ended":  "Cleared at Farm",
      "Slaughter":         "Sent to Slaughterhouse",
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
          event_type: "Health Check",
          event_date: now.toISOString().split("T")[0],
          notes: `Status updated: ${a.status} → ${changes.status}`,
          recorded_by: recordedBy || "System",
          recorded_at: now.toISOString(),
        }, ...evts]);
      }
      return updated;
    }));
  }, []);

  const addAnimalWithFarms = useCallback((animal: Omit<Animal, "id" | "created_at">) => addAnimal(animal, farms), [addAnimal, farms]);
  return { animals, events, farms, addAnimal: addAnimalWithFarms, addEvent, updateAnimal, getAnimalEvents, addFarm, deleteFarm, isOnline, setIsOnline };
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
              { label: "Breeder (Owner)", value: animal.breeder_name },
              { label: "Breeder CNIC",    value: animal.breeder_cnic || "—" },
              { label: "Registered Farm", value: animal.registered_farm || "—" },
              { label: "Birth Date",      value: formatDate(animal.birth_date) },
              { label: "Birth Location",  value: animal.birth_location },
              { label: "Color",           value: animal.color },
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
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const nextStatus = NEXT_STATUS[status];

  const downloadQR = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#event-qr-canvas canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${animalId}-event-qr.png`;
    a.click();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addEvent({ animal_id: animalId, event_type: eventType, event_date: date, notes, recorded_at: new Date().toISOString() });
    setSaved(true);
  };

  if (saved) {
    return (
      <div className="px-4 py-5 flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-100">
          <CheckCircle2 size={24} className="text-green-600" />
        </div>
        <div className="text-center">
          <p className="font-bold text-foreground text-sm" style={{ fontFamily: "Montserrat, sans-serif" }}>Event Saved!</p>
          <p className="text-xs text-muted-foreground mt-0.5">{eventType} · {date}</p>
        </div>

        <div id="event-qr-canvas" className="flex flex-col items-center gap-3">
          <div className="p-3 bg-white border-2 border-border rounded-xl shadow-sm">
            <QRCodeCanvas value={animalId} size={180} level="H" includeMargin={false} />
          </div>
          <p className="font-mono text-xs text-center bg-muted px-3 py-1.5 rounded-lg text-foreground">{animalId}</p>
          <p className="text-[11px] text-muted-foreground text-center">Scan to view this animal's full trace history</p>
        </div>

        <div className="flex gap-2 w-full">
          <button onClick={downloadQR}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <Download size={15} /> Download
          </button>
          <button onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            <Printer size={15} /> Print
          </button>
        </div>

        <button onClick={onDone}
          className="w-full py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
          Done
        </button>
      </div>
    );
  }

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
        <label className="text-xs font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Notes</label>
        <input className={cn(inputCls, "mt-1")} placeholder="Optional observations…"
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
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
    { status: "Transferred to Farm", icon: ArrowRightLeft, gradient: "var(--gradient-primary)", sub: "En route to farm" },
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
      <div className="md:hidden px-4 pt-4 pb-6 farm-bg-pattern-light" style={{ background: "var(--gradient-primary)" }}>
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center bg-white rounded-xl px-3 py-2 shadow-md">
            <img src="/logo.png" alt="Track Now" className="h-8 w-auto object-contain" />
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

        {/* Merged: Total Donkeys + Lifecycle Workflow */}
        <div className="rounded-2xl overflow-hidden shadow-md" style={{ background: "var(--gradient-primary)" }}>
          {/* Top: total count */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <span className="text-xl">🫏</span>
              </div>
              <div>
                <p className="text-[11px] text-white/60 uppercase tracking-widest" style={{ fontFamily: "Montserrat, sans-serif" }}>Total Donkeys</p>
                <p className="text-2xl font-bold text-white leading-none" style={{ fontFamily: "Montserrat, sans-serif" }}>{stats.total}</p>
              </div>
            </div>
            <p className="text-[10px] text-white/40 text-right">Registered<br/>in system</p>
          </div>
          {/* Divider */}
          <div className="mx-4 h-px bg-white/10" />
          {/* Bottom: workflow pills */}
          <div className="flex gap-1.5 px-3 py-3 overflow-x-auto scrollbar-hide">
            {WORKFLOW_STEPS.map(({ status, icon: Icon, gradient }, i) => (
              <div key={status} className="flex items-center flex-shrink-0">
                <button onClick={() => onStatusClick(status)}
                  className="flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[62px] hover:opacity-90 active:scale-95 transition-all"
                  style={{ background: gradient }}>
                  <p className="text-base font-bold text-white leading-none" style={{ fontFamily: "Montserrat, sans-serif" }}>{workflowCounts[status] || 0}</p>
                  <p className="text-[9px] text-white/80 mt-0.5 text-center leading-tight whitespace-nowrap">{STATUS_META[status].label}</p>
                </button>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-white/25 mx-0.5 flex-shrink-0" />
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

function RegisterAnimal({ addAnimal, updateAnimal, recordedBy, farms }: {
  farms: RegisteredFarm[];
  addAnimal: ReturnType<typeof useDataService>["addAnimal"];
  updateAnimal: ReturnType<typeof useDataService>["updateAnimal"];
  recordedBy: string;
}) {
  const [species] = useState<Species>("donkey");
  const [form, setForm] = useState({
    breeder_name: "",
    breeder_cnic: "",
    registered_farm: "",
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
    setForm({ breeder_name: "", breeder_cnic: "", registered_farm: "", birth_date: new Date().toISOString().split("T")[0], birth_location: "", birth_lat: undefined, birth_lng: undefined, gender: "Male", color: "", notes: "" });
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
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  onChange={e => setEditForm(f => f && ({ ...f, breeder_name: e.target.value }))} />
              </InputField>
              <InputField label="Breeder Location / Village">
                <input className={inputCls} value={editForm.birth_location}
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  onChange={e => setEditForm(f => f && ({ ...f, birth_location: e.target.value }))} />
              </InputField>
              <InputField label="Color / Markings">
                <input className={inputCls} value={editForm.color}
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  onChange={e => setEditForm(f => f && ({ ...f, color: e.target.value }))} />
              </InputField>
              <InputField label="Notes">
                <textarea className={cn(inputCls, "resize-none min-h-[70px]")} rows={2}
                  autoComplete="off" spellCheck={false}
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
        <InputField label="Breeder Name (Owner)" required>
          <input className={inputCls} placeholder="e.g. Muhammad Saleem" required
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            value={form.breeder_name} onChange={e => setForm(f => ({ ...f, breeder_name: e.target.value }))} />
        </InputField>

        <InputField label="Breeder CNIC">
          <input className={inputCls} placeholder="XXXXX-XXXXXXX-X" maxLength={15}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} inputMode="numeric"
            value={form.breeder_cnic} onChange={e => setForm(f => ({ ...f, breeder_cnic: maskCnic(e.target.value) }))} />
        </InputField>

        <InputField label="Registered Farm">
          <select className={inputCls} value={form.registered_farm}
            onChange={e => setForm(f => ({ ...f, registered_farm: e.target.value }))}>
            <option value="">— Select a farm —</option>
            {farms.map(farm => (
              <option key={farm.id} value={farm.name}>{farm.name}</option>
            ))}
          </select>
          {farms.length === 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">No farms registered yet. Ask your administrator to add farms first.</p>
          )}
        </InputField>

        <InputField label="Birth Date" required>
          <input type="date" className={inputCls} required
            value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
        </InputField>

        <InputField label="Breeder Location / Village" required>
          <input className={inputCls} placeholder="e.g. Turbat, Kech District" required
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
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
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
        </InputField>

        <InputField label="Notes (Optional)">
          <textarea className={cn(inputCls, "resize-none min-h-[80px]")} rows={3}
            placeholder="Any observations at birth…" autoComplete="off" spellCheck={false}
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

// Workflow stages in display order
const WORKFLOW_STAGES: EventType[] = [
  "Birth Registered",
  "Transfer to Farm",
  "Health Check",
  "Quarantine Started",
  "Quarantine Ended",
  "Slaughter",
];

function ActivitiesFeed({ animals, events, onAnimalClick }: {
  animals: Animal[]; events: AnimalEvent[]; onAnimalClick: (a: Animal) => void;
}) {
  const [stageFilter, setStageFilter] = useState<EventType | "all">("all");

  const animalById = useMemo(() => {
    const map = new Map<string, Animal>();
    animals.forEach(a => map.set(a.id, a));
    return map;
  }, [animals]);

  // Group events by their event_type (workflow stage), newest first within each group
  const groupsByStage = useMemo(() => {
    const map = new Map<EventType, AnimalEvent[]>();
    events.forEach(evt => {
      if (!WORKFLOW_STAGES.includes(evt.event_type as EventType)) return;
      if (!map.has(evt.event_type as EventType)) map.set(evt.event_type as EventType, []);
      map.get(evt.event_type as EventType)!.push(evt);
    });
    map.forEach(list => list.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()));
    return WORKFLOW_STAGES
      .filter(stage => map.has(stage) && (stageFilter === "all" || stageFilter === stage))
      .map(stage => ({ stage, evts: map.get(stage)! }));
  }, [events, stageFilter]);

  const presentStages = useMemo(() => {
    const s = new Set(events.map(e => e.event_type));
    return WORKFLOW_STAGES.filter(stage => s.has(stage));
  }, [events]);

  return (
    <div>
      <div className="px-4 pt-5 pb-4 md:hidden" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Activities</h1>
        <p className="text-white/60 text-xs mt-0.5">Events grouped by lifecycle stage</p>
      </div>
      <div className="hidden md:block px-6 pt-6 pb-2">
        <h1 className="text-foreground text-xl font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Activities</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Events grouped by lifecycle stage</p>
      </div>

      {/* Stage filter pills */}
      <div className="flex gap-2 px-4 md:px-6 py-3 overflow-x-auto scrollbar-hide border-b border-border">
        <button
          onClick={() => setStageFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0",
            stageFilter === "all" ? "text-white" : "bg-white border border-border text-foreground hover:bg-muted"
          )}
          style={{ fontFamily: "Montserrat, sans-serif", background: stageFilter === "all" ? "var(--gradient-primary)" : undefined }}>
          All ({events.length})
        </button>
        {presentStages.map(stage => {
          const em = EVENT_META[stage];
          const Icon = em.icon;
          const count = events.filter(e => e.event_type === stage).length;
          const active = stageFilter === stage;
          return (
            <button key={stage}
              onClick={() => setStageFilter(active ? "all" : stage)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 border",
                active ? "text-white border-transparent" : "bg-white border-border text-foreground hover:bg-muted"
              )}
              style={{
                fontFamily: "Montserrat, sans-serif",
                background: active ? em.color : undefined,
              }}>
              <Icon size={11} />
              {stage} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 md:px-6 py-3 pb-8 space-y-6">
        {groupsByStage.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No activity yet</div>
        )}
        {groupsByStage.map(({ stage, evts }) => {
          const em = EVENT_META[stage];
          const Icon = em.icon;
          const stepNum = WORKFLOW_STAGES.indexOf(stage) + 1;
          return (
            <div key={stage}>
              {/* Stage header */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: em.color + "20" }}>
                  <Icon size={14} style={{ color: em.color }} />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                    style={{ backgroundColor: em.color, fontFamily: "Montserrat, sans-serif" }}>
                    STEP {stepNum}
                  </span>
                  <h2 className="text-sm font-bold text-foreground truncate" style={{ fontFamily: "Montserrat, sans-serif" }}>
                    {stage}
                  </h2>
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ fontFamily: "Montserrat, sans-serif" }}>
                    {evts.length}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-0">
                {evts.map(evt => {
                  const animal = animalById.get(evt.animal_id);
                  if (!animal) return null;
                  return (
                    <Card key={evt.id} onClick={() => onAnimalClick(animal)} className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: em.color + "18" }}>
                        <Icon size={16} style={{ color: em.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-foreground truncate" style={{ fontFamily: "Montserrat, sans-serif" }}>
                            {animal.id}
                          </p>
                          <p className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatDate(evt.event_date)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {animal.breeder_name} · {animal.gender === "Male" ? "Jack" : "Jenny"} · {animal.color}
                        </p>
                        <p className="text-xs text-accent font-semibold flex items-center gap-1 mt-0.5">
                          <User size={11} /> {evt.recorded_by}
                        </p>
                        {evt.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 italic">"{evt.notes}"</p>
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
      {/* Mobile layout */}
      <div className="flex flex-col md:hidden">
      {/* Hero header */}
      <div className="flex-shrink-0 px-6 pt-10 pb-10 text-white relative overflow-hidden farm-bg-pattern-light"
        style={{ background: "var(--gradient-primary)" }}>
        {/* Decorative rings */}
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full border border-white/10" />
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full border border-white/10" />
        <div className="absolute right-6 top-6 w-16 h-16 rounded-full bg-white/5" />

        <div className="relative">
          <div className="inline-flex items-center bg-white rounded-xl px-4 py-2.5 shadow-md mb-5">
            <img src="/logo.png" alt="Track Now" className="h-9 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>
            Welcome back
          </h1>
          <p className="text-white/70 text-sm mt-1">
            Sign in to your traceability dashboard
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
          Track Now · v1.0
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

          <p className="relative text-white/40 text-xs">Track Now · v1.0</p>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto md:max-h-screen">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="inline-flex items-center border border-border rounded-2xl px-5 py-3 shadow-sm bg-white">
                <img src="/logo.png" alt="Track Now" className="h-11 w-auto object-contain" />
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
              Track Now · v1.0
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

        {/* Quick links */}
        <div className="space-y-2">
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
          {user.role === "administrator" && (
            <button onClick={() => navigate("/farms")}
              className="w-full flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3.5 hover:shadow-md transition-shadow text-left">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--gradient-primary)" }}>
                <Building2 size={18} className="text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Registered Farms</p>
                <p className="text-xs text-muted-foreground">Manage breeder farms and owners</p>
              </div>
              <ChevronRight2 size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          )}
        </div>

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
            <p className="text-xs text-muted-foreground">Track Now · v1.0</p>
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
  "/farms":       "farms",
  "/profile":     "profile",
};
const TAB_TO_ROUTE: Record<Tab, string> = {
  dashboard:  "/dashboard",
  register:   "/register",
  activities: "/activities",
  search:     "/scan",
  reports:    "/reports",
  farms:      "/farms",
  profile:    "/profile",
};

// Nav layout: Home | Activities | [+FAB] | Scan | Reports | Profile
const LEFT_NAV:  { tab: Tab; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { tab: "dashboard",   path: "/dashboard",   icon: LayoutDashboard, label: "Home" },
  { tab: "activities",  path: "/activities",  icon: ClipboardList,  label: "Activities" },
];
const RIGHT_NAV: { tab: Tab; path: string; icon: typeof LayoutDashboard; label: string }[] = [
  { tab: "search",  path: "/scan",    icon: Search, label: "Scan" },
  { tab: "profile", path: "/profile", icon: Users,  label: "More" },
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

// ─── Farms Management Page ────────────────────────────────────────────────────

// ─── Location Search (OpenStreetMap Nominatim) ───────────────────────────────

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

function LocationSearch({ value, onChange }: {
  value: string;
  onChange: (loc: { label: string; lat: number; lng: number }) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.length < 3) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(true);
      } catch { /* network error — silently ignore */ }
      finally { setLoading(false); }
    }, 500);
  };

  const select = (r: NominatimResult) => {
    const label = r.display_name;
    setQuery(label);
    setResults([]);
    setOpen(false);
    onChange({ label, lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          className={cn(inputCls, "pl-8 pr-8")}
          placeholder="Search address or place…"
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {results.map(r => (
            <button key={r.place_id} type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-muted border-b border-border last:border-0 transition-colors"
              onClick={() => select(r)}>
              <p className="text-xs font-medium text-foreground line-clamp-1">{r.display_name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FarmsManagement({ animals }: { animals: Animal[] }) {
  const { farms, addFarm, deleteFarm, addAnimal } = useData();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", lat: undefined as number | undefined, lng: undefined as number | undefined, owner_name: "", owner_cnic: "", phone: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selectedFarm, setSelectedFarm] = useState<RegisteredFarm | null>(null);
  const [showMapEmbed, setShowMapEmbed] = useState(false);
  const [showRegisterDonkey, setShowRegisterDonkey] = useState(false);
  const [donkeyForm, setDonkeyForm] = useState({ birth_date: "", breeder_name: "", breeder_cnic: "", birth_location: "", gender: "Male" as "Male" | "Female", color: "", notes: "" });
  const [importError, setImportError] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.owner_name) return;
    addFarm(form);
    setForm({ name: "", location: "", lat: undefined, lng: undefined, owner_name: "", owner_cnic: "", phone: "" });
    setShowForm(false);
  };

  // ── Farm Detail View ──────────────────────────────────────────────────────
  if (selectedFarm) {
    const farmAnimals = animals.filter(a => a.registered_farm === selectedFarm.name);
    const uniqueBreeders = Array.from(new Set(farmAnimals.map(a => a.breeder_name)));
    const statusCounts = farmAnimals.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {} as Record<string, number>);
    const mapsUrl = selectedFarm.lat ? `https://www.google.com/maps?q=${selectedFarm.lat},${selectedFarm.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedFarm.location)}`;
    const embedUrl = selectedFarm.lat ? `https://maps.google.com/maps?q=${selectedFarm.lat},${selectedFarm.lng}&z=14&output=embed` : `https://maps.google.com/maps?q=${encodeURIComponent(selectedFarm.location)}&z=14&output=embed`;

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
      setImportError("");
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length < 2) { setImportError("File has no data rows."); return; }
          const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
          let imported = 0;
          for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(",").map(v => v.trim());
            const get = (key: string) => vals[headers.indexOf(key)] || "";
            const birth_date = get("birth_date") || get("dob");
            const breeder_name = get("breeder_name") || get("breeder");
            const gender = (get("gender") || "Male") as "Male" | "Female";
            const color = get("color") || "Grey";
            if (!birth_date || !breeder_name) continue;
            addAnimal({
              species: "donkey", birth_date, breeder_name,
              breeder_cnic: get("breeder_cnic") || get("cnic"),
              registered_farm: selectedFarm.name,
              birth_location: get("birth_location") || get("location") || selectedFarm.location,
              gender, color, status: "Registered at Breeder's Farm",
              notes: get("notes"),
            });
            imported++;
          }
          if (imported === 0) setImportError("No valid rows found. Check column names.");
          else { setImportError(""); alert(`✅ ${imported} donkey(s) imported successfully!`); }
        } catch { setImportError("Failed to parse file. Ensure it's a valid CSV."); }
      };
      reader.readAsText(file);
      e.target.value = "";
    };

    const downloadSampleCSV = () => {
      const csv = `birth_date,breeder_name,breeder_cnic,gender,color,birth_location,notes\n2026-06-01,Muhammad Ali,54301-1234567-1,Male,Grey,Quetta Balochistan,Healthy foal\n2026-06-05,Fatima Baloch,54301-7654321-2,Female,Brown,Sibi Balochistan,`;
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "donkey_import_sample.csv";
      a.click();
    };

    const handleRegisterDonkey = (e: React.FormEvent) => {
      e.preventDefault();
      if (!donkeyForm.birth_date || !donkeyForm.breeder_name || !donkeyForm.color) return;
      addAnimal({
        species: "donkey",
        birth_date: donkeyForm.birth_date,
        breeder_name: donkeyForm.breeder_name,
        breeder_cnic: donkeyForm.breeder_cnic,
        registered_farm: selectedFarm.name,
        birth_location: donkeyForm.birth_location || selectedFarm.location,
        gender: donkeyForm.gender,
        color: donkeyForm.color,
        status: "Registered at Breeder's Farm",
        notes: donkeyForm.notes,
      });
      setDonkeyForm({ birth_date: "", breeder_name: "", breeder_cnic: "", birth_location: "", gender: "Male", color: "", notes: "" });
      setShowRegisterDonkey(false);
    };

    return (
      <div>
        {/* Detail header */}
        <div className="px-4 md:px-6 pt-5 pb-4 text-white" style={{ background: "var(--gradient-primary)" }}>
          <button onClick={() => { setSelectedFarm(null); setShowMapEmbed(false); setShowRegisterDonkey(false); }}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs mb-3 transition-colors">
            <ChevronLeft size={14} /> Back to Farms
          </button>
          <div className="flex items-start gap-3">
            <span className="text-3xl">🏡</span>
            <div>
              <h1 className="text-white text-lg font-bold leading-tight" style={{ fontFamily: "Montserrat, sans-serif" }}>{selectedFarm.name}</h1>
              <p className="text-white/60 text-xs mt-0.5 flex items-center gap-1"><MapPin size={11} />{selectedFarm.location || "Location not set"}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <div className="px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5"><span>🫏</span> {farmAnimals.length} Donkeys</div>
            <div className="px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5"><Users size={12} /> {uniqueBreeders.length} Breeders</div>
            <div className="px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold">Code: {selectedFarm.code}</div>
          </div>
        </div>

        <div className="px-4 md:px-6 py-4 space-y-4">

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setShowRegisterDonkey(true); setShowMapEmbed(false); }}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              style={{ background: "var(--gradient-brand)", fontFamily: "Montserrat, sans-serif" }}>
              <Plus size={15} /> Register Donkey
            </button>
            <label className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors cursor-pointer"
              style={{ fontFamily: "Montserrat, sans-serif" }}>
              <Download size={15} /> Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
            </label>
          </div>
          {importError && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{importError}</p>}
          <button onClick={downloadSampleCSV}
            className="text-xs text-accent underline underline-offset-2 hover:opacity-70 transition-opacity"
            style={{ fontFamily: "Montserrat, sans-serif" }}>
            Download sample CSV template
          </button>

          {/* Register donkey inline form */}
          {showRegisterDonkey && (
            <div className="bg-white rounded-xl border border-border shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide" style={{ fontFamily: "Montserrat, sans-serif" }}>Register New Donkey</p>
                <button onClick={() => setShowRegisterDonkey(false)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">Farm: <span className="font-semibold text-foreground">{selectedFarm.name}</span></p>
              <form onSubmit={handleRegisterDonkey} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Date of Birth *</label>
                    <input type="date" className={cn(inputCls, "mt-1")} required value={donkeyForm.birth_date} onChange={e => setDonkeyForm(f => ({ ...f, birth_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Gender *</label>
                    <select className={cn(inputCls, "mt-1")} value={donkeyForm.gender} onChange={e => setDonkeyForm(f => ({ ...f, gender: e.target.value as "Male" | "Female" }))}>
                      <option value="Male">Male (Jack)</option>
                      <option value="Female">Female (Jenny)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Breeder Name *</label>
                  <input className={cn(inputCls, "mt-1")} placeholder="Full name of breeder" required
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={donkeyForm.breeder_name} onChange={e => setDonkeyForm(f => ({ ...f, breeder_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Breeder CNIC</label>
                  <input className={cn(inputCls, "mt-1")} placeholder="XXXXX-XXXXXXX-X" maxLength={15}
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} inputMode="numeric"
                    value={donkeyForm.breeder_cnic} onChange={e => setDonkeyForm(f => ({ ...f, breeder_cnic: maskCnic(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Color *</label>
                  <input className={cn(inputCls, "mt-1")} placeholder="e.g. Grey, Brown, Black & White" required
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={donkeyForm.color} onChange={e => setDonkeyForm(f => ({ ...f, color: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Birth Location</label>
                  <input className={cn(inputCls, "mt-1")} placeholder={selectedFarm.location || "City, Region"}
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={donkeyForm.birth_location} onChange={e => setDonkeyForm(f => ({ ...f, birth_location: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>Notes</label>
                  <input className={cn(inputCls, "mt-1")} placeholder="Optional observations"
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={donkeyForm.notes} onChange={e => setDonkeyForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <button type="submit" className="w-full py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
                  Save Donkey
                </button>
              </form>
            </div>
          )}

          {/* Farm info card */}
          <div className="bg-white rounded-xl border border-border shadow-sm p-4">
            <p className="text-xs font-bold text-foreground uppercase tracking-wide mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>Farm Details</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><span className="text-muted-foreground">Owner</span><p className="font-semibold text-foreground mt-0.5">{selectedFarm.owner_name}</p></div>
              {selectedFarm.owner_cnic && <div><span className="text-muted-foreground">CNIC</span><p className="font-mono font-semibold text-foreground mt-0.5">{selectedFarm.owner_cnic}</p></div>}
              {selectedFarm.phone && <div><span className="text-muted-foreground">Phone</span><p className="font-semibold text-foreground mt-0.5">{selectedFarm.phone}</p></div>}
            </div>

            {/* Location / directions */}
            {(selectedFarm.lat || selectedFarm.location) && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Location</p>
                  <div className="flex gap-2">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80 transition-opacity">
                      <MapPin size={12} /> Get Directions
                    </a>
                    <button onClick={() => setShowMapEmbed(v => !v)}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      {showMapEmbed ? "Hide Map" : "Show Map"}
                    </button>
                  </div>
                </div>
                {selectedFarm.lat && (
                  <p className="font-mono text-[11px] text-muted-foreground">{selectedFarm.lat.toFixed(5)}, {selectedFarm.lng?.toFixed(5)}</p>
                )}
                {showMapEmbed && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-border" style={{ height: 220 }}>
                    <iframe
                      src={embedUrl}
                      width="100%" height="220" style={{ border: 0 }}
                      allowFullScreen loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Farm Location"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status breakdown */}
          {farmAnimals.length > 0 && (
            <div className="bg-white rounded-xl border border-border shadow-sm p-4">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide mb-3" style={{ fontFamily: "Montserrat, sans-serif" }}>Status Breakdown</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-xs font-semibold">
                    <span className="text-foreground">{count}</span>
                    <span className="text-muted-foreground">{status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Donkeys list — clickable cards */}
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide" style={{ fontFamily: "Montserrat, sans-serif" }}>Registered Donkeys</p>
              <span className="text-xs text-muted-foreground">{farmAnimals.length} total</span>
            </div>
            {farmAnimals.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-2xl mb-2">🫏</p>
                <p className="text-sm font-medium">No donkeys registered yet</p>
                <button onClick={() => setShowRegisterDonkey(true)}
                  className="mt-3 text-xs font-semibold text-accent hover:opacity-80 underline underline-offset-2">
                  Register the first donkey
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {farmAnimals.map(a => (
                  <button key={a.id} onClick={() => navigate(`/animal/${a.id}`)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted text-lg">🫏</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-foreground">{a.id}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">{a.gender} · {a.color}</span>
                        <span className="text-[11px] text-muted-foreground">DOB: {a.birth_date}</span>
                        <span className="text-[11px] text-muted-foreground">Breeder: {a.breeder_name}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 md:px-8 pt-5 pb-4 md:hidden" style={{ background: "var(--gradient-primary)" }}>
        <h1 className="text-white text-lg font-bold" style={{ fontFamily: "Montserrat, sans-serif" }}>Registered Farms</h1>
        <p className="text-white/60 text-xs mt-0.5">Manage breeder farms and owners</p>
      </div>

      <div className="px-4 md:px-6 py-4 md:py-6 space-y-4">
        {/* Add button */}
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
          <PlusCircle size={16} /> Register New Farm
        </button>

        {/* Farm list */}
        {farms.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-3xl mb-2">🏡</p>
            <p className="text-sm font-medium">No farms registered yet</p>
            <p className="text-xs mt-1 opacity-70">Add a farm above to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {farms.map(farm => {
              const farmAnimals = animals.filter(a => a.registered_farm === farm.name);
              const uniqueBreeders = new Set(farmAnimals.map(a => a.breeder_name)).size;
              return (
                <div key={farm.id} onClick={() => setSelectedFarm(farm)} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden flex flex-col cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all">
                  {/* Farm header */}
                  <div className="px-3 py-2.5 flex items-start justify-between" style={{ background: "var(--gradient-primary)" }}>
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-base flex-shrink-0">🏡</span>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-xs leading-tight line-clamp-1" style={{ fontFamily: "Montserrat, sans-serif" }}>{farm.name}</p>
                        <p className="text-white/60 text-[9px] line-clamp-1 mt-0.5">{farm.location || "Location not set"}</p>
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(farm.id); }}
                      className="p-1 rounded-lg bg-white/10 hover:bg-red-500/30 transition-colors flex-shrink-0 ml-1">
                      <Trash2 size={11} className="text-white/70" />
                    </button>
                  </div>

                  {/* Stats row */}
                  <div className="flex border-b border-border">
                    <div className="flex-1 px-3 py-2 border-r border-border">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Donkeys</p>
                      <p className="text-base font-bold text-foreground leading-none mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>{farmAnimals.length}</p>
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Breeders</p>
                      <p className="text-base font-bold text-foreground leading-none mt-0.5" style={{ fontFamily: "Montserrat, sans-serif" }}>{uniqueBreeders}</p>
                    </div>
                  </div>

                  {/* Owner info */}
                  <div className="px-3 py-2 text-[10px] border-b border-border space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Owner</span>
                      <span className="font-semibold text-foreground text-right truncate">{farm.owner_name}</span>
                    </div>
                    {farm.owner_cnic && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">CNIC</span>
                        <span className="font-mono font-semibold text-foreground">{farm.owner_cnic}</span>
                      </div>
                    )}
                  </div>

                  {/* Donkey list */}
                  {farmAnimals.length > 0 && (
                    <div className="px-3 py-2 flex-1">
                      <div className="space-y-1">
                        {farmAnimals.slice(0, 3).map(a => (
                          <div key={a.id} className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
                            <span className="text-xs">🫏</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-[9px] font-bold text-foreground truncate">{a.id}</p>
                              <p className="text-[9px] text-muted-foreground truncate">{a.breeder_name} · {a.color}</p>
                            </div>
                            <StatusBadge status={a.status} />
                          </div>
                        ))}
                        {farmAnimals.length > 3 && (
                          <p className="text-[9px] text-muted-foreground text-center pt-0.5">+{farmAnimals.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Farm bottom sheet */}
      {showForm && (
        <BottomSheet title="Register New Farm" onClose={() => setShowForm(false)}>
          <form onSubmit={handleAdd} className="px-4 py-4 space-y-4 pb-6">
            <InputField label="Farm Name" required>
              <input className={inputCls} placeholder="e.g. DesertWind Stables" required
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </InputField>
            <InputField label="Farm Location">
              <LocationSearch
                value={form.location}
                onChange={loc => setForm(f => ({ ...f, location: loc.label, lat: loc.lat, lng: loc.lng }))}
              />
              {form.lat && (
                <p className="text-[11px] text-accent mt-1 flex items-center gap-1">
                  <MapPin size={11} /> {form.lat.toFixed(5)}, {form.lng?.toFixed(5)}
                </p>
              )}
            </InputField>
            <InputField label="Owner Name" required>
              <input className={inputCls} placeholder="e.g. Muhammad Saleem" required
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} />
            </InputField>
            <InputField label="Owner CNIC">
              <input className={inputCls} placeholder="XXXXX-XXXXXXX-X" maxLength={15}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} inputMode="numeric"
                value={form.owner_cnic} onChange={e => setForm(f => ({ ...f, owner_cnic: maskCnic(e.target.value) }))} />
            </InputField>
            <InputField label="Phone Number">
              <input className={inputCls} placeholder="e.g. 0300-1234567"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} inputMode="tel"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </InputField>
            <button type="submit"
              className="w-full py-3 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-opacity"
              style={{ background: "var(--gradient-primary)", fontFamily: "Montserrat, sans-serif" }}>
              Save Farm
            </button>
          </form>
        </BottomSheet>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <p className="font-bold text-foreground mb-1" style={{ fontFamily: "Montserrat, sans-serif" }}>Remove Farm?</p>
            <p className="text-sm text-muted-foreground mb-4">This will only remove the farm record. Animal records will not be affected.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted">Cancel</button>
              <button onClick={() => { deleteFarm(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { animals, events, farms, addAnimal, addEvent, updateAnimal, getAnimalEvents, isOnline } = data;

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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    "/scan": "Search & Scan", "/reports": "Reports", "/profile": "More",
  };
  const pageTitle = location.pathname.startsWith("/animal/")
    ? "Animal Record"
    : PAGE_TITLES[location.pathname] ?? "Track Now";

  const ALL_NAV = [...LEFT_NAV, ...RIGHT_NAV];

  return (
    <div className="flex h-screen bg-background overflow-hidden farm-bg-pattern" style={{ fontFamily: "Manrope, sans-serif" }}>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className={cn(
        "hidden md:flex md:flex-col flex-shrink-0 border-r border-border bg-white transition-all duration-300",
        sidebarCollapsed ? "w-16" : "w-60"
      )}>
        {/* Logo + collapse toggle */}
        <div className="border-b border-border flex items-center justify-between bg-white" style={{ minHeight: 64 }}>
          {!sidebarCollapsed && (
            <div className="flex items-center px-3 py-2 flex-1 min-w-0">
              <img src="/logo.png" alt="Track Now" className="h-10 w-auto object-contain" />
            </div>
          )}
          {sidebarCollapsed && (
            <div className="flex items-center justify-center w-full py-2">
              <img src="/logo.png" alt="Track Now" className="h-8 w-auto object-contain" />
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(c => !c)}
            className="p-1.5 mr-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground flex-shrink-0">
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Register CTA */}
        <div className="px-3 py-3 border-b border-border">
          <button
            onClick={() => canRegister && goTo("register")}
            disabled={!canRegister}
            title="Register Animal"
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-bold transition-all",
              canRegister ? "hover:opacity-90 active:scale-[0.98]" : "opacity-40 cursor-not-allowed"
            )}
            style={{ background: canRegister ? "var(--gradient-brand)" : "#ccc", fontFamily: "Montserrat, sans-serif",
              boxShadow: canRegister ? "0 2px 12px rgba(47,181,114,0.35)" : undefined }}>
            <Plus size={17} strokeWidth={2.5} />
            {!sidebarCollapsed && "Register Animal"}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          {ALL_NAV.map(({ tab, icon: Icon, label }) => {
            const active = activeTab === tab;
            const allowed = allowedTabs.includes(tab);
            const isProfile = tab === "profile";
            return (
              <button key={tab}
                onClick={() => allowed && goTo(tab)}
                title={sidebarCollapsed ? label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group",
                  sidebarCollapsed && "justify-center px-2",
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
                {!sidebarCollapsed && <span className="text-sm font-semibold">{label}</span>}
                {!sidebarCollapsed && !allowed && <Lock size={11} className="ml-auto opacity-50" />}
              </button>
            );
          })}
          {rm.canViewReports && (
            <button onClick={() => goTo("reports")}
              title={sidebarCollapsed ? "Reports" : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                sidebarCollapsed && "justify-center px-2",
                activeTab === "reports" ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              style={{ background: activeTab === "reports" ? "var(--gradient-primary)" : undefined, fontFamily: "Montserrat, sans-serif" }}>
              <BarChart2 size={18} strokeWidth={activeTab === "reports" ? 2 : 1.5} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="text-sm font-semibold">Reports</span>}
            </button>
          )}
          {currentUser.role === "administrator" && (
            <button onClick={() => goTo("farms")}
              title={sidebarCollapsed ? "Farms" : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                sidebarCollapsed && "justify-center px-2",
                activeTab === "farms" ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              style={{ background: activeTab === "farms" ? "var(--gradient-primary)" : undefined, fontFamily: "Montserrat, sans-serif" }}>
              <Building2 size={18} strokeWidth={activeTab === "farms" ? 2 : 1.5} className="flex-shrink-0" />
              {!sidebarCollapsed && <span className="text-sm font-semibold">Farms</span>}
            </button>
          )}
        </nav>

        {/* User + sync at bottom */}
        <div className="px-3 py-4 border-t border-border space-y-3">
          {!sidebarCollapsed && (
            <div className={cn(
              "flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg w-fit",
              isOnline ? "bg-muted text-secondary" : "bg-yellow-100 text-yellow-700"
            )} style={{ fontFamily: "Montserrat, sans-serif" }}>
              <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isOnline ? "bg-secondary" : "bg-yellow-400")} />
              {isOnline ? "Synced" : "Offline"}
            </div>
          )}
          <div className={cn("flex items-center gap-2.5", sidebarCollapsed && "justify-center")}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: rm.bg, color: rm.color, fontFamily: "Montserrat, sans-serif" }}>
              {currentUser.avatar}
            </div>
            {!sidebarCollapsed && (
              <>
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
              </>
            )}
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
            <p className="text-xs text-muted-foreground">Track Now Traceability Platform</p>
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
                  ? <RegisterAnimal addAnimal={addAnimal} updateAnimal={updateAnimal} recordedBy={currentUser.name} farms={farms} />
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
              <Route path="/farms" element={
                currentUser.role === "administrator"
                  ? <FarmsManagement animals={animals} />
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

        <p className="text-xs text-muted-foreground mt-10">Track Now · Track Now</p>
      </div>
    </div>
  );
}

// ─── Site Password Gate (prototype-wide access lock) ──────────────────────────

const SITE_PASSWORD = "TrckN0w#Pk@2026!";
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
    <HashRouter>
      <Routes>
        {/* Login is the home page — AppShell handles / as well as all auth routes */}
        <Route path="*" element={<AppShellWithNotFound />} />
      </Routes>
    </HashRouter>
  );
}

function AppShellWithNotFound() {
  const location = useLocation();
  const knownRoutes = [
    "/", "/login", "/dashboard", "/activities", "/register",
    "/scan", "/reports", "/profile", "/farms",
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
