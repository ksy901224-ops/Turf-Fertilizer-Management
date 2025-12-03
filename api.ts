
import { Fertilizer, LogEntry, User, NotificationSettings, UserDataSummary } from './types';
import { FERTILIZER_GUIDE } from './constants';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, collection, doc, getDoc, setDoc, 
    updateDoc, deleteDoc, getDocs, query, where 
} from 'firebase/firestore';

// --- FIREBASE CONFIGURATION ---
// TODO: Vercel 배포 시 환경 변수 또는 실제 키 값으로 교체해야 합니다.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
// Note: In a real environment, wrap this in a try-catch or singleton pattern 
// to prevent multiple initializations in some hot-reload environments.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Collection References
const USERS_COLLECTION = 'users';
const APP_DATA_COLLECTION = 'appData'; // Stores logs, fertilizers, settings per user

// --- Helper Functions ---

const initialFertilizers: Fertilizer[] = [
    { name: 'HPG-N16 (16-2-12)', usage: '그린', type: '완효성', N:16, P:2, K:12, Ca:2, Mg:1, S:4, Fe:0, Mn:0.5, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:80000, unit:'20kg', rate:'15g/㎡', npkRatio:'8-1-6', stock: 40, imageUrl: 'https://via.placeholder.com/400x300/22c55e/ffffff?text=HPG-N16', lowStockAlertEnabled: false, description: '질소 함량이 높고 완효성 성분이 포함되어 있어 그린의 생육을 오랫동안 안정적으로 지속시켜줍니다. 생육기 전반에 사용하기 적합합니다.' },
    { name: 'Smartro NPK (20-20-20)', usage: '페어웨이', type: '수용성', N:20, P:20, K:20, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'10kg', rate:'20g/㎡', npkRatio:'1-1-1', stock: 20, lowStockAlertEnabled: true, description: '질소, 인산, 칼륨이 균형 있게 배합된 고농도 수용성 비료입니다. 엽면 시비 시 흡수가 빠르며 잔디의 색상 및 활력을 증진시킵니다.' },
    { name: '황산칼륨 (0-0-50)', usage: '그린', type: '수용성', N:0, P:0, K:50, S:17, Ca:0, Mg:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:90000, unit:'25kg', rate:'10g/㎡', npkRatio:'0-0-1', stock: 5, lowStockAlertEnabled: true, description: '고순도 칼륨을 공급하여 잔디의 내병성, 내서성, 내한성을 강화하는 데 탁월합니다. 고온기 및 월동 전 관리에 필수적입니다.' },
    { name: '액상 영양제 (10-10-10)', usage: '그린', type: '액상', N:10, P:10, K:10, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:70000, unit:'10L', rate:'2ml/㎡', density:1.1, concentration:10, npkRatio:'1-1-1', stock: 15, lowStockAlertEnabled: false, description: '빠른 흡수가 특징인 액상 비료로, 뿌리 기능이 저하되었거나 스트레스 시기에 즉각적인 영양 공급이 필요할 때 효과적입니다.' }
];

// --- User Management ---

export const validateUser = async (username: string, password_provided: string): Promise<User | 'pending' | null> => {
    try {
        const docRef = doc(db, USERS_COLLECTION, username);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const userData = docSnap.data() as User;
            // Simple password check (Note: In production, use Firebase Auth)
            if (userData.password === password_provided) {
                if (!userData.isApproved) {
                    return 'pending';
                }
                const { password, ...userWithoutPassword } = userData;
                return userWithoutPassword;
            }
        }
        return null;
    } catch (e) {
        console.error("Login error:", e);
        return null;
    }
};

export const createUser = async (username: string, password_provided: string, golfCourse: string): Promise<User | 'exists' | 'invalid'> => {
    if (!username.trim() || !password_provided || !golfCourse.trim()) {
        return 'invalid';
    }
    
    try {
        const docRef = doc(db, USERS_COLLECTION, username);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return 'exists';
        }

        const newUser: User = { username, password: password_provided, golfCourse, isApproved: false };
        await setDoc(docRef, newUser);
        
        // Initialize App Data document for this user with empty structure
        await setDoc(doc(db, APP_DATA_COLLECTION, username), {
            logs: [],
            fertilizers: [], // Will use global if empty, or user custom
            settings: {},
            notificationSettings: { enabled: false, email: '', threshold: 10 }
        });

        const { password, ...userWithoutPassword } = newUser;
        return userWithoutPassword;
    } catch (e) {
        console.error("Create User Error:", e);
        return 'invalid';
    }
};

export const approveUser = async (username: string): Promise<void> => {
    try {
        const docRef = doc(db, USERS_COLLECTION, username);
        await updateDoc(docRef, { isApproved: true });
    } catch (e) {
        console.error("Approve User Error:", e);
    }
};

export const getUser = async (username: string): Promise<User | null> => {
    try {
        const docRef = doc(db, USERS_COLLECTION, username);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const userData = docSnap.data() as User;
            const { password, ...userWithoutPassword } = userData;
            return userWithoutPassword;
        }
        return null;
    } catch (e) {
        console.error("Get User Error:", e);
        return null;
    }
};

export const deleteUser = async (username: string): Promise<void> => {
    try {
        // Delete User Profile
        await deleteDoc(doc(db, USERS_COLLECTION, username));
        // Delete User Data
        await deleteDoc(doc(db, APP_DATA_COLLECTION, username));
    } catch (e) {
        console.error("Delete User Error:", e);
    }
};

// --- Data Functions (Firestore Implementation) ---

// Helper to get app data doc
const getAppData = async (username: string) => {
    const docRef = doc(db, APP_DATA_COLLECTION, username);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return docSnap.data();
    return null;
};

export const getFertilizers = async (username: string): Promise<Fertilizer[]> => {
    try {
        const data = await getAppData(username);
        let fertilizers = data?.fertilizers || [];

        // If it's a regular user and they have no custom fertilizers, potentially return admin's (master) list
        // However, the app logic seems to merge them in App.tsx. 
        // Here we just return what is stored.
        
        // Special case: If requesting 'admin' and it's empty, return initial
        if (username === 'admin' && fertilizers.length === 0) {
            return initialFertilizers;
        }

        return fertilizers.map((item: any) => ({
            ...item,
            stock: item.stock ?? 0,
            lowStockAlertEnabled: item.lowStockAlertEnabled ?? false,
        }));
    } catch (e) {
        console.error("Get Fertilizers Error:", e);
        return [];
    }
};

export const saveFertilizers = async (username: string, fertilizers: Fertilizer[]): Promise<void> => {
    try {
        const docRef = doc(db, APP_DATA_COLLECTION, username);
        await setDoc(docRef, { fertilizers }, { merge: true });
    } catch (e) {
        console.error("Save Fertilizers Error:", e);
    }
};

export const getLog = async (username: string): Promise<LogEntry[]> => {
    try {
        const data = await getAppData(username);
        return data?.logs || [];
    } catch (e) {
        console.error("Get Log Error:", e);
        return [];
    }
};

export const saveLog = async (username: string, log: LogEntry[]): Promise<void> => {
    try {
        const docRef = doc(db, APP_DATA_COLLECTION, username);
        await setDoc(docRef, { logs: log }, { merge: true });
    } catch (e) {
        console.error("Save Log Error:", e);
    }
};

export interface UserSettings {
    greenArea: string;
    teeArea: string;
    fairwayArea: string;
    selectedGuide: string;
    manualPlanMode?: boolean;
    manualTargets?: { [area: string]: { N: number, P: number, K: number }[] };
    fairwayGuideType?: 'KBG' | 'Zoysia';
}

export const getSettings = async (username: string): Promise<UserSettings> => {
    const defaultManualTargets = {
        '그린': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '티': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '페어웨이': Array(12).fill({ N: 0, P: 0, K: 0 }),
    };
    
    const defaultSettings = {
        greenArea: '',
        teeArea: '',
        fairwayArea: '',
        selectedGuide: Object.keys(FERTILIZER_GUIDE)[0],
        manualPlanMode: false,
        manualTargets: defaultManualTargets,
        fairwayGuideType: 'KBG'
    };

    try {
        const data = await getAppData(username);
        const userSettings = data?.settings;

        if (userSettings) {
             // Handle migration/defaults logic
             let manualTargets = userSettings.manualTargets;
             if (Array.isArray(manualTargets)) {
                 manualTargets = {
                     '그린': manualTargets,
                     '티': [...defaultManualTargets['티']],
                     '페어웨이': [...defaultManualTargets['페어웨이']],
                 };
             } else if (!manualTargets) {
                 manualTargets = defaultManualTargets;
             }
             return { ...userSettings, manualTargets } as UserSettings;
        }
        
        return defaultSettings as UserSettings;
    } catch (e) {
        console.error("Get Settings Error:", e);
        return defaultSettings as UserSettings;
    }
};

export const saveSettings = async (username: string, settings: UserSettings): Promise<void> => {
    try {
        const docRef = doc(db, APP_DATA_COLLECTION, username);
        await setDoc(docRef, { settings }, { merge: true });
    } catch (e) {
        console.error("Save Settings Error:", e);
    }
};

export const getNotificationSettings = async (username: string): Promise<NotificationSettings> => {
    try {
        const data = await getAppData(username);
        if (data?.notificationSettings) {
            return data.notificationSettings;
        }
        return { enabled: false, email: '', threshold: 10 };
    } catch (e) {
        console.error("Get Notification Settings Error:", e);
         return { enabled: false, email: '', threshold: 10 };
    }
};

export const saveNotificationSettings = async (username: string, settings: NotificationSettings): Promise<void> => {
    try {
        const docRef = doc(db, APP_DATA_COLLECTION, username);
        await setDoc(docRef, { notificationSettings: settings }, { merge: true });
    } catch (e) {
        console.error("Save Notification Settings Error:", e);
    }
};

export const getAllUsersData = async (): Promise<UserDataSummary[]> => {
    try {
        // 1. Get all users
        const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
        const users: User[] = [];
        usersSnapshot.forEach(doc => {
            users.push(doc.data() as User);
        });

        const allData: UserDataSummary[] = [];

        // 2. Iterate and get AppData for each
        // Optimization: In a real large app, this N+1 query pattern is bad. 
        // Better to have a separate 'stats' collection or use a collection group query if data structure permits.
        // For this scale, it's acceptable.
        
        for (const user of users) {
            if (user.username === 'admin') continue;

            const appData = await getAppData(user.username);
            const logs = appData?.logs || [];
            const fertilizers = appData?.fertilizers || [];
            
            const totalCost = logs.reduce((sum: number, entry: LogEntry) => sum + (entry.totalCost || 0), 0);
            
            let lastActivity: string | null = null;
            if (logs.length > 0) {
                lastActivity = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date;
            }

            allData.push({
                username: user.username,
                golfCourse: user.golfCourse || '미지정',
                logCount: logs.length,
                totalCost,
                lastActivity,
                logs: [...logs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
                fertilizers,
                isApproved: user.isApproved ?? true,
            });
        }
        return allData;
    } catch (e) {
        console.error("Get All Users Data Error:", e);
        return [];
    }
};
