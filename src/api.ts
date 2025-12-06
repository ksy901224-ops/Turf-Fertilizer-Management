
import { Fertilizer, LogEntry, User, NotificationSettings, UserDataSummary } from './types';
import { FERTILIZER_GUIDE } from './constants';

// --- LocalStorage DB Configuration ---
const USERS_KEY = 'turf_users';
const DATA_PREFIX = 'turf_data_';

// --- Helper Functions ---

const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

const getUsersMap = (): Record<string, User> => {
    try {
        const json = localStorage.getItem(USERS_KEY);
        return json ? JSON.parse(json) : {};
    } catch (e) {
        console.error("Error reading users from storage", e);
        return {};
    }
};

const saveUsersMap = (users: Record<string, User>) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const getUserDataRaw = (username: string) => {
    try {
        const json = localStorage.getItem(DATA_PREFIX + username);
        return json ? JSON.parse(json) : null;
    } catch (e) {
        return null;
    }
};

const saveUserDataRaw = (username: string, data: any) => {
    localStorage.setItem(DATA_PREFIX + username, JSON.stringify(data));
};

const initialFertilizers: Fertilizer[] = [
    { name: 'HPG-N16 (16-2-12)', usage: '그린', type: '완효성', N:16, P:2, K:12, Ca:2, Mg:1, S:4, Fe:0, Mn:0.5, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:80000, unit:'20kg', rate:'15g/㎡', npkRatio:'8-1-6', stock: 40, imageUrl: 'https://via.placeholder.com/400x300/22c55e/ffffff?text=HPG-N16', lowStockAlertEnabled: false, description: '질소 함량이 높고 완효성 성분이 포함되어 있어 그린의 생육을 오랫동안 안정적으로 지속시켜줍니다. 생육기 전반에 사용하기 적합합니다.' },
    { name: 'Smartro NPK (20-20-20)', usage: '페어웨이', type: '수용성', N:20, P:20, K:20, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'10kg', rate:'20g/㎡', npkRatio:'1-1-1', stock: 20, lowStockAlertEnabled: true, description: '질소, 인산, 칼륨이 균형 있게 배합된 고농도 수용성 비료입니다. 엽면 시비 시 흡수가 빠르며 잔디의 색상 및 활력을 증진시킵니다.' },
    { name: '황산칼륨 (0-0-50)', usage: '그린', type: '수용성', N:0, P:0, K:50, S:17, Ca:0, Mg:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:90000, unit:'25kg', rate:'10g/㎡', npkRatio:'0-0-1', stock: 5, lowStockAlertEnabled: true, description: '고순도 칼륨을 공급하여 잔디의 내병성, 내서성, 내한성을 강화하는 데 탁월합니다. 고온기 및 월동 전 관리에 필수적입니다.' },
    { name: '액상 영양제 (10-10-10)', usage: '그린', type: '액상', N:10, P:10, K:10, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:70000, unit:'10L', rate:'2ml/㎡', density:1.1, concentration:10, npkRatio:'1-1-1', stock: 15, lowStockAlertEnabled: false, description: '빠른 흡수가 특징인 액상 비료로, 뿌리 기능이 저하되었거나 스트레스 시기에 즉각적인 영양 공급이 필요할 때 효과적입니다.' }
];

// Ensure 'admin' exists for demo purposes
const seedAdminIfNeeded = () => {
    const users = getUsersMap();
    if (!users['admin']) {
        users['admin'] = {
            username: 'admin',
            password: 'admin',
            golfCourse: '관리자',
            isApproved: true
        };
        saveUsersMap(users);
        
        if (!getUserDataRaw('admin')) {
             saveUserDataRaw('admin', {
                 logs: [],
                 fertilizers: initialFertilizers,
                 settings: {},
                 notificationSettings: { enabled: false, email: '', threshold: 10 }
             });
        }
    }
};

// --- User Management ---

export const validateUser = async (username: string, password_provided: string): Promise<User | 'pending' | null> => {
    await delay();
    seedAdminIfNeeded();
    
    const users = getUsersMap();
    const user = users[username];

    if (user && user.password === password_provided) {
        if (username !== 'admin' && !user.isApproved) {
            return 'pending';
        }
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    return null;
};

export const createUser = async (username: string, password_provided: string, golfCourse: string): Promise<User | 'exists' | 'invalid'> => {
    await delay();
    if (!username.trim() || !password_provided || !golfCourse.trim()) {
        return 'invalid';
    }
    
    const users = getUsersMap();

    if (users[username]) {
        return 'exists';
    }

    const newUser: User = { username, password: password_provided, golfCourse, isApproved: false };
    users[username] = newUser;
    saveUsersMap(users);
    
    // Initialize App Data document for this user
    saveUserDataRaw(username, {
        logs: [],
        fertilizers: [], 
        settings: {},
        notificationSettings: { enabled: false, email: '', threshold: 10 }
    });

    const { password, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
};

export const approveUser = async (username: string): Promise<void> => {
    await delay();
    const users = getUsersMap();
    if (users[username]) {
        users[username].isApproved = true;
        saveUsersMap(users);
    }
};

export const getUser = async (username: string): Promise<User | null> => {
    await delay();
    const users = getUsersMap();
    if (users[username]) {
        const { password, ...userWithoutPassword } = users[username];
        return userWithoutPassword;
    }
    return null;
};

export const deleteUser = async (username: string): Promise<void> => {
    await delay();
    const users = getUsersMap();
    if (users[username]) {
        delete users[username];
        saveUsersMap(users);
        // Also remove their data
        localStorage.removeItem(DATA_PREFIX + username);
    }
};

// --- Data Functions ---

export const getFertilizers = async (username: string): Promise<Fertilizer[]> => {
    await delay();
    seedAdminIfNeeded();

    const data = getUserDataRaw(username);
    const fertilizers = data?.fertilizers || [];

    // If 'admin' list is requested and empty (shouldn't happen due to seed, but safe fallback), return initial
    if (username === 'admin' && fertilizers.length === 0) {
        return initialFertilizers;
    }

    return fertilizers.map((item: any) => ({
        ...item,
        stock: item.stock ?? 0,
        lowStockAlertEnabled: item.lowStockAlertEnabled ?? false,
    }));
};

export const saveFertilizers = async (username: string, fertilizers: Fertilizer[]): Promise<void> => {
    await delay();
    const data = getUserDataRaw(username) || {};
    data.fertilizers = fertilizers;
    saveUserDataRaw(username, data);
};

export const getLog = async (username: string): Promise<LogEntry[]> => {
    await delay();
    const data = getUserDataRaw(username);
    return data?.logs || [];
};

export const saveLog = async (username: string, log: LogEntry[]): Promise<void> => {
    await delay();
    const data = getUserDataRaw(username) || {};
    data.logs = log;
    saveUserDataRaw(username, data);
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
    await delay();
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

    const data = getUserDataRaw(username);
    const userSettings = data?.settings;

    if (userSettings) {
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
};

export const saveSettings = async (username: string, settings: UserSettings): Promise<void> => {
    await delay();
    const data = getUserDataRaw(username) || {};
    data.settings = settings;
    saveUserDataRaw(username, data);
};

export const getNotificationSettings = async (username: string): Promise<NotificationSettings> => {
    await delay();
    const data = getUserDataRaw(username);
    if (data?.notificationSettings) {
        return data.notificationSettings;
    }
    return { enabled: false, email: '', threshold: 10 };
};

export const saveNotificationSettings = async (username: string, settings: NotificationSettings): Promise<void> => {
    await delay();
    const data = getUserDataRaw(username) || {};
    data.notificationSettings = settings;
    saveUserDataRaw(username, data);
};

export const getAllUsersData = async (): Promise<UserDataSummary[]> => {
    await delay();
    const users = getUsersMap();
    const allData: UserDataSummary[] = [];

    for (const username of Object.keys(users)) {
        if (username === 'admin') continue;
        const user = users[username];

        const appData = getUserDataRaw(username) || { logs: [], fertilizers: [] };
        const logs = appData.logs || [];
        const fertilizers = appData.fertilizers || [];
        
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
};
