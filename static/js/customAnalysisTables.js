import * as state from './state.js';
import * as dom from './dom.js';
import * as utils from './utils.js';
import { renderChart, destroySpecificChart } from './charts.js';
import { getGridStack } from './state.js'; // Importação necessária para o GridStack

// --- Helper: Download CSV/Excel ---
function downloadCSV(data, filename) {
    if (!data || data.length === 0) {
        utils.showError('Sem dados para exportar.');
        return;
    }
    const separator = ';';
    // Pega as chaves do primeiro objeto para o cabeçalho
    const keys = Object.keys(data[0]);
    const csvContent = [
        keys.join(separator),
        ...data.map(row => keys.map(k => {
            let val = row[k] === null || row[k] === undefined ? '' : String(row[k]);
            // Limpa quebras de linha e escapa aspas duplas
            val = val.replace(/"/g, '""').replace(/\n/g, ' ');
            return `"${val}"`;
        }).join(separator))
    ].join('\n');

    // Adiciona BOM para o Excel reconhecer acentos
    const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Helper: Badge de Comportamento de Pagamento ---
function getPaymentBehaviorBadge(avgDays) {
    if (avgDays === null || avgDays === undefined) return '<span class="text-xs text-gray-400 mt-1 block">Sem histórico</span>';
    
    const days = Math.round(avgDays);
    
    if (days <= -1) {
        return `<span class="text-xs font-semibold text-green-700 mt-1 bg-green-100 px-2 py-0.5 rounded-full w-fit block" title="Média: ${days} dias">Adiantado (${Math.abs(days)} dias)</span>`;
    }
    if (days === 0) {
        return `<span class="text-xs font-semibold text-gray-600 mt-1 bg-gray-100 px-2 py-0.5 rounded-full w-fit block">Em dia</span>`;
    }
    
    // Pagamento Atrasado
    if (days <= 5) return `<span class="text-xs font-semibold text-yellow-700 mt-1 bg-yellow-100 px-2 py-0.5 rounded-full w-fit block">Atraso Curto (+${days} dias)</span>`;
    if (days <= 15) return `<span class="text-xs font-semibold text-orange-700 mt-1 bg-orange-100 px-2 py-0.5 rounded-full w-fit block">Atraso Médio (+${days} dias)</span>`;
    if (days <= 30) return `<span class="text-xs font-semibold text-red-700 mt-1 bg-red-100 px-2 py-0.5 rounded-full w-fit block">Atraso Longo (+${days} dias)</span>`;
    
    return `<span class="text-xs font-bold text-white mt-1 bg-red-800 px-2 py-0.5 rounded-full w-fit block">Inadimplente Provável (+${days} dias)</span>`;
}

// --- Lógica para Análises Personalizadas (Tabelas) ---

export async function populateContractStatusFilters() {
    if (dom.contractStatusFilter && dom.contractStatusFilter.options.length > 1) {
        return; 
    }

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/filters/contract_statuses`);
        if (!response.ok) {
            const errorMsg = await utils.handleFetchError(response, 'Falha ao buscar status.');
            throw new Error(errorMsg);
        }
        const data = await response.json();

        if (dom.contractStatusFilter && data.status_contrato) {
            const currentValue = dom.contractStatusFilter.value;
            
            dom.contractStatusFilter.innerHTML = '<option value="">Todos</option>';
            data.status_contrato.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                dom.contractStatusFilter.appendChild(option);
            });

            if (currentValue) dom.contractStatusFilter.value = currentValue;
        }

        if (dom.accessStatusContainer && data.status_acesso) {
            if (dom.accessStatusContainer.children.length > 0 && dom.accessStatusContainer.querySelector('input')) {
                 return;
            }

            dom.accessStatusContainer.innerHTML = '';

            data.status_acesso.forEach(status => {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex items-center mb-1 hover:bg-gray-50 p-1 rounded';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = status;
                checkbox.className = 'mr-2 form-checkbox h-4 w-4 text-purple-600 transition duration-150 ease-in-out cursor-pointer';
                const uniqueId = `chk_access_${status.replace(/\s+/g, '_')}`;
                checkbox.id = uniqueId;

                if (status === 'Ativo') checkbox.checked = true;

                const label = document.createElement('label');
                label.textContent = status;
                label.htmlFor = uniqueId;
                label.className = 'text-gray-700 cursor-pointer select-none w-full text-xs';

                wrapper.appendChild(checkbox);
                wrapper.appendChild(label);
                dom.accessStatusContainer.appendChild(wrapper);
            });
        }
    } catch (error) {
        console.error("Erro ao popular filtros de status:", error);
    }
}

// --- FUNÇÃO NOVA: Busca TODOS os dados para exportação (limit alto) ---
async function fetchAllRealPermanenceData(searchTerm, relevance, startDate, endDate, relevanceReal) {
    const contractStatus = dom.contractStatusFilter?.value || '';
    let accessStatus = '';
    if (dom.accessStatusContainer) {
        const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
        accessStatus = Array.from(checked).map(cb => cb.value).join(',');
    }

    // Limit 100000 para garantir que pega tudo
    const params = new URLSearchParams({
        search_term: searchTerm,
        limit: 100000, 
        offset: 0
    });
    if (relevance) params.append('relevance', relevance);
    if (relevanceReal) params.append('relevance_real', relevanceReal);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (contractStatus) params.append('status_contrato', contractStatus);
    if (accessStatus) params.append('status_acesso', accessStatus);

    const url = `${state.API_BASE_URL}/api/custom_analysis/real_permanence?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro ao buscar dados para exportação.');
    return await response.json();
}

function renderCustomTable(result, title, columns, extraContentHtml = '') {
    const { data, total_rows } = result;
    state.setCustomAnalysisState({ totalRows: total_rows });

    const currentState = state.getCustomAnalysisState();

    if (!dom.dashboardContentDiv) return;

    const titleHtml = `<h2 class="text-2xl font-semibold mb-4 text-gray-800">${title}</h2>`;

    // Mensagem de filtro ativo (feedback visual)
    let activeFilterHtml = '';
    if (currentState.chartFilterColumn && currentState.chartFilterValue) {
        let colName = currentState.chartFilterColumn === 'motivo' ? 'Motivo' : 
                      currentState.chartFilterColumn === 'obs' ? 'Observação' : 'Financeiro';
        activeFilterHtml = `
            <div class="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-md mb-4 flex justify-between items-center">
                <span>Filtrado por <strong>${colName}: ${currentState.chartFilterValue}</strong></span>
                <button id="clearChartFilterBtn" class="text-sm font-bold text-blue-800 hover:text-blue-900 underline">Limpar Filtro</button>
            </div>
        `;
    }

    if (extraContentHtml) {
        activeFilterHtml += extraContentHtml;
    }

    let tableHtml = '<p class="text-center text-gray-500 mt-4">Nenhum resultado encontrado.</p>';
    if (data && data.length > 0) {
        const generatedTableHtml = utils.renderGenericDetailTable(null, data, columns, true);
        tableHtml = `<div class="table-wrapper border rounded-lg shadow-sm bg-white">${generatedTableHtml}</div>`;
    }

    let paginationHtml = '';
    const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
    
    // Controles de paginação
    if (totalPages > 1) {
        paginationHtml = `
            <div id="custom-analysis-pagination-controls" class="pagination-controls flex flex-wrap justify-center items-center gap-4 mt-8">
                <button id="customPrevPageBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed">Página Anterior</button>
                <span id="customPageInfo" class="text-gray-700 font-medium"></span>
                <button id="customNextPageBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Próxima Página</button>
            </div>
        `;
    }

    let tableContainer = document.getElementById('custom-table-container');
    if (!tableContainer) {
        tableContainer = document.createElement('div');
        tableContainer.id = 'custom-table-container';
        dom.dashboardContentDiv.appendChild(tableContainer);
    }
    
    tableContainer.innerHTML = activeFilterHtml + titleHtml + tableHtml + paginationHtml;

    if (totalPages > 1) {
        renderCustomAnalysisPagination();
    }

    // --- LÓGICA DE EVENTOS DA PAGINAÇÃO ---
    const prevBtn = document.getElementById('customPrevPageBtn');
    const nextBtn = document.getElementById('customNextPageBtn');

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => changePage(currentState.currentPage - 1));
        nextBtn.addEventListener('click', () => changePage(currentState.currentPage + 1));
    }

    function changePage(newPage) {
        if (newPage < 1) return;
        
        const s = state.getCustomAnalysisState();
        const type = s.currentAnalysis;
        
        if (type === 'real_permanence') {
            fetchAndRenderRealPermanenceAnalysis(
                s.currentSearchTerm, 
                newPage, 
                s.currentRelevance, 
                s.currentStartDate, 
                s.currentEndDate, 
                s.currentRelevanceReal
            );
        } else if (type === 'cancellations') {
            fetchAndRenderCancellationAnalysis(
                s.currentSearchTerm, 
                newPage, 
                s.currentRelevance, 
                s.sortOrder === 'asc', 
                s.currentStartDate, 
                s.currentEndDate
            );
        } else if (type === 'negativacao') {
            fetchAndRenderNegativacaoAnalysis(
                s.currentSearchTerm, 
                newPage, 
                s.currentRelevance, 
                s.sortOrder === 'asc', 
                s.currentStartDate, 
                s.currentEndDate
            );
        } else if (type === 'saude_financeira') {
             fetchAndRenderFinancialHealthAnalysis(
                 s.currentSearchTerm,
                 s.currentAnalysisType,
                 newPage,
                 s.currentStartDate,
                 s.currentEndDate
             );
        } else if (type === 'atrasos_e_nao_pagos') {
            fetchAndRenderLatePaymentsAnalysis(
                s.currentSearchTerm,
                newPage
            );
        }
    }

    const clearBtn = document.getElementById('clearChartFilterBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.setCustomAnalysisState({ chartFilterColumn: null, chartFilterValue: null });
            
            const s = state.getCustomAnalysisState();
            const currentType = s.currentAnalysis;

            if (currentType === 'cancellations') {
                fetchAndRenderCancellationAnalysis(s.currentSearchTerm, 1, s.currentRelevance, s.sortOrder === 'asc', s.currentStartDate, s.currentEndDate);
            } else if (currentType === 'negativacao') {
                fetchAndRenderNegativacaoAnalysis(s.currentSearchTerm, 1, s.currentRelevance, s.sortOrder === 'asc', s.currentStartDate, s.currentEndDate);
            }
        });
    }
}

function renderCustomAnalysisPagination() {
    const currentState = state.getCustomAnalysisState();
    const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);

    const pageInfo = document.getElementById('customPageInfo');
    const prevBtn = document.getElementById('customPrevPageBtn');
    const nextBtn = document.getElementById('customNextPageBtn');
    const paginationControls = document.getElementById('custom-analysis-pagination-controls');

    if (paginationControls) {
        if (totalPages > 1 && currentState.totalRows > 0) {
            if(pageInfo) pageInfo.textContent = `Página ${currentState.currentPage} de ${totalPages} (${currentState.totalRows} registros)`;
            if(prevBtn) prevBtn.disabled = currentState.currentPage <= 1;
            if(nextBtn) nextBtn.disabled = currentState.currentPage >= totalPages;
            paginationControls.classList.remove('hidden');
        }
    }
}


// --- FUNÇÕES DE FETCH ---

export async function fetchAndRenderLatePaymentsAnalysis(searchTerm = '', page = 1) {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'atrasos_e_nao_pagos', currentSearchTerm: searchTerm });
    
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;
    const url = `${state.API_BASE_URL}/api/custom_analysis/contas_a_receber?search_term=${encodeURIComponent(searchTerm)}&limit=${currentState.rowsPerPage}&offset=${offset}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar atrasos.'));
        const result = await response.json();
        
        if (state.getCustomAnalysisState().currentAnalysis !== 'atrasos_e_nao_pagos') return;
        
        dom.dashboardContentDiv.innerHTML = ''; // Limpa dashboard
        renderCustomTable(result, 'Análise de Atrasos e Faturas Não Pagas', [
            { header: 'Cliente', render: r => `<span title="${r.Cliente}">${r.Cliente}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
            { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas }
        ]);
    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'atrasos_e_nao_pagos') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'atrasos_e_nao_pagos') utils.showLoading(false);
    }
}

export async function fetchAndRenderFinancialHealthAnalysis(searchTerm = '', analysisType = 'atraso', page = 1, startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'saude_financeira', currentSearchTerm: searchTerm, currentAnalysisType: analysisType }); 
    
    const currentState = state.getCustomAnalysisState(); 
    const contractStatus = dom.contractStatusFilter?.value || '';
    
    let accessStatus = '';
    if (dom.accessStatusContainer) {
         const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
         accessStatus = Array.from(checked).map(cb => cb.value).join(',');
    }

    const offset = (page - 1) * currentState.rowsPerPage;
    const endpoint = analysisType === 'bloqueio' ? 'financial_health_auto_block' : 'financial_health';

    const params = new URLSearchParams({ search_term: searchTerm, limit: currentState.rowsPerPage, offset: offset });
    
    if (contractStatus) params.append('status_contrato', contractStatus);
    if (accessStatus) params.append('status_acesso', accessStatus); 
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const url = `${state.API_BASE_URL}/api/custom_analysis/${endpoint}?${params.toString()}`;
    const title = analysisType === 'bloqueio' ? 'Análise de Saúde Financeira (Bloqueio Automático > 20 dias)' : 'Análise de Saúde Financeira (Atraso > 10 dias)';

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar saúde financeira.'));
        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'saude_financeira') return;

        dom.dashboardContentDiv.innerHTML = ''; // Limpa dashboard
        renderCustomTable(result, title, [
            { header: 'Cliente', render: r => `<span title="${r.Razao_Social}">${r.Razao_Social}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Status Contrato', key: 'Status_contrato' },
            { header: 'Status Acesso', key: 'Status_acesso' },
            { header: 'Data Ativação', render: r => r.Data_ativa_o ? utils.formatDate(r.Data_ativa_o) : 'N/A' },
            { header: '1ª Inadimplência', render: r => r.Primeira_Inadimplencia_Vencimento ? `<span class="detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="financial" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${utils.formatDate(r.Primeira_Inadimplencia_Vencimento)}</span>` : 'N/A' },
            { header: 'Tem Reclamações?', render: r => r.Possui_Reclamacoes === 'Sim' ? `<span class="detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="complaints" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">Sim</span>` : 'Não' },
            { header: 'Última Conexão', render: r => r.Ultima_Conexao ? `<span class="detail-trigger cursor-pointer text-blue-600 hover:underline" data-type="logins" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${utils.formatDate(r.Ultima_Conexao)}</span>` : 'N/A' }
        ]);

        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.remove('hidden');
            dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
        }

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'saude_financeira') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'saude_financeira') utils.showLoading(false);
    }
}

// *** FUNÇÃO ATUALIZADA PARA RENDERIZAR A TABELA DE PERMANÊNCIA REAL COM GRÁFICOS INTERATIVOS ***
export async function fetchAndRenderRealPermanenceAnalysis(searchTerm = '', page = 1, relevance = '', startDate = '', endDate = '', relevanceReal = '') {
    utils.showLoading(true);
    // Salva estado detalhado para paginação funcionar
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

    const params = new URLSearchParams({
        search_term: searchTerm,
        limit: currentState.rowsPerPage,
        offset: offset
    });
    if (relevance) params.append('relevance', relevance); // Filtra por meses pagos
    if (relevanceReal) params.append('relevance_real', relevanceReal); // Filtra por meses reais (NOVO)
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

        // Limpa o dashboard para a renderização inicial
        if (dom.dashboardContentDiv && dom.dashboardContentDiv.innerHTML !== '') {
             if (!document.getElementById('pagaChart')) {
                 dom.dashboardContentDiv.innerHTML = '';
             }
        }

        // --- 1. RENDERIZAÇÃO DOS GRÁFICOS ---
        if (dom.mainChartsArea && result.charts) {
            if (!dom.dashboardContentDiv.contains(dom.mainChartsArea)) {
                dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
            }
            dom.mainChartsArea.classList.remove('hidden');
            
            const grid = getGridStack();
            
            if (grid) grid.removeAll();

            // Adiciona Widgets Fixos (Paga e Real)
            if (result.charts.paga_distribution) {
                grid.addWidget({
                    w: 4, h: 6, x: 0, y: 0,
                    content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="pagaChartTitle" class="chart-title">Permanência Paga</h3></div><div class="chart-canvas-container"><canvas id="pagaChart"></canvas></div></div>`
                });
            }

            if (result.charts.real_distribution) {
                grid.addWidget({
                    w: 4, h: 6, x: 4, y: 0,
                    content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 id="realChartTitle" class="chart-title">Permanência Real</h3></div><div class="chart-canvas-container"><canvas id="realChart"></canvas></div></div>`
                });
            }

            // --- GERAÇÃO DINÂMICA DE WIDGETS POR CIDADE (SEPARADOS) ---
            if (result.charts.city_distribution && result.charts.city_distribution.length > 0) {
                const cityData = result.charts.city_distribution;
                const cities = [...new Set(cityData.map(d => d.Cidade))].sort();
                
                let currentX = 0;
                let currentY = 6; 

                cities.forEach((city, idx) => {
                    const canvasId = `chart_city_${city.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    
                    grid.addWidget({
                        w: 4, h: 6, x: currentX, y: currentY,
                        content: `<div class="grid-stack-item-content">
                                    <div class="chart-container-header"><h3 class="chart-title truncate" title="${city}">${city}</h3></div>
                                    <div class="chart-canvas-container"><canvas id="${canvasId}"></canvas></div>
                                  </div>`
                    });

                    currentX += 4;
                    if (currentX >= 12) {
                        currentX = 0;
                        currentY += 6;
                    }
                });
            }

            // --- RENDERIZAÇÃO DOS GRÁFICOS (APÓS DOM PRONTO) ---
            setTimeout(() => {
                if (result.charts.paga_distribution) {
                    const dataPaga = result.charts.paga_distribution;
                    renderChart('pagaChart', 'pie', 
                        dataPaga.map(d => d.Faixa), 
                        [{ data: dataPaga.map(d => d.Count) }], 
                        'Permanência Paga', 
                        { 
                            formatterType: 'value_only',
                            plugins: {
                                tooltip: { callbacks: { label: function(context) { return `${context.label}: ${context.raw}`; } } }
                            },
                            onClick: (event, elements, chart) => {
                                if (elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = chart.data.labels[index];
                                    fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, label, startDate, endDate, '');
                                }
                            }
                        }
                    );
                }

                if (result.charts.real_distribution) {
                    const dataReal = result.charts.real_distribution;
                    renderChart('realChart', 'pie', 
                        dataReal.map(d => d.Faixa), 
                        [{ data: dataReal.map(d => d.Count) }], 
                        'Permanência Real', 
                        { 
                            formatterType: 'value_only',
                            plugins: {
                                tooltip: { callbacks: { label: function(context) { return `${context.label}: ${context.raw}`; } } }
                            },
                            onClick: (event, elements, chart) => {
                                if (elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = chart.data.labels[index];
                                    fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, '', startDate, endDate, label);
                                }
                            }
                        }
                    );
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

                        renderChart(canvasId, 'pie', 
                            faixasOrder, 
                            [{ 
                                data: counts,
                                backgroundColor: colors
                            }], 
                            `${city} (${totalCity})`, 
                            {
                                formatterType: 'value_only',
                                plugins: {
                                    tooltip: {
                                        callbacks: { label: function(context) { return `${context.label}: ${context.raw}`; } }
                                    },
                                    datalabels: {
                                        formatter: (value, ctx) => { return value; },
                                        color: '#fff',
                                        font: { weight: 'bold' }
                                    }
                                },
                                legendPosition: 'bottom',
                                maintainAspectRatio: false,
                                onClick: (event, elements, chart) => {
                                    if (elements.length > 0) {
                                        const index = elements[0].index;
                                        const clickedFaixa = chart.data.labels[index];
                                        
                                        if(dom.clientSearchInput) dom.clientSearchInput.value = city; 
                                        fetchAndRenderRealPermanenceAnalysis(city, 1, clickedFaixa, startDate, endDate, relevanceReal);
                                    }
                                }
                            }
                        );
                    });
                }
            }, 100);
        }

        // --- 2. RENDERIZAÇÃO DA TABELA ---
        const columns = [
            { 
                header: 'Cliente', 
                render: r => {
                    const clientLink = `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline font-medium" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>`;
                    return `<div class="flex flex-col">${clientLink}</div>`;
                } 
            },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { 
                header: 'Status Contrato', 
                render: r => {
                    let color = 'bg-gray-100 text-gray-800';
                    if (r.Status_contrato === 'Ativo') color = 'bg-green-100 text-green-800';
                    else if (['Inativo', 'Cancelado'].includes(r.Status_contrato)) color = 'bg-red-100 text-red-800';
                    else if (r.Status_contrato === 'Negativado') color = 'bg-orange-100 text-orange-800';
                    return `<span class="text-xs font-bold px-2 py-1 rounded-full ${color}">${r.Status_contrato}</span>`;
                }
            },
            // Verifica variações da chave Data de Ativação
            { header: 'Data Ativação', render: r => (r.Data_ativa_o || r.data_ativa_o || r.data_ativacao) ? utils.formatDate(r.Data_ativa_o || r.data_ativa_o || r.data_ativacao) : 'N/A' },
            { header: 'Status Acesso', key: 'Status_acesso', render: r => `<span class="text-xs text-gray-600">${r.Status_acesso}</span>` },
            { 
                header: 'Permanência Paga', 
                render: r => `<span class="text-lg font-bold text-green-700 bg-green-50 px-3 py-1 rounded-lg shadow-sm border border-green-200" title="Meses efetivamente pagos">${r.Permanencia_Paga} meses</span>`,
                cssClass: 'text-center'
            },
            { 
                header: 'Permanência Real', 
                render: r => `<span class="text-gray-600 font-medium" title="Tempo corrido desde a ativação">${r.Permanencia_Real_Calendario} meses</span>`,
                cssClass: 'text-center'
            },
            // --- NOVA COLUNA: Média Pagamento ---
            { 
                header: 'Média Pagamento', 
                render: r => {
                    if (r.Media_Atraso === null || r.Media_Atraso === undefined) {
                        return '<span class="text-gray-400 text-xs italic">Sem Histórico</span>';
                    }
                    const days = Math.round(r.Media_Atraso);
                    let badgeClass = '';
                    let text = '';

                    if (days < 0) {
                        // Adiantado
                        badgeClass = 'bg-green-100 text-green-800 border border-green-200';
                        text = `${days} dias (Adiantado)`;
                    } else if (days > 0) {
                        // Atrasado
                        badgeClass = 'bg-red-100 text-red-800 border border-red-200';
                        text = `+${days} dias (Atraso)`;
                    } else {
                        // Em dia
                        badgeClass = 'bg-gray-100 text-gray-800 border border-gray-200';
                        text = 'Em Dia (0)';
                    }
                    return `<span class="inline-block px-2 py-1 rounded text-xs font-semibold ${badgeClass}" title="Média de dias entre vencimento e pagamento">${text}</span>`;
                },
                cssClass: 'text-center'
            },
            { 
                header: 'Faturas (Resumo)', 
                render: r => {
                    return `
                    <div class="text-xs space-y-1">
                        <div class="flex justify-between w-32"><span class="text-gray-500">Total:</span> <span class="font-bold text-gray-800 invoice-detail-trigger cursor-pointer hover:underline" data-type="all_invoices" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Total_Faturas}</span></div>
                        <div class="flex justify-between w-32"><span class="text-green-600">Pagas:</span> <span class="font-bold text-green-700">${r.Faturas_Pagas}</span></div>
                        <div class="flex justify-between w-32"><span class="text-red-500">Abertas:</span> <span class="font-bold text-red-600 invoice-detail-trigger cursor-pointer hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span></div>
                        <div class="flex justify-between w-32"><span class="text-orange-500">Atrasos PG:</span> <span class="font-bold text-orange-600 invoice-detail-trigger cursor-pointer hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span></div>
                    </div>
                    `;
                }
            },
            { 
                header: 'Equipamento (Comodato)', 
                render: r => {
                    if (!r.Equipamento_Comodato || r.Equipamento_Comodato === 'Nenhum') return '<span class="text-gray-400 text-xs italic">Nenhum</span>';
                    return `<span class="text-xs text-blue-800 bg-blue-50 px-2 py-1 rounded max-w-[200px] truncate block" title="${r.Equipamento_Comodato}">${r.Equipamento_Comodato}</span>`;
                }
            },
            { header: 'Vendedor', render: r => `<span class="text-xs font-medium text-gray-700">${r.Vendedor_Nome || 'N/A'}</span>` },
            { header: 'Cidade', key: 'Cidade' },
            { header: 'Bairro', key: 'Bairro' }
        ];

        let extraFilterMsg = '';
        if (relevanceReal) {
            window.clearRealFilter = () => {
                fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, relevance, startDate, endDate, '');
            };

            extraFilterMsg = `
                <div class="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2 rounded-md mb-4 flex justify-between items-center">
                    <span>Filtrado por <strong>Permanência Real: ${relevanceReal}</strong></span>
                    <button onclick="clearRealFilter()" class="text-sm font-bold text-purple-800 hover:text-purple-900 underline">Limpar Filtro</button>
                </div>
            `;
        }
        
        if (relevance) {
            window.clearPagaFilter = () => {
                fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, '', startDate, endDate, relevanceReal);
            };

            extraFilterMsg += `
                <div class="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-md mb-4 flex justify-between items-center">
                    <span>Filtrado por <strong>Permanência Paga: ${relevance}</strong></span>
                    <button onclick="clearPagaFilter()" class="text-sm font-bold text-blue-800 hover:text-blue-900 underline">Limpar Filtro</button>
                </div>
            `;
        }

        // --- Botão de Exportar Excel no Topo (Agora com Busca de Todos os Dados) ---
        const exportButtonTop = `
            <button id="btnExportRealPermanenceTop" class="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm font-medium mb-2 float-right flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar Excel (Tudo)
            </button>
            <div class="clear-both"></div>
        `;

        const combinedExtraMsg = exportButtonTop + (extraFilterMsg || '');

        renderCustomTable(result, 'Análise de Permanência Real (Meses Pagos vs Calendário)', columns, combinedExtraMsg);

        // Listener para o botão do topo (BUSCA TODOS OS DADOS COM LIMIT ALTO)
        setTimeout(() => {
            const btnTop = document.getElementById('btnExportRealPermanenceTop');
            if(btnTop) {
                btnTop.addEventListener('click', async () => {
                    utils.showLoading(true);
                    try {
                        // Chama a nova função com limit alto
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

        // --- ESCONDER BOTÃO DE TABELA COMPLETA (Para não gerar erro 404) ---
        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.add('hidden');
        }

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

// ... (Rest of the file remains the same: fetchAndRenderCancellationAnalysis, fetchAndRenderNegativacaoAnalysis, fetchAndRenderDailyComparison) ...
// *** FUNÇÃO ATUALIZADA COM CORREÇÃO DO FILTRO DE CLIQUE ***
export async function fetchAndRenderCancellationAnalysis(searchTerm = '', page = 1, relevance = '', sortAsc = false, startDate = '', endDate = '', relevanceReal = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'cancellations', currentSearchTerm: searchTerm, currentRelevance: relevance, currentStartDate: startDate, currentEndDate: endDate, sortOrder: sortAsc ? 'asc' : 'desc' });
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;

    const params = new URLSearchParams({
        search_term: searchTerm,
        limit: currentState.rowsPerPage,
        offset: offset
    });
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

        dom.dashboardContentDiv.innerHTML = ''; // Limpa dashboard

        // --- RENDERIZAÇÃO DOS GRÁFICOS (MOTIVO, OBS e FINANCEIRO) ---
        let chartsHtml = '';
        if (result.charts) {
            const totalMotivos = result.charts.motivo ? result.charts.motivo.reduce((acc, curr) => acc + (curr.Count || 0), 0) : 0;
            const totalObs = result.charts.obs ? result.charts.obs.reduce((acc, curr) => acc + (curr.Count || 0), 0) : 0;
            const totalFinanceiro = result.charts.financeiro ? result.charts.financeiro.reduce((acc, curr) => acc + (curr.Count || 0), 0) : 0;

            chartsHtml = `
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Motivos de Cancelamento: ${totalMotivos}</h3>
                        <div class="chart-canvas-container" style="height: 400px;">
                            <canvas id="motivoCancelamentoChart"></canvas>
                        </div>
                        <p class="text-xs text-center text-gray-400 mt-2">Clique para filtrar</p>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Observações de Cancelamento: ${totalObs}</h3>
                        <div class="chart-canvas-container" style="height: 400px;">
                            <canvas id="obsCancelamentoChart"></canvas>
                        </div>
                        <p class="text-xs text-center text-gray-400 mt-2">Clique para filtrar</p>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Comportamento Financeiro: ${totalFinanceiro}</h3>
                        <div class="chart-canvas-container" style="height: 400px;">
                            <canvas id="financeiroCancelamentoChart"></canvas>
                        </div>
                        <p class="text-xs text-center text-gray-400 mt-2">Clique para filtrar</p>
                    </div>
                </div>
            `;
        }

        const arrowIcon = sortAsc ? '↓' : '↑';
        const headerHtml = `<div class="flex items-center gap-1 cursor-pointer select-none sort-permanence-header hover:text-blue-600 transition-colors" title="Clique para ordenar">Permanência (Meses) <span class="text-lg font-bold leading-none">${arrowIcon}</span></div>`;

        const columns = [
            { 
                header: 'Cliente', 
                render: r => {
                    const clientLink = `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline text-base" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>`;
                    const behaviorBadge = getPaymentBehaviorBadge(r.Media_Atraso);
                    return `<div class="flex flex-col items-start">${clientLink}${behaviorBadge}</div>`;
                } 
            },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            // --- NOVAS COLUNAS: Motivo e Observação ---
            { header: 'Motivo', key: 'Motivo_cancelamento', render: r => `<span class="text-xs font-medium text-gray-700">${r.Motivo_cancelamento || '-'}</span>` },
            { header: 'Observação', key: 'Obs_cancelamento', render: r => `<div class="text-xs text-gray-500 max-w-[150px] truncate" title="${(r.Obs_cancelamento || '').replace(/"/g, '&quot;')}">${r.Obs_cancelamento || '-'}</div>` },
            // ------------------------------------------
            { header: 'Data Cancelamento', render: r => r.Data_cancelamento ? utils.formatDate(r.Data_cancelamento) : 'N/A' },
            { header: headerHtml, key: 'permanencia_meses', cssClass: 'text-center' },
            { 
                header: 'Faturas', 
                render: r => `<span class="invoice-detail-trigger cursor-pointer text-blue-600 font-bold hover:underline" data-type="all_invoices" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Total_Faturas || 0}</span>`,
                cssClass: 'text-center' 
            },
            { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
            { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas },
            { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
        ];
        
        renderCustomTable(result, 'Análise de Cancelamentos por Contato Técnico', columns, chartsHtml);

        if (result.charts) {
            setTimeout(() => {
                // --- CALLBACK CORRIGIDO PARA REMOVER A CONTAGEM DO RÓTULO ---
                const chartClickCallback = (column) => (evt, elements, chart) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        let label = chart.data.labels[index];

                        // IMPORTANTE: Remove " (15)" do final da string para filtrar corretamente
                        if (column === 'motivo' || column === 'obs') {
                             label = label.replace(/ \(\d+\)$/, '');
                        }

                        state.setCustomAnalysisState({ chartFilterColumn: column, chartFilterValue: label });
                        fetchAndRenderCancellationAnalysis(searchTerm, 1, relevance, sortAsc, startDate, endDate);
                    }
                };

                if (result.charts.motivo && result.charts.motivo.length > 0) {
                    renderChart('motivoCancelamentoChart', 'pie', 
                        result.charts.motivo.map(d => `${d.Motivo_cancelamento} (${d.Count})`), 
                        [{ data: result.charts.motivo.map(d => d.Count) }], 
                        '', 
                        { 
                            formatterType: 'percent_only',
                            onClick: chartClickCallback('motivo') // Passa o callback corrigido
                        }
                    );
                } else if (document.getElementById('motivoCancelamentoChart')) {
                    document.getElementById('motivoCancelamentoChart').parentNode.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem dados de motivo.</p>';
                }

                if (result.charts.obs && result.charts.obs.length > 0) {
                    renderChart('obsCancelamentoChart', 'pie', 
                        result.charts.obs.map(d => `${d.Obs_cancelamento} (${d.Count})`), 
                        [{ data: result.charts.obs.map(d => d.Count) }], 
                        '', 
                        { 
                            formatterType: 'percent_only',
                            onClick: chartClickCallback('obs') // Passa o callback corrigido
                        }
                    );
                } else if (document.getElementById('obsCancelamentoChart')) {
                    document.getElementById('obsCancelamentoChart').parentNode.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem dados de observação.</p>';
                }

                if (result.charts.financeiro && result.charts.financeiro.length > 0) {
                    renderChart('financeiroCancelamentoChart', 'pie', 
                        result.charts.financeiro.map(d => d.Status_Pagamento), 
                        [{ 
                            data: result.charts.financeiro.map(d => d.Count),
                            backgroundColor: [
                                '#10b981', '#f59e0b', '#991b1b', '#9ca3af'
                            ]
                        }], 
                        '', 
                        { 
                            formatterType: 'percent_only',
                            onClick: chartClickCallback('financeiro') // Passa o callback corrigido (embora financeiro não tenha contagem no label)
                        }
                    );
                } else if (document.getElementById('financeiroCancelamentoChart')) {
                    document.getElementById('financeiroCancelamentoChart').parentNode.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem dados financeiros.</p>';
                }
            }, 50);
        }

        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.remove('hidden');
            dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
        }
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

// *** FUNÇÃO ATUALIZADA: AGORA COM 3 GRÁFICOS INTERATIVOS ***
export async function fetchAndRenderNegativacaoAnalysis(searchTerm = '', page = 1, relevance = '', sortAsc = false, startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'negativacao', currentSearchTerm: searchTerm, currentRelevance: relevance, currentStartDate: startDate, currentEndDate: endDate, sortOrder: sortAsc ? 'asc' : 'desc' });
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;
    
    const params = new URLSearchParams({
        search_term: searchTerm,
        limit: currentState.rowsPerPage,
        offset: offset
    });
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

        dom.dashboardContentDiv.innerHTML = ''; // Limpa dashboard

        // --- RENDERIZAÇÃO DOS GRÁFICOS ---
        let chartsHtml = '';
        const totalFinanceiro = result.charts?.financeiro ? result.charts.financeiro.reduce((acc, curr) => acc + (curr.Count || 0), 0) : 0;

        if (totalFinanceiro > 0) {
             chartsHtml = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 justify-center">
                    <!-- NOVO GRÁFICO FINANCEIRO -->
                    <div class="bg-white p-4 rounded-lg shadow-md border border-gray-200 col-span-1 md:col-span-2 lg:col-span-1 lg:col-start-2 hover:shadow-lg transition-shadow cursor-pointer">
                        <h3 class="text-lg font-semibold text-gray-700 mb-2 text-center">Comportamento Financeiro: ${totalFinanceiro}</h3>
                        <div class="chart-canvas-container" style="height: 400px;">
                            <canvas id="financeiroNegativacaoChart"></canvas>
                        </div>
                        <p class="text-xs text-center text-gray-400 mt-2">Clique para filtrar</p>
                    </div>
                </div>
            `;
        }

        const arrowIcon = sortAsc ? '↓' : '↑';
        const headerHtml = `<div class="flex items-center gap-1 cursor-pointer select-none sort-permanence-header hover:text-blue-600 transition-colors" title="Clique para ordenar">Permanência (Meses) <span class="text-lg font-bold leading-none">${arrowIcon}</span></div>`;

        const columns = [
            { 
                header: 'Cliente', 
                render: r => {
                    const clientLink = `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline text-base" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>`;
                    const behaviorBadge = getPaymentBehaviorBadge(r.Media_Atraso);
                    return `<div class="flex flex-col items-start">${clientLink}${behaviorBadge}</div>`;
                } 
            },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Data Negativação', render: r => r.end_date ? utils.formatDate(r.end_date) : 'N/A' },
            { header: headerHtml, key: 'permanencia_meses', cssClass: 'text-center' },
            { 
                header: 'Faturas', 
                render: r => `<span class="invoice-detail-trigger cursor-pointer text-blue-600 font-bold hover:underline" data-type="all_invoices" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Total_Faturas || 0}</span>`,
                cssClass: 'text-center' 
            },
            { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
            { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas },
            { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
        ];
        renderCustomTable(result, 'Análise de Negativação por Contato Técnico', columns, chartsHtml);

        if (result.charts && result.charts.financeiro) {
             setTimeout(() => {
                const chartClickCallback = (column) => (evt, elements, chart) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = chart.data.labels[index];
                        // Não precisa de replace aqui pois financeiro não tem contagem no label
                        state.setCustomAnalysisState({ chartFilterColumn: column, chartFilterValue: label });
                        fetchAndRenderNegativacaoAnalysis(searchTerm, 1, relevance, sortAsc, startDate, endDate);
                    }
                };

                if (result.charts.financeiro.length > 0) {
                    renderChart('financeiroNegativacaoChart', 'pie', 
                        result.charts.financeiro.map(d => d.Status_Pagamento), 
                        [{ 
                            data: result.charts.financeiro.map(d => d.Count),
                            backgroundColor: [
                                '#10b981', // Verde
                                '#f59e0b', // Laranja (Pagamento Atrasado)
                                '#991b1b', // Vermelho Escuro
                                '#9ca3af'  // Cinza
                            ]
                        }], 
                        '', 
                        { 
                            formatterType: 'percent_only',
                            onClick: chartClickCallback('financeiro') // INTERATIVIDADE
                        }
                    );
                }
             }, 50);
        }

        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.remove('hidden');
            dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
        }
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

export async function fetchAndRenderDailyComparison() {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'comparativo_diario', currentPage: 1 });

    const url = `${state.API_BASE_URL}/api/comparison/daily`;

    try {
        const response = await fetch(url); 
        if (!response.ok) throw new Error("Falha ao buscar dados comparativos.");
        
        const result = await response.json();
        
        if (state.getCustomAnalysisState().currentAnalysis !== 'comparativo_diario') return;

        const data = result.liquido; 
        const info = result.info;

        if (!dom.dashboardContentDiv) return;

        dom.dashboardContentDiv.innerHTML = ''; // Limpa dashboard

        const uploadHtml = `
            <div class="upload-pdf-container">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Importar Dados do PDF</h3>
                <p class="text-sm text-gray-500 mb-4">Selecione o arquivo PDF com os dados de recebimento para atualizar o mês atual.</p>
                <input type="file" id="pdfUploadInput" accept=".pdf" class="hidden">
                <button onclick="document.getElementById('pdfUploadInput').click()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
                    📁 Selecionar Arquivo PDF
                </button>
                <span id="uploadStatus" class="ml-3 text-sm font-medium"></span>
            </div>
        `;

        const legendHtml = `
            <div class="comparison-legend">
                <div class="legend-item"><div class="legend-box" style="background-color: #fef3c7;"></div> Fim de Semana</div>
                <div class="legend-item"><div class="legend-box" style="background-color: #d1fae5;"></div> Feriado</div>
                <div class="legend-item"><div class="legend-box" style="background-color: #dbeafe; border: 1px solid #3b82f6;"></div> Dia Atual</div>
                <div class="legend-item"><div class="legend-box" style="background-color: #1e3a8a;"></div> Total</div>
            </div>
        `;

        const createTableHtml = (title, typeKeyPrefix) => {
            let rowsHtml = '';
            let totalPrev = 0, totalCurr = 0, totalDiff = 0;

            data.forEach(day => {
                const prev = day[`${typeKeyPrefix}_prev`] || 0;
                const curr = day[`${typeKeyPrefix}_curr`] || 0;
                const diff = day[`${typeKeyPrefix}_diff`] || 0;

                totalPrev += prev;
                totalCurr += curr;
                totalDiff += diff;

                let rowClass = '';
                if (day.is_today) rowClass = 'row-today';
                else if (day.is_holiday) rowClass = 'row-holiday';
                else if (day.is_weekend) rowClass = 'row-weekend';

                const diffClass = diff < 0 ? 'text-neg' : 'text-pos';

                rowsHtml += `
                    <tr class="${rowClass}">
                        <td>${day.day}</td>
                        <td>${utils.formatCurrency(prev)}</td>
                        <td>${utils.formatCurrency(curr)}</td>
                        <td class="${diffClass}">${utils.formatCurrency(diff)}</td>
                    </tr>
                `;
            });

            const footerHtml = `
                <tr class="row-total">
                    <td>Total</td>
                    <td>${utils.formatCurrency(totalPrev)}</td>
                    <td>${utils.formatCurrency(totalCurr)}</td>
                    <td>${utils.formatCurrency(totalDiff)}</td>
                </tr>
            `;

            return `
                <div class="comparison-table-wrapper">
                    <div class="comparison-header">${title}</div>
                    <table class="comparison-table">
                        <thead>
                            <tr>
                                <th>Dia</th>
                                <th>Anterior (${info.prev_label})</th>
                                <th>Atual (${info.curr_label})</th>
                                <th>Diferença</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                        <tfoot>${footerHtml}</tfoot>
                    </table>
                </div>
            `;
        };

        const table1 = createTableHtml("Recebimento Líquido Diário Mês", "liq");
        const table2 = createTableHtml("Recebimento Baixa Diária Mês", "bai");

        dom.dashboardContentDiv.innerHTML = `${uploadHtml}${legendHtml}<div class="comparison-container">${table1}${table2}</div>`;

        const uploadInput = document.getElementById('pdfUploadInput');
        const statusSpan = document.getElementById('uploadStatus');
        
        if (uploadInput) {
            uploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                statusSpan.textContent = "Enviando...";
                statusSpan.className = "ml-3 text-sm font-medium text-blue-600";

                try {
                    const res = await fetch(`${state.API_BASE_URL}/api/comparison/upload_pdf`, {
                        method: 'POST',
                        body: formData
                    });
                    const json = await res.json();
                    
                    if (res.ok) {
                        statusSpan.textContent = "Sucesso! Atualizando...";
                        statusSpan.className = "ml-3 text-sm font-medium text-green-600";
                        setTimeout(() => fetchAndRenderDailyComparison(), 1000); 
                    } else {
                        throw new Error(json.error || "Erro no upload");
                    }
                } catch (err) {
                    statusSpan.textContent = "Erro: " + err.message;
                    statusSpan.className = "ml-3 text-sm font-medium text-red-600";
                }
            });
        }

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'comparativo_diario') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'comparativo_diario') utils.showLoading(false);
    }
}