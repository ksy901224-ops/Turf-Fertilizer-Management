
import React, { useState, useEffect, useMemo } from 'react';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { Chatbot } from './Chatbot';
import * as api from './api';
import { Fertilizer, LogEntry } from './types';
import { FERTILIZER_GUIDE, MONTHLY_DISTRIBUTION } from './constants';
import { ChatIcon, LogoutIcon, CloseIcon, CalendarIcon, CalculatorIcon, ClipboardListIcon, ChevronDownIcon, ChevronUpIcon } from './icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line } from 'recharts';

// --- Components ---

interface FertilizerDetailModalProps {
    fertilizer: Fertilizer;
    onClose: () => void;
}

const FertilizerDetailModal: React.FC<FertilizerDetailModalProps> = ({ fertilizer, onClose }) => {
    const [area, setArea] = useState<string>('');
    const [rate, setRate] = useState<string>('');

    // Parse rate string to number (e.g., "20g/m2" -> 20)
    const defaultRate = parseFloat(fertilizer.rate) || 0;
    const isLiquid = fertilizer.type === '액상' || fertilizer.type === '기능성제제' || fertilizer.unit.toLowerCase().includes('l') || fertilizer.unit.toLowerCase().includes('ml');

    const calculated = useMemo(() => {
        const areaNum = parseFloat(area) || 0;
        const rateNum = parseFloat(rate) || 0;
        
        // Product Amount
        // Solid: rate(g/m2) * area(m2) / 1000 = kg
        // Liquid: rate(ml/m2) * area(m2) / 1000 = L
        const totalAmount = (rateNum * areaNum) / 1000;
        
        // Cost
        // Price per unit (e.g. 20kg or 10L)
        // Unit string parsing: "20kg" -> 20
        const unitSize = parseFloat(fertilizer.unit) || 1;
        const pricePerUnit = fertilizer.price;
        const totalCost = (totalAmount / unitSize) * pricePerUnit;

        return { totalAmount, totalCost };
    }, [area, rate, fertilizer]);

    // Nutrient Analysis per m2 at default rate
    const nutrientAnalysis = useMemo(() => {
        const rateVal = defaultRate; // g/m2 or ml/m2
        // For liquid, we need density to convert ml to g if NPK is w/w. 
        // Assuming NPK is w/w, and density provided. If no density, assume 1.
        const density = fertilizer.density || 1;
        const gramsPerM2 = isLiquid ? rateVal * density : rateVal;

        const getNutrientAmount = (percent: number) => (gramsPerM2 * percent) / 100;

        return {
            N: getNutrientAmount(fertilizer.N),
            P: getNutrientAmount(fertilizer.P),
            K: getNutrientAmount(fertilizer.K),
            // Add others if needed
        };
    }, [fertilizer, defaultRate, isLiquid]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <div>
                         <h3 className="font-bold text-lg text-slate-800">{fertilizer.name}</h3>
                         <span className="text-xs text-slate-500">{fertilizer.type} | {fertilizer.usage}</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><CloseIcon /></button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Description Section - Added based on request */}
                    {fertilizer.description && (
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <h4 className="font-bold text-slate-700 mb-2 text-sm">📝 제품 특징</h4>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                                {fertilizer.description}
                            </p>
                        </div>
                    )}

                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">포장 단위</span>
                            <span className="font-semibold">{fertilizer.unit}</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">가격</span>
                            <span className="font-semibold">{fertilizer.price.toLocaleString()}원</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">권장 사용량</span>
                            <span className="font-semibold">{fertilizer.rate}</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">성분 (N-P-K)</span>
                            <span className="font-semibold">{fertilizer.N}-{fertilizer.P}-{fertilizer.K}</span>
                        </div>
                    </div>

                    {/* Nutrient Breakdown */}
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2 text-sm">🧪 영양소 분석 (권장량 기준)</h4>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-xs text-blue-600 font-bold">N (질소)</div>
                                <div className="text-lg font-bold text-slate-800">{nutrientAnalysis.N.toFixed(2)}g</div>
                                <div className="text-[10px] text-slate-500">per ㎡</div>
                            </div>
                            <div>
                                <div className="text-xs text-blue-600 font-bold">P (인산)</div>
                                <div className="text-lg font-bold text-slate-800">{nutrientAnalysis.P.toFixed(2)}g</div>
                                <div className="text-[10px] text-slate-500">per ㎡</div>
                            </div>
                            <div>
                                <div className="text-xs text-blue-600 font-bold">K (칼륨)</div>
                                <div className="text-lg font-bold text-slate-800">{nutrientAnalysis.K.toFixed(2)}g</div>
                                <div className="text-[10px] text-slate-500">per ㎡</div>
                            </div>
                        </div>
                    </div>

                    {/* Calculator */}
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2 text-sm flex items-center gap-2"><CalculatorIcon /> 필요량 계산기</h4>
                        <div className="bg-slate-50 p-4 rounded-lg border space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">면적 (㎡)</label>
                                    <input 
                                        type="number" 
                                        value={area} 
                                        onChange={e => setArea(e.target.value)} 
                                        className="w-full border p-2 rounded text-sm"
                                        placeholder="예: 500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">사용량 ({isLiquid ? 'ml' : 'g'}/㎡)</label>
                                    <input 
                                        type="number" 
                                        value={rate} 
                                        onChange={e => setRate(e.target.value)} 
                                        className="w-full border p-2 rounded text-sm"
                                        placeholder={defaultRate.toString()}
                                    />
                                </div>
                            </div>
                            
                            {(calculated.totalAmount > 0) && (
                                <div className="border-t pt-3 mt-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sm text-slate-600">총 필요 제품량:</span>
                                        <span className="text-lg font-bold text-purple-600">
                                            {calculated.totalAmount.toFixed(1)} {isLiquid ? 'L' : 'kg'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-600">예상 비용:</span>
                                        <span className="text-lg font-bold text-slate-800">
                                            {Math.round(calculated.totalCost).toLocaleString()}원
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main App Component ---

export default function App() {
    const [user, setUser] = useState<string | null>(null);
    const [fertilizers, setFertilizers] = useState<Fertilizer[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    
    // UI State
    const [activeFertilizerListTab, setActiveFertilizerListTab] = useState('전체');
    const [detailModalFertilizer, setDetailModalFertilizer] = useState<Fertilizer | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    // Log Input State
    const [activeLogTab, setActiveLogTab] = useState<'그린'|'티'|'페어웨이'>('그린');
    const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [logArea, setLogArea] = useState('');
    const [applicationRate, setApplicationRate] = useState('');
    const [productSearch, setProductSearch] = useState('');

    // Analysis State
    const [isCumulative, setIsCumulative] = useState(false);

    useEffect(() => {
        if (user && user !== 'admin') {
            loadUserData();
        }
    }, [user]);

    const loadUserData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [ferts, userLogs] = await Promise.all([
                api.getFertilizers(user),
                api.getLog(user)
            ]);
            setFertilizers(ferts);
            setLogs(userLogs);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Filtered Fertilizers for Dropdown
    const filteredFertilizersForLog = useMemo(() => {
        return fertilizers.filter(f => 
            (activeLogTab === '그린' ? f.usage === '그린' : 
             activeLogTab === '티' ? f.usage === '티' : 
             f.usage === '페어웨이') &&
            f.name.toLowerCase().includes(productSearch.toLowerCase())
        );
    }, [fertilizers, activeLogTab, productSearch]);

    // Nutrient Preview
    const nutrientPreview = useMemo(() => {
        const product = fertilizers.find(f => f.name === selectedProduct);
        const rate = parseFloat(applicationRate) || 0;
        if (!product || rate <= 0) return { N: 0, P: 0, K: 0 };

        const isLiquid = product.type === '액상' || product.type === '기능성제제' || product.unit.toLowerCase().includes('l') || product.unit.toLowerCase().includes('ml');
        const density = product.density || 1;
        const gramsPerM2 = isLiquid ? rate * density : rate;

        return {
            N: (gramsPerM2 * product.N) / 100,
            P: (gramsPerM2 * product.P) / 100,
            K: (gramsPerM2 * product.K) / 100
        };
    }, [selectedProduct, applicationRate, fertilizers]);

    const handleSaveLog = async () => {
        if (!user || !selectedProduct || !logArea || !applicationRate) return;
        const product = fertilizers.find(f => f.name === selectedProduct);
        if (!product) return;

        const areaNum = parseFloat(logArea);
        const rateNum = parseFloat(applicationRate);
        const isLiquid = product.type === '액상' || product.type === '기능성제제';
        
        // Calculate total amount (kg or L)
        const totalAmount = (rateNum * areaNum) / 1000;
        // Calculate cost
        const unitSize = parseFloat(product.unit) || 1;
        const totalCost = (totalAmount / unitSize) * product.price;

        // Calculate total nutrient amounts (g) for the whole area
        const density = product.density || 1;
        const gramsApplied = isLiquid ? rateNum * areaNum * density : rateNum * areaNum;

        const newEntry: LogEntry = {
            id: Date.now().toString(),
            date: logDate,
            product: product.name,
            area: areaNum,
            totalCost: totalCost,
            usage: activeLogTab,
            applicationRate: rateNum,
            applicationUnit: isLiquid ? 'ml/㎡' : 'g/㎡',
            nutrients: {
                N: (gramsApplied * product.N) / 100,
                P: (gramsApplied * product.P) / 100,
                K: (gramsApplied * product.K) / 100,
                // Add others if needed
            }
        };

        const updatedLogs = [...logs, newEntry];
        setLogs(updatedLogs);
        await api.saveLog(user, updatedLogs);
        
        // Reset form
        setSelectedProduct('');
        setApplicationRate('');
        alert('시비 기록이 저장되었습니다.');
    };

    const handleDeleteLog = async (id: string) => {
        if (!user || !window.confirm('삭제하시겠습니까?')) return;
        const updatedLogs = logs.filter(l => l.id !== id);
        setLogs(updatedLogs);
        await api.saveLog(user, updatedLogs);
    };

    // Analysis Data Preparation
    const analysisData = useMemo(() => {
        // Aggregate by month
        const data: Record<string, { month: string, N: number, P: number, K: number, N_cum: number, P_cum: number, K_cum: number }> = {};
        
        // Initialize 12 months
        for (let i = 1; i <= 12; i++) {
            const m = `${new Date().getFullYear()}-${String(i).padStart(2, '0')}`;
            data[m] = { month: `${i}월`, N: 0, P: 0, K: 0, N_cum: 0, P_cum: 0, K_cum: 0 };
        }

        // Sort logs
        const sortedLogs = [...logs].sort((a,b) => a.date.localeCompare(b.date));

        // Group by month
        sortedLogs.forEach(log => {
            const m = log.date.substring(0, 7); // YYYY-MM
            if (data[m]) {
                // We want g/m2 per log. 
                // Log stores total nutrients (g). We need to divide by area?
                // Or better, use the nutrientPreview logic: g/m2 calculated from rate.
                // LogEntry has nutrients (Total grams).
                // g/m2 = total grams / area.
                const n_m2 = log.nutrients.N / log.area;
                const p_m2 = log.nutrients.P / log.area;
                const k_m2 = log.nutrients.K / log.area;

                data[m].N += n_m2;
                data[m].P += p_m2;
                data[m].K += k_m2;
            }
        });

        // Calculate cumulative
        const months = Object.keys(data).sort();
        let accN = 0, accP = 0, accK = 0;
        months.forEach(m => {
            accN += data[m].N;
            accP += data[m].P;
            accK += data[m].K;
            data[m].N_cum = accN;
            data[m].P_cum = accP;
            data[m].K_cum = accK;
        });

        return Object.values(data);
    }, [logs]);

    // Guide Data for Chart
    // Assuming 'Green' guide for simplicity or logic to select guide
    const currentGuide = FERTILIZER_GUIDE['한지형잔디 (벤트그라스)']; // Default
    const guideDistribution = MONTHLY_DISTRIBUTION['한지형잔디 (벤트그라스)'];

    const chartData = useMemo(() => {
        let accGuideN = 0, accGuideP = 0, accGuideK = 0;
        return analysisData.map((d, idx) => {
            // Guide monthly amount
            const gN = currentGuide.N * (guideDistribution.N[idx] || 0);
            const gP = currentGuide.P * (guideDistribution.P[idx] || 0);
            const gK = currentGuide.K * (guideDistribution.K[idx] || 0);
            
            accGuideN += gN;
            accGuideP += gP;
            accGuideK += gK;

            return {
                ...d,
                guideN: isCumulative ? accGuideN : gN,
                guideP: isCumulative ? accGuideP : gP,
                guideK: isCumulative ? accGuideK : gK,
                valN: isCumulative ? d.N_cum : d.N,
                valP: isCumulative ? d.P_cum : d.P,
                valK: isCumulative ? d.K_cum : d.K,
            };
        });
    }, [analysisData, isCumulative, currentGuide, guideDistribution]);

    if (!user) {
        return <Login onLogin={setUser} />;
    }

    if (user === 'admin') {
        return <AdminDashboard user={user} onLogout={() => setUser(null)} />;
    }

    return (
        <div className="min-h-screen bg-slate-100 p-4 font-sans">
            {/* Header */}
            <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm mb-6 max-w-7xl mx-auto">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">나의 잔디 관리</h1>
                    <p className="text-sm text-slate-500">{user}님 환영합니다</p>
                </div>
                <button 
                    onClick={() => setUser(null)} 
                    className="flex items-center gap-1 text-slate-500 hover:text-red-500 transition-colors"
                >
                    <span className="text-sm font-semibold">로그아웃</span>
                    <LogoutIcon />
                </button>
            </header>
            
            <main className="max-w-7xl mx-auto space-y-6">
                {/* 1. Owned Fertilizer List */}
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-slate-800">보유 비료 목록</h2>
                        <div className="flex gap-2">
                             {['전체', '그린', '티', '페어웨이'].map(tab => (
                                <button 
                                    key={tab}
                                    onClick={() => setActiveFertilizerListTab(tab)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                                        activeFertilizerListTab === tab 
                                        ? 'bg-blue-600 text-white shadow' 
                                        : 'bg-white text-slate-600 border hover:bg-slate-50'
                                    }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {loading ? (
                            <div className="col-span-full py-12 text-center text-slate-500">로딩 중...</div>
                        ) : fertilizers
                            .filter(f => activeFertilizerListTab === '전체' || f.usage === activeFertilizerListTab)
                            .map(fertilizer => (
                            <div 
                                key={fertilizer.name} 
                                onClick={() => setDetailModalFertilizer(fertilizer)}
                                className="group relative bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden h-24 flex items-center justify-center p-3"
                            >
                                <div className={`absolute top-0 left-0 w-full h-1.5 ${
                                    fertilizer.usage === '그린' ? 'bg-green-500' : 
                                    fertilizer.usage === '티' ? 'bg-blue-500' : 
                                    'bg-orange-500'
                                }`}></div>
                                
                                <h3 className="font-bold text-slate-700 text-sm text-center break-keep leading-snug line-clamp-3 px-1">
                                    {fertilizer.name}
                                </h3>
                            </div>
                        ))}
                         {!loading && fertilizers.length === 0 && (
                             <div className="col-span-full py-8 text-center text-slate-400 bg-white rounded-lg border border-dashed">
                                 등록된 비료가 없습니다. 관리자에게 문의하세요.
                             </div>
                         )}
                    </div>
                </section>

                {/* 2. Log Input Section */}
                <section className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <CalendarIcon /> 시비 기록 작성
                        </h2>
                    </div>
                    <div className="p-6">
                         {/* Tabs */}
                        <div className="flex border-b mb-6">
                            {['그린', '티', '페어웨이'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveLogTab(tab as any)}
                                    className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${
                                        activeLogTab === tab 
                                        ? 'border-blue-600 text-blue-600 bg-blue-50' 
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             {/* Inputs */}
                             <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">날짜</label>
                                    <input 
                                        type="date" 
                                        value={logDate} 
                                        onChange={e => setLogDate(e.target.value)} 
                                        className="w-full border p-2 rounded text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">비료 선택</label>
                                    <select 
                                        value={selectedProduct} 
                                        onChange={e => {
                                            setSelectedProduct(e.target.value);
                                            // Auto-fill rate if available
                                            const p = fertilizers.find(f => f.name === e.target.value);
                                            if (p) setApplicationRate(parseFloat(p.rate).toString());
                                        }} 
                                        className="w-full border p-2 rounded text-sm"
                                    >
                                        <option value="">비료를 선택하세요</option>
                                        {filteredFertilizersForLog.map(f => (
                                            <option key={f.name} value={f.name}>
                                                {f.name} ({f.N}-{f.P}-{f.K}) - 재고: {f.stock}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">면적 (㎡)</label>
                                        <input 
                                            type="number" 
                                            value={logArea} 
                                            onChange={e => setLogArea(e.target.value)} 
                                            placeholder="예: 500"
                                            className="w-full border p-2 rounded text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">사용량 (g/ml per ㎡)</label>
                                        <input 
                                            type="number" 
                                            value={applicationRate} 
                                            onChange={e => setApplicationRate(e.target.value)} 
                                            placeholder="예: 20"
                                            className="w-full border p-2 rounded text-sm"
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={handleSaveLog}
                                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 shadow-md mt-2"
                                >
                                    기록 저장
                                </button>
                             </div>

                             {/* Nutrient Preview Card */}
                             <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                                <h3 className="font-bold text-slate-700 mb-4 text-sm">🧪 순성분비 미리보기 (g/㎡)</h3>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                        <div className="text-xs text-green-600 font-bold mb-1">질소 (N)</div>
                                        <div className="text-xl font-bold text-slate-800">{nutrientPreview.N.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                        <div className="text-xs text-blue-600 font-bold mb-1">인산 (P)</div>
                                        <div className="text-xl font-bold text-slate-800">{nutrientPreview.P.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-white p-3 rounded shadow-sm border border-slate-100">
                                        <div className="text-xs text-orange-600 font-bold mb-1">칼륨 (K)</div>
                                        <div className="text-xl font-bold text-slate-800">{nutrientPreview.K.toFixed(2)}</div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 mt-4 text-center">
                                    * 입력한 사용량 기준 1㎡당 투입되는 순수 비료 성분량입니다.
                                </p>
                             </div>
                        </div>
                    </div>
                </section>

                {/* 3. Analysis Charts */}
                <section className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <ClipboardListIcon /> 월별 투입 현황 및 분석
                        </h2>
                        <div className="flex bg-slate-200 rounded p-1">
                            <button 
                                onClick={() => setIsCumulative(false)}
                                className={`px-3 py-1 text-xs font-bold rounded ${!isCumulative ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}
                            >
                                월별 보기
                            </button>
                            <button 
                                onClick={() => setIsCumulative(true)}
                                className={`px-3 py-1 text-xs font-bold rounded ${isCumulative ? 'bg-white text-blue-600 shadow' : 'text-slate-500'}`}
                            >
                                누적 보기
                            </button>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{top: 20, right: 30, left: 0, bottom: 0}}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" fontSize={12} />
                                    <YAxis label={{ value: '투입량 (g/㎡)', angle: -90, position: 'insideLeft', style: {fontSize: 12} }} fontSize={12} />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        labelStyle={{ fontWeight: 'bold', color: '#334155' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                    
                                    {/* Bars for Actual */}
                                    <Bar dataKey="valN" name="질소(N) 투입" fill="#4ade80" barSize={20} radius={[4,4,0,0]} stackId="a" />
                                    <Bar dataKey="valP" name="인산(P) 투입" fill="#60a5fa" barSize={20} radius={[4,4,0,0]} stackId="b" />
                                    <Bar dataKey="valK" name="칼륨(K) 투입" fill="#fb923c" barSize={20} radius={[4,4,0,0]} stackId="c" />

                                    {/* Lines for Guide */}
                                    <Line type="monotone" dataKey="guideN" name="질소 가이드" stroke="#16a34a" strokeWidth={2} dot={{r: 4}} />
                                    <Line type="monotone" dataKey="guideP" name="인산 가이드" stroke="#2563eb" strokeWidth={2} dot={{r: 4}} />
                                    <Line type="monotone" dataKey="guideK" name="칼륨 가이드" stroke="#ea580c" strokeWidth={2} dot={{r: 4}} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>
            </main>
            
            {/* Detail Modal */}
            {detailModalFertilizer && (
                <FertilizerDetailModal 
                    fertilizer={detailModalFertilizer} 
                    onClose={() => setDetailModalFertilizer(null)} 
                />
            )}
            
            {/* Chatbot */}
            <button 
                onClick={() => setIsChatOpen(true)}
                className="fixed bottom-6 right-6 p-4 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-transform hover:scale-105 z-40 flex items-center justify-center w-14 h-14"
                aria-label="Open Chatbot"
            >
                <ChatIcon />
            </button>
            <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </div>
    );
}
