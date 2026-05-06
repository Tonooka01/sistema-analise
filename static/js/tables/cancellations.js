/**
 * tables/cancellations.js
 * fetchAndRenderCancellationAnalysis
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { renderChart } from '../charts.js';
import { registerFetchFn, renderCustomTable, getPaymentBehaviorBadge } from './shared.js';

registerFetchFn('cancellations', (s, p) =>
    fetchAndRenderCancellationAnalysis(s.currentSearchTerm, p, s.currentRelevance, s.sortOrder === 'asc', s.currentStartDate, s.currentEndDate)
);

export async function fetchAndRenderCancellationAnalysis(searchTerm = '', page = 1, relevance = '', sortAsc = false, startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'cancellations', currentSearchTerm: searchTerm, currentRelevance: relevance, currentStartDate: startDate, currentEndDate: endDate, sortOrder: sortAsc ? 'asc' : 'desc' });
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;

    const params = new URLSearchParams({ search_term: searchTerm, limit: currentState.rowsPerPage, offset: offset });
    if (relevance) params.append('relevance', relevance);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (currentState.chartFilterColumn) params.append('filter_column', currentState.chartFilterColumn);
    if (currentState.chartFilterValue) params.append('filter_value', currentState.chartFilterValue);
    params.append('sort_order', sortAsc ? 'asc' : 'desc');

    const url = `${state.API_BASE_URL}/api/custom_analysis/cancellations?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar cancelamentos.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'cancellations') return;

        dom.dashboardContentDiv.innerHTML = '';

        let chartsHtml = '';
        if (result.charts) {
            const totalMotivos   = result.charts.motivo     ? result.charts.motivo.reduce((a, c) => a + (c.Count || 0), 0) : 0;
            const totalObs       = result.charts.obs        ? result.charts.obs.reduce((a, c) => a + (c.Count || 0), 0) : 0;
            const totalFinanceiro = result.charts.financeiro ? result.charts.financeiro.reduce((a, c) => a + (c.Count || 0), 0) : 0;

            chartsHtml = `
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Motivos de Cancelamento: ${totalMotivos}</h3>
                        <div class="chart-canvas-container" style="height: 400px;"><canvas id="motivoCancelamentoChart"></canvas></div>
                        <p class="text-xs text-center text-gray-400 mt-2">Clique para filtrar</p>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Observações de Cancelamento: ${totalObs}</h3>
                        <div class="chart-canvas-container" style="height: 400px;"><canvas id="obsCancelamentoChart"></canvas></div>
                        <p class="text-xs text-center text-gray-400 mt-2">Clique para filtrar</p>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Comportamento Financeiro: ${totalFinanceiro}</h3>
                        <div class="chart-canvas-container" style="height: 400px;"><canvas id="financeiroCancelamentoChart"></canvas></div>
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
            { header: 'Motivo', key: 'Motivo_cancelamento', render: r => `<span class="text-xs font-medium text-gray-700">${r.Motivo_cancelamento || '-'}</span>` },
            { header: 'Observação', key: 'Obs_cancelamento', render: r => `<div class="text-xs text-gray-500 max-w-[150px] truncate" title="${(r.Obs_cancelamento || '').replace(/"/g, '&quot;')}">${r.Obs_cancelamento || '-'}</div>` },
            { header: 'Data Cancelamento', render: r => r.Data_cancelamento ? utils.formatDate(r.Data_cancelamento) : 'N/A' },
            { header: headerHtml, key: 'permanencia_meses', cssClass: 'text-center' },
            { header: 'Faturas', render: r => `<span class="invoice-detail-trigger cursor-pointer text-blue-600 font-bold hover:underline" data-type="all_invoices" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Total_Faturas || 0}</span>`, cssClass: 'text-center' },
            { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
            { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas },
            { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
        ];

        renderCustomTable(result, 'Análise de Cancelamentos por Contato Técnico', columns, chartsHtml);

        if (result.charts) {
            setTimeout(() => {
                const chartClickCallback = (column) => (evt, elements, chart) => {
                    if (elements.length > 0) {
                        let label = chart.data.labels[elements[0].index];
                        if (column === 'motivo' || column === 'obs') label = label.replace(/ \(\d+\)$/, '');
                        state.setCustomAnalysisState({ chartFilterColumn: column, chartFilterValue: label });
                        fetchAndRenderCancellationAnalysis(searchTerm, 1, relevance, sortAsc, startDate, endDate);
                    }
                };

                if (result.charts.motivo && result.charts.motivo.length > 0) {
                    renderChart('motivoCancelamentoChart', 'pie', result.charts.motivo.map(d => `${d.Motivo_cancelamento} (${d.Count})`), [{ data: result.charts.motivo.map(d => d.Count) }], '', { formatterType: 'percent_only', onClick: chartClickCallback('motivo') });
                } else if (document.getElementById('motivoCancelamentoChart')) {
                    document.getElementById('motivoCancelamentoChart').parentNode.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem dados de motivo.</p>';
                }

                if (result.charts.obs && result.charts.obs.length > 0) {
                    renderChart('obsCancelamentoChart', 'pie', result.charts.obs.map(d => `${d.Obs_cancelamento} (${d.Count})`), [{ data: result.charts.obs.map(d => d.Count) }], '', { formatterType: 'percent_only', onClick: chartClickCallback('obs') });
                } else if (document.getElementById('obsCancelamentoChart')) {
                    document.getElementById('obsCancelamentoChart').parentNode.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem dados de observação.</p>';
                }

                if (result.charts.financeiro && result.charts.financeiro.length > 0) {
                    renderChart('financeiroCancelamentoChart', 'pie', result.charts.financeiro.map(d => d.Status_Pagamento), [{ data: result.charts.financeiro.map(d => d.Count), backgroundColor: ['#10b981', '#f59e0b', '#991b1b', '#9ca3af'] }], '', { formatterType: 'percent_only', onClick: chartClickCallback('financeiro') });
                } else if (document.getElementById('financeiroCancelamentoChart')) {
                    document.getElementById('financeiroCancelamentoChart').parentNode.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem dados financeiros.</p>';
                }
            }, 50);
        }

        if (dom.viewTableBtn) { dom.viewTableBtn.classList.remove('hidden'); dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)'; }
        if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
        if (dom.relevanceFilterSearch) dom.relevanceFilterSearch.value = relevance || '';
        if (dom.customStartDate) dom.customStartDate.value = startDate;
        if (dom.customEndDate) dom.customEndDate.value = endDate;

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations') utils.showLoading(false);
    }
}
