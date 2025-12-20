
import { Fertilizer, LogEntry, User, UserDataSummary } from './types';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, Unsubscribe, collection, getDocs } from 'firebase/firestore';

export interface UserSettings {
    greenArea: string;
    teeArea: string;
    fairwayArea: string;
    selectedGuide: string;
    manualPlanMode?: boolean;
    manualTargets?: { [area: string]: { N: number, P: number, K: number }[] };
    fairwayGuideType?: 'KBG' | 'Zoysia';
}

const DEFAULT_USER_SETTINGS: UserSettings = {
    greenArea: '',
    teeArea: '',
    fairwayArea: '',
    selectedGuide: '난지형잔디 (한국잔디)',
    manualPlanMode: false,
    manualTargets: {
        '그린': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '티': Array(12).fill({ N: 0, P: 0, K: 0 }),
        '페어웨이': Array(12).fill({ N: 0, P: 0, K: 0 }),
    },
    fairwayGuideType: 'KBG'
};

const seedAdminIfNeeded = async () => {
    try {
        const adminRef = doc(db, "users", "admin");
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
            await setDoc(adminRef, { username: 'admin', password: 'admin', golfCourse: '관리자', role: 'admin', isApproved: true });
            await setDoc(doc(db, "appData", "admin"), { logs: [], fertilizers: [], settings: DEFAULT_USER_SETTINGS });
        }
    } catch (e) { console.error("Seed error:", e); }
};

export const validateUser = async (username: string, password_provided: string): Promise<User | 'pending' | null> => {
    await seedAdminIfNeeded();
    const userSnap = await getDoc(doc(db, "users", username));
    if (userSnap.exists()) {
        const user = userSnap.data() as User;
        if (user.password === password_provided) {
            if (user.role !== 'admin' && !user.isApproved) return 'pending';
            const { password, ...safeUser } = user;
            return safeUser as User;
        }
    }
    return null;
};

export const createUser = async (username: string, password_provided: string, golfCourse: string): Promise<User | 'exists' | 'invalid'> => {
    if (!username.trim() || !password_provided || !golfCourse.trim()) return 'invalid';
    const userRef = doc(db, "users", username);
    if ((await getDoc(userRef)).exists()) return 'exists';
    const newUser: User = { username, password: password_provided, golfCourse, role: 'user', isApproved: false };
    await setDoc(userRef, newUser);
    await setDoc(doc(db, "appData", username), { logs: [], fertilizers: [], settings: DEFAULT_USER_SETTINGS });
    const { password, ...safeUser } = newUser;
    return safeUser as User;
};

export const approveUser = async (username: string) => await updateDoc(doc(db, "users", username), { isApproved: true });
export const deleteUser = async (username: string) => { await deleteDoc(doc(db, "users", username)); await deleteDoc(doc(db, "appData", username)); };

export const subscribeToAppData = (username: string, onUpdate: (data: any) => void): Unsubscribe => {
    return onSnapshot(doc(db, "appData", username), (snap) => {
        if (snap.exists()) onUpdate(snap.data());
        else onUpdate(null);
    });
};

export const saveLog = async (username: string, logs: LogEntry[]) => await setDoc(doc(db, "appData", username), { logs }, { merge: true });
export const saveFertilizers = async (username: string, fertilizers: Fertilizer[]) => await setDoc(doc(db, "appData", username), { fertilizers }, { merge: true });
export const saveSettings = async (username: string, settings: UserSettings) => await setDoc(doc(db, "appData", username), { settings }, { merge: true });

export const getFertilizers = async (username: string): Promise<Fertilizer[]> => {
    const snap = await getDoc(doc(db, "appData", username));
    return snap.exists() ? (snap.data().fertilizers || []) : [];
};

export const getAllUsersData = async (): Promise<UserDataSummary[]> => {
    const userSnapshot = await getDocs(collection(db, "users"));
    const allData: UserDataSummary[] = [];
    for (const userDoc of userSnapshot.docs) {
        const u = userDoc.data() as User;
        if (u.username === 'admin') continue;
        const appSnap = await getDoc(doc(db, "appData", u.username));
        const appData = appSnap.exists() ? appSnap.data() : { logs: [], fertilizers: [] };
        const logs = appData.logs || [];
        allData.push({
            username: u.username,
            golfCourse: u.golfCourse,
            logCount: logs.length,
            totalCost: logs.reduce((s: number, e: any) => s + (e.totalCost || 0), 0),
            lastActivity: logs.length > 0 ? [...logs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : null,
            logs,
            fertilizers: appData.fertilizers || [],
            isApproved: u.isApproved ?? true,
            role: u.role || 'user'
        });
    }
    return allData;
};
