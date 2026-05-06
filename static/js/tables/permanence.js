/**
 * tables/permanence.js
 * fetchAndRenderRealPermanenceAnalysis
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { renderChart, destroySpecificChart } from '../charts.js';
import { getGridStack } from '../state.js';
import { registerFetchFn, renderCustomTable, downloadCSV } from './shared.js';

registerFetchFn('real_permanence', (s, p) =>
    fetchAndRenderRealPermanenceAnalysis(s.currentSearchTerm, p, s.currentRelevance, s.currentStartDate, s.currentEndDate, s.currentRelevanceReal)
);

async function fetchAllRealPermanenceData(searchTerm, relevance, startDate, endDate, relevanceReal) {
    const contractStatus = dom.contractStatusFilter?.value || '';
    let accessStatus = '';
    if (dom.accessStatusContainer) {
        const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
        accessStatus = Array.from(checked).map(cb => cb.value).join(',');
    }

    const params = new URLSearchParams({ search_term: searchTerm, limit: 100000, offset: 0 });
    if (relevance) params.append('relevance', relevance);
    if (relevanceReal) params.append('relevance_real', relevanceReal);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (contractStatus) params.append('status_contrato', contractStatus);
    if (accessStatus) params.append('status_acesso', accessStatus);

    const response = await fetch(`${state.API_BASE_URL}/api/custom_analysis/real_permanence?${params.toString()}`);
    if (!response.ok) throw new Error('Erro ao buscar dados para exportação.');
    return await response.json();
}

export async function fetchAndRenderRealPermanenceAnalysis(searchTerm = '', page = 1, relevance = '', startDate = '', endDate = '', relevanceReal = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({
        currentPage: page,
        currentAnalysis: 'real_permanence',
        currentSearchTerm: searchTerm,
        currentRelevance: relevance,
        currentRelevanceReal: relevanceReal,
        currentStartDate: startDate,
        currentEndDate: endDate
    });

    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;

    const contractStatus = dom.contractStatusFilter?.value || '';
    let accessStatus = '';
    if (dom.accessStatusContainer) {
        const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
        accessStatus = Array.from(checked).map(cb => cb.value).join(',');
    }

    const params = new URLSearchParams({ search_term: searchTerm, limit: currentState.rowsPerPage, offset: offset });
    if (relevance) params.append('relevance', relevance);
    if (relevanceReal) params.append('relevance_real', relevanceReal);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (contractStatus) params.append('status_contrato', contractStatus);
    if (accessStatus) params.append('status_acesso', accessStatus);

    const url = `${state.API_BASE_URL}/api/custom_analysis/real_permanence?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise de permanência.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'real_permanence') return;

        if (dom.dashboardContentDiv && dom.dashboardContentDiv.innerHTML !== '') {
            if (!document.getElementById('pagaChart')) dom.dashboardContentDiv.innerHTML = '';
        }

        // --- 1. GRÁFICOS ---
        if (dom.mainChartsArea && result.charts) {
            if (!dom.dashboardContentDiv.contains(dom.mainChartsArea))
                dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
            dom.mainChartsArea.classList.remove('hidden');

            const grid = getGridStack();
            if (grid) grid.removeAll();

            if (result.charts.paga_distribution) {
                grid.addWidget({ w: 4, h: 6, x: 0, y: 0, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="pagaChartTitle" class="chart-title">Permanência Paga</h3></div><div class="chart-canvas-container"><canvas id="pagaChart"></canvas></div></div>` });
            }
            if (result.charts.real_distribution) {
                grid.addWidget({ w: 4, h: 6, x: 4, y: 0, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="realChartTitle" class="chart-title">Permanência Real</h3></div><div class="chart-canvas-container"><canvas id="realChart"></canvas></div></div>` });
            }

            if (result.charts.city_distribution && result.charts.city_distribution.length > 0) {
                const cities = [...new Set(result.charts.city_distribution.map(d => d.Cidade))].sort();
                let currentX = 0, currentY = 6;
                cities.forEach(city => {
                    const canvasId = `chart_city_${city.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    grid.addWidget({
                        w: 4, h: 6, x: currentX, y: currentY,
                        content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title truncate" title="${city}">${city}</h3></div><div class="chart-canvas-container"><canvas id="${canvasId}"></canvas></div></div>`
                    });
                    currentX += 4;
                    if (currentX >= 12) { currentX = 0; currentY += 6; }
                });
            }

            setTimeout(() => {
                if (result.charts.paga_distribution) {
                    const dataPaga = result.charts.paga_distribution;
                    renderChart('pagaChart', 'pie', dataPaga.map(d => d.Faixa), [{ data: dataPaga.map(d => d.Count) }], 'Permanência Paga', {
                        formatterType: 'value_only',
                        plugins: { tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } } },
                        onClick: (event, elements, chart) => {
                            if (elements.length > 0) {
                                const label = chart.data.labels[elements[0].index];
                                fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, label, startDate, endDate, '');
                            }
                        }
                    });
                }

                if (result.charts.real_distribution) {
                    const dataReal = result.charts.real_distribution;
                    renderChart('realChart', 'pie', dataReal.map(d => d.Faixa), [{ data: dataReal.map(d => d.Count) }], 'Permanência Real', {
                        formatterType: 'value_only',
                        plugins: { tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } } },
                        onClick: (event, elements, chart) => {
                            if (elements.length > 0) {
                                const label = chart.data.labels[elements[0].index];
                                fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, '', startDate, endDate, label);
                            }
                        }
                    });
                }

                if (result.charts.city_distribution) {
                    const cityData = result.charts.city_distribution;
                    const cities = [...new Set(cityData.map(d => d.Cidade))].sort();
                    const faixasOrder = ['0-6', '7-12', '13-18', '19-25', '25-30', '31+'];
                    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

                    cities.forEach(city => {
                        const dataForCity = cityData.filter(d => d.Cidade === city);
                        const counts = faixasOrder.map(faixa => {
                            const entry = dataForCity.find(d => d.Faixa === faixa);
                            return entry ? entry.Count : 0;
                        });
                        const totalCity = counts.reduce((a, b) => a + b, 0);
                        const canvasId = `chart_city_${city.replace(/[^a-zA-Z0-9]/g, '_')}`;
                        renderChart(canvasId, 'pie', faixasOrder, [{ data: counts, backgroundColor: colors }], `${city} (${totalCity})`, {
                            formatterType: 'value_only',
                            plugins: {
                                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } },
                                datalabels: { formatter: (v) => v, color: '#fff', font: { weight: 'bold' } }
                            },
                            legendPosition: 'bottom',
                            maintainAspectRatio: false,
                            onClick: (event, elements, chart) => {
                                if (elements.length > 0) {
                                    const clickedFaixa = chart.data.labels[elements[0].index];
                                    if (dom.clientSearchInput) dom.clientSearchInput.value = city;
                                    fetchAndRenderRealPermanenceAnalysis(city, 1, clickedFaixa, startDate, endDate, relevanceReal);
                                }
                            }
                        });
                    });
                }
            }, 100);
        }

        // --- 2. TABELA ---
        const columns = [
            { header: 'Cliente', render: r => `<div class="flex flex-col"><span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline font-medium" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span></div>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Status Contrato', render: r => {
                let color = 'bg-gray-100 text-gray-800';
                if (r.Status_contrato === 'Ativo') color = 'bg-green-100 text-green-800';
                else if (['Inativo', 'Cancelado'].includes(r.Status_contrato)) color = 'bg-red-100 text-red-800';
                else if (r.Status_contrato === 'Negativado') color = 'bg-orange-100 text-orange-800';
                return `<span class="text-xs font-bold px-2 py-1 rounded-full ${color}">${r.Status_contrato}</span>`;
            }},
            { header: 'Data Ativação', render: r => (r.Data_ativa_o || r.data_ativa_o || r.data_ativacao) ? utils.formatDate(r.Data_ativa_o || r.data_ativa_o || r.data_ativacao) : 'N/A' },
            { header: 'Status Acesso', key: 'Status_acesso', render: r => `<span class="text-xs text-gray-600">${r.Status_acesso}</span>` },
            { header: 'Permanência Paga', render: r => `<span class="text-lg font-bold text-green-700 bg-green-50 px-3 py-1 rounded-lg shadow-sm border border-green-200" title="Meses efetivamente pagos">${r.Permanencia_Paga} meses</span>`, cssClass: 'text-center' },
            { header: 'Permanência Real', render: r => `<span class="text-gray-600 font-medium" title="Tempo corrido desde a ativação">${r.Permanencia_Real_Calendario} meses</span>`, cssClass: 'text-center' },
            { header: 'Média Pagamento', render: r => {
                if (r.Media_Atraso === null || r.Media_Atraso === undefined) return '<span class="text-gray-400 text-xs italic">Sem Histórico</span>';
                const days = Math.round(r.Media_Atraso);
                let badgeClass = '', text = '';
                if (days < 0) { badgeClass = 'bg-green-100 text-green-800 border border-green-200'; text = `${days} dias (Adiantado)`; }
                else if (days > 0) { badgeClass = 'bg-red-100 text-red-800 border border-red-200'; text = `+${days} dias (Atraso)`; }
                else { badgeClass = 'bg-gray-100 text-gray-800 border border-gray-200'; text = 'Em Dia (0)'; }
                return `<span class="inline-block px-2 py-1 rounded text-xs font-semibold ${badgeClass}" title="Média de dias entre vencimento e pagamento">${text}</span>`;
            }, cssClass: 'text-center' },
            { header: 'Faturas (Resumo)', render: r => `<div class="text-xs space-y-1"><div class="flex justify-between w-32"><span class="text-gray-500">Total:</span> <span class="font-bold text-gray-800 invoice-detail-trigger cursor-pointer hover:underline" data-type="all_invoices" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Total_Faturas}</span></div><div class="flex justify-between w-32"><span class="text-green-600">Pagas:</span> <span class="font-bold text-green-700">${r.Faturas_Pagas}</span></div><div class="flex justify-between w-32"><span class="text-red-500">Abertas:</span> <span class="font-bold text-red-600 invoice-detail-trigger cursor-pointer hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span></div><div class="flex justify-between w-32"><span class="text-orange-500">Atrasos PG:</span> <span class="font-bold text-orange-600 invoice-detail-trigger cursor-pointer hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span></div></div>` },
            { header: 'Equipamento (Comodato)', render: r => { if (!r.Equipamento_Comodato || r.Equipamento_Comodato === 'Nenhum') return '<span class="text-gray-400 text-xs italic">Nenhum</span>'; return `<span class="text-xs text-blue-800 bg-blue-50 px-2 py-1 rounded max-w-[200px] truncate block" title="${r.Equipamento_Comodato}">${r.Equipamento_Comodato}</span>`; } },
            { header: 'Vendedor', render: r => `<span class="text-xs font-medium text-gray-700">${r.Vendedor_Nome || 'N/A'}</span>` },
            { header: 'Cidade', key: 'Cidade' },
            { header: 'Bairro', key: 'Bairro' }
        ];

        let extraFilterMsg = '';
        if (relevanceReal) {
            window.clearRealFilter = () => fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, relevance, startDate, endDate, '');
            extraFilterMsg = `<div class="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2 rounded-md mb-4 flex justify-between items-center"><span>Filtrado por <strong>Permanência Real: ${relevanceReal}</strong></span><button onclick="clearRealFilter()" class="text-sm font-bold text-purple-800 hover:text-purple-900 underline">Limpar Filtro</button></div>`;
        }
        if (relevance) {
            window.clearPagaFilter = () => fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, '', startDate, endDate, relevanceReal);
            extraFilterMsg += `<div class="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-md mb-4 flex justify-between items-center"><span>Filtrado por <strong>Permanência Paga: ${relevance}</strong></span><button onclick="clearPagaFilter()" class="text-sm font-bold text-blue-800 hover:text-blue-900 underline">Limpar Filtro</button></div>`;
        }

        const exportButtonTop = `<button id="btnExportRealPermanenceTop" class="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm font-medium mb-2 float-right flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Exportar Excel (Tudo)</button><div class="clear-both"></div>`;

        renderCustomTable(result, 'Análise de Permanência Real (Meses Pagos vs Calendário)', columns, exportButtonTop + (extraFilterMsg || ''));

        setTimeout(() => {
            const btnTop = document.getElementById('btnExportRealPermanenceTop');
            if (btnTop) {
                btnTop.addEventListener('click', async () => {
                    utils.showLoading(true);
                    try {
                        const fullData = await fetchAllRealPermanenceData(searchTerm, relevance, startDate, endDate, relevanceReal);
                        downloadCSV(fullData.data, 'permanencia_real_completa.csv');
                    } catch (e) {
                        utils.showError('Erro ao exportar: ' + e.message);
                    } finally {
                        utils.showLoading(false);
                    }
                });
            }
        }, 100);

        if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');
        if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
        if (dom.relevanceFilterSearch) dom.relevanceFilterSearch.value = relevance || '';
        if (dom.customStartDate) dom.customStartDate.value = startDate;
        if (dom.customEndDate) dom.customEndDate.value = endDate;

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'real_permanence') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'real_permanence') utils.showLoading(false);
    }
}
