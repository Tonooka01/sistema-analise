import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';
import { renderChart, destroyAllMainCharts } from '../charts.js';
import { getGridStack } from '../state.js';
import * as modals from '../modals.js'; 

// --- Helper local para configurar a área de gráficos ---
function setupChartsArea() {
    if (dom.mainChartsArea) {
        if (dom.dashboardContentDiv && !dom.dashboardContentDiv.contains(dom.mainChartsArea)) {
            dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
        }
        dom.mainChartsArea.classList.remove('hidden');
        destroyAllMainCharts();
        const grid = getGridStack();
        if(grid) grid.removeAll();
        dom.mainChartsArea.innerHTML = ''; 
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
 * Busca e renderiza a análise de "Evolução Diária por Cidade".
 * ATUALIZADO: Interação melhorada no clique do gráfico.
 */
export async function fetchAndRenderDailyEvolution(startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'daily_evolution_by_city', currentPage: 1 });

    if (!startDate || !endDate) {
        utils.showLoading(false);
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

        if (state.getCustomAnalysisState().currentAnalysis !== 'daily_evolution_by_city') return;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';
        if (dom.dailyEvolutionFiltersDiv && !dom.dashboardContentDiv.contains(dom.dailyEvolutionFiltersDiv)) {
             dom.dashboardContentDiv.appendChild(dom.dailyEvolutionFiltersDiv);
        }
        
        setupChartsArea();
        const grid = getGridStack();

        if (result.data && Object.keys(result.data).length > 0) {
            let x = 0, y = 0, col = 0;
            const colsPerRow = 2;

            for (const cityName in result.data) {
                const cityData = result.data[cityName];
                const dailyData = cityData.daily_data || [];
                const totals = cityData.totals || {};

                dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));
                const labels = dailyData.map(d => new Date(d.date + 'T00:00:00-03:00').toLocaleDateString('pt-BR'));
                const datasets = [
                    { label: 'Ativações', data: dailyData.map(d => d.ativacoes || 0), backgroundColor: 'rgba(34, 197, 94, 0.2)', borderColor: '#22c55e', pointRadius: 4, pointHoverRadius: 6, tension: 0.1, fill: true },
                    { label: 'Churn', data: dailyData.map(d => d.churn || 0), backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', pointRadius: 4, pointHoverRadius: 6, tension: 0.1, fill: true }
                ];

                const chartId = `daily-chart-${cityName.replace(/[^a-zA-Z0-9]/g, '')}`;
                const summaryHtml = `<div class="summary-card-container flex justify-center gap-4 mb-2"><div class="summary-card-item bg-green-100 p-2 rounded-lg text-center shadow-sm"><p class="text-xs font-bold text-green-800 uppercase">Ativações</p><p class="text-xl font-bold text-green-600">${totals.total_ativacoes || 0}</p></div><div class="summary-card-item bg-red-100 p-2 rounded-lg text-center shadow-sm"><p class="text-xs font-bold text-red-800 uppercase">Churn</p><p class="text-xl font-bold text-red-600">${totals.total_churn || 0}</p></div></div>`;
                const content = `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="${chartId}Title" class="chart-title"></h3></div>${summaryHtml}<div class="chart-canvas-container"><canvas id="${chartId}"></canvas></div></div>`;

                if(grid) grid.addWidget({ x: x, y: y, w: 6, h: 7, content: content, id: `${chartId}Widget` });

                renderChart(chartId, 'line', labels, datasets, `Evolução Diária - ${cityName}`, {
                    plugins: { 
                        legend: { display: true, position: 'bottom' }, 
                        datalabels: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false, // Tooltip aparece ao passar mouse na linha vertical (eixo X)
                        }
                    },
                    // CONFIGURAÇÃO CRÍTICA PARA O CLIQUE FUNCIONAR FACILMENTE
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false // Permite clicar na "linha vertical" do dia, não só no ponto
                    },
                    scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { beginAtZero: true } },
                    
                    // Lógica de Clique Corrigida e Robusta
                    onClick: (event, elements, chartInstance) => {
                        // Tenta usar a instância passada pelo Chart.js (v3+), senão busca no estado global
                        const chart = chartInstance || state.getMainCharts()[chartId];
                        
                        if (chart && elements && elements.length > 0) {
                            const index = elements[0].index;
                            const dateLabel = chart.data.labels[index];
                            
                            console.log("Data clicada:", dateLabel); // Debug no console

                            if (dateLabel) {
                                const parts = dateLabel.split('/');
                                if (parts.length === 3) {
                                    // Converte DD/MM/YYYY para YYYY-MM-DD
                                    const dbDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                    const tableContainer = document.getElementById('daily-evolution-table-container');
                                    
                                    if (tableContainer) {
                                        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        // Atualiza a tabela com a data específica
                                        fetchAndRenderDailyEvolutionTable(dbDate, dbDate, 1);
                                    }
                                }
                            }
                        }
                    }
                });

                x += 6; col++;
                if (col >= colsPerRow) { x = 0; y += 7; col = 0; }
            }
        } else {
             dom.mainChartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum dado encontrado.</p>`;
        }

        // 3. Renderiza o Container da Tabela
        const tableContainer = document.createElement('div');
        tableContainer.id = 'daily-evolution-table-container';
        tableContainer.className = 'mt-8 bg-white rounded-lg shadow p-6';
        dom.dashboardContentDiv.appendChild(tableContainer);

        // Carrega a tabela inicialmente com o período completo
        await fetchAndRenderDailyEvolutionTable(startDate, endDate, 1);

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'daily_evolution_by_city') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'daily_evolution_by_city') utils.showLoading(false);
    }
}

/**
 * Função Auxiliar para buscar e renderizar a tabela de detalhes da evolução diária.
 */
async function fetchAndRenderDailyEvolutionTable(startDate, endDate, page = 1) {
    const container = document.getElementById('daily-evolution-table-container');
    if (!container) return;

    if(page === 1 || container.querySelector('.loading-spinner')) {
        container.innerHTML = '<div class="loading-spinner"></div><p class="text-center text-gray-500">Carregando lista detalhada de clientes...</p>';
    }

    const rowsPerPage = 20;
    const offset = (page - 1) * rowsPerPage;
    const url = `${state.API_BASE_URL}/api/details/daily_evolution_details?start_date=${startDate}&end_date=${endDate}&limit=${rowsPerPage}&offset=${offset}`;

    try {
        const response = await fetch(url);
        if(!response.ok) throw new Error("Erro ao buscar detalhes.");
        const result = await response.json();

        const columns = [
            { 
                header: 'Cliente', 
                render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline font-semibold" 
                                data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" 
                                data-contract-id="${r.Contrato_ID}"
                                title="Ver Histórico">
                                ${r.Cliente}
                              </span>` 
            },
            { header: 'Contrato ID', key: 'Contrato_ID' },
            { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
            { header: 'Cidade', key: 'Cidade' },
            { 
                header: 'Equipamento (Emprestado)', 
                key: 'Equipamento_Atual',
                render: r => r.Equipamento_Atual 
                    ? `<span class="inline-block px-2 py-1 text-xs font-semibold leading-none text-blue-800 bg-blue-100 rounded-full">${r.Equipamento_Atual}</span>` 
                    : '<span class="text-gray-400 text-xs">-</span>'
            },
            { 
                header: 'Status', 
                key: 'Status_contrato',
                render: r => {
                    let cls = 'bg-gray-100 text-gray-800';
                    if (r.Status_contrato === 'Ativo') cls = 'text-green-700 bg-green-100';
                    else if (r.Status_contrato === 'Inativo' || r.Status_contrato === 'Cancelado') cls = 'text-red-700 bg-red-100';
                    else if (r.Status_contrato === 'Negativado') cls = 'text-orange-700 bg-orange-100';
                    
                    return `<span class="${cls} px-2 py-1 rounded font-bold text-xs uppercase">${r.Status_contrato}</span>`;
                }
            },
            { header: 'Data Final (Churn)', key: 'Data_Final', isDate: true },
            { header: 'Permanência (Meses)', key: 'permanencia_meses', cssClass: 'text-center' }
        ];

        // Título dinâmico
        const formatDate = (d) => {
            const p = d.split('-');
            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
        };
        const dateRangeStr = startDate === endDate ? `do Dia ${formatDate(startDate)}` : `de ${formatDate(startDate)} até ${formatDate(endDate)}`;
        
        const titleHtml = `<div class="flex justify-between items-center mb-4 border-b pb-2">
            <h3 class="text-lg font-bold text-gray-700">Detalhes de Instalações e Churn ${dateRangeStr}</h3>
            <span class="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full">${result.total_rows} registros</span>
        </div>`;
        
        const tableHtml = utils.renderGenericDetailTable(null, result.data, columns, true);
        
        const totalPages = Math.ceil(result.total_rows / rowsPerPage);
        let paginationHtml = '';
        
        if (totalPages > 1) {
            paginationHtml = `
                <div class="flex justify-center items-center gap-4 mt-6">
                    <button class="daily-evo-page-btn bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg shadow-sm disabled:opacity-50 transition" 
                        ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">Anterior</button>
                    <span class="text-sm font-medium text-gray-600">Página ${page} de ${totalPages}</span>
                    <button class="daily-evo-page-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm disabled:opacity-50 transition" 
                        ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Próxima</button>
                </div>
            `;
        } else if (result.total_rows === 0) {
             paginationHtml = '<p class="text-center text-gray-500 mt-2 text-sm">Nenhum registro encontrado para este período.</p>';
        }

        container.innerHTML = titleHtml + `<div class="overflow-x-auto border rounded-lg">${tableHtml}</div>` + paginationHtml;

        container.querySelectorAll('.daily-evo-page-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetPage = parseInt(e.target.dataset.page);
                fetchAndRenderDailyEvolutionTable(startDate, endDate, targetPage);
            });
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="bg-red-50 p-4 rounded border border-red-200 text-red-600">Erro ao carregar tabela: ${e.message}</div>`;
    }
}