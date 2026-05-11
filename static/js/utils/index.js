/**
 * utils/index.js
 * Barrel — re-exporta tudo dos submódulos de utils.
 */

export { formatDate, formatCurrency } from './format.js';
export { showLoading, showError, handleFetchError } from './feedback.js';
export { setActiveControl, getSelectedChartType, populateYearFilter, populateCityFilter, resetAllFilters, hideAllCustomFilters } from './filters.js';
export { renderSummaryCards, renderGenericDetailTable, renderGenericPagination, createGenericPaginationHtml } from './render.js';
export { exportTableToCSV } from './export.js';
