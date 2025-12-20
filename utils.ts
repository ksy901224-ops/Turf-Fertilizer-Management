
import { Fertilizer } from './types';
import { NUTRIENTS } from './constants';

export const parseRateValue = (rateStr: string) => {
    if (!rateStr) return 0;
    const m = rateStr.toString().match(/([0-9]+(\.[0-9]+)?)/);
    return m ? parseFloat(m[0]) : 0;
};

export const getApplicationDetails = (product: Fertilizer | null, areaNum: number, rateNum: number) => {
    const ZEROS = {
        nutrients: NUTRIENTS.reduce((acc, n) => ({...acc, [n]: 0}), {} as {[key:string]:number}),
        totalCost: 0,
        nutrientCosts: {},
    };

    if (!product || !isFinite(areaNum) || areaNum <= 0 || !isFinite(rateNum) || rateNum < 0) {
        return ZEROS;
    }

    const density = product.density ?? 1;
    const concentration = product.concentration ?? 0;
    const price = product.price || 0;

    const isLiquidRate = (product.rate || '').toLowerCase().includes('ml') || product.type === '액상';
    
    const totalGramsApplied = isLiquidRate
        ? rateNum * areaNum * density
        : rateNum * areaNum;

    if (!isFinite(totalGramsApplied)) return ZEROS;

    const nutrientCarrierGrams = (isLiquidRate && concentration > 0)
        ? totalGramsApplied * (concentration / 100)
        : totalGramsApplied;
    
    if (!isFinite(nutrientCarrierGrams)) return ZEROS;

    const nutrients = NUTRIENTS.reduce((acc, n) => {
        const percentage = (product as any)[n] || 0;
        const nutrientGrams = (percentage / 100) * nutrientCarrierGrams;
        acc[n] = isFinite(nutrientGrams) ? Number(nutrientGrams.toFixed(3)) : 0;
        return acc;
    }, {} as {[key:string]:number});
    
    let totalCost = 0;
    const packageSize = parseFloat((product.unit || '').replace(/[^0-9.]/g, ''));

    if (isFinite(packageSize) && packageSize > 0) {
        const isLiquidUnit = (product.unit || '').toLowerCase().includes('l');
        const packageWeightKg = isLiquidUnit 
            ? packageSize * density
            : packageSize;

        if (isFinite(packageWeightKg) && packageWeightKg > 0) {
            const costPerKg = price / packageWeightKg;
            const totalKgApplied = totalGramsApplied / 1000;
            const finalCost = totalKgApplied * costPerKg;
            totalCost = isFinite(finalCost) ? finalCost : 0;
        }
    }

    const nutrientCosts: {[key: string]: number} = {};
    if (isFinite(price) && price > 0 && isFinite(packageSize) && packageSize > 0) {
        const isLiquidUnit = (product.unit || '').toLowerCase().includes('l');
        const totalPackageGrams = isLiquidUnit 
            ? packageSize * density * 1000 
            : packageSize * 1000;

        if (isFinite(totalPackageGrams) && totalPackageGrams > 0) {
            ['N', 'P', 'K'].forEach(nutrient => {
                const percentage = (product as any)[nutrient] || 0;
                if (percentage > 0) {
                    const totalNutrientGramsInPackage = totalPackageGrams * (percentage / 100);
                    if (totalNutrientGramsInPackage > 0) {
                        nutrientCosts[nutrient] = price / totalNutrientGramsInPackage;
                    }
                }
            });
        }
    }

    return { nutrients, totalCost, nutrientCosts };
};
