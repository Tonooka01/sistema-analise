import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { renderChart, destroyAllMainCharts, destroySpecificChart } from '../charts.js';
import { getGridStack } from '../state.js';
import * as modals from '../modals.js';

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

// Helper local para o gráfico de coorte
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
    // Adiciona ao gerenciador de estado (mesmo sem exportação, para que possa ser destruído por ID globalmente)
    // Nota: addChart é do charts.js, mas aqui precisamos acessar o estado para adicionar.
    // Como charts.js gerencia isso, idealmente renderChart já faz. Mas aqui estamos usando new Chart direto.
    // Correção: Importar e usar state.addChart se disponível, ou garantir que charts.js lide com isso.
    state.addChart(canvasId, chartInstance);
}