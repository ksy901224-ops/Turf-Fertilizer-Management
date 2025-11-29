
export interface Fertilizer {
  name: string;
  usage: '그린' | '티' | '페어웨이';
  type: '완효성' | '액상' | '4종복합비료' | '수용성' | '기능성제제' | '유기농' | '토양개량제';
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
  aminoAcid?: number; // New field for Amino Acids
  price: number;
  unit: string;
  rate: string;
  density?: number;
  concentration?: number;
  npkRatio?: string;
  stock?: number;
  imageUrl?: string;
  lowStockAlertEnabled?: boolean;
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
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface User {
  username: string;
  password?: string;
  golfCourse: string;
  isApproved?: boolean; // New field for approval status
}

export interface UserDataSummary {
    username: string;
    golfCourse: string;
    logCount: number;
    totalCost: number;
    lastActivity: string | null;
    logs: LogEntry[];
    fertilizers: Fertilizer[];
    isApproved: boolean; // New field for dashboard
}

export interface NotificationSettings {
    enabled: boolean;
    email: string;
    threshold: number;
}