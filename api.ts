
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

// 2025 E&L Catalog Fertilizers
const initialFertilizers: Fertilizer[] = [
    // --- 1. Green Slow Release ---
    { name: 'HPG-N16 (16-2-12)', usage: '그린', type: '완효성', N:16, P:2, K:12, Ca:2, Mg:1, S:4, Mn:0.5, Fe:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:90000, unit:'20kg', rate:'15-20g/㎡', npkRatio:'16-2-12', stock: 50 },
    { name: 'HPG-N10 (10-10-10)', usage: '그린', type: '완효성', N:10, P:10, K:10, Ca:8, Mg:4, S:3.5, Fe:1, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:80000, unit:'20kg', rate:'20g/㎡', npkRatio:'10-10-10', stock: 50 },
    { name: 'HPG-K25 (0-0-25)', usage: '그린', type: '완효성', N:0, P:0, K:25, Ca:10, Mg:6, S:16.8, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:80000, unit:'20kg', rate:'20g/㎡', npkRatio:'0-0-25', stock: 50 },
    { name: 'HPG-P20 (0-20-0)', usage: '그린', type: '완효성', N:0, P:20, K:0, Ca:17.8, Mg:4, Fe:1.5, Mn:0.05, S:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:80000, unit:'20kg', rate:'20g/㎡', npkRatio:'0-20-0', stock: 50 },
    { name: '썰포그린 (0-0-22)', usage: '그린', type: '완효성', N:0, P:0, K:22, Ca:9.7, Mg:11, S:7.5, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:78000, unit:'22.7kg', rate:'20g/㎡', npkRatio:'0-0-22', stock: 50 },
    
    // --- 2. Liquid / Functional ---
    { name: '프리미엄 슈퍼파라오', usage: '그린', type: '액상', N:6, P:3, K:2, Mg:2, Ca:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:50000, unit:'500ml', rate:'0.25-0.5ml/㎡', npkRatio:'6-3-2', stock: 50 },
    { name: '바이오마스타', usage: '그린', type: '기능성제제', N:0, P:0, K:0, Mn:0.75, Mg:1.5, S:4, B:0.16, Fe:3.5, Mo:0.003, Zn:0.75, Ca:0, Cu:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:165000, unit:'9.45L', rate:'1-2.5ml/㎡', npkRatio:'-', stock: 20 },
    { name: '트리플A', usage: '그린', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:50000, unit:'250ml', rate:'0.25ml/㎡', npkRatio:'-', stock: 50 },
    { name: '리브터프 (Rev Turf)', usage: '그린', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:230000, unit:'9.45L', rate:'1-1.5ml/㎡', npkRatio:'-', stock: 20 },
    { name: '마이크로맥스', usage: '그린', type: '액상', N:0, P:0, K:0, Mg:1.3, Zn:2.6, Fe:2.6, Mn:2.0, B:1.0, S:4.5, Cu:0.33, Mo:0.33, Ca:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:35000, unit:'1L', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '스마트올', usage: '그린', type: '액상', N:10, P:0, K:0, Ca:17, Mg:4, B:0.1, Cu:0.002, Mn:0.01, Zn:0.12, S:0, Fe:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:35000, unit:'1L', rate:'1-1.5ml/㎡', npkRatio:'10-0-0', stock: 50 },
    
    // --- 3. 4-Type Complex / Liquid ---
    { name: '컨버지 (18-3-6)', usage: '그린', type: '4종복합비료', N:18, P:3, K:6, Fe:0.1, Mn:0.05, Cu:0.05, Zn:0.05, Ca:0, Mg:0, S:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:120000, unit:'9.45L', rate:'2-4ml/㎡', npkRatio:'18-3-6', stock: 30 },
    { name: '플랜트 스타트 (8-27-2)', usage: '그린', type: '액상', N:8, P:27, K:2, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:165000, unit:'9.45L', rate:'4-5ml/㎡', npkRatio:'8-27-2', stock: 30 },
    { name: '인사이트 (3-12-0)', usage: '그린', type: '액상', N:3, P:12, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:165000, unit:'9.45L', rate:'1-2ml/㎡', npkRatio:'3-12-0', stock: 30 },
    { name: '뉴트리텐 (10-10-10)', usage: '그린', type: '4종복합비료', N:10, P:10, K:10, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:35000, unit:'1L', rate:'1ml/㎡', npkRatio:'10-10-10', stock: 50 },
    { name: '뉴트리아이언', usage: '그린', type: '액상', N:0, P:0, K:0, Fe:7, Ca:0, Mg:0, S:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:35000, unit:'1L', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '30-K', usage: '그린', type: '액상', N:0, P:0, K:30, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:145000, unit:'9.45L', rate:'1-4ml/㎡', npkRatio:'0-0-30', stock: 30 },
    { name: '아이언셔틀', usage: '그린', type: '액상', N:0, P:0, K:0, Fe:7, Ca:0, Mg:0, S:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'5L', rate:'1-2ml/㎡', npkRatio:'-', stock: 40 },
    { name: '트리플텐 (10-10-10)', usage: '그린', type: '4종복합비료', N:10, P:10, K:10, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'5L', rate:'1-2ml/㎡', npkRatio:'10-10-10', stock: 40 },
    { name: '아미노규산 플러스', usage: '그린', type: '액상', N:0, P:0, K:0, Si:21, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Ni:0, Co:0, V:0, price:20000, unit:'1L', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '아미노칼슘 플러스', usage: '그린', type: '액상', N:0, P:0, K:0, Ca:21, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:20000, unit:'1L', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '슈퍼탱크', usage: '그린', type: '액상', N:0, P:0, K:0, Ca:14, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:30000, unit:'1L', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '포타슘실리게이트', usage: '그린', type: '액상', N:0, P:0, K:15.3, Si:17.3, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Ni:0, Co:0, V:0, price:35000, unit:'1L', rate:'1ml/㎡', npkRatio:'0-0-15', stock: 50 },

    // --- 4. Fairway / Tee Granular ---
    { name: '엘리스페어12 (12-5-15)', usage: '페어웨이', type: '완효성', N:12, P:5, K:15, S:7, Fe:4, Mn:0.5, Zn:0.1, Ca:0, Mg:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:57000, unit:'20kg', rate:'20-30g/㎡', npkRatio:'12-5-15', stock: 100 },
    { name: '엘리스페어15 (15-3-15)', usage: '페어웨이', type: '완효성', N:15, P:3, K:15, S:5.3, Fe:4, Mn:0.5, Zn:0.1, Ca:0, Mg:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:54000, unit:'20kg', rate:'20-30g/㎡', npkRatio:'15-3-15', stock: 100 },
    { name: '뉴리더플러스 (13-5-14)', usage: '페어웨이', type: '완효성', N:13, P:5, K:14, Mg:1.5, B:0.15, Ca:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:35000, unit:'20kg', rate:'20-30g/㎡', npkRatio:'13-5-14', stock: 100 },
    { name: '뉴리더터프15 (15-6-18)', usage: '페어웨이', type: '완효성', N:15, P:6, K:18, Mg:2, B:0.2, Ca:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:32000, unit:'20kg', rate:'20-30g/㎡', npkRatio:'15-6-18', stock: 100 },
    { name: '뉴리더터프12 (12-5-17)', usage: '페어웨이', type: '완효성', N:12, P:5, K:17, Mg:4, B:0.4, Ca:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:23000, unit:'20kg', rate:'20-30g/㎡', npkRatio:'12-5-17', stock: 100 },
    { name: '뉴트리 G (Micro)', usage: '그린', type: '완효성', N:0, P:0, K:0, Ca:10, Mg:6, S:5, B:1, Cu:0.5, Fe:5, Mn:2, Mo:0.1, Zn:2.5, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:78000, unit:'20kg', rate:'15-20g/㎡', npkRatio:'-', stock: 50 },
    
    // --- 5. Amendments & Special ---
    { name: '프리미엄 라임플러스', usage: '페어웨이', type: '토양개량제', N:0, P:0, K:0, Ca:29, Mg:14, S:3, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:15000, unit:'20kg', rate:'50-100g/㎡', npkRatio:'-', stock: 50 },
    { name: 'Cal-CM+', usage: '페어웨이', type: '토양개량제', N:0, P:0, K:0, Ca:23, S:18, Mg:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:38000, unit:'22.7kg', rate:'50-250g/㎡', npkRatio:'-', stock: 50 },
    { name: '짚라이프 (Gyp-Life)', usage: '페어웨이', type: '토양개량제', N:0, P:0, K:0, Ca:19.55, S:15.31, Mg:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:30000, unit:'1L', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '퍼펙트 켈프', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:40000, unit:'1L', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '루츠그로우2', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:28000, unit:'1L', rate:'1-2ml/㎡', npkRatio:'-', stock: 50 },
    { name: '아미노칼마그', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:24, Mg:3.2, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:20000, unit:'500g', rate:'0.5-0.7g/㎡', npkRatio:'-', stock: 50 },
    { name: '아미노스타', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:60000, unit:'10L', rate:'2ml/㎡', npkRatio:'-', stock: 20 },
    { name: '에이지파이트 (AG-Phite)', usage: '티', type: '액상', N:0, P:31, K:29, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:250000, unit:'9.45L', rate:'1-2ml/㎡', npkRatio:'0-31-29', stock: 20 },
    { name: '리퀴파이 (Liqui-Phi)', usage: '티', type: '액상', N:0, P:0, K:25, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:190000, unit:'9.45L', rate:'1-2ml/㎡', npkRatio:'0-0-25', stock: 20 },
    { name: '뉴가디언', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:35000, unit:'500ml', rate:'0.5-1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '듀 드러퍼', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:260000, unit:'9.45L', rate:'1-2ml/㎡', npkRatio:'-', stock: 20 },
    { name: '듀 다운', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:135000, unit:'5L', rate:'1-2ml/㎡', npkRatio:'-', stock: 20 },
    { name: '탑코트 (TopCoat)', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:450000, unit:'9.45L', rate:'1-2ml/㎡', npkRatio:'-', stock: 20 },
    { name: '노쿠레이트', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:180000, unit:'9.45L', rate:'1-2ml/㎡', npkRatio:'-', stock: 20 },
    { name: '프로스트킵', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:35000, unit:'1L', rate:'1-2ml/㎡', npkRatio:'-', stock: 50 },
    { name: '다코타피트', usage: '티', type: '토양개량제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:29000, unit:'31L', rate:'-', npkRatio:'-', stock: 50 },
    { name: '자이언트UV', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:40000, unit:'1L', rate:'1-1.5ml/㎡', npkRatio:'-', stock: 50 },
    
    // --- 6. Special Products ---
    { name: '에포리온 액제', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'2kg', rate:'-', npkRatio:'-', stock: 20 },
    { name: '인슈어(insure)', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:25000, unit:'500ml', rate:'-', npkRatio:'-', stock: 50 },
    { name: '그린챔프', usage: '그린', type: '4종복합비료', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:15000, unit:'500ml', rate:'1ml/㎡', npkRatio:'-', stock: 50 },
    { name: '민앤 그린', usage: '페어웨이', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:280000, unit:'9.45L', rate:'2-4ml/㎡', npkRatio:'-', stock: 20 },
    { name: '그린앤그린', usage: '페어웨이', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:250000, unit:'10L', rate:'2-4ml/㎡', npkRatio:'-', stock: 20 },
    { name: '블루라군 SS', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:100000, unit:'946ml', rate:'-', npkRatio:'-', stock: 30 },
    { name: '빅풋블루SS', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:50000, unit:'946ml', rate:'-', npkRatio:'-', stock: 30 },
    { name: '빅풋포미', usage: '티', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:130000, unit:'3.78L', rate:'-', npkRatio:'-', stock: 30 },
    { name: '솔솔900', usage: '그린', type: '토양개량제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:250000, unit:'18.1kg', rate:'20-30g/㎡', npkRatio:'-', stock: 20 },
    { name: '대취프리', usage: '그린', type: '토양개량제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:65000, unit:'5L', rate:'-', npkRatio:'-', stock: 30 },
    
    // --- 7. Soluble Fertilizers ---
    { name: 'JS MAP (12-61-0)', usage: '페어웨이', type: '수용성', N:12, P:61, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:90000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'12-61-0', stock: 50 },
    { name: 'JS MKP (0-52-32)', usage: '페어웨이', type: '수용성', N:0, P:52, K:32, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:120000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'0-52-32', stock: 50 },
    { name: 'JS NK (13-0-46)', usage: '페어웨이', type: '수용성', N:13, P:0, K:46, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:90000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'13-0-46', stock: 50 },
    { name: 'Smartro NPK (30-10-10)', usage: '페어웨이', type: '수용성', N:30, P:10, K:10, B:0.02, Zn:0.01, Fe:0.05, Mo:0.001, Mn:0.02, Cu:0.01, Mg:2, Ca:0, S:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:40000, unit:'10kg', rate:'1-4g/㎡', npkRatio:'30-10-10', stock: 50 },
    { name: 'Smartro NPK (10-10-30)', usage: '페어웨이', type: '수용성', N:10, P:10, K:30, B:0.02, Zn:0.01, Fe:0.05, Mo:0.001, Mn:0.02, Cu:0.01, Mg:2, Ca:0, S:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:40000, unit:'10kg', rate:'1-4g/㎡', npkRatio:'10-10-30', stock: 50 },
    { name: 'Smartro NPK (20-20-20)', usage: '페어웨이', type: '수용성', N:20, P:20, K:20, B:0.02, Zn:0.01, Fe:0.05, Mo:0.001, Mn:0.02, Cu:0.01, Mg:2, Ca:0, S:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:60000, unit:'10kg', rate:'1-4g/㎡', npkRatio:'20-20-20', stock: 50 },
    { name: 'EDTA-Fe', usage: '페어웨이', type: '수용성', N:0, P:0, K:0, Fe:13, Ca:0, Mg:0, S:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:270000, unit:'25kg', rate:'1-2g/㎡', npkRatio:'-', stock: 50 },
    { name: 'FE DTPA', usage: '페어웨이', type: '수용성', N:0, P:0, K:0, Fe:6, Ca:0, Mg:0, S:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:230000, unit:'25kg', rate:'1-2g/㎡', npkRatio:'-', stock: 50 },
    { name: '질산칼슘', usage: '페어웨이', type: '수용성', N:15, P:0, K:0, Ca:26, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:40000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'15-0-0', stock: 50 },
    { name: '황산마그네슘', usage: '페어웨이', type: '수용성', N:0, P:0, K:0, Mg:16, S:13, Ca:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:30000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'-', stock: 50 },
    { name: '황산칼륨', usage: '페어웨이', type: '수용성', N:0, P:0, K:50, S:17, Ca:0, Mg:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:65000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'0-0-50', stock: 50 },
    { name: '황산망간', usage: '페어웨이', type: '수용성', N:0, P:0, K:0, Mn:31, S:18, Ca:0, Mg:0, Fe:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:70000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'-', stock: 50 },
    { name: '황산아연', usage: '페어웨이', type: '수용성', N:0, P:0, K:0, Zn:35, S:17, Ca:0, Mg:0, Fe:0, Mn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:70000, unit:'25kg', rate:'2-5g/㎡', npkRatio:'-', stock: 50 },
    { name: '황산구리', usage: '페어웨이', type: '수용성', N:0, P:0, K:0, Cu:25, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:0, unit:'25kg', rate:'2-5g/㎡', npkRatio:'-', stock: 10 },
    
    // --- 8. Others ---
    { name: '뉴워터플로우', usage: '그린', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:9000, unit:'M당', rate:'-', npkRatio:'-', stock: 100 },
    { name: '디클라레이션 (벤트종자)', usage: '그린', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:700000, unit:'11.34kg', rate:'-', npkRatio:'-', stock: 10 },
    { name: '노넷 (톨 훼스큐)', usage: '페어웨이', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:260000, unit:'22.68kg', rate:'-', npkRatio:'-', stock: 10 },
    { name: '스노우-키 (제설제)', usage: '페어웨이', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:20000, unit:'25kg', rate:'-', npkRatio:'-', stock: 50 },
    { name: '리페어 (그린보수기)', usage: '그린', type: '기능성제제', N:0, P:0, K:0, Ca:0, Mg:0, S:0, Fe:0, Mn:0, Zn:0, Cu:0, B:0, Mo:0, Cl:0, Na:0, Si:0, Ni:0, Co:0, V:0, price:500000, unit:'EA', rate:'-', npkRatio:'-', stock: 5 }
];

const migrateUsage = (item: any) => {
    const newItem = { ...item };
    if (newItem.usage === '그린용') newItem.usage = '그린';
    else if (newItem.usage === '티/페어웨이용') newItem.usage = '페어웨이';
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
