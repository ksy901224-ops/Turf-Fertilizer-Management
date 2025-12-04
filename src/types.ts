
export interface Fertilizer {
  name: string;
  usage: '그린' | '티' | '페어웨이';
  type: string; // Changed from strict union to string to support expanded categories
  N: number;
  P: number;
  K: number;
  Ca: number;
  Mg: number;
  S: number;
  Fe: number;
  Mn: number;
  Zn: number;
  Cu: number;
  B: number;
  Mo: number;
  Cl: number;
  Na: number;
  Si: number;
  Ni: number;
  Co: number;
  V: number;
  aminoAcid?: number;
  price: number;
  unit: string;
  rate: string;
  density?: number;
  concentration?: number;
  npkRatio?: string;
  stock?: number;
  imageUrl?: string;
  lowStockAlertEnabled?: boolean;
  description?: string;
}

export type NewFertilizerForm = {
  [key: string]: string;
};

export interface NutrientLog {
  [key: string]: number;
}

export interface LogEntry {
  id: string;
  date: string;
  product: string;
  area: number;
  totalCost: number;
  nutrients: NutrientLog;
  applicationRate: number;
  applicationUnit: string;
  usage: '그린' | '티' | '페어웨이';
  nutrientCosts?: {
    N?: number;
    P?: number;
    K?: number;
  };
  topdressing?: number; // Added: Depth in mm
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface User {
  username: string;
  password?: string;
  golfCourse: string;
  isApproved?: boolean;
}

export interface UserDataSummary {
    username: string;
    golfCourse: string;
    logCount: number;
    totalCost: number;
    lastActivity: string | null;
    logs: LogEntry[];
    fertilizers: Fertilizer[];
    isApproved: boolean;
}

export interface NotificationSettings {
    enabled: boolean;
    email: string;
    threshold: number;
}