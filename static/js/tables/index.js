/**
 * tables/index.js
 * Barrel — importa e re-exporta tudo dos módulos de tabela.
 * Use: import { fetchAndRenderCancellationAnalysis } from './tables/index.js';
 */

export { populateContractStatusFilters, downloadCSV, renderCustomTable } from './shared.js';
export { fetchAndRenderLatePaymentsAnalysis, fetchAndRenderFinancialHealthAnalysis } from './finance.js';
export { fetchAndRenderRealPermanenceAnalysis } from './permanence.js';
export { fetchAndRenderCancellationAnalysis } from './cancellations.js';
export { fetchAndRenderNegativacaoAnalysis } from './negativacao.js';
export { fetchAndRenderDailyComparison } from './comparison.js';
