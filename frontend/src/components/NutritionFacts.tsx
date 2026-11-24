import React from 'react';
import { AlertCircle, CheckCircle, Info, ShieldCheck } from 'lucide-react';
import {
  calculateItemNutrition,
  DAILY_VALUES,
  formatNutritionAmount,
  getProductNutrition,
} from '../data/nutrition';
import './NutritionFacts.css';

interface NutritionFactsProps {
  productId: string;
  size?: 'small' | 'medium' | 'large';
  extras?: Array<{ id: string; name?: string }>;
  english?: boolean;
  compact?: boolean;
  showSources?: boolean;
}

export const NutritionFacts: React.FC<NutritionFactsProps> = ({
  productId,
  size = 'medium',
  extras = [],
  english = false,
  compact = false,
  showSources = true,
}) => {
  const baseProfile = getProductNutrition(productId);
  const calculated = calculateItemNutrition(productId, size, extras);

  if (!baseProfile || !calculated.values || baseProfile.status === 'unavailable') {
    return (
      <div className="tbh-nutrition-unavailable" role="status">
        <AlertCircle size={20} aria-hidden="true" />
        <div>
          <strong className="tbh-nutrition-unavailable-title">
            {english ? 'Nutritional information unavailable' : 'Informação nutricional indisponível'}
          </strong>
          <p className="tbh-nutrition-unavailable-desc">
            {english
              ? 'Standard recipe data is currently being calibrated for this item.'
              : 'Os dados desta receita estão em fase de calibração técnica.'}
          </p>
        </div>
      </div>
    );
  }

  const { values } = calculated;
  const isEstimated = baseProfile.status === 'estimated';
  const kJ = Math.round(values.calories * 4.184);

  // Compact Summary Strip (for quick inline preview)
  if (compact) {
    return (
      <div className="tbh-nutrition-compact" aria-label={english ? 'Nutritional overview' : 'Resumo nutricional'}>
        <div className="tbh-nutrition-compact-pill">
          <span className="tbh-nutrition-compact-val">{values.calories} kcal</span>
          <span className="tbh-nutrition-compact-dot" aria-hidden="true">•</span>
          <span>{values.protein}g {english ? 'prot' : 'prot'}</span>
          <span className="tbh-nutrition-compact-dot" aria-hidden="true">•</span>
          <span>{values.carbohydrates}g {english ? 'carbs' : 'carb'}</span>
          <span className="tbh-nutrition-compact-dot" aria-hidden="true">•</span>
          <span>{values.totalFat}g {english ? 'fat' : 'gord'}</span>
        </div>
        <span className={`tbh-nutrition-compact-badge ${isEstimated ? 'tbh-nutrition-compact-badge--est' : 'tbh-nutrition-compact-badge--ver'}`}>
          {isEstimated
            ? (english ? 'Estimated values' : 'Valores estimados')
            : (english ? 'Verified label' : 'Rótulo verificado')}
        </span>
      </div>
    );
  }

  // Helper to compute % Daily Value
  const getVd = (key: keyof typeof DAILY_VALUES, amount: number) => {
    const ref = DAILY_VALUES[key];
    if (!ref) return null;
    return Math.round((amount / ref) * 100);
  };

  return (
    <div className="tbh-nutrition-card" data-estimated={isEstimated}>
      <header className="tbh-nutrition-card-header">
        <div className="tbh-nutrition-title-row">
          <h4 className="tbh-nutrition-title">
            {english ? 'NUTRITION FACTS' : 'INFORMAÇÃO NUTRICIONAL'}
          </h4>
          <span
            className={`tbh-nutrition-status-pill ${
              isEstimated ? 'tbh-nutrition-status-pill--estimated' : 'tbh-nutrition-status-pill--verified'
            }`}
          >
            {isEstimated ? (
              <>
                <Info size={14} aria-hidden="true" />
                <span>{english ? 'Estimated nutritional values' : 'Valores nutricionais estimados'}</span>
              </>
            ) : (
              <>
                <CheckCircle size={14} aria-hidden="true" />
                <span>{english ? 'Official manufacturer label' : 'Rótulo oficial verificado'}</span>
              </>
            )}
          </span>
        </div>

        <div className="tbh-nutrition-serving-card">
          <span className="tbh-nutrition-serving-label">
            {english ? 'Serving size:' : 'Porção de referência:'}
          </span>
          <strong className="tbh-nutrition-serving-value">
            {english ? baseProfile.serving.labelEn : baseProfile.serving.labelPt}
          </strong>
          {size !== 'medium' && (
            <span className="tbh-nutrition-size-note">
              ({english ? `Size ${size}` : `Tamanho ${size === 'small' ? 'P' : 'G'}`})
            </span>
          )}
        </div>
      </header>

      {/* Structured Nutritional Table */}
      <table className="tbh-nutrition-table">
        <caption className="sr-only">
          {english ? 'Nutritional table per serving' : 'Tabela de valores nutricionais por porção'}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="tbh-nutrition-col-nutrient">
              {english ? 'Amount per serving' : 'Quantidade por porção'}
            </th>
            <th scope="col" className="tbh-nutrition-col-vd">
              % VD*
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Energy row */}
          <tr className="tbh-nutrition-row-calories">
            <th scope="row">
              <span className="tbh-nutrition-row-label-primary">
                {english ? 'Energy / Calories' : 'Valor Energético'}
              </span>
              <span className="tbh-nutrition-amount-secondary">
                {values.calories} kcal <span className="tbh-nutrition-kj">({kJ} kJ)</span>
              </span>
            </th>
            <td className="tbh-nutrition-vd tbh-nutrition-vd-bold">{getVd('calories', values.calories)}%</td>
          </tr>

          {/* Carbohydrates & Sugars Group */}
          <tr className="tbh-nutrition-row-main">
            <th scope="row">
              <span className="tbh-nutrition-row-label-primary">{english ? 'Carbohydrates' : 'Carboidratos'}</span>
              <span className="tbh-nutrition-amount">{formatNutritionAmount(values.carbohydrates, 'g', english)}</span>
            </th>
            <td className="tbh-nutrition-vd">{getVd('carbohydrates', values.carbohydrates)}%</td>
          </tr>

          <tr className="tbh-nutrition-row-sub">
            <th scope="row">
              <span className="tbh-nutrition-sub-indicator" aria-hidden="true">↳</span>
              <span className="tbh-nutrition-row-label-sub">{english ? 'Total sugars' : 'Açúcares totais'}</span>
              <span className="tbh-nutrition-amount">{formatNutritionAmount(values.totalSugars, 'g', english)}</span>
            </th>
            <td className="tbh-nutrition-vd tbh-nutrition-vd-muted">**</td>
          </tr>

          {values.addedSugars !== undefined && (
            <tr className="tbh-nutrition-row-sub">
              <th scope="row">
                <span className="tbh-nutrition-sub-indicator" aria-hidden="true">↳</span>
                <span className="tbh-nutrition-row-label-sub">{english ? 'Added sugars' : 'Açúcares adicionados'}</span>
                <span className="tbh-nutrition-amount">{formatNutritionAmount(values.addedSugars, 'g', english)}</span>
              </th>
              <td className="tbh-nutrition-vd">{getVd('addedSugars', values.addedSugars)}%</td>
            </tr>
          )}

          {/* Proteins Group */}
          <tr className="tbh-nutrition-row-main">
            <th scope="row">
              <span className="tbh-nutrition-row-label-primary">{english ? 'Proteins' : 'Proteínas'}</span>
              <span className="tbh-nutrition-amount">{formatNutritionAmount(values.protein, 'g', english)}</span>
            </th>
            <td className="tbh-nutrition-vd">{getVd('protein', values.protein)}%</td>
          </tr>

          {/* Fats Group */}
          <tr className="tbh-nutrition-row-main">
            <th scope="row">
              <span className="tbh-nutrition-row-label-primary">{english ? 'Total Fat' : 'Gorduras Totais'}</span>
              <span className="tbh-nutrition-amount">{formatNutritionAmount(values.totalFat, 'g', english)}</span>
            </th>
            <td className="tbh-nutrition-vd">{getVd('totalFat', values.totalFat)}%</td>
          </tr>

          <tr className="tbh-nutrition-row-sub">
            <th scope="row">
              <span className="tbh-nutrition-sub-indicator" aria-hidden="true">↳</span>
              <span className="tbh-nutrition-row-label-sub">{english ? 'Saturated fat' : 'Gorduras saturadas'}</span>
              <span className="tbh-nutrition-amount">{formatNutritionAmount(values.saturatedFat, 'g', english)}</span>
            </th>
            <td className="tbh-nutrition-vd">{getVd('saturatedFat', values.saturatedFat)}%</td>
          </tr>

          {/* Fiber & Minerals Group */}
          <tr className="tbh-nutrition-row-main">
            <th scope="row">
              <span className="tbh-nutrition-row-label-primary">{english ? 'Dietary Fiber' : 'Fibra Alimentar'}</span>
              <span className="tbh-nutrition-amount">{formatNutritionAmount(values.fiber, 'g', english)}</span>
            </th>
            <td className="tbh-nutrition-vd">{getVd('fiber', values.fiber)}%</td>
          </tr>

          <tr className="tbh-nutrition-row-main tbh-nutrition-row-last">
            <th scope="row">
              <span className="tbh-nutrition-row-label-primary">{english ? 'Sodium' : 'Sódio'}</span>
              <span className="tbh-nutrition-amount">{formatNutritionAmount(values.sodium, 'mg', english)}</span>
            </th>
            <td className="tbh-nutrition-vd">{getVd('sodium', values.sodium)}%</td>
          </tr>
        </tbody>
      </table>

      {/* Disclaimers & Technical Audit Section */}
      <footer className="tbh-nutrition-footer">
        <p className="tbh-nutrition-vd-legend">
          {english
            ? '* % Daily Values are based on a 2,000 kcal (8,400 kJ) diet. Your daily values may be higher or lower depending on your energy needs.'
            : '* % Valores Diários de referência com base em uma dieta de 2.000 kcal (8.400 kJ). Seus valores diários podem ser maiores ou menores dependendo de suas necessidades energéticas.'}
        </p>
        <p className="tbh-nutrition-vd-legend">
          {english ? '** Daily Value not established.' : '** Valor Diário não estabelecido.'}
        </p>

        {showSources && (
          <div className="tbh-nutrition-audit">
            <div className="tbh-nutrition-audit-item">
              <ShieldCheck size={16} className="tbh-nutrition-audit-icon" aria-hidden="true" />
              <div>
                <strong className="tbh-nutrition-audit-title">
                  {english ? 'Data source:' : 'Fonte dos dados:'}
                </strong>
                <p className="tbh-nutrition-audit-text">
                  {english ? baseProfile.sourceEn : baseProfile.sourcePt}
                </p>
              </div>
            </div>

            {baseProfile.assumptionsPt && (
              <div className="tbh-nutrition-audit-item">
                <Info size={16} className="tbh-nutrition-audit-icon" aria-hidden="true" />
                <div>
                  <strong className="tbh-nutrition-audit-title">
                    {english ? 'Recipe standard basis:' : 'Base de preparo e porção:'}
                  </strong>
                  <p className="tbh-nutrition-audit-text">
                    {english ? baseProfile.assumptionsEn : baseProfile.assumptionsPt}
                  </p>
                </div>
              </div>
            )}

            {isEstimated && (
              <div className="tbh-nutrition-audit-disclaimer-box">
                <p className="tbh-nutrition-audit-disclaimer">
                  {english
                    ? 'Disclaimer: Values are calculated estimates from standard recipe portions and compositional databases. Handcrafted kitchen preparations may exhibit slight natural variations. Estimates are never presented as certified laboratory measurements.'
                    : 'Aviso: Os valores são estimativas calculadas a partir de porções padrão da receita e tabelas oficiais de composição de alimentos. Preparações artesanais podem apresentar pequenas variações naturais. Estimativas não substituem laudos laboratoriais bromatológicos.'}
                </p>
              </div>
            )}
          </div>
        )}
      </footer>
    </div>
  );
};
