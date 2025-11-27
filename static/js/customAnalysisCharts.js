import * as state from './state.js';
import * as dom from './dom.js';
import * as utils from './utils.js';
import { renderChart, destroyAllMainCharts, populateChartTypeSelector, destroySpecificChart } from './charts.js';
import { getGridStack } from './state.js';
import * as modals from './modals.js';

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
        // Isso resolve o problema de sobras de outras análises
        dom.mainChartsArea.innerHTML = ''; 
    }
}

/**
 * Busca e renderiza a análise de "Vendedores" (Churn) com cards e tabela.
 */
export async function fetchAndRenderSellerAnalysis(startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'vendedores', currentPage: 1 });
    
    const url = `${state.API_BASE_URL}/api/custom_analysis/sellers?start_date=${startDate}&end_date=${endDate}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar vendedores.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'vendedores') return;

        if (dom.sellerStartDate) dom.sellerStartDate.value = startDate;
        if (dom.sellerEndDate) dom.sellerEndDate.value = endDate;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = ''; // Limpa o dashboard
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden'); // Esconde área de gráficos

        utils.renderSummaryCards(dom.dashboardContentDiv, [
            { title: 'Total de Clientes Cancelados', value: result.total_cancelados || 0, colorClass: 'bg-red-50' },
            { title: 'Total de Clientes Negativados', value: result.total_negativados || 0, colorClass: 'bg-orange-50' },
            { title: 'Soma Total (Churn)', value: result.grand_total || 0, colorClass: 'bg-gray-100' }
        ]);

        const tableData = result.data;
        if (!tableData || tableData.length === 0) {
            const msg = document.createElement('p');
            msg.className = "text-center text-gray-500 mt-4";
            msg.textContent = "Nenhum resultado encontrado.";
            dom.dashboardContentDiv.appendChild(msg);
            return;
        }

        const columns = [
            { header: 'Vendedor', render: r => `<div class="font-medium text-gray-900">${r.Vendedor_Nome || 'Não Identificado'}</div>` },
            { header: 'Cancelados', render: r => r.Cancelados_Count > 0 ? `<span class="seller-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="cancelado">${r.Cancelados_Count}</span>` : '0', cssClass: 'text-center' },
            { header: '% Canc.', render: r => r.Total > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Cancelados_Count / r.Total) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Negativados', render: r => r.Negativados_Count > 0 ? `<span class="seller-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="negativado">${r.Negativados_Count}</span>` : '0', cssClass: 'text-center' },
            { header: '% Neg.', render: r => r.Total > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Negativados_Count / r.Total) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Total Churn', key: 'Total', cssClass: 'text-center font-bold text-gray-800 bg-gray-100' }
        ];

        const tableHtml = utils.renderGenericDetailTable(null, tableData, columns, true);
        
        // --- USO SEGURO DO DOM (APPEND AO INVÉS DE +=) ---
        const tableContainer = document.createElement('div');
        tableContainer.className = "bg-white rounded-lg shadow-md overflow-hidden mt-8";
        tableContainer.innerHTML = `
             <div class="p-6">
                <h2 class="text-xl font-semibold text-gray-800">Desempenho por Vendedor (Churn)</h2>
                <p class="text-sm text-gray-500">As porcentagens representam a participação de cada tipo no total de perdas do vendedor.</p>
            </div>
            <div class="overflow-x-auto">
               ${tableHtml}
            </div>
        `;
        dom.dashboardContentDiv.appendChild(tableContainer);

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'vendedores') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'vendedores') utils.showLoading(false);
    }
}

/**
 * Busca e renderiza a análise de "Cancelamento/Negativação por Cidade".
 */
export async function fetchAndRenderCancellationsByCity(startDate = '', endDate = '', relevance = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'cancellations_by_city', currentPage: 1 });

    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (relevance) params.append('relevance', relevance);
    const url = `${state.API_BASE_URL}/api/custom_analysis/cancellations_by_city?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise por cidade.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'cancellations_by_city') return;

        if(dom.cityCancellationStartDate) dom.cityCancellationStartDate.value = startDate;
        if(dom.cityCancellationEndDate) dom.cityCancellationEndDate.value = endDate;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';

        const mainCards = [
            { title: 'Total Cancelados', value: result.total_cancelados || 0, colorClass: 'bg-red-50' },
            { title: 'Total Negativados', value: result.total_negativados || 0, colorClass: 'bg-orange-50' },
            { title: 'Soma Geral', value: result.grand_total || 0, colorClass: 'bg-gray-100' }
        ];
        
        if (result.data) {
            const cityCards = result.data.map(item => ({ title: item.Cidade, value: item.Total || 0, colorClass: 'bg-blue-50' }));
            utils.renderSummaryCards(dom.dashboardContentDiv, [...mainCards, ...cityCards]);
        } else {
             utils.renderSummaryCards(dom.dashboardContentDiv, mainCards);
        }

        setupChartsArea();
        const grid = getGridStack();

        if(!result.data || result.data.length === 0) {
            dom.mainChartsArea.innerHTML = '<p class="text-center text-gray-500 mt-4">Nenhum dado encontrado.</p>';
            return;
        }

        const labels = result.data.map(d => d.Cidade || 'N/A');
        const datasets = [
            { label: 'Cancelados', data: result.data.map(d => d.Cancelados || 0), backgroundColor: '#ef4444' },
            { label: 'Negativados', data: result.data.map(d => d.Negativados || 0), backgroundColor: '#f97316' }
        ];

        if(grid) grid.addWidget({ w: 12, h: 8, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="cityAnalysisChartTitle" class="chart-title"></h3></div><div class="chart-canvas-container"><canvas id="cityAnalysisChart"></canvas></div></div>`, id: 'cityAnalysisChartWidget' });

        renderChart('cityAnalysisChart', 'bar_vertical', labels, datasets, 'Cancelamentos e Negativações por Cidade', {
            formatterType: 'number',
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const chart = state.getMainCharts()['cityAnalysisChart'];
                    const element = elements[0];
                    const clickedCity = chart.data.labels[element.index];
                    const type = chart.data.datasets[element.datasetIndex].label === 'Cancelados' ? 'cancelado' : 'negativado';
                    modals.openCityDetailModal(clickedCity, type, dom.cityCancellationStartDate?.value || '', dom.cityCancellationEndDate?.value || '', dom.relevanceFilterCity?.value || '');
                }
            }
        });

        const tableColumns = [
            { header: 'Cidade', key: 'Cidade', cssClass: 'font-medium text-gray-900' },
            { header: 'Cancelados', key: 'Cancelados', cssClass: 'text-center text-red-600 font-bold' },
            { header: 'Negativados', key: 'Negativados', cssClass: 'text-center text-orange-600 font-bold' },
            { header: 'Total', key: 'Total', cssClass: 'text-center font-bold bg-gray-100' }
        ];
        const tableHtml = utils.renderGenericDetailTable(null, result.data, tableColumns, true);
        
        // --- USO SEGURO DO DOM (APPEND) ---
        const tableDiv = document.createElement('div');
        tableDiv.className = "bg-white rounded-lg shadow-md overflow-hidden mt-8";
        tableDiv.innerHTML = `<div class="p-6 border-b border-gray-200"><h2 class="text-xl font-semibold text-gray-800">Detalhamento por Cidade</h2></div><div class="overflow-x-auto">${tableHtml}</div>`;
        dom.dashboardContentDiv.appendChild(tableDiv);

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations_by_city') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations_by_city') utils.showLoading(false);
    }
}

/**
 * Busca e renderiza a análise de "Cancelamento/Negativação por Bairro".
 */
export async function fetchAndRenderCancellationsByNeighborhood(city = '', startDate = '', endDate = '', relevance = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'cancellations_by_neighborhood', currentPage: 1 });

    const params = new URLSearchParams({ city: city });
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (relevance) params.append('relevance', relevance);
    const url = `${state.API_BASE_URL}/api/custom_analysis/cancellations_by_neighborhood?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise por bairro.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'cancellations_by_neighborhood') return;

        if(dom.neighborhoodAnalysisCityFilter && result.cities) utils.populateCityFilter(dom.neighborhoodAnalysisCityFilter, result.cities, city);
        if(dom.neighborhoodAnalysisStartDate) dom.neighborhoodAnalysisStartDate.value = startDate;
        if(dom.neighborhoodAnalysisEndDate) dom.neighborhoodAnalysisEndDate.value = endDate;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';

        if (city) {
            utils.renderSummaryCards(dom.dashboardContentDiv, [
                { title: 'Total Cancelados', value: result.total_cancelados || 0, colorClass: 'bg-red-50' },
                { title: 'Total Negativados', value: result.total_negativados || 0, colorClass: 'bg-orange-50' },
                { title: 'Soma Geral (Bairros)', value: result.grand_total || 0, colorClass: 'bg-gray-100' }
            ]);
        }

        setupChartsArea();
        const grid = getGridStack();

        if (!city) {
            dom.mainChartsArea.innerHTML = '<p class="text-center text-gray-500 mt-4">Por favor, selecione uma cidade.</p>';
            return;
        }

        if (!result.data || result.data.length === 0) {
            dom.mainChartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum dado encontrado para ${city}.</p>`;
            return;
        }

        const labels = result.data.map(d => d.Bairro || 'N/A');
        const datasets = [
            { label: 'Cancelados', data: result.data.map(d => d.Cancelados || 0), backgroundColor: '#ef4444' },
            { label: 'Negativados', data: result.data.map(d => d.Negativados || 0), backgroundColor: '#f97316' }
        ];

        if(grid) grid.addWidget({ w: 12, h: 10, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="neighborhoodChartTitle" class="chart-title"></h3></div><div class="chart-canvas-container"><canvas id="neighborhoodChart"></canvas></div></div>`, id: 'neighborhoodChartWidget' });

        renderChart('neighborhoodChart', 'bar_horizontal', labels, datasets, `Cancelamentos/Negativações por Bairro em ${city}`, {
            formatterType: 'number',
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const chart = state.getMainCharts()['neighborhoodChart'];
                    const element = elements[0];
                    const neighborhood = chart.data.labels[element.index];
                    const type = chart.data.datasets[element.datasetIndex].label === 'Cancelados' ? 'cancelado' : 'negativado';
                    modals.openNeighborhoodDetailModal(city, neighborhood, type, dom.neighborhoodAnalysisStartDate?.value || '', dom.neighborhoodAnalysisEndDate?.value || '', dom.relevanceFilterNeighborhood?.value || '');
                }
            }
        });

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations_by_neighborhood') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations_by_neighborhood') utils.showLoading(false);
    }
}

/**
 * Busca e renderiza a análise de "Cancelamento por Equipamento".
 */
export async function fetchAndRenderCancellationsByEquipment(startDate = '', endDate = '', city = '', relevance = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'cancellations_by_equipment', currentPage: 1 });

    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (city) params.append('city', city);
    if (relevance) params.append('relevance', relevance);
    const url = `${state.API_BASE_URL}/api/custom_analysis/cancellations_by_equipment?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise por equipamento.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'cancellations_by_equipment') return;

        if(dom.equipmentAnalysisStartDate) dom.equipmentAnalysisStartDate.value = startDate;
        if(dom.equipmentAnalysisEndDate) dom.equipmentAnalysisEndDate.value = endDate;
        if(dom.equipmentAnalysisCityFilter && result.cities) utils.populateCityFilter(dom.equipmentAnalysisCityFilter, result.cities, city);

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';

        utils.renderSummaryCards(dom.dashboardContentDiv, [{ title: 'Total de Equipamentos Devolvidos', value: result.total_equipments || 0, colorClass: 'bg-purple-50' }]);

        setupChartsArea();
        const grid = getGridStack();

        if (!result.data || result.data.length === 0) {
            dom.mainChartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum cancelamento associado a equipamentos encontrado.</p>`;
            return;
        }

        const labels = result.data.map(d => d.Descricao_produto || 'Não Identificado');
        const datasets = [{ label: 'Cancelamentos', data: result.data.map(d => d.Count || 0), backgroundColor: '#d946ef' }];

        if(grid) grid.addWidget({ w: 12, h: 10, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="equipmentChartTitle" class="chart-title"></h3></div><div class="chart-canvas-container"><canvas id="equipmentChart"></canvas></div></div>`, id: 'equipmentChartWidget' });

        renderChart('equipmentChart', 'bar_horizontal', labels, datasets, 'Top Cancelamentos por Modelo de Equipamento', {
            formatterType: 'number',
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const chart = state.getMainCharts()['equipmentChart'];
                    const element = elements[0];
                    const equipmentName = chart.data.labels[element.index];
                    modals.openEquipmentDetailModal(equipmentName, dom.equipmentAnalysisStartDate?.value || '', dom.equipmentAnalysisEndDate?.value || '', dom.equipmentAnalysisCityFilter?.value || '', dom.relevanceFilterEquipment?.value || '');
                }
            }
        });

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations_by_equipment') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'cancellations_by_equipment') utils.showLoading(false);
    }
}

/**
 * Busca e renderiza a análise de "Equipamentos por OLT" (agora Equipamentos Ativos por Cidade).
 */
export async function fetchAndRenderEquipmentByOlt(city = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'equipment_by_olt', currentPage: 1 });

    const url = `${state.API_BASE_URL}/api/custom_analysis/equipment_by_olt?city=${encodeURIComponent(city)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar equipamentos.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'equipment_by_olt') return;

        if (dom.equipmentAnalysisCityFilter && result.cities) utils.populateCityFilter(dom.equipmentAnalysisCityFilter, result.cities, city);

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';
        
        setupChartsArea();
        const grid = getGridStack();

        if (!result.data || result.data.length === 0) {
            dom.mainChartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">${city ? `Nenhum equipamento ativo para ${city}.` : 'Nenhum equipamento ativo encontrado.'}</p>`;
            return;
        }

        const labels = result.data.map(d => d.Descricao_produto || 'N/A');
        const data = result.data.map(d => d.Count || 0);
        const filterText = city ? `em ${city}` : '(Todas as Cidades)';

        if(grid) grid.addWidget({ w: 12, h: 10, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="equipmentChartTitle" class="chart-title"></h3></div><div class="chart-canvas-container"><canvas id="equipmentChart"></canvas></div></div>`, id: 'equipmentChartWidget' });

        renderChart('equipmentChart', 'bar_horizontal', labels, [{ label: 'Contagem', data: data }], `Equipamentos em Comodato Ativo ${filterText}`, {
            formatterType: 'number',
            plugins: { legend: { display: false } },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const chart = state.getMainCharts()['equipmentChart'];
                    const element = elements[0];
                    const equipmentName = chart.data.labels[element.index];
                    modals.openActiveEquipmentDetailModal(equipmentName, dom.equipmentAnalysisCityFilter?.value || '');
                }
            }
        });

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'equipment_by_olt') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'equipment_by_olt') utils.showLoading(false);
    }
}

/**
 * Busca os dados da API e renderiza o gráfico de coorte de retenção.
 */
export async function fetchAndRenderCohortAnalysis(city = '', startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'cohort_retention', currentPage: 1 });

    const params = new URLSearchParams();
    if (city) params.append('city', city);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const url = `${state.API_BASE_URL}/api/custom_analysis/cohort?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar coorte.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'cohort_retention') return;

        if (dom.cohortCityFilter && result.cities) utils.populateCityFilter(dom.cohortCityFilter, result.cities, city);
        if (dom.cohortStartDate) dom.cohortStartDate.value = startDate;
        if (dom.cohortEndDate) dom.cohortEndDate.value = endDate;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';
        
        setupChartsArea();
        const grid = getGridStack();

        if (!result.datasets || result.datasets.length === 0) {
            dom.mainChartsArea.innerHTML = '<p class="text-center text-gray-500 mt-4">Nenhum dado encontrado para a análise de coorte.</p>';
            return;
        }

        if(grid) grid.addWidget({ w: 12, h: 8, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="cohortChartTitle" class="chart-title">Retenção de Clientes por Coorte</h3></div><div class="chart-canvas-container"><canvas id="cohortChart"></canvas></div></div>`, id: 'cohortChartWidget' });

        renderCohortChart(result.labels || [], result.datasets || []);

    } catch (error) {
         if (state.getCustomAnalysisState().currentAnalysis === 'cohort_retention') {
             destroySpecificChart('cohortChart');
             utils.showError(error.message);
         }
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'cohort_retention') utils.showLoading(false);
    }
}

function renderCohortChart(labels, datasets) {
    const canvasId = 'cohortChart';
    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    destroySpecificChart(canvasId);

    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a0aec0', '#4a5568'];
    const chartDatasets = datasets.map((ds, index) => ({
        ...ds,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + '80',
        pointRadius: 0,
        tension: 0.1,
        fill: 'origin'
    }));

    const chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: chartDatasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, title: { display: false }, datalabels: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: { x: { stacked: true, title: { display: true, text: 'Mês da Fatura' } }, y: { stacked: true, title: { display: true, text: 'Número de Clientes Ativos' }, beginAtZero: true } },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
    state.addChart(canvasId, chartInstance);
}

/**
 * Busca e renderiza a análise de "Evolução Diária por Cidade".
 */
export async function fetchAndRenderDailyEvolution(startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'daily_evolution_by_city', currentPage: 1 });

    if (!startDate || !endDate) {
        utils.showLoading(false);
        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'daily_evolution_by_city') return;

        if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = '';
        if (dom.dailyEvolutionFiltersDiv && !dom.dashboardContentDiv.contains(dom.dailyEvolutionFiltersDiv)) {
             dom.dashboardContentDiv.appendChild(dom.dailyEvolutionFiltersDiv);
        }
        if (dom.mainChartsArea) {
            dom.mainChartsArea.innerHTML = '<p class="text-center text-gray-500 mt-4">Por favor, selecione uma data inicial e final.</p>';
            if (!dom.dashboardContentDiv.contains(dom.mainChartsArea)) dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
            dom.mainChartsArea.classList.remove('hidden');
        }
        destroyAllMainCharts();
        const grid = getGridStack();
        if(grid) grid.removeAll();
        return;
    }

    const url = `${state.API_BASE_URL}/api/custom_analysis/daily_evolution_by_city?start_date=${startDate}&end_date=${endDate}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar evolução diária.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'daily_evolution_by_city') return;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';
        if (dom.dailyEvolutionFiltersDiv && !dom.dashboardContentDiv.contains(dom.dailyEvolutionFiltersDiv)) {
             dom.dashboardContentDiv.appendChild(dom.dailyEvolutionFiltersDiv);
        }
        
        setupChartsArea();
        const grid = getGridStack();

        if (!result.data || Object.keys(result.data).length === 0) {
            dom.mainChartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum dado encontrado.</p>`;
            return;
        }

        let x = 0, y = 0, col = 0;
        const colsPerRow = 2;

        for (const cityName in result.data) {
            const cityData = result.data[cityName];
            const dailyData = cityData.daily_data || [];
            const totals = cityData.totals || {};

            dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));
            const labels = dailyData.map(d => new Date(d.date + 'T00:00:00-03:00').toLocaleDateString('pt-BR'));
            const datasets = [
                { label: 'Ativações', data: dailyData.map(d => d.ativacoes || 0), backgroundColor: 'rgba(34, 197, 94, 0.2)', borderColor: '#22c55e', pointRadius: 3, pointHoverRadius: 5, tension: 0.1, fill: true },
                { label: 'Churn', data: dailyData.map(d => d.churn || 0), backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', pointRadius: 3, pointHoverRadius: 5, tension: 0.1, fill: true }
            ];

            const chartId = `daily-chart-${cityName.replace(/[^a-zA-Z0-9]/g, '')}`;
            const summaryHtml = `<div class="summary-card-container flex justify-center gap-4 mb-2"><div class="summary-card-item bg-green-100 p-2 rounded-lg text-center shadow-sm"><p class="text-xs font-bold text-green-800 uppercase">Ativações</p><p class="text-xl font-bold text-green-600">${totals.total_ativacoes || 0}</p></div><div class="summary-card-item bg-red-100 p-2 rounded-lg text-center shadow-sm"><p class="text-xs font-bold text-red-800 uppercase">Churn</p><p class="text-xl font-bold text-red-600">${totals.total_churn || 0}</p></div></div>`;
            const content = `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="${chartId}Title" class="chart-title"></h3></div>${summaryHtml}<div class="chart-canvas-container"><canvas id="${chartId}"></canvas></div></div>`;

            if(grid) grid.addWidget({ x: x, y: y, w: 6, h: 7, content: content, id: `${chartId}Widget` });

            renderChart(chartId, 'line', labels, datasets, `Evolução Diária - ${cityName}`, {
                plugins: { legend: { display: true, position: 'bottom' }, datalabels: { display: false } },
                scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { beginAtZero: true } }
            });

            x += 6; col++;
            if (col >= colsPerRow) { x = 0; y += 7; col = 0; }
        }

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'daily_evolution_by_city') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'daily_evolution_by_city') utils.showLoading(false);
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
 * Busca e renderiza a análise de "Ativação por Vendedor" com cards e tabela.
 */
export async function fetchAndRenderActivationsBySeller(city = '', startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'activations_by_seller', currentPage: 1 }); 
    
    const params = new URLSearchParams();
    if (city) params.append('city', city);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const url = `${state.API_BASE_URL}/api/custom_analysis/activations_by_seller?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de ativação por vendedor.');
            throw new Error(errorMessage);
        }
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'activations_by_seller') return;

        if(dom.activationSellerCityFilter && result.cities) utils.populateCityFilter(dom.activationSellerCityFilter, result.cities, city);
        if(dom.activationSellerStartDate) dom.activationSellerStartDate.value = startDate;
        if(dom.activationSellerEndDate) dom.activationSellerEndDate.value = endDate;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';
        
        // --- CORREÇÃO: Esconde a área de gráficos pois vamos desenhar tabela no dashboard ---
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');

        utils.renderSummaryCards(dom.dashboardContentDiv, [
            { title: 'Total Ativações', value: result.totals?.total_ativacoes || 0, colorClass: 'bg-blue-50' },
            { title: 'Permanecem Ativos', value: result.totals?.total_permanecem_ativos || 0, colorClass: 'bg-green-50' },
            { title: 'Cancelados', value: result.totals?.total_cancelados || 0, colorClass: 'bg-orange-50' },
            { title: 'Negativados', value: result.totals?.total_negativados || 0, colorClass: 'bg-red-50' },
            { title: 'Churn Total', value: result.totals?.total_churn || 0, colorClass: 'bg-gray-100' }
        ]);

        if (!result.data || result.data.length === 0) {
            const msg = document.createElement('p');
            msg.className = "text-center text-gray-500 mt-4";
            msg.textContent = "Nenhum vendedor com ativações encontrado para os filtros selecionados.";
            dom.dashboardContentDiv.appendChild(msg);
            return;
        }

        const columns = [
            { header: 'Vendedor', render: r => `<div class="font-medium text-gray-900">${r.Vendedor_Nome || 'Não Identificado'}</div>` },
            { header: 'Total Ativações', render: r => r.Total_Ativacoes > 0 ? `<span class="seller-activation-trigger cursor-pointer text-blue-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="ativado">${r.Total_Ativacoes}</span>` : '0', cssClass: 'text-center font-bold bg-blue-50' },
            { header: 'Permanecem Ativos', render: r => r.Permanecem_Ativos > 0 ? `<span class="seller-activation-trigger cursor-pointer text-green-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="ativo_permanece">${r.Permanecem_Ativos}</span>` : '0', cssClass: 'text-center' },
            { header: '% Ativos', render: r => r.Total_Ativacoes > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Permanecem_Ativos / r.Total_Ativacoes) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Cancelados', render: r => r.Cancelados > 0 ? `<span class="seller-activation-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="cancelado">${r.Cancelados}</span>` : '0', cssClass: 'text-center' },
            { header: '% Canc.', render: r => r.Total_Ativacoes > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Cancelados / r.Total_Ativacoes) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Negativados', render: r => r.Negativados > 0 ? `<span class="seller-activation-trigger cursor-pointer text-red-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="negativado">${r.Negativados}</span>` : '0', cssClass: 'text-center' },
            { header: '% Neg.', render: r => r.Total_Ativacoes > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Negativados / r.Total_Ativacoes) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Churn Total', key: 'Total_Churn', cssClass: 'text-center font-bold text-gray-800 bg-gray-100' }
        ];

        const tableHtml = utils.renderGenericDetailTable(null, result.data, columns, true);

        // --- USO SEGURO DO DOM (APPEND) ---
        const tableDiv = document.createElement('div');
        tableDiv.className = "bg-white rounded-lg shadow-md overflow-hidden mt-8";
        tableDiv.innerHTML = `
             <div class="p-6">
                <h2 class="text-xl font-semibold text-gray-800">Desempenho de Ativação por Vendedor</h2>
            </div>
            <div class="overflow-x-auto">
               ${tableHtml}
            </div>
        `;
        dom.dashboardContentDiv.appendChild(tableDiv);

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'activations_by_seller') {
            utils.showError(error.message);
        }
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'activations_by_seller') {
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