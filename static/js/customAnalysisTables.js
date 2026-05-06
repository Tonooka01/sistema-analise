/**
 * customAnalysisTables.js
 * Barrel de compatibilidade — re-exporta tudo de static/js/tables/index.js
 * Nenhum outro arquivo precisa ser alterado.
 */

export {
    populateContractStatusFilters,
    downloadCSV,
    renderCustomTable,
    fetchAndRenderLatePaymentsAnalysis,
    fetchAndRenderFinancialHealthAnalysis,
    fetchAndRenderRealPermanenceAnalysis,
    fetchAndRenderCancellationAnalysis,
    fetchAndRenderNegativacaoAnalysis,
    fetchAndRenderDailyComparison
} from './tables/index.js';
