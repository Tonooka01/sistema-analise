/**
 * tables/negativacao.js
 * fetchAndRenderNegativacaoAnalysis
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { renderChart } from '../charts.js';
import { registerFetchFn, renderCustomTable, getPaymentBehaviorBadge } from './shared.js';

registerFetchFn('negativacao', (s, p) =>
    fetchAndRenderNegativacaoAnalysis(s.currentSearchTerm, p, s.currentRelevance, s.sortOrder === 'asc', s.currentStartDate, s.currentEndDate)
);

export async function fetchAndRenderNegativacaoAnalysis(searchTerm = '', page = 1, relevance = '', sortAsc = false, startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'negativacao', currentSearchTerm: searchTerm, currentRelevance: relevance, currentStartDate: startDate, currentEndDate: endDate, sortOrder: sortAsc ? 'asc' : 'desc' });
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;

    const params = new URLSearchParams({ search_term: searchTerm, limit: currentState.rowsPerPage, offset: offset });
    if (relevance) params.append('relevance', relevance);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (currentState.chartFilterColumn) params.append('filter_column', currentState.chartFilterColumn);
    if (currentState.chartFilterValue) params.append('filter_value', currentState.chartFilterValue);
    params.append('sort_order', sortAsc ? 'asc' : 'desc');

    const url = `${state.API_BASE_URL}/api/custom_analysis/negativacao?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar negativações.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'negativacao') return;

        dom.dashboardContentDiv.innerHTML = '';

        let chartsHtml = '';
        const totalFinanceiro = result.charts?.financeiro ? result.charts.financeiro.reduce((a, c) => a + (c.Count || 0), 0) : 0;

        if (totalFinanceiro > 0) {
            chartsHtml = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 justify-center">
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 col-span-1 md:col-span-2 lg:col-span-1 lg:col-start-2 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Comportamento Financeiro: ${totalFinanceiro}</h3>
                        <div class="chart-canvas-container" style="height: 400px;"><canvas id="financeiroNegativacaoChart"></canvas></div>
                        <p class="text-xs text-center text-gray-400 mt-2">Clique para filtrar</p>
                    </div>
                </div>
            `;
        }

        const arrowIcon = sortAsc ? '↓' : '↑';
        const headerHtml = `<div class="flex items-center gap-1 cursor-pointer select-none sort-permanence-header hover:text-blue-600 transition-colors" title="Clique para ordenar">Permanência (Meses) <span class="text-lg font-bold leading-none">${arrowIcon}</span></div>`;

        const columns = [
            { header: 'Cliente', render: r => `<div class="flex flex-col items-start"><span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline text-base" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>${getPaymentBehaviorBadge(r.Media_Atraso)}</div>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Data Negativação', render: r => r.end_date ? utils.formatDate(r.end_date) : 'N/A' },
            { header: headerHtml, key: 'permanencia_meses', cssClass: 'text-center' },
            { header: 'Faturas', render: r => `<span class="invoice-detail-trigger cursor-pointer text-blue-600 font-bold hover:underline" data-type="all_invoices" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Total_Faturas || 0}</span>`, cssClass: 'text-center' },
            { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
            { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas },
            { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
        ];

        renderCustomTable(result, 'Análise de Negativação por Contato Técnico', columns, chartsHtml);

        if (result.charts && result.charts.financeiro) {
            setTimeout(() => {
                const chartClickCallback = (column) => (evt, elements, chart) => {
                    if (elements.length > 0) {
                        const label = chart.data.labels[elements[0].index];
                        state.setCustomAnalysisState({ chartFilterColumn: column, chartFilterValue: label });
                        fetchAndRenderNegativacaoAnalysis(searchTerm, 1, relevance, sortAsc, startDate, endDate);
                    }
                };

                if (result.charts.financeiro.length > 0) {
                    renderChart('financeiroNegativacaoChart', 'pie',
                        result.charts.financeiro.map(d => d.Status_Pagamento),
                        [{ data: result.charts.financeiro.map(d => d.Count), backgroundColor: ['#10b981', '#f59e0b', '#991b1b', '#9ca3af'] }],
                        '', { formatterType: 'percent_only', onClick: chartClickCallback('financeiro') }
                    );
                }
            }, 50);
        }

        if (dom.viewTableBtn) { dom.viewTableBtn.classList.remove('hidden'); dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)'; }
        if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
        if (dom.relevanceFilterSearch) dom.relevanceFilterSearch.value = relevance || '';
        if (dom.customStartDate) dom.customStartDate.value = startDate;
        if (dom.customEndDate) dom.customEndDate.value = endDate;

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'negativacao') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'negativacao') utils.showLoading(false);
    }
}
