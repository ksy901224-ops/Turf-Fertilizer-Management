
import { Fertilizer, LogEntry, User, NotificationSettings, UserDataSummary } from './types';
import { FERTILIZER_GUIDE } from './constants';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, onSnapshot, Unsubscribe, QuerySnapshot, DocumentData } from 'firebase/firestore';

// --- Interfaces & Defaults ---

export interface UserSettings {
    greenArea: string;
    teeArea: string;
    fairwayArea: string;
    selectedGuide: string;
    manualPlanMode?: boolean;
    manualTargets?: { [area: string]: { N: number, P: number, K: number }[] };
    fairwayGuideType?: 'KBG' | 'Zoysia';
}

// Define Default Settings to ensure type safety
const DEFAULT_USER_SETTINGS: UserSettings = {
    greenArea: '',
    teeArea: '',
    fairwayArea: '',
    selectedGuide: Object.keys(FERTILIZER_GUIDE)[0] || '난지형잔디 (한국잔디)',
    manualPlanMode: false,
    manualTargets: {
        '그린': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '티': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '페어웨이': Array(12).fill({ N: 0, P: 0, K: 0 }),
    },
    fairwayGuideType: 'KBG'
};

interface AppData {
    logs: LogEntry[];
    fertilizers: Fertilizer[];
    settings: UserSettings;
    notificationSettings: NotificationSettings;
}

// --- Helper Functions ---

const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

const initialFertilizers: Fertilizer[] = [
    { name: 'HPG-N16 (16-2-12)', usage: '그린', type: '완효성', N:16, P:2, K:12, Ca:2, Mg:1, S:4, Fe:0, Mn:0.5, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:80000, unit:'20kg', rate:'15g/㎡', npkRatio:'8-1-6', stock: 40, imageUrl: 'https://via.placeholder.com/400x300/22c55e/ffffff?text=HPG-N16', lowStockAlertEnabled: false, description: '질소 함량이 높고 완효성 성분이 포함되어 있어 그린의 생육을 오랫동안 안정적으로 지속시켜줍니다. 생육기 전반에 사용하기 적합합니다.' },
    { name: 'Smartro NPK (20-20-20)', usage: '페어웨이', type: '수용성', N:20, P:20, K:20, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'10kg', rate:'20g/㎡', npkRatio:'1-1-1', stock: 20, lowStockAlertEnabled: true, description: '질소, 인산, 칼륨이 균형 있게 배합된 고농도 수용성 비료입니다. 엽면 시비 시 흡수가 빠르며 잔디의 색상 및 활력을 증진시킵니다.' },
    { name: '황산칼륨 (0-0-50)', usage: '그린', type: '수용성', N:0, P:0, K:50, S:17, Ca:0, Mg:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:90000, unit:'25kg', rate:'10g/㎡', npkRatio:'0-0-1', stock: 5, lowStockAlertEnabled: true, description: '고순도 칼륨을 공급하여 잔디의 내병성, 내서성, 내한성을 강화하는 데 탁월합니다. 고온기 및 월동 전 관리에 필수적입니다.' },
    { name: '액상 영양제 (10-10-10)', usage: '그린', type: '액상', N:10, P:10, K:10, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:70000, unit:'10L', rate:'2ml/㎡', density:1.1, concentration:10, npkRatio:'1-1-1', stock: 15, lowStockAlertEnabled: false, description: '빠른 흡수가 특징인 액상 비료로, 뿌리 기능이 저하되었거나 스트레스 시기에 즉각적인 영양 공급이 필요할 때 효과적입니다.' }
];

// Ensure 'admin' exists in Firestore
export const seedAdminIfNeeded = async () => {
    try {
        const adminRef = doc(db, "users", "admin");
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
            await setDoc(adminRef, {
                username: 'admin',
                password: 'admin',
                golfCourse: '관리자',
                isApproved: true
            });
            
            const adminDataRef = doc(db, "appData", "admin");
            const adminDataSnap = await getDoc(adminDataRef);
            if (!adminDataSnap.exists()) {
                await setDoc(adminDataRef, {
                    logs: [],
                    fertilizers: initialFertilizers,
                    settings: DEFAULT_USER_SETTINGS,
                    notificationSettings: { enabled: false, email: '', threshold: 10 }
                });
            }
        }
    } catch (e) {
        console.error("Error seeding admin:", e);
    }
};

// --- User Management ---

export const validateUser = async (username: string, password_provided: string): Promise<User | 'pending' | null> => {
    try {
        await seedAdminIfNeeded();
        const userRef = doc(db, "users", username);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const user = userSnap.data() as User;
            // In a real app, use hashed passwords.
            if (user.password === password_provided) {
                if (username !== 'admin' && !user.isApproved) {
                    return 'pending';
                }
                const { password, ...userWithoutPassword } = user;
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
        const userRef = doc(db, "users", username);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            return 'exists';
        }

        const newUser: User = { username, password: password_provided, golfCourse, isApproved: false };
        await setDoc(userRef, newUser);
        
        // Initialize App Data document for this user
        const dataRef = doc(db, "appData", username);
        await setDoc(dataRef, {
            logs: [],
            fertilizers: [], 
            settings: DEFAULT_USER_SETTINGS,
            notificationSettings: { enabled: false, email: '', threshold: 10 }
        });

        const { password, ...userWithoutPassword } = newUser;
        return userWithoutPassword;
    } catch (e) {
        console.error("Signup error:", e);
        return 'invalid';
    }
};

export const approveUser = async (username: string): Promise<void> => {
    try {
        const userRef = doc(db, "users", username);
        await updateDoc(userRef, { isApproved: true });
    } catch (e) {
        console.error("Approval error", e);
    }
};

export const getUser = async (username: string): Promise<User | null> => {
    try {
        const userRef = doc(db, "users", username);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const user = userSnap.data() as User;
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const deleteUser = async (username: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, "users", username));
        await deleteDoc(doc(db, "appData", username));
    } catch (e) {
        console.error("Delete user error", e);
    }
};

// --- Data Functions (Firestore & Real-time) ---

// Subscribe to a specific user's App Data
export const subscribeToAppData = (username: string, onUpdate: (data: Partial<AppData> | null) => void): Unsubscribe => {
    const docRef = doc(db, "appData", username);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as Partial<AppData>;
            // Ensure settings has defaults if missing
            if (data.settings) {
                data.settings = { ...DEFAULT_USER_SETTINGS, ...data.settings };
            }
            onUpdate(data);
        } else {
            onUpdate(null);
        }
    }, (error) => {
        console.error("Error subscribing to app data:", error);
    });
};

// Subscribe to the users collection (for Admin)
export const subscribeToUsers = (onUpdate: (users: User[]) => void): Unsubscribe => {
    const colRef = collection(db, "users");
    return onSnapshot(colRef, (snapshot: QuerySnapshot<DocumentData>) => {
        const users = snapshot.docs.map(d => d.data() as User);
        onUpdate(users);
    }, (error) => {
        console.error("Error subscribing to users:", error);
    });
};

// Subscribe to all app data (for Admin aggregation)
export const subscribeToAllAppData = (onUpdate: (data: Record<string, Partial<AppData>>) => void): Unsubscribe => {
    const colRef = collection(db, "appData");
    return onSnapshot(colRef, (snapshot: QuerySnapshot<DocumentData>) => {
        const data: Record<string, Partial<AppData>> = {};
        snapshot.forEach(doc => {
            data[doc.id] = doc.data() as Partial<AppData>;
        });
        onUpdate(data);
    }, (error) => {
        console.error("Error subscribing to all app data:", error);
    });
};

// --- Save Functions (Actions) ---

export const getFertilizers = async (username: string): Promise<Fertilizer[]> => {
    // Legacy support or direct fetch if needed, but subscriptions preferred
    await seedAdminIfNeeded();
    try {
        const docRef = doc(db, "appData", username);
        const docSnap = await getDoc(docRef);
        const fertilizers = docSnap.exists() ? (docSnap.data() as AppData).fertilizers : [];
        if (username === 'admin' && (!fertilizers || fertilizers.length === 0)) {
            return initialFertilizers;
        }
        return fertilizers || [];
    } catch {
        return [];
    }
};

export const saveFertilizers = async (username: string, fertilizers: Fertilizer[]): Promise<void> => {
    try {
        const docRef = doc(db, "appData", username);
        await updateDoc(docRef, { fertilizers });
    } catch (e) {
        // If doc doesn't exist (edge case), try setting it
        console.warn("Update failed, trying set for fertilizers", e);
        const docRef = doc(db, "appData", username);
        await setDoc(docRef, { fertilizers }, { merge: true });
    }
};

export const getLog = async (username: string): Promise<LogEntry[]> => {
    try {
        const docRef = doc(db, "appData", username);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? (docSnap.data() as AppData).logs || [] : [];
    } catch {
        return [];
    }
};

export const saveLog = async (username: string, log: LogEntry[]): Promise<void> => {
    try {
        const docRef = doc(db, "appData", username);
        await updateDoc(docRef, { logs: log });
    } catch (e) {
        const docRef = doc(db, "appData", username);
        await setDoc(docRef, { logs: log }, { merge: true });
    }
};

export const getSettings = async (username: string): Promise<UserSettings> => {
    try {
        const docRef = doc(db, "appData", username);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = (docSnap.data() as AppData).settings;
            // Merge retrieved data with default settings to ensure all required fields exist
            return { ...DEFAULT_USER_SETTINGS, ...data };
        }
        return DEFAULT_USER_SETTINGS;
    } catch (e) {
        console.error("Error getting settings:", e);
        return DEFAULT_USER_SETTINGS;
    }
};

export const saveSettings = async (username: string, settings: UserSettings): Promise<void> => {
    try {
        const docRef = doc(db, "appData", username);
        await updateDoc(docRef, { settings });
    } catch (e) {
        const docRef = doc(db, "appData", username);
        await setDoc(docRef, { settings }, { merge: true });
    }
};

export const getAllUsersData = async (): Promise<UserDataSummary[]> => {
    // Legacy support, Admin Dashboard now uses real-time listeners
    try {
        const usersCol = collection(db, "users");
        const userSnapshot = await getDocs(usersCol);
        const allData: UserDataSummary[] = [];

        for (const userDoc of userSnapshot.docs) {
            const userData = userDoc.data() as User;
            const username = userData.username;
            
            if (username === 'admin') continue;

            const docRef = doc(db, "appData", username);
            const appDataSnap = await getDoc(docRef);
            const appData = appDataSnap.exists() ? (appDataSnap.data() as AppData) : null;
            const logs = appData?.logs || [];
            const fertilizers = appData?.fertilizers || [];
            
            const totalCost = logs.reduce((sum: number, entry: LogEntry) => sum + (entry.totalCost || 0), 0);
            
            let lastActivity: string | null = null;
            if (logs.length > 0) {
                lastActivity = [...logs].sort((a: LogEntry, b: LogEntry) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date;
            }

            allData.push({
                username: userData.username,
                golfCourse: userData.golfCourse || '미지정',
                logCount: logs.length,
                totalCost,
                lastActivity,
                logs: [...logs].sort((a: LogEntry, b: LogEntry) => new Date(b.date).getTime() - new Date(a.date).getTime()),
                fertilizers,
                isApproved: userData.isApproved ?? true,
            });
        }
        return allData;
    } catch (e) {
        console.error("Get All Users Data error", e);
        return [];
    }
};
