
import { Fertilizer, LogEntry, User, NotificationSettings, UserDataSummary } from './types';
import { FERTILIZER_GUIDE } from './constants';

const DB_KEY = 'TURF_APP_DATABASE_V2'; // New key to force migration

interface TurfDatabase {
    users: User[];
    fertilizers: { [username: string]: Fertilizer[] };
    logs: { [username: string]: LogEntry[] };
    settings: {
        [username: string]: {
            greenArea: string;
            teeArea: string;
            fairwayArea: string;
            selectedGuide: string;
            manualPlanMode?: boolean;
            manualTargets?: { [area: string]: { N: number, P: number, K: number }[] };
            fairwayGuideType?: 'KBG' | 'Zoysia';
        }
    };
    notificationSettings: { [username: string]: NotificationSettings };
}

const simulateDelay = (ms: number) => new Promise(res => setTimeout(res, ms));

const getDatabase = (): TurfDatabase => {
    try {
        const saved = localStorage.getItem(DB_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error("Failed to load database, will reset.", e);
    }
    // Default empty state
    return {
        users: [],
        fertilizers: {},
        logs: {},
        settings: {},
        notificationSettings: {}
    };
};

const saveDatabase = (db: TurfDatabase) => {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
        console.error("Failed to save database.", e);
    }
};

const initialFertilizers: Fertilizer[] = [
    { name: 'HPG-N16 (16-2-12)', usage: '그린', type: '완효성', N:16, P:2, K:12, Ca:2, Mg:1, S:4, Fe:0, Mn:0.5, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:80000, unit:'20kg', rate:'15g/㎡', npkRatio:'8-1-6', stock: 40, imageUrl: 'https://via.placeholder.com/400x300/22c55e/ffffff?text=HPG-N16', lowStockAlertEnabled: false, description: '질소 함량이 높고 미량요소가 포함된 그린용 완효성 비료입니다.' },
    { name: 'Smartro NPK (20-20-20)', usage: '페어웨이', type: '수용성', N:20, P:20, K:20, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'10kg', rate:'20g/㎡', npkRatio:'1-1-1', stock: 20, lowStockAlertEnabled: true, description: '수용성으로 빠른 효과를 볼 수 있는 페어웨이용 고농도 복합 비료입니다.' },
    { name: '황산칼륨 (0-0-50)', usage: '그린', type: '수용성', N:0, P:0, K:50, S:17, Ca:0, Mg:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:90000, unit:'25kg', rate:'10g/㎡', npkRatio:'0-0-1', stock: 5, lowStockAlertEnabled: true, description: '칼륨 공급 및 내병성 증대를 위한 수용성 비료입니다.' },
    { name: '액상 영양제 (10-10-10)', usage: '그린', type: '액상', N:10, P:10, K:10, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:70000, unit:'10L', rate:'2ml/㎡', density:1.1, concentration:10, npkRatio:'1-1-1', stock: 15, lowStockAlertEnabled: false, description: '빠른 흡수를 돕는 액상 타입 영양제입니다.' }
];

const migrateUsage = (item: any) => {
    const newItem = { ...item };
    if (newItem.usage === '그린용') newItem.usage = '그린';
    else if (newItem.usage === '티/페어웨이용') newItem.usage = '페어웨이';
    if (!newItem.description) newItem.description = '';
    return newItem;
};

const runMigration = () => {
    const db = getDatabase();
    
    // Check if we need to migrate approval status for existing users
    let needsSave = false;
    db.users.forEach(user => {
        if (user.isApproved === undefined) {
            user.isApproved = true; // Auto-approve existing users during migration
            needsSave = true;
        }
    });

    if (db.users.length > 0 && !needsSave) return; // Already migrated or fresh install

    console.log("Running one-time data migration...");

    try {
        // Migrate users
        const oldUsersRaw = localStorage.getItem('turf_users');
        const oldUsers = oldUsersRaw ? JSON.parse(oldUsersRaw) : [{ username: 'admin', password: 'admin', golfCourse: '관리자', isApproved: true }];
        
        // Merge old users if DB was empty, otherwise we just updated existing db above
        if (db.users.length === 0) {
            db.users = oldUsers.map((u: User) => ({...u, isApproved: u.isApproved ?? true}));
        }

        // Migrate data for each user
        for (const user of oldUsers) {
            const username = user.username;

            // Fertilizers
            const fertKey = `turf_fertilizers_${username}`;
            const oldFertRaw = localStorage.getItem(fertKey);
            if (oldFertRaw) {
                db.fertilizers[username] = JSON.parse(oldFertRaw).map(migrateUsage);
                localStorage.removeItem(fertKey);
            } else if (username === 'admin') {
                db.fertilizers.admin = initialFertilizers.map(migrateUsage);
            }

            // Logs
            const logKey = `turf_log_${username}`;
            const oldLogRaw = localStorage.getItem(logKey);
            if (oldLogRaw) {
                db.logs[username] = JSON.parse(oldLogRaw).map(migrateUsage);
                localStorage.removeItem(logKey);
            }

            // Settings
            const greenArea = localStorage.getItem(`turf_greenArea_${username}`) || '';
            const teeArea = localStorage.getItem(`turf_teeArea_${username}`) || '';
            const fairwayArea = localStorage.getItem(`turf_fairwayArea_${username}`) || localStorage.getItem(`turf_teeFairwayArea_${username}`) || '';
            const selectedGuide = localStorage.getItem(`turf_selectedGuide_${username}`) || Object.keys(FERTILIZER_GUIDE)[0];
            db.settings[username] = { greenArea, teeArea, fairwayArea, selectedGuide };
            localStorage.removeItem(`turf_greenArea_${username}`);
            localStorage.removeItem(`turf_teeArea_${username}`);
            localStorage.removeItem(`turf_fairwayArea_${username}`);
            localStorage.removeItem(`turf_teeFairwayArea_${username}`);
            localStorage.removeItem(`turf_selectedGuide_${username}`);
            
            // Notification Settings
            const notifKey = `turf_notifications_${username}`;
            const oldNotifRaw = localStorage.getItem(notifKey);
            if (oldNotifRaw) {
                db.notificationSettings[username] = JSON.parse(oldNotifRaw);
                localStorage.removeItem(notifKey);
            }
        }
        
        // Ensure admin user exists and is approved
        if (!db.users.some(u => u.username === 'admin')) {
            db.users.push({ username: 'admin', password: 'admin', golfCourse: '관리자', isApproved: true });
        } else {
             const admin = db.users.find(u => u.username === 'admin');
             if (admin) admin.isApproved = true;
        }
        
        if(!db.fertilizers.admin) {
            db.fertilizers.admin = initialFertilizers.map(migrateUsage);
        }

        saveDatabase(db);
        localStorage.removeItem('turf_users');
        console.log("Migration complete.");
    } catch (e) {
        console.error("Migration failed:", e);
    }
};

// Run migration once on startup
runMigration();

// --- User Management ---
export const validateUser = async (username: string, password_provided: string): Promise<User | 'pending' | null> => {
    await simulateDelay(50);
    const db = getDatabase();
    const user = db.users.find(u => u.username === username && u.password === password_provided);
    if (user) {
        if (!user.isApproved) {
            return 'pending';
        }
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    return null;
};

export const createUser = async (username: string, password_provided: string, golfCourse: string): Promise<User | 'exists' | 'invalid'> => {
    await simulateDelay(100);
    if (!username.trim() || !password_provided || !golfCourse.trim()) {
        return 'invalid';
    }
    const db = getDatabase();
    if (db.users.some(u => u.username === username)) {
        return 'exists';
    }
    // New users are NOT approved by default (except maybe the very first one if logic dictates, but we'll stick to secure default)
    const newUser: User = { username, password: password_provided, golfCourse, isApproved: false };
    db.users.push(newUser);
    saveDatabase(db);
    const { password, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
};

export const approveUser = async (username: string): Promise<void> => {
    await simulateDelay(100);
    const db = getDatabase();
    const user = db.users.find(u => u.username === username);
    if (user) {
        user.isApproved = true;
        saveDatabase(db);
    }
};

export const getUser = async (username: string): Promise<User | null> => {
    await simulateDelay(50);
    const db = getDatabase();
    const user = db.users.find(u => u.username === username);
    if (user) {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    return null;
};

export const deleteUser = async (username: string): Promise<void> => {
    await simulateDelay(100);
    const db = getDatabase();
    
    // Remove user
    db.users = db.users.filter(u => u.username !== username);
    
    // Remove associated data
    if (db.fertilizers[username]) delete db.fertilizers[username];
    if (db.logs[username]) delete db.logs[username];
    if (db.settings[username]) delete db.settings[username];
    if (db.notificationSettings[username]) delete db.notificationSettings[username];
    
    saveDatabase(db);
};

// --- Data Functions ---

export const getFertilizers = async (username: string): Promise<Fertilizer[]> => {
    await simulateDelay(200);
    const db = getDatabase();
    const fertilizers = db.fertilizers[username] || [];
    return fertilizers.map((item: any) => ({
        ...item,
        stock: item.stock ?? 0,
        lowStockAlertEnabled: item.lowStockAlertEnabled ?? false,
        description: item.description ?? '', // Ensure description exists
    }));
};

export const saveFertilizers = async (username: string, fertilizers: Fertilizer[]): Promise<void> => {
    await simulateDelay(100);
    const db = getDatabase();
    db.fertilizers[username] = fertilizers;
    saveDatabase(db);
};

export const getLog = async (username: string): Promise<LogEntry[]> => {
    await simulateDelay(200);
    const db = getDatabase();
    return db.logs[username] || [];
};

export const saveLog = async (username: string, log: LogEntry[]): Promise<void> => {
    await simulateDelay(100);
    const db = getDatabase();
    db.logs[username] = log;
    saveDatabase(db);
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
    await simulateDelay(150);
    const db = getDatabase();
    const userSettings = db.settings[username];
    
    const defaultManualTargets = {
        '그린': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '티': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '페어웨이': Array(12).fill({ N: 0, P: 0, K: 0 }),
    };

    if (userSettings) {
        // Handle migration from array to object if old data exists
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

        return { ...userSettings, manualTargets };
    }

    return {
        greenArea: '',
        teeArea: '',
        fairwayArea: '',
        selectedGuide: Object.keys(FERTILIZER_GUIDE)[0],
        manualPlanMode: false,
        manualTargets: defaultManualTargets,
        fairwayGuideType: 'KBG'
    };
};

export const saveSettings = async (username: string, settings: UserSettings): Promise<void> => {
    await simulateDelay(50);
    const db = getDatabase();
    db.settings[username] = settings;
    saveDatabase(db);
};


export const getNotificationSettings = async (username: string): Promise<NotificationSettings> => {
    await simulateDelay(100);
    const db = getDatabase();
    const settings = db.notificationSettings[username];
    if (settings) {
        return settings;
    }
    // Return default settings if none found
    return { enabled: false, email: '', threshold: 10 };
};

export const saveNotificationSettings = async (username: string, settings: NotificationSettings): Promise<void> => {
    await simulateDelay(100);
    const db = getDatabase();
    db.notificationSettings[username] = settings;
    saveDatabase(db);
};

export const getAllUsersData = async (): Promise<UserDataSummary[]> => {
    await simulateDelay(300);
    const db = getDatabase();
    const allData: UserDataSummary[] = [];

    for (const user of db.users) {
        if (user.username === 'admin') continue;

        const logs = db.logs[user.username] || [];
        const fertilizers = db.fertilizers[user.username] || []; // User-specific, but they don't have one, so it will be empty
        const totalCost = logs.reduce((sum, entry) => sum + (entry.totalCost || 0), 0);
        
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
            isApproved: user.isApproved ?? true, // Default to true if missing for display
        });
    }
    return allData;
};
