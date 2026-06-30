/**
 * Asset Health Scoring — the paper's signature feature. Estimates an asset's
 * condition (0–100) and remaining useful life from its install date, expected
 * lifespan and reported condition, and derives a recommended action.
 */
import type { Row } from '../models/resourceRepo.js';

const CONDITION_FACTOR: Record<string, number> = {
  good: 1,
  needs_maintenance: 0.7,
  needs_replacement: 0.4,
  dispose: 0.1,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function withAssetHealth(asset: Row): Row {
  const install = asset.install_date ? new Date(String(asset.install_date)) : null;
  const lifespan = Number(asset.expected_lifespan_years) || 10;
  const condition = String(asset.condition ?? 'good');

  let ageYears = 0;
  if (install && !Number.isNaN(install.getTime())) {
    ageYears = (Date.now() - install.getTime()) / (365.25 * 24 * 3600 * 1000);
  }

  const ageScore = clamp(100 * (1 - ageYears / lifespan), 0, 100);
  const factor = CONDITION_FACTOR[condition] ?? 1;
  const healthScore = Math.round(ageScore * factor);
  const remainingYears = Math.max(0, Math.round((lifespan - ageYears) * 10) / 10);

  let healthLabel: string;
  let recommendation: string;
  if (condition === 'dispose' || healthScore < 15) {
    healthLabel = 'Critical';
    recommendation = 'Dispose / Replace';
  } else if (healthScore < 40 || condition === 'needs_replacement') {
    healthLabel = 'Poor';
    recommendation = 'Schedule Replacement';
  } else if (healthScore < 70 || condition === 'needs_maintenance') {
    healthLabel = 'Fair';
    recommendation = 'Preventive Maintenance';
  } else {
    healthLabel = 'Good';
    recommendation = 'Monitor';
  }

  return {
    ...asset,
    age_years: Math.round(ageYears * 10) / 10,
    remaining_years: remainingYears,
    health_score: healthScore,
    health_label: healthLabel,
    recommendation,
  };
}
