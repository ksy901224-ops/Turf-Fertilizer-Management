
import React, { useState, useEffect, useMemo } from 'react';
import { Fertilizer } from './types';
import { CloseIcon, DocumentSearchIcon, CalculatorIcon } from './icons';
import { getApplicationDetails, parseRateValue } from './utils';

interface FertilizerDetailModalProps {
    fertilizer: Fertilizer;
    onClose: () => void;
}

export const FertilizerDetailModal: React.FC<FertilizerDetailModalProps> = ({ fertilizer, onClose }) => {
    const [activeTab, setActiveTab] = useState<'info' | 'calc'>('info');
    const [calcArea, setCalcArea] = useState<string>('');
    const [calcRate, setCalcRate] = useState<string>('');

    useEffect(() => {
        const defaultRate = parseRateValue(fertilizer.rate);
        if (defaultRate > 0) setCalcRate(defaultRate.toString());
    }, [fertilizer]);

    const details = useMemo(() => {
        const defaultRate = parseRateValue(fertilizer.rate);
        return getApplicationDetails(fertilizer, 1, defaultRate); // Per 1m² analysis
    }, [fertilizer]);

    const calcResult = useMemo(() => {
        const area = parseFloat(calcArea);
        const rate = parseFloat(calcRate);
        if (isNaN(area) || area <= 0 || isNaN(rate) || rate < 0) return null;
        
        const result = getApplicationDetails(fertilizer, area, rate);
        const isLiquid = fertilizer.type === '액상';
        
        // Total amount calculation
        let totalAmount = (area * rate) / 1000; // Default to kg or L (assuming input is g or ml)
        
        return {
            totalCost: result.totalCost,
            totalAmount,
            unit: isLiquid ? 'L' : 'kg'
        };
    }, [fertilizer, calcArea, calcRate]);

    const categorizedNutrients = useMemo(() => {
        return {
            primary: ['N', 'P', 'K'],
            secondary: ['Ca', 'Mg', 'S'],
            micro: ['Fe', 'Mn', 'Zn', 'Cu', 'B', 'Mo', 'Cl', 'Na', 'Si', 'Ni', 'Co', 'V']
        };
    }, []);

    const hasNutrient = (n: string) => (fertilizer as any)[n] > 0;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <header className="bg-slate-50 border-b p-4 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            {fertilizer.name}
                        </h3>
                        <div className="flex gap-2 mt-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                fertilizer.usage === '그린' ? 'bg-green-100 text-green-800' :
                                fertilizer.usage === '티' ? 'bg-blue-100 text-blue-800' :
                                'bg-orange-100 text-orange-800'
                            }`}>
                                {fertilizer.usage}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">{fertilizer.type}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <CloseIcon />
                    </button>
                </header>
                
                <div className="flex border-b">
                    <button 
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                        onClick={() => setActiveTab('info')}
                    >
                        📊 상세 정보
                    </button>
                    <button 
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'calc' ? 'text-green-600 border-b-2 border-green-600 bg-green-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                        onClick={() => setActiveTab('calc')}
                    >
                        🧮 필요량 계산기
                    </button>
                </div>

                <div className="overflow-y-auto p-6 flex-1">
                    {activeTab === 'info' ? (
                        <div className="space-y-6">
                            {/* Description Section */}
                            {fertilizer.description && (
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-700 leading-relaxed shadow-sm">
                                    <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2 text-xs uppercase tracking-wider">
                                        <DocumentSearchIcon className="w-4 h-4"/> 제품 특징
                                    </h4>
                                    <p className="whitespace-pre-line">{fertilizer.description}</p>
                                </div>
                            )}

                            {/* Basic Specs */}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">포장 단위</span>
                                    <span className="font-bold text-slate-800">{fertilizer.unit}</span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">가격</span>
                                    <span className="font-bold text-slate-800">{fertilizer.price.toLocaleString()}원</span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">권장 사용량</span>
                                    <span className="font-bold text-slate-800">{fertilizer.rate}</span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center text-center">
                                    <span className="text-slate-400 text-xs mb-1">NPK 비율</span>
                                    <span className="font-bold text-slate-800">{fertilizer.npkRatio || `${fertilizer.N}-${fertilizer.P}-${fertilizer.K}`}</span>
                                </div>
                            </div>

                            {/* Detailed Nutrient Analysis */}
                            <div>
                                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm border-b pb-2">
                                    🌱 성분 함량 및 투입량 <span className="text-[10px] font-normal text-slate-500 ml-auto">권장량 기준</span>
                                </h4>
                                
                                <div className="space-y-4">
                                    {/* Primary */}
                                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                        <p className="text-xs font-bold text-slate-500 mb-2">다량 요소 (Macro)</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {categorizedNutrients.primary.map(n => (
                                                <div key={n} className="bg-white rounded p-2 text-center border shadow-sm">
                                                    <div className={`text-xs font-bold ${n==='N'?'text-green-600':n==='P'?'text-blue-600':'text-orange-600'}`}>{n}</div>
                                                    <div className="text-sm font-bold text-slate-800">{(fertilizer as any)[n]}%</div>
                                                    <div className="text-[10px] text-slate-500 mt-1 pt-1 border-t">{details.nutrients[n]?.toFixed(2)}g/㎡</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Secondary */}
                                    {categorizedNutrients.secondary.some(hasNutrient) && (
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                            <p className="text-xs font-bold text-slate-500 mb-2">2차 요소 (Secondary)</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {categorizedNutrients.secondary.filter(hasNutrient).map(n => (
                                                    <div key={n} className="bg-white rounded p-1.5 text-center border">
                                                        <div className="text-[10px] text-slate-500 font-medium">{n}</div>
                                                        <div className="text-xs font-bold text-slate-800">{(fertilizer as any)[n]}%</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Micro & Others */}
                                    {(categorizedNutrients.micro.some(hasNutrient) || (fertilizer.aminoAcid && fertilizer.aminoAcid > 0)) && (
                                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                            <p className="text-xs font-bold text-slate-500 mb-2">미량 요소 및 기타 (Micro & Others)</p>
                                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                                {categorizedNutrients.micro.filter(hasNutrient).map(n => (
                                                    <div key={n} className="bg-white rounded p-1.5 text-center border">
                                                        <div className="text-[10px] text-slate-500 font-medium">{n}</div>
                                                        <div className="text-xs font-bold text-slate-800">{(fertilizer as any)[n]}%</div>
                                                    </div>
                                                ))}
                                                {fertilizer.aminoAcid !== undefined && fertilizer.aminoAcid > 0 && (
                                                    <div className="bg-purple-50 rounded p-1.5 text-center border border-purple-100 col-span-2">
                                                        <div className="text-[10px] text-purple-600 font-bold">아미노산</div>
                                                        <div className="text-xs font-bold text-purple-800">{fertilizer.aminoAcid}%</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100 mb-4">
                                <p className="text-sm text-green-800 font-medium mb-2">계산할 면적과 사용량을 입력하세요.</p>
                                <div className="grid gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-green-900 mb-1">시비 면적 (㎡)</label>
                                        <input 
                                            type="number" 
                                            value={calcArea} 
                                            onChange={e => setCalcArea(e.target.value)}
                                            placeholder="예: 500"
                                            className="w-full p-2 border border-green-200 rounded-md focus:ring-2 focus:ring-green-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-green-900 mb-1">사용량 ({fertilizer.type === '액상' ? 'ml' : 'g'}/㎡)</label>
                                        <input 
                                            type="number" 
                                            value={calcRate} 
                                            onChange={e => setCalcRate(e.target.value)}
                                            placeholder={parseRateValue(fertilizer.rate).toString()}
                                            className="w-full p-2 border border-green-200 rounded-md focus:ring-2 focus:ring-green-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {calcResult ? (
                                <div className="space-y-4 animate-fadeIn">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-white border rounded-xl shadow-sm text-center">
                                            <p className="text-xs text-slate-500 mb-1">총 필요 제품량</p>
                                            <p className="text-2xl font-bold text-slate-800">
                                                {calcResult.totalAmount.toFixed(1)}
                                                <span className="text-sm font-normal ml-1 text-slate-600">{calcResult.unit}</span>
                                            </p>
                                        </div>
                                        <div className="p-4 bg-white border rounded-xl shadow-sm text-center">
                                            <p className="text-xs text-slate-500 mb-1">총 예상 비용</p>
                                            <p className="text-2xl font-bold text-blue-600">
                                                {Math.round(calcResult.totalCost).toLocaleString()}
                                                <span className="text-sm font-normal ml-1 text-slate-600">원</span>
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-center text-xs text-slate-400">
                                        * 실제 구매 단위({fertilizer.unit})에 따라 비용은 달라질 수 있습니다.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    <CalculatorIcon />
                                    <p className="mt-2 text-sm">값을 입력하면 결과가 표시됩니다.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
