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
 * ATUALIZADO: Clique abre o MODAL DE TABELA (Pop Up) com filtro correto por cidade e data.
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

                // Ordena datas
                dailyData.sort((a, b) => new Date(a.date) - new Date(b.date));
                const labels = dailyData.map(d => {
                    const parts = d.date.split('-');
                    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
                });
                
                const datasets = [
                    { label: 'Ativações', data: dailyData.map(d => d.ativacoes || 0), backgroundColor: 'rgba(34, 197, 94, 0.2)', borderColor: '#22c55e', pointRadius: 4, pointHoverRadius: 6, tension: 0.1, fill: true },
                    { label: 'Churn', data: dailyData.map(d => d.churn || 0), backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', pointRadius: 4, pointHoverRadius: 6, tension: 0.1, fill: true }
                ];

                const chartId = `daily-chart-${cityName.replace(/[^a-zA-Z0-9]/g, '')}`;
                const summaryHtml = `<div class="summary-card-container flex justify-center gap-4 mb-2"><div class="summary-card-item bg-green-100 p-2 rounded-lg text-center shadow-sm"><p class="text-xs font-bold text-green-800 uppercase">Ativações</p><p class="text-xl font-bold text-green-600">${totals.total_ativacoes || 0}</p></div><div class="summary-card-item bg-red-100 p-2 rounded-lg text-center shadow-sm"><p class="text-xs font-bold text-red-800 uppercase">Churn</p><p class="text-xl font-bold text-red-600">${totals.total_churn || 0}</p></div></div>`;
                const content = `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="${chartId}Title" class="chart-title">${cityName}</h3></div>${summaryHtml}<div class="chart-canvas-container"><canvas id="${chartId}"></canvas></div></div>`;

                if(grid) grid.addWidget({ x: x, y: y, w: 6, h: 7, content: content, id: `${chartId}Widget` });

                renderChart(chartId, 'line', labels, datasets, `Evolução - ${cityName}`, {
                    plugins: { 
                        legend: { display: true, position: 'bottom' }, 
                        datalabels: { display: false },
                        tooltip: { mode: 'index', intersect: false }
                    },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false },
                    scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }, y: { beginAtZero: true } },
                    
                    // --- CLIQUE NO GRÁFICO (ABRE MODAL) ---
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            // Usa a data real do objeto de dados (YYYY-MM-DD), não a label formatada
                            // AQUI ESTÁ O TRUQUE: Usamos o array original 'dailyData' que está no escopo do loop
                            const rawDate = dailyData[index].date; 
                            openDailyEvolutionModal(cityName, rawDate);
                        }
                    }
                });

                x += 6; col++;
                if (col >= colsPerRow) { x = 0; y += 7; col = 0; }
            }
        } else {
             dom.mainChartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum dado encontrado.</p>`;
        }

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'daily_evolution_by_city') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'daily_evolution_by_city') utils.showLoading(false);
    }
}

/**
 * Abre o Modal (Pop-up) com a tabela de detalhes do dia.
 */
function openDailyEvolutionModal(city, date) {
    if (!dom.tableModal) return;
    
    // Configura e abre o modal genérico
    dom.tableModal.classList.add('show');
    if (dom.modalTitle) dom.modalTitle.textContent = `Detalhes: ${city} - ${utils.formatDate(date)}`;
    if (dom.modalTableHead) dom.modalTableHead.innerHTML = '';
    if (dom.modalTableBody) dom.modalTableBody.innerHTML = '';
    if (dom.modalLoadingDiv) dom.modalLoadingDiv.classList.remove('hidden');
    
    // Esconde a paginação padrão do modal (para usar a nossa personalizada e evitar conflitos)
    if (dom.modalPaginationControls) dom.modalPaginationControls.classList.add('hidden');

    // Inicia a busca
    fetchAndDisplayDailyEvolutionModalTable(city, date, 1);
}

/**
 * Busca e preenche a tabela DENTRO do modal.
 */
async function fetchAndDisplayDailyEvolutionModalTable(city, date, page = 1) {
    const rowsPerPage = 20;
    const offset = (page - 1) * rowsPerPage;
    // IMPORTANTE: Passa 'city' para a API para filtrar os dados corretamente
    const url = `${state.API_BASE_URL}/api/details/daily_evolution_details?start_date=${date}&end_date=${date}&city=${encodeURIComponent(city)}&limit=${rowsPerPage}&offset=${offset}`;

    try {
        const response = await fetch(url);
        if(!response.ok) throw new Error("Erro ao buscar detalhes.");
        const result = await response.json();

        if (dom.modalLoadingDiv) dom.modalLoadingDiv.classList.add('hidden');

        // Renderiza Cabeçalho da Tabela
        if (dom.modalTableHead) {
            dom.modalTableHead.innerHTML = `
                <th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase bg-gray-100">Cliente</th>
                <th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase bg-gray-100">Contrato ID</th>
                <th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase bg-gray-100">Status</th>
                <th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase bg-gray-100">Data Ativação</th>
                <th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase bg-gray-100">Data Churn</th>
                <th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase bg-gray-100">Equipamento</th>
            `;
        }

        // Renderiza Corpo da Tabela
        if (dom.modalTableBody) {
            if (result.data.length === 0) {
                dom.modalTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Nenhum registro encontrado.</td></tr>';
            } else {
                dom.modalTableBody.innerHTML = result.data.map(r => {
                    let statusClass = 'bg-gray-100 text-gray-800';
                    if (r.Status_contrato === 'Ativo') statusClass = 'text-green-700 bg-green-100';
                    else if (['Inativo', 'Cancelado'].includes(r.Status_contrato)) statusClass = 'text-red-700 bg-red-100';
                    else if (r.Status_contrato === 'Negativado') statusClass = 'text-orange-700 bg-orange-100';

                    const equipHtml = r.Equipamento_Atual 
                        ? `<span class="inline-block px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">${r.Equipamento_Atual}</span>` 
                        : '<span class="text-gray-400 text-xs">-</span>';

                    return `
                        <tr class="border-b border-gray-200 hover:bg-gray-50 transition">
                            <td class="py-3 px-4 text-sm font-medium">
                                <span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" 
                                      data-client-name="${(r.Cliente || '').replace(/"/g, '&quot;')}" 
                                      data-contract-id="${r.Contrato_ID}"
                                      title="Ver Histórico">
                                    ${r.Cliente}
                                </span>
                            </td>
                            <td class="py-3 px-4 text-sm text-gray-600">${r.Contrato_ID}</td>
                            <td class="py-3 px-4 text-sm"><span class="${statusClass} px-2 py-1 rounded font-bold text-xs uppercase">${r.Status_contrato}</span></td>
                            <td class="py-3 px-4 text-sm text-gray-600">${utils.formatDate(r.Data_ativa_o)}</td>
                            <td class="py-3 px-4 text-sm text-gray-600">${utils.formatDate(r.Data_Final)}</td>
                            <td class="py-3 px-4 text-sm">${equipHtml}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Renderiza Paginação Customizada (substitui conteúdo do container padrão)
        // Usamos IDs únicos para não conflitar com o listener global do modal padrão
        const totalPages = Math.ceil(result.total_rows / rowsPerPage);
        if (dom.modalPaginationControls) {
            if (totalPages > 1) {
                dom.modalPaginationControls.classList.remove('hidden');
                dom.modalPaginationControls.innerHTML = `
                    <button id="dailyEvoPrevBtn" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg shadow-sm disabled:opacity-50 transition" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
                    <span class="mx-4 text-gray-700 font-medium">Página ${page} de ${totalPages}</span>
                    <button id="dailyEvoNextBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm disabled:opacity-50 transition" ${page >= totalPages ? 'disabled' : ''}>Próxima</button>
                `;
                
                // Adiciona listeners diretos aos novos botões
                document.getElementById('dailyEvoPrevBtn').onclick = (e) => { e.stopPropagation(); fetchAndDisplayDailyEvolutionModalTable(city, date, page - 1); };
                document.getElementById('dailyEvoNextBtn').onclick = (e) => { e.stopPropagation(); fetchAndDisplayDailyEvolutionModalTable(city, date, page + 1); };
            } else {
                dom.modalPaginationControls.classList.add('hidden');
            }
        }

    } catch (e) {
        console.error(e);
        if (dom.modalTableBody) dom.modalTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-red-500 py-4">Erro ao carregar dados: ${e.message}</td></tr>`;
        if (dom.modalLoadingDiv) dom.modalLoadingDiv.classList.add('hidden');
    }
}