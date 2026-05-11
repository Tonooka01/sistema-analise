/**
 * utils.js
 * Barrel de compatibilidade — re-exporta de static/js/utils/index.js
 * Nenhum outro arquivo precisa ser alterado.
 */

export {
    formatDate, formatCurrency,
    showLoading, showError, handleFetchError,
    setActiveControl, getSelectedChartType, populateYearFilter, populateCityFilter,
    resetAllFilters, hideAllCustomFilters,
    renderSummaryCards, renderGenericDetailTable, renderGenericPagination, createGenericPaginationHtml,
    exportTableToCSV
} from './utils/index.js';
