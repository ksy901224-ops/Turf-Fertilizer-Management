import React, { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import * as api from './api';
import { Login } from './Login';
import { AdminDashboard } from './AdminDashboard';
import { Chatbot } from './Chatbot';
import { FERTILIZER_GUIDE, NUTRIENTS, MONTHLY_DISTRIBUTION } from './constants';
import { Fertilizer, LogEntry, UserSettings, UserDataSummary } from './types';
import * as Icons from './icons';

// Internal Component for Fertilizer Details
interface FertilizerDetailModalProps {
    fertilizer: Fertilizer;
    onClose: () => void;
}

const FertilizerDetailModal: React.FC<FertilizerDetailModalProps> = ({ fertilizer, onClose }) => {
    const [calcArea, setCalcArea] = useState<string>('1000');
    const [calcRate, setCalcRate] = useState<string>('');

    useEffect(() => {
        if (fertilizer.rate) {
            const numericRate = parseFloat(fertilizer.rate.replace(/[^0-9.]/g, ''));
            if (!isNaN(numericRate)) setCalcRate(numericRate.toString());
        }
    }, [fertilizer]);

    const calculated = useMemo(() => {
        const areaNum = parseFloat(calcArea) || 0;
        const rateNum = parseFloat(calcRate) || 0;
        const isLiquidRate = fertilizer.rate.includes('ml');
        
        let amountNeeded = 0;
        let amountUnit = 'kg';
        let cost = 0;

        if (isLiquidRate) {
            const totalMl = rateNum * areaNum;
            amountNeeded = totalMl / 1000; // Liters
            amountUnit = 'L';
        } else {
            const totalGrams = rateNum * areaNum;
            amountNeeded = totalGrams / 1000; // kg
        }

        const pkgUnitMatch = fertilizer.unit.match(/([\d.]+)\s*([a-zA-Z]+)/);
        let pkgSize = 20; 
        if (pkgUnitMatch) {
            pkgSize = parseFloat(pkgUnitMatch[1]);
        }
        
        const bagsNeeded = amountNeeded / pkgSize;
        cost = bagsNeeded * fertilizer.price;

        const nutrientGramsPerM2: Record<string, number> = {};
        NUTRIENTS.forEach(n => {
            const content = (fertilizer as any)[n] || 0;
            if (content > 0) {
                let weightRate = rateNum;
                if (isLiquidRate && fertilizer.density) {
                    weightRate = rateNum * fertilizer.density;
                }
                nutrientGramsPerM2[n] = weightRate * (content / 100);
            }
        });

        return { amountNeeded, amountUnit, cost, nutrientGramsPerM2 };
    }, [calcArea, calcRate, fertilizer]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{fertilizer.name}</h3>
                        <p className="text-sm text-slate-500">{fertilizer.type} | {fertilizer.usage}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><Icons.CloseIcon /></button>
                </div>
                <div className="overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">포장 단위</span>
                            <span className="font-bold text-slate-800">{fertilizer.unit}</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">가격</span>
                            <span className="font-bold text-slate-800">{fertilizer.price.toLocaleString()}원</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">권장 사용량</span>
                            <span className="font-bold text-slate-800">{fertilizer.rate}</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded">
                            <span className="block text-slate-500 text-xs">성분비 (NPK)</span>
                            <span className="font-bold text-slate-800 font-mono">{fertilizer.N}-{fertilizer.P}-{fertilizer.K}</span>
                        </div>
                    </div>
                    {fertilizer.description && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h4 className="font-bold text-blue-900 text-sm mb-2">제품 상세 특징</h4>
                            <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">{fertilizer.description}</p>
                        </div>
                    )}
                    
                    {/* Nutrient Table */}
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><Icons.ClipboardListIcon /> 성분 상세 분석</h4>
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-sm text-center">
                                <thead className="bg-slate-100 text-slate-600">
                                    <tr>
                                        <th className="p-2">성분</th>
                                        <th className="p-2">함량(%)</th>
                                        <th className="p-2">1kg당 함량(g)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {NUTRIENTS.map(n => {
                                        const val = (fertilizer as any)[n];
                                        if (!val) return null;
                                        return (
                                            <tr key={n}>
                                                <td className="p-2 font-bold text-slate-700">{n}</td>
                                                <td className="p-2">{val}%</td>
                                                <td className="p-2">{val * 10}g</td>
                                            </tr>
                                        );
                                    })}
                                    {fertilizer.aminoAcid ? (
                                        <tr className="bg-amber-50">
                                            <td className="p-2 font-bold text-amber-700">아미노산</td>
                                            <td className="p-2 text-amber-700">{fertilizer.aminoAcid}%</td>
                                            <td className="p-2 text-amber-700">{fertilizer.aminoAcid * 10}g</td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-purple-50 p-5 rounded-xl border border-purple-100">
                        <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                            <Icons.CalculatorIcon /> 필요량 및 비용 계산기
                        </h4>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-purple-800 mb-1">시비 면적 (㎡)</label>
                                <input type="number" className="w-full p-2 border border-purple-200 rounded focus:ring-2 focus:ring-purple-500 outline-none" value={calcArea} onChange={e => setCalcArea(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-purple-800 mb-1">사용량 ({fertilizer.rate.includes('ml') ? 'ml' : 'g'}/㎡)</label>
                                <input type="number" className="w-full p-2 border border-purple-200 rounded focus:ring-2 focus:ring-purple-500 outline-none" value={calcRate} onChange={e => setCalcRate(e.target.value)} />
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-purple-100 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-600 text-sm">총 필요 제품량:</span>
                                <span className="text-xl font-bold text-purple-700">{calculated.amountNeeded.toFixed(1)} {calculated.amountUnit}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-dashed">
                                <span className="text-slate-600 text-sm">예상 소요 비용:</span>
                                <span className="text-xl font-bold text-slate-800">약 {Math.round(calculated.cost).toLocaleString()}원</span>
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-xs font-bold text-purple-800 mb-2">🌱 1㎡당 투입 순성분량 (예상)</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(calculated.nutrientGramsPerM2).map(([n, val]) => (
                                    <span key={n} className="bg-white border border-purple-200 px-2 py-1 rounded text-xs text-purple-700 font-mono"><b>{n}:</b> {val.toFixed(2)}g</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

function App() {
  const [user, setUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fertilizers, setFertilizers] = useState<Fertilizer[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedFertilizerForModal, setSelectedFertilizerForModal] = useState<Fertilizer | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<any | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('turf_user');
    if (savedUser) handleLogin(savedUser);
    else setIsLoading(false);
  }, []);

  const loadUserData = async (username: string) => {
    try {
        const [loadedFertilizers, loadedLog, loadedSettings] = await Promise.all([
            api.getFertilizers(username),
            api.getLog(username),
            api.getSettings(username)
        ]);
        let finalFertilizers = loadedFertilizers;
        if (loadedFertilizers.length === 0) {
            const adminFertilizers = await api.getFertilizers('admin');
            finalFertilizers = adminFertilizers;
        }
        setFertilizers(finalFertilizers);
        setLog(loadedLog);
        setSettings(loadedSettings);
    } catch (error) {
        console.error("Failed to load user data", error);
    }
  };

  const handleLogin = async (username: string) => {
    setUser(username);
    localStorage.setItem('turf_user', username);
    if (username === 'admin') {
        setIsAdmin(true);
    } else {
        setIsAdmin(false);
        await loadUserData(username);
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    setUser(null);
    setIsAdmin(false);
    localStorage.removeItem('turf_user');
    setFertilizers([]);
    setLog([]);
    setSettings(null);
    setActiveTab('dashboard');
  };

  const { totalManagedArea, greenArea, teeArea, fairwayArea } = useMemo(() => {
      if (!settings) return { totalManagedArea: 0, greenArea: 0, teeArea: 0, fairwayArea: 0 };
      const g = Number(settings.greenArea) || 0;
      const t = Number(settings.teeArea) || 0;
      const f = Number(settings.fairwayArea) || 0;
      return { totalManagedArea: g + t + f, greenArea: g, teeArea: t, fairwayArea: f };
  }, [settings]);

  const totalSummary = useMemo(() => ({ totalCost: log.reduce((acc, curr) => acc + curr.totalCost, 0) }), [log]);
  
  const categorySummariesPerM2 = useMemo(() => {
    const sums: Record<string, Record<string, number>> = {
        '그린': {}, '티': {}, '페어웨이': {}
    };
    NUTRIENTS.forEach(n => {
        sums['그린'][n] = 0;
        sums['티'][n] = 0;
        sums['페어웨이'][n] = 0;
    });

    log.forEach(entry => {
        const area = entry.usage === '그린' ? greenArea : entry.usage === '티' ? teeArea : fairwayArea;
        if (area > 0 && entry.nutrients) {
            NUTRIENTS.forEach(n => {
                 if (entry.nutrients[n]) {
                    sums[entry.usage][n] += (entry.nutrients[n] / area);
                 }
            });
        }
    });
    return sums;
  }, [log, greenArea, teeArea, fairwayArea]);

  const monthlyNutrientChartData = useMemo(() => {
      if (!settings) return [];
      const guideKey = settings.selectedGuide;
      const guide = FERTILIZER_GUIDE[guideKey] || FERTILIZER_GUIDE[Object.keys(FERTILIZER_GUIDE)[0]];
      const distribution = MONTHLY_DISTRIBUTION[guideKey] || MONTHLY_DISTRIBUTION[Object.keys(MONTHLY_DISTRIBUTION)[0]];
      const currentYear = new Date().getFullYear();
      const months = Array.from({length: 12}, (_, i) => `${currentYear}-${String(i+1).padStart(2, '0')}`);

      return months.map((month, idx) => {
          const monthlyLogs = log.filter(l => l.date.startsWith(month));
          const actualN = monthlyLogs.reduce((sum, l) => sum + ((l.nutrients?.N || 0) / (l.area || 1)), 0);
          const actualP = monthlyLogs.reduce((sum, l) => sum + ((l.nutrients?.P || 0) / (l.area || 1)), 0);
          const actualK = monthlyLogs.reduce((sum, l) => sum + ((l.nutrients?.K || 0) / (l.area || 1)), 0);
          const distN = distribution?.N?.[idx] ?? (1/12);
          const guideN = guide.N * distN;

          return {
              month,
              N: parseFloat(actualN.toFixed(2)),
              P: parseFloat(actualP.toFixed(2)),
              K: parseFloat(actualK.toFixed(2)),
              guideN: parseFloat(guideN.toFixed(2))
          };
      });
  }, [log, settings]);

  const handleGetRecommendation = async () => {
    if (!settings) return;
    setIsLoadingAI(true);
    setAiResponse('');
    setAiError(null);
    setAiAction(null);

    const monthlyTrendData = monthlyNutrientChartData.map(d => `- ${d.month}: N(${d.N})/P(${d.P})/K(${d.K}) vs Goal N(${d.guideN})`).join('\n');
    const productUsageSummary = Object.entries(log.reduce((acc, curr) => { acc[curr.product] = (acc[curr.product] || 0) + 1; return acc; }, {} as Record<string, number>))
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name} (${count}회)`).join(', ');
    
    const prompt = `
      # 잔디 비료 관리 분석 요청
      ## 현황
      - 면적: 그린${greenArea}, 티${teeArea}, 페어웨이${fairwayArea}
      - 가이드: ${settings.selectedGuide}
      - 월별 트렌드:
      ${monthlyTrendData}
      - 사용 제품: ${productUsageSummary}
      - 보유 비료: ${fertilizers.map(f => f.name).join(', ')}

      전문가로서 시비 패턴, 리스크, 비용 효율화, 다음 시비 계획을 제안해주세요.
      답변 끝에 아래 JSON을 포함하세요:
      \`\`\`json
      { "productName": "이름", "targetArea": "구역", "rate": 숫자, "reason": "이유" }
      \`\`\`
    `;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      let text = response.text || '';
      
      let jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
          try {
              const actionData = JSON.parse(jsonMatch[1]);
              setAiAction(actionData);
              text = text.replace(/```json\s*\{[\s\S]*?\}\s*```/, '');
          } catch (e) { console.error(e); }
      }
      setAiResponse(text);
    } catch (error) {
      setAiError("AI 분석 실패. 다시 시도해주세요.");
    } finally {
      setIsLoadingAI(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Loading...</div>;
  if (!user) return <Login onLogin={handleLogin} />;
  if (isAdmin) return <AdminDashboard user={user} onLogout={handleLogout} />;

  return (
    <div className="min-h-screen bg-slate-100 font-sans pb-20">
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-2xl">⛳️</span><h1 className="text-xl font-bold text-slate-800">Turf Manager AI</h1></div>
          <div className="flex items-center gap-4"><span className="text-sm text-slate-500 hidden sm:block">{user}님</span><button onClick={handleLogout} className="text-slate-500 hover:text-red-500"><Icons.LogoutIcon /></button></div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex space-x-4 mb-6 overflow-x-auto pb-2">
            {['dashboard', 'fertilizers', 'log', 'ai'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${activeTab === tab ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {tab === 'dashboard' ? '대시보드' : tab === 'fertilizers' ? '비료 목록' : tab === 'log' ? '시비 기록' : 'AI 분석'}
                </button>
            ))}
        </div>
        {activeTab === 'dashboard' && (
            <div className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><h3 className="text-sm font-semibold text-slate-500">총 누적 비용</h3><p className="text-2xl font-bold text-slate-800 mt-2">{totalSummary.totalCost.toLocaleString()}원</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><h3 className="text-sm font-semibold text-slate-500">관리 면적</h3><p className="text-2xl font-bold text-slate-800 mt-2">{totalManagedArea.toLocaleString()}㎡</p></div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"><h3 className="text-sm font-semibold text-slate-500">시비 기록 수</h3><p className="text-2xl font-bold text-slate-800 mt-2">{log.length}회</p></div>
                 </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">월별 질소(N) 투입 현황</h3>
                    <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyNutrientChartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tickFormatter={v => v.slice(5)} /><YAxis /><Tooltip /><Legend /><Bar dataKey="N" name="실적 N" fill="#3b82f6" barSize={20} /><Line type="monotone" dataKey="guideN" name="목표 N" stroke="#ef4444" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer>
                 </div>
            </div>
        )}
        {activeTab === 'fertilizers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fertilizers.map((f, idx) => (
                    <div key={idx} onClick={() => setSelectedFertilizerForModal(f)} className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer border-t-4 border-blue-500 relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2"><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{f.usage}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{f.type}</span></div>
                        <h4 className="font-bold text-lg text-slate-800 mb-1">{f.name}</h4>
                        <div className="text-xs text-slate-500 space-y-1"><p>성분: {f.N}-{f.P}-{f.K}</p><p>{f.unit} / {f.price.toLocaleString()}원</p></div>
                    </div>
                ))}
            </div>
        )}
        {activeTab === 'ai' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="bg-blue-50 p-4 rounded-full mb-4"><Icons.SparklesIcon /></div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">AI 정밀 분석 & 추천</h2>
                    {!aiResponse && !isLoadingAI && <button onClick={handleGetRecommendation} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-2"><Icons.SparklesIcon /> 분석 시작하기</button>}
                    {isLoadingAI && <div className="mt-4 animate-pulse text-blue-600">데이터 분석 중...</div>}
                </div>
                {aiResponse && (
                    <div className="mt-8 animate-fadeIn text-left prose prose-slate max-w-none">
                        {aiResponse.split('\n').map((line, i) => <p key={i} className="mb-2 whitespace-pre-wrap">{line}</p>)}
                        {aiAction && <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200"><h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2"><Icons.CheckIcon /> 추천 실행 계획</h3><div className="bg-white p-3 rounded shadow-sm"><p className="font-bold">{aiAction.productName}</p><p className="text-sm text-slate-600">{aiAction.targetArea} / {aiAction.rate}g/㎡</p><p className="text-xs text-blue-600 mt-1">{aiAction.reason}</p></div></div>}
                    </div>
                )}
            </div>
        )}
        {activeTab === 'log' && <div className="bg-white p-6 rounded-xl shadow-sm border text-center text-slate-500"><p>시비 기록 기능 준비중 (데모)</p></div>}
      </main>
      {selectedFertilizerForModal && <FertilizerDetailModal fertilizer={selectedFertilizerForModal} onClose={() => setSelectedFertilizerForModal(null)} />}
      <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg z-30"><Icons.ChatIcon /></button>
      <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}

export default App;