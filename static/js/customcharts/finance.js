import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { renderChart, destroyAllMainCharts, populateChartTypeSelector } from '../charts.js';
import { getGridStack } from '../state.js';
import { API_BASE_URL } from '../state.js'; // Caso precise usar a constante diretamente, embora state.API_BASE_URL funcione

// --- Helper para configurar área de gráficos ---
function setupChartsArea() {
    if (dom.mainChartsArea) {
        // Garante que a área de gráficos está dentro do dashboard
        if (dom.dashboardContentDiv && !dom.dashboardContentDiv.contains(dom.mainChartsArea)) {
            dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
        }
        
        dom.mainChartsArea.classList.remove('hidden');
        
        // Limpeza profunda
        destroyAllMainCharts();
        const grid = getGridStack();
        if(grid) {
            grid.removeAll(); 
        }
        // FORÇA BRUTA: Garante que não sobrou nenhum HTML "órfão" (como tabelas antigas injetadas manualmente)
        dom.mainChartsArea.innerHTML = ''; 
    }
}

/**
 * Busca e renderiza a análise de "Faturamento por Período e Cidade".
 */
export async function fetchAndRenderBillingByCityAnalysis(startDate = '', endDate = '', city = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'faturamento_por_cidade', currentPage: 1 });

    if (!startDate || !endDate) {
        utils.showLoading(false);
        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'faturamento_por_cidade') return;

         if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = '';
         if (dom.mainChartsArea) {
             dom.mainChartsArea.innerHTML = '<p class="text-center text-gray-500 mt-4">Por favor, selecione as datas.</p>';
             if (!dom.dashboardContentDiv.contains(dom.mainChartsArea)) dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
             dom.mainChartsArea.classList.remove('hidden');
         }
        destroyAllMainCharts();
        const grid = getGridStack();
        if(grid) grid.removeAll();
        utils.showError("As datas inicial e final são obrigatórias.");
        return;
    }

    const params = new URLSearchParams();
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    if (city) params.append('city', city);

    const url = `${state.API_BASE_URL}/api/custom_analysis/faturamento_por_cidade?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 400) {
                 const errorData = await response.json();
                 throw new Error(errorData.error || 'Erro na requisição: Verifique os parâmetros.');
            }
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de faturamento.');
            throw new Error(errorMessage);
        }
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'faturamento_por_cidade') return;

        if(dom.faturamentoCityFilter && result.cities) utils.populateCityFilter(dom.faturamentoCityFilter, result.cities, city);
        if(dom.faturamentoStartDate) dom.faturamentoStartDate.value = startDate;
        if(dom.faturamentoEndDate) dom.faturamentoEndDate.value = endDate;

        if (!dom.dashboardContentDiv) throw new Error("Área principal não encontrada.");
        dom.dashboardContentDiv.innerHTML = '';
        
        setupChartsArea();
        const grid = getGridStack();

        const renderBillingChart = (id, title, data, typeOptions, chartOptions, widgetConfig) => {
            const grid = getGridStack();
            if (!grid) return;
            if (!data || !data.labels || data.labels.length === 0 || !data.datasets || data.datasets.length === 0) {
                 grid.addWidget({...widgetConfig, content: `<div class="grid-stack-item-content"><p class="text-gray-500 m-auto">Sem dados para ${title}</p></div>`, id: `${id}EmptyWidget`});
                 return;
            }
            grid.addWidget({ ...widgetConfig, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="${id}Title" class="chart-title"></h3><div class="chart-type-options" id="${id}TypeSelector"></div></div><div class="chart-canvas-container"><canvas id="${id}"></canvas></div></div>`, id: `${id}Widget` });
            populateChartTypeSelector(`${id}TypeSelector`, typeOptions);
            renderChart(id, utils.getSelectedChartType(`${id}Type`, typeOptions.find(o => o.checked)?.value || typeOptions[0].value), data.labels, data.datasets, title, chartOptions);
        };

        const statusColorsBilling = {'Recebido': '#48bb78', 'A receber': '#f59e0b', 'Cancelado': '#6b7280'};
        const commonStackedOptions = { scales: { x: { stacked: true }, y: { stacked: true } } };

        if (result.faturamento_total?.length > 0) {
            const data1 = result.faturamento_total;
            const labels1 = [...new Set(data1.map(item => item.Month))].sort();
            const datasets1 = [...new Set(data1.map(item => item.Status))].map(status => ({
                label: status, data: labels1.map(label => data1.find(d => d.Month === label && d.Status === status)?.Total_Value || 0), backgroundColor: statusColorsBilling[status] || '#a0aec0'
            }));
            renderBillingChart('billingChart1', 'Contas a Receber (Todos)', { labels: labels1, datasets: datasets1 }, [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'line', label: 'Linha'}], commonStackedOptions, { w: 6, h: 6, x: 0, y: 0 });
        }

        if (result.faturamento_ativos?.length > 0) {
            const data2 = result.faturamento_ativos;
            const labels2 = [...new Set(data2.map(item => item.Month))].sort();
            const datasets2 = [...new Set(data2.map(item => item.Status))].map(status => ({
                label: status, data: labels2.map(label => data2.find(d => d.Month === label && d.Status === status)?.Total_Value || 0), backgroundColor: statusColorsBilling[status] || '#a0aec0'
            }));
             renderBillingChart('billingChart2', 'Contas a Receber (Ativos)', { labels: labels2, datasets: datasets2 }, [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'line', label: 'Linha'}], commonStackedOptions, { w: 6, h: 6, x: 6, y: 0 });
        }

        if (result.faturamento_por_dia_vencimento?.length > 0) {
            const data3 = result.faturamento_por_dia_vencimento;
            const labels3 = [...new Set(data3.map(item => item.Due_Day))].sort((a,b) => parseInt(a) - parseInt(b));
            const datasets3 = [...new Set(data3.map(item => item.Month))].sort().map((month, index) => ({
                label: month, data: labels3.map(day => data3.find(d => d.Month === month && d.Due_Day === day)?.Total_Value || 0), backgroundColor: ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899'][index % 5]
            }));
            renderBillingChart('billingChart3', 'Comparativo por Dia de Vencimento', { labels: labels3, datasets: datasets3 }, [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'bar_horizontal', label: 'Barra H'}], { scales: { y: { beginAtZero: true } } }, { w: 12, h: 7, x: 0, y: 6 });
        }

    } catch (error) {
         if (state.getCustomAnalysisState().currentAnalysis === 'faturamento_por_cidade') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'faturamento_por_cidade') utils.showLoading(false);
    }
}

/**
 * Busca e renderiza a análise de "Evolução de Clientes Ativos".
 */
export async function fetchAndRenderActiveClientsEvolution(startDate = '', endDate = '', city = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'active_clients_evolution', currentPage: 1 });

    if (!startDate || !endDate) {
        utils.showLoading(false);
        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'active_clients_evolution') return;

         if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = '';
         if (dom.mainChartsArea) {
             dom.mainChartsArea.innerHTML = '<p class="text-center text-gray-500 mt-4">Por favor, selecione as datas.</p>';
             if (!dom.dashboardContentDiv.contains(dom.mainChartsArea)) dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
             dom.mainChartsArea.classList.remove('hidden');
         }
        destroyAllMainCharts();
        const grid = getGridStack();
        if(grid) grid.removeAll();
        utils.showError("As datas inicial e final são obrigatórias.");
        return;
    }

    const statusContrato = dom.contractStatusFilter?.value || '';
    let statusAcesso = '';
    if (dom.accessStatusContainer) {
        statusAcesso = Array.from(dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value).join(',');
    }

    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (city) params.append('city', city);
    if (statusContrato) params.append('status_contrato', statusContrato);
    if (statusAcesso) params.append('status_acesso', statusAcesso);
    
    const url = `${state.API_BASE_URL}/api/custom_analysis/active_clients_evolution?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a evolução de clientes.');
            throw new Error(errorMessage);
        }
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'active_clients_evolution') return;

        if (dom.faturamentoCityFilter && result.cities) {
            utils.populateCityFilter(dom.faturamentoCityFilter, result.cities, city);
        }
        if(dom.faturamentoStartDate) dom.faturamentoStartDate.value = startDate;
        if(dom.faturamentoEndDate) dom.faturamentoEndDate.value = endDate;
        
        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';
        
        setupChartsArea();
        const grid = getGridStack();

        if (!result.data || result.data.length === 0) {
            dom.mainChartsArea.innerHTML = '<p class="text-center text-gray-500 mt-4">Nenhum dado de evolução de clientes encontrado para o período.</p>';
            return;
        }

        const labels = result.data.map(d => d.Month);
        const dataValues = result.data.map(d => d.Active_Clients_Count || 0);
        const cityText = city ? `em ${city}` : '';

        if(grid) grid.addWidget({ w: 12, h: 8, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="activeClientsChartTitle" class="chart-title"></h3></div><div class="chart-canvas-container"><canvas id="activeClientsChart"></canvas></div></div>`, id: 'activeClientsWidget' });

        renderChart('activeClientsChart', 'line', labels,
            [{
                label: 'Clientes Ativos',
                data: dataValues,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: '#3B82F6',
                tension: 0.1
            }],
            `Evolução de Clientes Ativos ${cityText}`, {
                formatterType: 'number',
                 plugins: {
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'top',
                        color: '#374151',
                        font: { weight: 'bold', size: 10 },
                        formatter: (value) => new Intl.NumberFormat('pt-BR').format(value)
                    },
                    legend: { display: false }
                },
                scales: { y: { beginAtZero: false } }
            }
        );

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'active_clients_evolution') {
            utils.showError(error.message);
        }
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'active_clients_evolution') {
            utils.showLoading(false);
        }
    }
}

/**
 * Busca e renderiza a análise de "Juros por Atraso".
 */
export async function fetchAndRenderLateInterestAnalysis(startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'analise_juros_atraso', currentPage: 1 });

    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const url = `${state.API_BASE_URL}/api/custom_analysis/late_interest_analysis?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de juros por atraso.');
            throw new Error(errorMessage);
        }
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'analise_juros_atraso') return;

        if (dom.latePaymentStartDate) {
            dom.latePaymentStartDate.value = startDate;
        }
        if (dom.latePaymentEndDate) {
            dom.latePaymentEndDate.value = endDate;
        }

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';

        utils.renderSummaryCards(dom.dashboardContentDiv, [
            { title: 'Total de Juros/Multas Recebidos', value: result.totals?.total_interest_amount || 0, colorClass: 'bg-green-50', formatAsCurrency: true },
            { title: 'Total de Faturas Pagas com Atraso', value: result.totals?.total_late_payments_count || 0, colorClass: 'bg-yellow-50' }
        ]);

        setupChartsArea();
        const grid = getGridStack();

        if (!result.data || result.data.length === 0) {
            dom.mainChartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum pagamento com atraso encontrado para os filtros selecionados.</p>`;
            return;
        }

        const columns = [
            { header: 'Faixa de Atraso', key: 'Delay_Bucket', cssClass: 'font-medium text-gray-900' },
            { header: 'Nº de Faturas', key: 'Count', cssClass: 'text-center' },
            { header: 'Valor Total (Juros/Multas)', key: 'Total_Interest', isCurrency: true, cssClass: 'text-right' }
        ];

        const tableHtml = utils.renderGenericDetailTable(null, result.data, columns, true);

        // Renderiza tabela usando mainChartsArea para manter consistência visual com outros gráficos
        dom.mainChartsArea.innerHTML = `
            <div class="bg-white rounded-lg shadow-md overflow-hidden mt-8">
                 <div class="p-6">
                    <h2 class="text-xl font-semibold text-gray-800">Detalhamento por Faixa de Atraso</h2>
                    <p class="text-sm text-gray-600">Análise baseada na data de *pagamento*.</p>
                </div>
                <div class="overflow-x-auto">
                   ${tableHtml}
                </div>
            </div>
        `;

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'analise_juros_atraso') {
            utils.showError(error.message);
        }
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'analise_juros_atraso') {
            utils.showLoading(false);
        }
    }
}