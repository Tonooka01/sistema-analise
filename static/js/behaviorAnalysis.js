import * as state from './state.js';
import * as dom from './dom.js';
import * as utils from './utils.js';
import { renderChart, destroySpecificChart } from './charts.js'; // Remove importações desnecessárias
import { getGridStack } from './state.js';
import { populateContractStatusFilters } from './customAnalysisTables.js';

// --- LÓGICA DA ANÁLISE DE COMPORTAMENTO (Abas) ---

// ─── Ordenação de tabelas ─────────────────────────────────────────────────────
function _makeSortable(table) {
    if (!table || table.dataset.sortable) return;
    table.dataset.sortable = '1';

    const headers = table.querySelectorAll('thead th');
    let _sortCol = -1;
    let _sortDir = 1; // 1=asc, -1=desc

    headers.forEach((th, colIdx) => {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.style.whiteSpace = 'nowrap';

        const indicator = document.createElement('span');
        indicator.style.cssText = 'margin-left:4px;opacity:0.35;font-size:.75em;';
        indicator.textContent = '⇅';
        th.appendChild(indicator);

        th.addEventListener('click', () => {
            if (_sortCol === colIdx) {
                _sortDir = -_sortDir;
            } else {
                _sortCol = colIdx;
                _sortDir = 1;
            }

            // Update indicators
            headers.forEach((h, i) => {
                const ind = h.querySelector('span');
                if (!ind) return;
                if (i === _sortCol) {
                    ind.textContent = _sortDir === 1 ? ' ▲' : ' ▼';
                    ind.style.opacity = '0.85';
                } else {
                    ind.textContent = '⇅';
                    ind.style.opacity = '0.35';
                }
            });

            // Sort rows
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.sort((a, b) => {
                const ca = a.children[colIdx];
                const cb = b.children[colIdx];
                if (!ca || !cb) return 0;
                // Use data-sort attribute if present, else text
                const va = (ca.dataset.sort ?? ca.textContent).trim();
                const vb = (cb.dataset.sort ?? cb.textContent).trim();
                // Numeric detection: remove non-numeric chars (d, %, R$, spaces) then parse
                const na = parseFloat(va.replace(/[^\d.,-]/g, '').replace(',', '.'));
                const nb = parseFloat(vb.replace(/[^\d.,-]/g, '').replace(',', '.'));
                if (!isNaN(na) && !isNaN(nb)) return _sortDir * (na - nb);
                return _sortDir * va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' });
            });
            rows.forEach(r => tbody.appendChild(r));
        });
    });
}

// Aplica sorting automaticamente em qualquer <table> inserida na área behavior
function _initBehaviorSortObserver() {
    const area = document.getElementById('behavior-analysis-tab-content');
    if (!area) return;

    // Apply to any table already present
    area.querySelectorAll('table').forEach(_makeSortable);

    new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                const tables = node.tagName === 'TABLE'
                    ? [node]
                    : Array.from(node.querySelectorAll('table'));
                tables.forEach(_makeSortable);
            }
        }
    }).observe(area, { childList: true, subtree: true });
}

/**
 * Inicializa a primeira aba da Análise de Comportamento.
 */
export function initializeBehaviorAnalysis() {
    _initBehaviorSortObserver();
    const allTabs = dom.behaviorAnalysisTabs?.querySelectorAll('.tab-link') || [];
    const firstTab = Array.from(allTabs).find(t => t.style.display !== 'none');
    if (firstTab) {
        handleBehaviorTabChange(firstTab.dataset.tab);
    } else {
        console.warn("Nenhuma aba encontrada para Análise de Comportamento.");
        if (dom.behaviorAnalysisTabContent) dom.behaviorAnalysisTabContent.innerHTML = '<p class="text-gray-500">Erro: Abas não encontradas.</p>';
    }
}

/**
 * Manipula a mudança de abas na Análise de Comportamento.
 * @param {string} tabName - O nome da aba ('reclamacoes', 'churn', 'preditiva').
 */
export function handleBehaviorTabChange(tabName) {
    if (!dom.behaviorAnalysisTabs || !dom.behaviorAnalysisTabContent) {
        console.error("Elementos das abas de comportamento não encontrados.");
        return;
    }

    // Atualiza classe 'active' nas abas
    dom.behaviorAnalysisTabs.querySelectorAll('.tab-link').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Mostra o painel de conteúdo correto
    dom.behaviorAnalysisTabContent.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-content-${tabName}`);
        // Limpa o conteúdo de painéis inativos para forçar recarregamento se clicado novamente
        if (pane.id !== `tab-content-${tabName}`) {
            pane.innerHTML = '';
        }
    });

    // Carrega o conteúdo da aba selecionada (se ainda não carregado)
    const targetPane = document.getElementById(`tab-content-${tabName}`);
    
    if (targetPane) { 
        switch(tabName) {
            case 'reclamacoes':
                renderComplaintPatternTab();
                break;
            case 'churn':
                renderChurnPatternTab();
                break;
            case 'preditiva':
                renderPredictiveChurnTab();
                break;
            case 'qualidade':
                renderQoSTab();
                break;
            case 'acoes':
                renderAcoesTab();
                break;
            case 'temporal_suporte':
                renderTemporalSuporteTab();
                break;
            case 'financeiro_ativo':
                renderFinanceiroAtivoTab();
                break;
            case 'inatividade':
                renderInatividadeTab();
                break;
            case 'sazonalidade_canc':
                renderSazonalidadeCanc();
                break;
            case 'causa_queda':
                renderCausaQuedaTab();
                break;
            case 'lista_retencao':
                renderListaRetencaoTab();
                break;
            case 'alertas_acao':
                renderAlertasAcaoTab();
                break;
            case 'motivos_canc':
                renderMotivosCancTab();
                break;
            case 'padrao_pre_canc':
                renderPadraoPrecancTab();
                break;
            case 'lifecycle_risk':
                renderLifecycleRiskTab();
                break;
            case 'risco_plano':
                renderRiscoPlanoTab();
                break;
            case 'perfil_pagamento':
                renderPerfilPagamentoTab();
                break;
            case 'acompanhamento':
                renderAcompanhamentoTab();
                break;
            case 'retirada':
                renderRetiradaTab();
                break;
            case 'retorno':
                renderRetornoTab();
                break;
            default:
                console.warn(`Aba de comportamento desconhecida: ${tabName}`);
                if (targetPane) targetPane.innerHTML = `<p class="text-red-500">Conteúdo para aba "${tabName}" não definido.</p>`;
        }
    }
}

/**
 * Prepara a UI e busca os dados para a aba "Padrão de Reclamações".
 */
async function renderComplaintPatternTab() {
    const tabContent = document.getElementById('tab-content-reclamacoes');
    if (!tabContent) return;

    // Estrutura HTML da aba com botão de filtro
    tabContent.innerHTML = `
        <div class="flex flex-wrap justify-center gap-4 mb-6 items-end">
            <div class="flex flex-col items-center">
                <label for="complaintCityFilter" class="text-gray-700 font-medium mb-1 text-sm">Filtrar por Cidade:</label>
                <select id="complaintCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm min-w-[200px]">
                    <option value="">Todas as Cidades</option>
                </select>
            </div>
            <button id="btnFilterComplaint" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="complaint-summary-cards" class="summary-cards-container mb-4" style="border-bottom: none; padding-bottom: 0;"></div>
        <!-- Área específica para o GridStack desta aba -->
        <div id="complaint-charts-area" class="grid-stack"></div> 
    `;

    // Adiciona o listener ao botão DEPOIS de criar o elemento
    const btnFilter = tabContent.querySelector('#btnFilterComplaint');
    const cityFilter = tabContent.querySelector('#complaintCityFilter');
    
    if (btnFilter) {
        btnFilter.addEventListener('click', () => fetchBehaviorData_Complaints(cityFilter ? cityFilter.value : ''));
    }

    // Carrega os dados iniciais (todas as cidades)
    await fetchBehaviorData_Complaints();
}


/**
 * Busca os dados e renderiza os gráficos/cards da aba "Padrão de Reclamações".
 * @param {string} city - Cidade selecionada no filtro.
 */
async function fetchBehaviorData_Complaints(city = '') {
    const chartsArea = document.getElementById('complaint-charts-area');
    const summaryCardsArea = document.getElementById('complaint-summary-cards');

    if (!chartsArea || !summaryCardsArea) {
        console.error("Áreas de conteúdo da aba de reclamações não encontradas.");
        return;
    }

    // --- FIX: Limpeza e Inicialização Correta do GridStack Local ---
    // Verifica se já existe uma instância GridStack neste elemento e a destrói para limpar
    if (chartsArea.gridstack) {
        chartsArea.gridstack.destroy(false); // false = mantém o elemento DOM, limpa apenas a instância/widgets
    }
    
    chartsArea.innerHTML = '<div class="loading-spinner"></div>'; // Mostra loading
    summaryCardsArea.innerHTML = ''; // Limpa cards antigos

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/complaint_patterns?city=${encodeURIComponent(city)}`);
        if (!response.ok) {
            throw new Error(await utils.handleFetchError(response, 'Não foi possível carregar os dados de reclamações.'));
        }
        const data = await response.json();

        // Popula o filtro de cidade
        const cityFilter = document.getElementById('complaintCityFilter');
        if (cityFilter && data.cities && cityFilter.options.length <= 1) {
             utils.populateCityFilter(cityFilter, data.cities, city);
        }

        // Limpa o spinner
        chartsArea.innerHTML = ''; 

        const hasSubjectData = data.top_subjects && data.top_subjects.length > 0;

        // Mensagem se não houver dados
        if (!hasSubjectData) {
            chartsArea.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum dado de reclamação encontrado${city ? ` para ${city}` : ''}.</p>`;
            return;
        }

        const filterText = city ? `em ${city}` : '';

        // Gráfico 1: Top Assuntos — renderizado direto sem GridStack
        if (hasSubjectData) {
            const chartId = 'complaintChart';
            chartsArea.innerHTML = `
                <div style="padding:10px">
                    <h3 class="chart-title" style="margin-bottom:8px">Top Assuntos de Reclamação ${filterText}</h3>
                    <div class="chart-canvas-container"><canvas id="${chartId}"></canvas></div>
                </div>`;
            setTimeout(() => {
                if (!document.getElementById(chartId)) return; // aba mudou, canvas removido
                renderChart(chartId, 'bar_vertical', data.top_subjects.map(d => d.Assunto), [{ label: 'Contagem', data: data.top_subjects.map(d => d.Count) }], `Top Assuntos de Reclamação ${filterText}`, { formatterType: 'number' });
                _addChartClickHandler(chartId, label => {
                    const url = `${state.API_BASE_URL}/api/behavior/complaint_clients?subject=${encodeURIComponent(label)}&city=${encodeURIComponent(city)}`;
                    _openBehaviorDetailModal(`Reclamações: "${label}"`, url, true);
                });
            }, 50);
        }

    } catch (error) {
        console.error(error);
        chartsArea.innerHTML = `<p class="text-red-500">${error.message}</p>`;
    }
}

/**
 * Renderiza a aba "Padrão de Churn".
 */
function renderChurnPatternTab() {
    const tabContent = document.getElementById('tab-content-churn');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div class="flex flex-wrap justify-center gap-4 mb-4 items-end">
            <div class="flex flex-col items-center">
                <label for="churnCityFilter" class="text-gray-700 font-medium mb-1 text-sm">Filtrar por Cidade:</label>
                <select id="churnCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm min-w-[200px]">
                    <option value="">Todas as Cidades</option>
                </select>
            </div>
            <button id="btnFilterChurn" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="churn-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="churn-charts-area" class="grid-stack"></div>
    `;

    const btnFilter = tabContent.querySelector('#btnFilterChurn');
    if (btnFilter) {
        btnFilter.addEventListener('click', () => {
            const city = tabContent.querySelector('#churnCityFilter')?.value || '';
            fetchBehaviorData_ChurnPattern(city);
        });
    }

    fetchBehaviorData_ChurnPattern();
}

async function fetchBehaviorData_ChurnPattern(city = '') {
    const chartsArea = document.getElementById('churn-charts-area');
    const kpiArea    = document.getElementById('churn-kpi-row');
    if (!chartsArea || !kpiArea) return;

    if (chartsArea.gridstack) chartsArea.gridstack.destroy(false);
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';
    kpiArea.innerHTML = '';

    try {
        const qs = city ? `?city=${encodeURIComponent(city)}` : '';
        const resp = await fetch(`${state.API_BASE_URL}/api/behavior/churn_pattern${qs}`);
        if (!resp.ok) throw new Error(await utils.handleFetchError(resp, 'Erro ao carregar padrão de churn.'));
        const data = await resp.json();

        const { summary: s = {}, permanence_distribution = [], seasonal_distribution = [], assunto_distribution = [], cities = [] } = data;

        // City filter
        const cityFilter = document.getElementById('churnCityFilter');
        if (cityFilter && cities.length && cityFilter.options.length <= 1) {
            utils.populateCityFilter(cityFilter, cities, city);
        }

        const total    = s.Total_Churners || 0;
        const pctAtraso = total > 0 ? Math.round((s.Com_Atraso_Pre_Churn / total) * 100) : 0;
        const pctAtend  = total > 0 ? Math.round((s.Com_Atendimentos     / total) * 100) : 0;
        const pctPre6m  = total > 0 ? Math.round((s.Churners_Pre_6m      / total) * 100) : 0;

        kpiArea.innerHTML = `
            <div class="summary-card">
                <div class="summary-card-label">Total Churners</div>
                <div class="summary-card-value">${total.toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card">
                <div class="summary-card-label">Permanência Média</div>
                <div class="summary-card-value">${s.Media_Permanencia_Meses || 0} meses</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #ef4444;">
                <div class="summary-card-label">Atraso nos 60d antes</div>
                <div class="summary-card-value" style="color:#ef4444;">${pctAtraso}%</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #f97316;">
                <div class="summary-card-label">Tinham Atendimento</div>
                <div class="summary-card-value" style="color:#f97316;">${pctAtend}%</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #eab308;">
                <div class="summary-card-label">Pagaram &lt; 6 meses</div>
                <div class="summary-card-value" style="color:#eab308;">${pctPre6m}%</div>
            </div>
        `;

        chartsArea.innerHTML = '';

        if (total === 0) {
            chartsArea.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum dado de churn encontrado.</p>';
            return;
        }

        const grid = GridStack.init({
            cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12,
            disableOneColumnMode: false
        }, chartsArea);
        if (!grid) return;

        // Chart 1 — Sinais de risco (horizontal/vertical bar)
        const signalChartId = 'churnSignalsChart';
        const signalLabels  = ['Atraso 60d antes', 'Histórico de atraso', 'Tinha atendimento', 'Fatura vencida', '< 6 meses pagos'];
        const signalValues  = [
            Math.round((s.Com_Atraso_Pre_Churn  / total) * 100),
            Math.round((s.Com_Historico_Atraso  / total) * 100),
            Math.round((s.Com_Atendimentos      / total) * 100),
            Math.round((s.Com_Faturas_Vencidas  / total) * 100),
            Math.round((s.Churners_Pre_6m       / total) * 100),
        ];
        grid.addWidget({
            w: 6, h: 7, x: 0, y: 0,
            content: `<div class="grid-stack-item-content">
                <div class="chart-container-header"><h3 class="chart-title">Sinais Presentes nos Churners (%)</h3></div>
                <div class="chart-canvas-container"><canvas id="${signalChartId}"></canvas></div>
            </div>`
        });
        setTimeout(() => {
            renderChart(
                signalChartId, 'bar_vertical', signalLabels,
                [{ label: '% dos churners', data: signalValues }],
                'Sinais Presentes nos Churners (%)',
                { formatterType: 'number' }
            );
            const SIGNAL_KEY = {
                'Atraso 60d antes':    'atraso_pre_churn',
                'Histórico de atraso': 'historico_atraso',
                'Tinha atendimento':   'com_atendimentos',
                'Fatura vencida':      'faturas_vencidas',
                '< 6 meses pagos':     'pre_6m',
            };
            _addChartClickHandler(signalChartId, label => {
                const key = SIGNAL_KEY[label];
                if (!key) return;
                const url = `${state.API_BASE_URL}/api/behavior/churn_clients?filter_type=signal&filter_value=${encodeURIComponent(key)}&city=${encodeURIComponent(city)}`;
                _openBehaviorDetailModal(`Churners — "${label}"`, url, false);
            });
        }, 50);

        // Chart 2 — Permanência
        if (permanence_distribution.length) {
            const permChartId = 'churnPermChart';
            const order  = ['0-3m','3-6m','6-12m','12-24m','24m+'];
            const sorted = order.map(f => permanence_distribution.find(d => d.Faixa === f) || { Faixa: f, Count: 0 });
            grid.addWidget({
                w: 6, h: 7, x: 6, y: 0,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Distribuição de Permanência</h3></div>
                    <div class="chart-canvas-container"><canvas id="${permChartId}"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart(
                    permChartId, 'bar_vertical',
                    sorted.map(d => d.Faixa),
                    [{ label: 'Cancelamentos', data: sorted.map(d => d.Count) }],
                    'Distribuição de Permanência',
                    { formatterType: 'number' }
                );
                _addChartClickHandler(permChartId, label => {
                    const url = `${state.API_BASE_URL}/api/behavior/churn_clients?filter_type=permanencia&filter_value=${encodeURIComponent(label)}&city=${encodeURIComponent(city)}`;
                    _openBehaviorDetailModal(`Churners com permanência: ${label}`, url, false);
                });
            }, 50);
        }

        // Chart 3 — Sazonalidade
        if (seasonal_distribution.length) {
            const seasonChartId = 'churnSeasonChart';
            grid.addWidget({
                w: 12, h: 7, x: 0, y: 7,
                id: 'seasonWidget',
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Sazonalidade de Cancelamentos (por mês do ano)</h3></div>
                    <div class="chart-canvas-container"><canvas id="${seasonChartId}"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart(
                    seasonChartId, 'bar_vertical',
                    seasonal_distribution.map(d => d.Mes),
                    [{ label: 'Cancelamentos', data: seasonal_distribution.map(d => d.Count) }],
                    'Sazonalidade de Cancelamentos',
                    { formatterType: 'number' }
                );
                _addChartClickHandler(seasonChartId, label => {
                    const url = `${state.API_BASE_URL}/api/behavior/churn_clients?filter_type=mes&filter_value=${encodeURIComponent(label)}&city=${encodeURIComponent(city)}`;
                    _openBehaviorDetailModal(`Churners cancelados em: ${label}`, url, false);
                });
            }, 50);
        }

        // Chart 4 — Assuntos dos Churners
        if (assunto_distribution.length) {
            const assChartId = 'churnAssuntosChart';
            grid.addWidget({
                w: 12, h: 9, x: 0, y: 14,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Principais Assuntos de Atendimento dos Churners</h3></div>
                    <div class="chart-canvas-container"><canvas id="${assChartId}"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart(
                    assChartId, 'bar_vertical',
                    assunto_distribution.map(d => d.Assunto),
                    [{ label: 'Churners afetados', data: assunto_distribution.map(d => d.Count) }],
                    'Principais Assuntos de Atendimento dos Churners',
                    { formatterType: 'number' }
                );
                _addChartClickHandler(assChartId, label => {
                    const url = `${state.API_BASE_URL}/api/behavior/churn_clients?filter_type=signal&filter_value=com_atendimentos&city=${encodeURIComponent(city)}`;
                    _openBehaviorDetailModal(`Churners com atendimento: "${label}"`, url, false);
                });
            }, 50);
        }

    } catch (error) {
        console.error(error);
        chartsArea.innerHTML = `<p class="text-red-500 p-4">${error.message}</p>`;
    }
}

/**
 * Prepara a UI e busca os dados para a aba "Análise Preditiva de Churn".
 */
function renderPredictiveChurnTab() {
    const tabContent = document.getElementById('tab-content-preditiva');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div id="pred-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div class="flex flex-wrap justify-center gap-4 mb-4 items-end">
            <div>
                <label class="text-sm font-medium text-gray-700 mr-1">Cidade:</label>
                <select id="predCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none sm:text-sm min-w-[160px]">
                    <option value="">Todas</option>
                </select>
            </div>
            <div>
                <label class="text-sm font-medium text-gray-700 mr-1">Nível de Risco:</label>
                <select id="predRiskFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none sm:text-sm">
                    <option value="">Todos</option>
                    <option value="Altíssimo">🚨 Altíssimo</option>
                    <option value="Alto">🔴 Alto</option>
                    <option value="Médio">🟠 Médio</option>
                    <option value="Baixo">🟡 Baixo</option>
                </select>
            </div>
            <div style="position:relative;" id="predAccessDropdownWrap">
                <label class="text-sm font-medium text-gray-700 mr-1">St. Acesso:</label>
                <button type="button" id="predAccessBtn"
                    class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm text-sm min-w-[160px] text-left flex items-center justify-between gap-2"
                    style="cursor:pointer;">
                    <span id="predAccessLabel">Todos</span>
                    <svg style="width:14px;height:14px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </button>
                <div id="predAccessMenu" style="display:none;position:absolute;top:100%;left:0;z-index:50;background:#fff;border:1px solid #d1d5db;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);min-width:200px;padding:6px 0;">
                    ${['Ativo','Suspenso','Bloqueio Manual','Bloqueio Automático','Financeiro em atraso'].map(v =>
                        `<label style="display:flex;align-items:center;gap:8px;padding:6px 14px;cursor:pointer;font-size:.875rem;" class="hover:bg-gray-50">
                            <input type="checkbox" class="pred-access-cb" value="${v}" style="cursor:pointer;">
                            ${v}
                        </label>`
                    ).join('')}
                </div>
            </div>
            <button id="btnFilterPredictive" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
            <button id="btnExportPredictive" class="bg-green-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-green-700 transition font-semibold text-sm h-10">⬇ Baixar CSV</button>
        </div>
        <div id="predictive-churn-table-container"></div>
    `;

    const btnFilter = tabContent.querySelector('#btnFilterPredictive');
    if (btnFilter) btnFilter.addEventListener('click', () => fetchAndRenderPredictiveChurnTable(1));

    const btnExport = tabContent.querySelector('#btnExportPredictive');
    if (btnExport) btnExport.addEventListener('click', () => exportPredictiveChurnCSV());

    // Multi-select dropdown de St. Acesso
    const accessBtn  = tabContent.querySelector('#predAccessBtn');
    const accessMenu = tabContent.querySelector('#predAccessMenu');
    if (accessBtn && accessMenu) {
        accessBtn.addEventListener('click', e => {
            e.stopPropagation();
            accessMenu.style.display = accessMenu.style.display === 'none' ? 'block' : 'none';
        });
        accessMenu.addEventListener('change', () => {
            const checked = [...accessMenu.querySelectorAll('.pred-access-cb:checked')].map(cb => cb.value);
            tabContent.querySelector('#predAccessLabel').textContent =
                checked.length === 0 ? 'Todos' : checked.length === 1 ? checked[0] : `${checked.length} selecionados`;
        });
        document.addEventListener('click', e => {
            if (!tabContent.querySelector('#predAccessDropdownWrap')?.contains(e.target))
                accessMenu.style.display = 'none';
        }, { capture: false });
    }

    fetchAndRenderPredictiveChurnTable(1);
}

/**
 * Busca e renderiza a tabela paginada da "Análise Preditiva de Churn".
 */
export async function fetchAndRenderPredictiveChurnTable(page = 1) {
    const container = document.getElementById('predictive-churn-table-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"></div>';

    const city          = document.getElementById('predCityFilter')?.value || '';
    const riskLevel     = document.getElementById('predRiskFilter')?.value || '';
    const accessChecked = [...document.querySelectorAll('.pred-access-cb:checked')].map(cb => cb.value);
    const rowsPerPage   = 20;
    const offset        = (page - 1) * rowsPerPage;

    const params = new URLSearchParams({ limit: rowsPerPage, offset });
    if (city)      params.append('city',       city);
    if (riskLevel) params.append('risk_level', riskLevel);
    accessChecked.forEach(v => params.append('status_acesso', v));

    const url = `${state.API_BASE_URL}/api/behavior/predictive_churn?${params}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise preditiva.'));
        const result = await response.json();

        // KPI tiles
        const kpiRow = document.getElementById('pred-kpi-row');
        if (kpiRow && result.summary) {
            const s = result.summary;
            kpiRow.innerHTML = `
                <div class="summary-card" style="border-left:4px solid #7c3aed;cursor:pointer;" onclick="document.getElementById('predRiskFilter').value='Altíssimo';document.getElementById('btnFilterPredictive').click()">
                    <div class="summary-card-label">🚨 Altíssimo Risco</div>
                    <div class="summary-card-value" style="color:#7c3aed;">${s.Altissimo || 0}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">Score &gt; 160 · clique para filtrar</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #ef4444;cursor:pointer;" onclick="document.getElementById('predRiskFilter').value='Alto';document.getElementById('btnFilterPredictive').click()">
                    <div class="summary-card-label">🔴 Alto Risco</div>
                    <div class="summary-card-value" style="color:#ef4444;">${s.Alto || 0}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">Score 60–160 · clique para filtrar</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #f97316;cursor:pointer;" onclick="document.getElementById('predRiskFilter').value='Médio';document.getElementById('btnFilterPredictive').click()">
                    <div class="summary-card-label">🟠 Médio Risco</div>
                    <div class="summary-card-value" style="color:#f97316;">${s.Medio || 0}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">Score 25–59 · clique para filtrar</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #eab308;cursor:pointer;" onclick="document.getElementById('predRiskFilter').value='Baixo';document.getElementById('btnFilterPredictive').click()">
                    <div class="summary-card-label">🟡 Baixo Risco</div>
                    <div class="summary-card-value" style="color:#eab308;">${s.Baixo || 0}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">Score 10–24 · clique para filtrar</div>
                </div>
                <div class="summary-card">
                    <div class="summary-card-label">Total Monitorados</div>
                    <div class="summary-card-value">${s.Total || 0}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">com algum sinal de risco</div>
                </div>
            `;
        }

        // City filter on first load
        const cityFilter = document.getElementById('predCityFilter');
        if (cityFilter && result.cities?.length && cityFilter.options.length <= 1) {
            utils.populateCityFilter(cityFilter, result.cities, city);
        }

        const RISK_CLS = {
            'Altíssimo': 'background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;',
            'Alto':      'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
            'Médio':     'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
            'Baixo':     'background:#fefce8;color:#ca8a04;border:1px solid #fde047;',
        };

        const _esc = s => (s || '').replace(/"/g, '&quot;');

        const ACCESS_CLS = {
            'Ativo':               'background:#dcfce7;color:#16a34a;border:1px solid #86efac;',
            'Suspenso':            'background:#fef9c3;color:#a16207;border:1px solid #fde047;',
            'Bloqueado':           'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
            'Bloqueio Manual':     'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
            'Bloqueio Automático': 'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
            'Financeiro em atraso':'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
        };

        const columns = [
            { header: 'Contrato', render: r =>
                `<span class="font-mono text-xs text-gray-500">#${r.Contrato_ID}</span>` },
            { header: 'Cliente', render: r =>
                `<span class="detail-trigger cursor-pointer text-blue-600 font-medium hover:underline"
                    data-type="financial"
                    data-contract-id="${r.Contrato_ID}"
                    data-client-name="${_esc(r.Cliente)}">${r.Cliente}</span>` },
            { header: 'Cidade', key: 'Cidade' },
            { header: 'St. Acesso', render: r => {
                const s = r.Status_acesso || '-';
                return `<span style="padding:2px 7px;border-radius:999px;font-size:0.72rem;font-weight:600;white-space:nowrap;${ACCESS_CLS[s]||'background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;'}">${s}</span>`;
            }},
            { header: 'Risco', render: r =>
                `<span style="padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:700;${RISK_CLS[r.Nivel_Risco]||''}">${r.Nivel_Risco}</span>` },
            { header: 'Score', render: r => `<span class="font-mono font-bold">${r.Risk_Score}</span>` },
            { header: 'Fat. Vencidas', render: r => r.Faturas_Vencidas > 0
                ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline"
                    data-type="faturas_nao_pagas"
                    data-contract-id="${r.Contrato_ID}"
                    data-client-name="${_esc(r.Cliente)}">${r.Faturas_Vencidas}</span>`
                : '0' },
            { header: 'Dias Vencido', render: r => r.Dias_Vencido > 0
                ? `<span style="color:#dc2626;">${r.Dias_Vencido}d</span>` : '-' },
            { header: 'Atrasos 90d', render: r => r.Atrasos_90d > 0
                ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline"
                    data-type="atrasos_pagos"
                    data-contract-id="${r.Contrato_ID}"
                    data-client-name="${_esc(r.Cliente)}">${r.Atrasos_90d}</span>`
                : '0' },
            { header: 'Atend. 30d', render: r => r.Atendimentos_30d > 0
                ? `<span class="detail-trigger cursor-pointer text-blue-600 font-bold hover:underline"
                    data-type="complaints"
                    data-contract-id="${r.Contrato_ID}"
                    data-client-name="${_esc(r.Cliente)}">${r.Atendimentos_30d}</span>`
                : '0' },
            { header: 'Sem Conexão', render: r => r.Dias_Sem_Conexao > 0
                ? `<span class="detail-trigger cursor-pointer hover:underline"
                    style="color:${r.Dias_Sem_Conexao > 30 ? '#dc2626' : '#ca8a04'};"
                    data-type="logins"
                    data-contract-id="${r.Contrato_ID}"
                    data-client-name="${_esc(r.Cliente)}">${r.Dias_Sem_Conexao}d</span>`
                : '-' },
            { header: 'Val. Vencido', render: r => r.Valor_Vencido > 0
                ? `<span style="color:#dc2626;">R$ ${parseFloat(r.Valor_Vencido).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`
                : '-' },
        ];

        let tableHtml = '<p class="text-center text-gray-500 mt-4">Nenhum cliente em risco para os filtros selecionados.</p>';
        if (result.data?.length > 0) {
            tableHtml = utils.renderGenericDetailTable(null, result.data, columns, true);
        }

        const n = result.total_rows || 0;
        const totalPages = Math.ceil(n / rowsPerPage);
        let paginationHtml = '';
        if (totalPages > 1) {
            paginationHtml = `
                <div class="pagination-controls flex justify-center items-center gap-2 mt-4">
                    <button class="pred-page-btn bg-gray-200 px-3 py-1 rounded disabled:opacity-50"
                            data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
                    <span class="text-sm text-gray-500">Página ${page} de ${totalPages} · ${n.toLocaleString('pt-BR')} registros</span>
                    <button class="pred-page-btn bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
                            data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Próxima</button>
                </div>`;
        } else if (n > 0) {
            paginationHtml = `<p class="text-sm text-gray-400 mt-2 text-center">${n.toLocaleString('pt-BR')} registros</p>`;
        }
        container.innerHTML = `<div class="border rounded-lg overflow-hidden"><div style="overflow-y:auto;max-height:520px;">${tableHtml}</div></div>${paginationHtml}`;
        container.querySelectorAll('.pred-page-btn').forEach(btn => {
            btn.addEventListener('click', () => fetchAndRenderPredictiveChurnTable(parseInt(btn.dataset.page)));
        });

    } catch (error) {
        container.innerHTML = `<p class="text-red-500 p-4">${error.message}</p>`;
    }
}

async function exportPredictiveChurnCSV() {
    const city          = document.getElementById('predCityFilter')?.value || '';
    const riskLevel     = document.getElementById('predRiskFilter')?.value || '';
    const accessChecked = [...document.querySelectorAll('.pred-access-cb:checked')].map(cb => cb.value);
    const btn           = document.getElementById('btnExportPredictive');

    if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }

    try {
        const params = new URLSearchParams({ limit: 5000, offset: 0 });
        if (city)      params.append('city',       city);
        if (riskLevel) params.append('risk_level', riskLevel);
        accessChecked.forEach(v => params.append('status_acesso', v));

        const res  = await fetch(`/api/behavior/predictive_churn_export?${params}`);
        if (!res.ok) throw new Error('Erro ao buscar dados para exportação.');
        const { data } = await res.json();
        if (!data?.length) { alert('Nenhum dado para exportar.'); return; }

        const headers = ['Contrato','Cliente','Telefone','WhatsApp','Cidade',
                         'St. Contrato','St. Acesso',
                         'Nível Risco','Score',
                         'Fat. Vencidas','Dias Vencido','Atrasos 90d','Atend. 30d','Sem Conexão (dias)','Val. Vencido'];
        const rows = data.map(r => [
            r.Contrato_ID, r.Cliente,
            r.Telefone  || '', r.WhatsApp || '',
            r.Cidade    || '', r.Status_contrato || '', r.Status_acesso || '',
            r.Nivel_Risco, r.Risk_Score,
            r.Faturas_Vencidas, r.Dias_Vencido, r.Atrasos_90d,
            r.Atendimentos_30d, r.Dias_Sem_Conexao,
            r.Valor_Vencido > 0 ? parseFloat(r.Valor_Vencido).toFixed(2).replace('.', ',') : '0,00'
        ]);

        const csvContent = [headers, ...rows]
            .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
            .join('\n');

        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `churn_preditivo_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert(e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⬇ Baixar CSV'; }
    }
}

// -------------------------------------------------------
// MODAL DE CLIENTES DOS GRÁFICOS CLICÁVEIS
// -------------------------------------------------------

const _BC_MODAL_ID = 'behaviorClientsModal';

function _addChartClickHandler(chartId, onLabel) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', event => {
        const chart = state.getMainCharts()[chartId];
        if (!chart) return;
        const elements = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
        if (!elements.length) return;
        onLabel(chart.data.labels[elements[0].index]);
    });
}

function _ensureBehaviorDetailModal() {
    if (document.getElementById(_BC_MODAL_ID)) return;
    const el = document.createElement('div');
    el.id = _BC_MODAL_ID;
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);align-items:center;justify-content:center;';
    el.innerHTML = `
        <div style="background:#fff;border-radius:12px;max-width:960px;width:95vw;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
                <h3 id="bcModalTitle" style="font-size:.95rem;font-weight:700;color:#111827;margin:0;"></h3>
                <button id="bcModalClose" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:1.5rem;line-height:1;padding:0 4px;">&times;</button>
            </div>
            <div id="bcModalBody" style="overflow-y:auto;padding:16px;flex:1;min-height:180px;"></div>
        </div>
    `;
    document.body.appendChild(el);
    document.getElementById('bcModalClose').addEventListener('click', _closeBehaviorDetailModal);
    el.addEventListener('click', e => { if (e.target === el) _closeBehaviorDetailModal(); });
}

function _closeBehaviorDetailModal() {
    const el = document.getElementById(_BC_MODAL_ID);
    if (el) el.style.display = 'none';
}

async function _openBehaviorDetailModal(title, url, isComplaint) {
    _ensureBehaviorDetailModal();
    const modal = document.getElementById(_BC_MODAL_ID);
    document.getElementById('bcModalTitle').textContent = title;
    const body = document.getElementById('bcModalBody');
    body.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;"><div class="loading-spinner"></div></div>';
    modal.style.display = 'flex';

    try {
        const resp = await fetch(url);
        const result = await resp.json();
        if (result.error) {
            body.innerHTML = `<p style="color:#dc2626;padding:16px;">Erro: ${result.error}</p>`;
            return;
        }
        const rows = result.data || [];
        if (!rows.length) {
            body.innerHTML = '<p style="text-align:center;color:#6b7280;padding:32px;">Nenhum cliente encontrado.</p>';
            return;
        }

        const cols = isComplaint
            ? [
                { label: 'Cliente', key: 'Cliente' },
                { label: 'Cidade',  key: 'Cidade'  },
                { label: 'Tipo',    key: 'Tipo'    },
                { label: 'Data',    key: 'Data'    },
              ]
            : [
                { label: 'Cliente',      key: 'Cliente'          },
                { label: 'Cidade',       key: 'Cidade'           },
                { label: 'Ativação',     key: 'Data_ativa_o'     },
                { label: 'Cancelamento', key: 'end_date'         },
                { label: 'Meses Pagos',  key: 'Permanencia_Meses', fmt: v => v != null ? `${v}` : '' },
              ];

        const thHtml = cols.map(c =>
            `<th style="text-align:left;padding:8px 12px;white-space:nowrap;color:#374151;font-size:.8rem;font-weight:600;border-bottom:2px solid #e2e8f0;">${c.label}</th>`
        ).join('');

        const tbHtml = rows.map((row, i) => {
            const cells = cols.map(c => {
                const val = c.fmt ? c.fmt(row[c.key]) : (row[c.key] ?? '');
                return `<td style="padding:7px 12px;color:#374151;white-space:nowrap;font-size:.82rem;">${val}</td>`;
            }).join('');
            return `<tr style="border-bottom:1px solid #f1f5f9;background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">${cells}</tr>`;
        }).join('');

        body.innerHTML = `
            <p style="font-size:.78rem;color:#9ca3af;margin-bottom:10px;">
                ${rows.length} registro${rows.length !== 1 ? 's' : ''}${rows.length >= 300 ? ' (limitado a 300)' : ''}
            </p>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="background:#f8fafc;">${thHtml}</tr></thead>
                    <tbody>${tbHtml}</tbody>
                </table>
            </div>`;

    } catch (e) {
        body.innerHTML = '<p style="color:#dc2626;padding:16px;">Erro ao carregar dados.</p>';
        console.error(e);
    }
}

// -------------------------------------------------------
// ABA: QUALIDADE DE REDE
// -------------------------------------------------------

async function renderQoSTab() {
    const tabContent = document.getElementById('tab-content-qualidade');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div class="flex flex-wrap justify-center gap-4 mb-6 items-end">
            <div class="flex flex-col items-center">
                <label for="qosCityFilter" class="text-gray-700 font-medium mb-1 text-sm">Filtrar por Cidade:</label>
                <select id="qosCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm min-w-[200px]">
                    <option value="">Todas as cidades</option>
                </select>
            </div>
            <button id="btnFilterQoS" class="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">Filtrar</button>
        </div>
        <div id="qos-kpi-row" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"></div>
        <div id="qos-charts-area" class="grid-stack"></div>
    `;

    tabContent.querySelector('#btnFilterQoS')?.addEventListener('click', fetchBehaviorData_QoS);
    fetchBehaviorData_QoS();
}

async function fetchBehaviorData_QoS() {
    const city = document.getElementById('qosCityFilter')?.value || '';
    const params = new URLSearchParams();
    if (city) params.append('city', city);

    const chartsArea = document.getElementById('qos-charts-area');
    if (chartsArea?.gridstack) { chartsArea.gridstack.destroy(false); }

    try {
        const resp = await fetch(`${state.API_BASE_URL}/api/behavior/qos_overview?${params}`);
        if (!resp.ok) throw new Error('Erro ao carregar dados de qualidade');
        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        // Cidade filter
        const cityFilter = document.getElementById('qosCityFilter');
        if (cityFilter && data.cities?.length && cityFilter.options.length <= 1) {
            utils.populateCityFilter(cityFilter, data.cities, city);
        }

        // KPI cards
        const kpiRow = document.getElementById('qos-kpi-row');
        if (kpiRow) {
            const k = data.kpis;
            kpiRow.innerHTML = `
                <div class="summary-card" style="border-left:4px solid #ef4444;cursor:pointer;" onclick="_openQoSModal('Clientes com Sinal Crítico','${state.API_BASE_URL}/api/behavior/signal_clients?level=critical&city=${encodeURIComponent(city)}')">
                    <div class="summary-card-label">Sinal Crítico</div>
                    <div class="summary-card-value" style="color:#ef4444;">${k.signal_critical}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">RX &lt; -27 dBm · clique para ver</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #3b82f6;">
                    <div class="summary-card-label">ONUs Monitoradas</div>
                    <div class="summary-card-value" style="color:#3b82f6;">${k.signal_total}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">clientes com dado de sinal</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #f97316;cursor:pointer;" onclick="_openQoSModal('Clientes com Franquia Atingida','${state.API_BASE_URL}/api/behavior/signal_clients?city=${encodeURIComponent(city)}')">
                    <div class="summary-card-label">Franquia Atingida</div>
                    <div class="summary-card-value" style="color:#f97316;">${k.quota_pct}%</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">${k.quota_atingiram} clientes no limite</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #8b5cf6;">
                    <div class="summary-card-label">Desconexões Hoje</div>
                    <div class="summary-card-value" style="color:#8b5cf6;">${k.disc_total}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">total registrado hoje</div>
                </div>
            `;
        }

        // GridStack
        const gs = GridStack.init({ cellHeight: 60, margin: 8, column: 12, float: false }, '#qos-charts-area');
        chartsArea.gridstack = gs;

        // Chart 1: Qualidade de Sinal por OLT (stacked)
        if (data.signal_by_olt?.length) {
            const cId = 'qosSignalChart';
            gs.addWidget(`<div class="grid-stack-item" gs-w="12" gs-h="9" gs-x="0" gs-y="0">
                <div class="grid-stack-item-content chart-widget">
                    <h3 class="chart-title" id="${cId}Title">Qualidade de Sinal por OLT</h3>
                    <canvas id="${cId}"></canvas>
                </div></div>`);
            setTimeout(() => {
                const olts = data.signal_by_olt.map(d => d.olt || 'Desconhecido');
                const LEVEL_KEYS = ['excellent', 'good', 'marginal', 'critical'];
                renderChart(cId, 'bar_vertical', olts,
                    [
                        { label: 'Excelente (acima de -20 dBm)', data: data.signal_by_olt.map(d => d.excelente || 0), backgroundColor: '#15803dE6' },
                        { label: 'Boa (-20 a -25 dBm)',          data: data.signal_by_olt.map(d => d.boa       || 0), backgroundColor: '#22c55eE6' },
                        { label: 'Marginal (-25 a -27 dBm)',      data: data.signal_by_olt.map(d => d.marginal  || 0), backgroundColor: '#eab308E6' },
                        { label: 'Crítica (abaixo de -27 dBm)',  data: data.signal_by_olt.map(d => d.critica   || 0), backgroundColor: '#ef4444E6' },
                    ],
                    'Qualidade de Sinal por OLT',
                    { formatterType: 'number', scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
                );
                const cvs = document.getElementById(cId);
                if (cvs) {
                    cvs.style.cursor = 'pointer';
                    cvs.addEventListener('click', ev => {
                        const chart = state.getMainCharts()[cId];
                        if (!chart) return;
                        const els = chart.getElementsAtEventForMode(ev, 'nearest', { intersect: true }, false);
                        if (!els.length) return;
                        const olt = chart.data.labels[els[0].index];
                        const lvl = LEVEL_KEYS[els[0].datasetIndex] || '';
                        const lvlLabel = chart.data.datasets[els[0].datasetIndex]?.label || '';
                        _openQoSModal(`Sinal — ${olt} · ${lvlLabel}`,
                            `${state.API_BASE_URL}/api/behavior/signal_clients?olt=${encodeURIComponent(olt)}&level=${lvl}&city=${encodeURIComponent(city)}`);
                    });
                }
            }, 50);
        }

        // Chart 2: Distribuição por Tipo de ONU
        if (data.onu_distribution?.length) {
            const cId = 'qosOnuChart';
            gs.addWidget(`<div class="grid-stack-item" gs-w="6" gs-h="9" gs-x="0" gs-y="9">
                <div class="grid-stack-item-content chart-widget">
                    <h3 class="chart-title" id="${cId}Title">Distribuição por Tipo de ONU</h3>
                    <canvas id="${cId}"></canvas>
                </div></div>`);
            setTimeout(() => {
                renderChart(cId, 'pie',
                    data.onu_distribution.map(d => d.onu),
                    [{ label: 'Quantidade', data: data.onu_distribution.map(d => d.count) }],
                    'Distribuição por Tipo de ONU', { formatterType: 'number' });
            }, 50);
        }

        // Chart 3: Desconexões por OLT
        if (data.instability_by_olt?.length) {
            const cId = 'qosInstabChart';
            gs.addWidget(`<div class="grid-stack-item" gs-w="6" gs-h="9" gs-x="6" gs-y="9">
                <div class="grid-stack-item-content chart-widget">
                    <h3 class="chart-title" id="${cId}Title">Média de Desconexões por OLT</h3>
                    <canvas id="${cId}"></canvas>
                </div></div>`);
            setTimeout(() => {
                renderChart(cId, 'bar_vertical',
                    data.instability_by_olt.map(d => d.olt),
                    [{ label: 'Média de Desconexões', data: data.instability_by_olt.map(d => d.avg_disc) }],
                    'Média de Desconexões por OLT', { formatterType: 'number' });
                _addChartClickHandler(cId, label => {
                    _openQoSModal(`Desconexões — "${label}"`,
                        `${state.API_BASE_URL}/api/behavior/signal_clients?olt=${encodeURIComponent(label)}&city=${encodeURIComponent(city)}`);
                });
            }, 50);
        }

    } catch (e) {
        if (chartsArea) chartsArea.innerHTML = `<p class="text-red-500 p-4">${e.message}</p>`;
        console.error(e);
    }
}

window._openQoSModal = async function(title, url) {
    _ensureBehaviorDetailModal();
    const modal = document.getElementById(_BC_MODAL_ID);
    document.getElementById('bcModalTitle').textContent = title;
    const body = document.getElementById('bcModalBody');
    body.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;"><div class="loading-spinner"></div></div>';
    modal.style.display = 'flex';

    try {
        const resp = await fetch(url);
        const result = await resp.json();
        if (result.error) { body.innerHTML = `<p style="color:#dc2626;padding:16px;">Erro: ${result.error}</p>`; return; }
        const rows = result.data || [];
        if (!rows.length) { body.innerHTML = '<p style="text-align:center;color:#6b7280;padding:32px;">Nenhum cliente encontrado.</p>'; return; }

        const cols = [
            { label: 'Cliente',      key: 'Cliente' },
            { label: 'Cidade',       key: 'Cidade'  },
            { label: 'OLT',          key: 'OLT'     },
            { label: 'Sinal RX',     key: 'Sinal_RX',         fmt: v => v != null ? `${v} dBm` : '-' },
            { label: 'Sinal TX',     key: 'Sinal_TX',         fmt: v => v != null ? `${v} dBm` : '-' },
            { label: 'Status ONU',   key: 'Status_ONU'   },
            { label: 'Causa Queda',  key: 'Causa_Queda'  },
            { label: 'Desc. Hoje',   key: 'Desconexoes_Hoje' },
        ];

        const th = cols.map(c =>
            `<th style="text-align:left;padding:8px 12px;white-space:nowrap;color:#374151;font-size:.8rem;font-weight:600;border-bottom:2px solid #e2e8f0;">${c.label}</th>`
        ).join('');

        const tb = rows.map((row, i) => {
            const rxVal = row['Sinal_RX'];
            const rxStyle = rxVal < -27 ? 'color:#dc2626;font-weight:700;' : rxVal < -25 ? 'color:#d97706;' : 'color:#16a34a;';
            const cells = cols.map(c => {
                const val = c.fmt ? c.fmt(row[c.key]) : (row[c.key] ?? '-');
                const extra = c.key === 'Sinal_RX' ? `style="${rxStyle}"` : '';
                return `<td ${extra} style="padding:7px 12px;white-space:nowrap;font-size:.82rem;color:#374151;">${val}</td>`;
            }).join('');
            return `<tr style="border-bottom:1px solid #f1f5f9;background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">${cells}</tr>`;
        }).join('');

        body.innerHTML = `
            <p style="font-size:.78rem;color:#9ca3af;margin-bottom:10px;">${rows.length} registro${rows.length !== 1 ? 's' : ''}${rows.length >= 300 ? ' (limitado a 300)' : ''}</p>
            <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:#f8fafc;">${th}</tr></thead>
                <tbody>${tb}</tbody>
            </table></div>`;
    } catch (e) {
        body.innerHTML = '<p style="color:#dc2626;padding:16px;">Erro ao carregar dados.</p>';
        console.error(e);
    }
};
// -------------------------------------------------------
// ABA: PLANO DE ACOES ANTI-CHURN
// -------------------------------------------------------

async function renderAcoesTab() {
    const pane = document.getElementById('tab-content-acoes');
    if (!pane) return;
    pane.innerHTML = '<p class="text-gray-400 p-8 text-center">Carregando...</p>';

    let summary = { Altissimo: 0, Alto: 0, Medio: 0, Baixo: 0, Total: 0 };
    try {
        const r = await fetch(`${state.API_BASE_URL}/api/behavior/predictive_churn?limit=1&offset=0`);
        if (r.ok) { const d = await r.json(); if (d.summary) summary = { ...summary, ...d.summary }; }
    } catch (_) {}

    const STAGES = [
        { key: 'Altissimo', label: 'Altissimo', count: summary.Altissimo || 0,
          cor: '#7c3aed', corBg: '#ede9fe', corBd: '#c4b5fd', emoji: 'xx_EMOJ1',
          scoreRange: '> 160', urgencia: 'MESMO DIA — resposta em ate 2 horas', urCor: '#7c3aed',
          gatilhos: ['Score > 160 pontos', 'Multiplos sinais criticos simultaneos', 'Bloqueio + historico de atraso + queda de uso'],
          acoes: [
            { t: 'Ligacao de retencao especializada', d: 'Agente treinado com autoridade. Script LAER: Ouca -> Reconheca -> Explique/Oferea -> Peca compromisso.' },
            { t: 'Callback executivo', d: 'Para clientes de alto valor: escalar para gerente. Contato pessoal tem impacto desproporcional.' },
            { t: 'Oferta de retencao estruturada', d: 'Lock de preco 12 meses, upgrade de velocidade no preco atual, mes gratis ou bundle com servico adicional.' },
            { t: 'Visita tecnica prioritaria', d: 'Se ha problemas em aberto: visita no mesmo dia. A rapidez da resposta e, por si, um argumento de retencao.' },
            { t: 'Credito na fatura', d: 'Para falhas verificadas: oferea proativamente. "Identificamos instabilidade — creditamos R$Y na proxima fatura."' },
          ],
          nao: 'Nao delegue a atendimento nivel 1. Nao use scripts genericos. Personalize a oferta.' },
        { key: 'Alto', label: 'Alto', count: summary.Alto || 0,
          cor: '#dc2626', corBg: '#fee2e2', corBd: '#fca5a5', emoji: 'xx_EMOJ2',
          scoreRange: '60 – 160', urgencia: 'MESMO DIA — resposta em ate 4 horas', urCor: '#dc2626',
          gatilhos: ['Score 60-160', 'Concorrente mencionado ou cotado', 'Solicitacao de info sobre cancelamento', '5+ dias inadimplente', 'Zero uso por 7+ dias'],
          acoes: [
            { t: 'Ligacao de retencao (agente senior)', d: 'Revise o historico antes de ligar. Mencione tickets e datas de problema — mostre que conhece o caso.' },
            { t: 'Oferta personalizada por motivo', d: 'Preco -> lock + upgrade. Tecnico -> visita + credito. Concorrente -> diferencial (suporte local, tempo de resposta).' },
            { t: 'Reconexao imediata para inadimplentes', d: 'Ofereca reconexao ao pagar + parcelamento. Reconexao rapida evita migracao durante o bloqueio.' },
            { t: 'Investigar churn silencioso', d: 'Se uso zerou sem motivo, o cliente ja usa outro provedor. WhatsApp: "Notamos sua conexao sem uso — esta tudo bem?"' },
            { t: 'Proposta por escrito no WhatsApp', d: 'Apos a ligacao, envie resumo da oferta por escrito. Facilita a decisao e gera registro.' },
          ],
          nao: 'Nao ofereca desconto antes de ouvir o motivo real. Nao desista apos uma unica tentativa.' },
        { key: 'Medio', label: 'Medio', count: summary.Medio || 0,
          cor: '#ea580c', corBg: '#ffedd5', corBd: '#fdba74', emoji: 'xx_EMOJ3',
          scoreRange: '25 – 59', urgencia: 'EM ATE 24 HORAS — proativo antes que escale', urCor: '#ea580c',
          gatilhos: ['Score 25-59', '2-3 tickets no mes', '1a ou 2a cobranca em atraso', 'Downgrade sem motivo', 'NPS detractor (0-6)'],
          acoes: [
            { t: 'Ligacao proativa de servico (nao de vendas)', d: '"Notamos que voce teve problemas recentemente e queremos garantir que esta tudo bem." Ouca. Nao venda.' },
            { t: 'Oferta de diagnostico gratuito', d: 'Ofereca visita tecnica preventiva dentro da semana. A oferta ja sinaliza cuidado.' },
            { t: 'Relatorio personalizado de qualidade', d: 'WhatsApp: "Seu uptime no ultimo mes foi X%, velocidade media Y Mbps." Transparencia gera confianca.' },
            { t: 'Revisao de plano', d: '"Seu plano atual ainda atende bem? Posso verificar se ha algo mais adequado." — nao e upsell, e otimizacao.' },
          ],
          nao: 'NAO ofereca desconto neste estagio. Clientes que recebem desconto por reclamar aprendem a reclamar para obter desconto.' },
        { key: 'Baixo', label: 'Baixo', count: summary.Baixo || 0,
          cor: '#ca8a04', corBg: '#fefce8', corBd: '#fde047', emoji: 'xx_EMOJ4',
          scoreRange: '10 – 24', urgencia: 'EM ATE 72 HORAS — monitoramento e prevencao', urCor: '#ca8a04',
          gatilhos: ['Score 10-24', '1 ticket no mes', '1o pagamento com pequeno atraso', 'Sinal de risco isolado'],
          acoes: [
            { t: 'Lembrete automatico de cobranca', d: 'Sequencia D-5, D-2, D0 via WhatsApp com link PIX. Recupera ate 42% dos atrasos sem contato humano.' },
            { t: 'Monitorar tickets recorrentes', d: 'Se o mesmo problema se repete, eleve para Medio imediatamente. Problemas repetidos sao o maior preditor de churn tecnico.' },
            { t: 'Pesquisa NPS pos-atendimento', d: 'Apos ticket encerrado: envie pesquisa rapida de satisfacao. Detractors disparam alerta automatico.' },
            { t: 'Toque de aniversario de contrato', d: '1, 2 ou 3 anos: mensagem + beneficio (desconto, upgrade temporario). Custo quase zero, impacto alto.' },
          ],
          nao: 'Nao ignore sinais isolados. Acumulacao de sinais baixos e o padrao mais comum antes do churn.' },
    ];

    const CENARIOS = [
        { motivo: 'Preco alto / concorrente', a1: 'Transparencia sobre promo do concorrente (validade, reajuste pos-promo)', a2: 'Lock de preco 12 meses + upgrade de velocidade no plano atual', au: 'Desconto 10-15% por compromisso de 12 meses' },
        { motivo: 'Problemas tecnicos recorrentes', a1: 'Visita tecnica prioritaria no mesmo dia + timeline de resolucao', a2: 'Credito na fatura proporcional ao periodo de instabilidade', au: 'Troca de equipamento + mes gratis + tecnico dedicado por 60 dias' },
        { motivo: 'Dificuldade financeira', a1: 'Flexibilidade de data de vencimento (sem custo, alto impacto)', a2: 'Parcelamento da divida + reconexao imediata', au: 'Downgrade temporario de plano para manter o relacionamento' },
        { motivo: 'Sem uso / churn silencioso', a1: 'WhatsApp: "Notamos sua conexao sem uso — esta tudo certo?"', a2: 'Visita tecnica gratuita para verificar qualidade do sinal', au: 'Re-engajamento: 1 mes reduzido + upgrade de velocidade' },
        { motivo: 'Mau atendimento', a1: 'Escalacao imediata para gerente + callback executivo', a2: 'Credito na fatura + contato dedicado por 60 dias', au: 'Reconhecimento formal + SLA escrito de resolucao' },
        { motivo: 'Mudanca de endereco', a1: 'Verificar cobertura no novo endereco imediatamente', a2: 'Instalacao prioritaria sem custo', au: 'Se sem cobertura: win-back em 60 dias com oferta especial' },
    ];

    const DUNNING = [
        { dia: 'D-5', acao: 'WhatsApp com lembrete e link de pagamento (PIX)', canal: 'WhatsApp' },
        { dia: 'D-2', acao: 'Segundo lembrete via SMS ou push', canal: 'SMS/Push' },
        { dia: 'D0',  acao: 'Confirmacao de vencimento ou lembrete se nao pago', canal: 'WhatsApp' },
        { dia: 'D+1', acao: 'Primeiro contato de recuperacao — tom amigavel, ofereca PIX', canal: 'WhatsApp' },
        { dia: 'D+3', acao: 'Segundo contato — ofereca negociacao (parcelar ou adiar 7 dias)', canal: 'Ligacao' },
        { dia: 'D+5', acao: 'Aviso final antes de bloqueio — inclua oferta de regularizacao na mensagem', canal: 'WhatsApp' },
        { dia: 'D+7', acao: 'Bloqueio (se contratual) — reconexao imediata ao pagar', canal: 'Sistema' },
        { dia: 'D+10',acao: 'Oferta pos-bloqueio: isente taxa de reconexao se pagar em X dias', canal: 'WhatsApp' },
    ];

    const QUICKSTART = [
        ['1', 'Automacao de cobranca WhatsApp', 'Sequencia D-5/D-2/D0 com link PIX. Recupera ate 42% da inadimplencia sem contato humano.', '#059669'],
        ['2', 'Flag: 2+ tickets no mes', 'Alerta automatico + ligacao proativa em 48h. Previne 60-70% dos churns tecnicos.', '#0284c7'],
        ['3', 'Save desk dedicado', '1-2 agentes treinados com script e autoridade para descontos. Reduz churn reativo em ate 50%.', '#7c3aed'],
        ['4', 'Credito pos-falha proativo', 'Ofereca antes do cliente pedir. Elimina a conta mental "por que estou pagando por isso?".', '#dc2626'],
        ['5', 'Contato de renovacao 30 dias antes', 'Proativo antes que o cliente busque alternativas. Janela mais eficaz de retencao.', '#ea580c'],
        ['6', 'Aniversario de contrato', 'Mensagem + beneficio no 1o, 2o e 3o aniversario. Custo quase zero, impacto alto.', '#ca8a04'],
    ];

    const emojis = ['xx_EMOJ1','xx_EMOJ2','xx_EMOJ3','xx_EMOJ4'];
    const emojiReals = ['\uD83D\uDEA8','\uD83D\uDD34','\uD83D\uDFE0','\uD83D\uDFE1'];

    const stageHtml = STAGES.map((s, si) => {
        const emoji = emojiReals[si];
        const gatHtml = s.gatilhos.map(g => `<li style="margin-bottom:3px;">${g}</li>`).join('');
        const acoHtml = s.acoes.map((a, i) => `
            <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid ${s.corBd};">
                <div style="min-width:22px;height:22px;background:${s.cor};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">${i+1}</div>
                <div><div style="font-weight:600;color:#1e293b;font-size:12px;">${a.t}</div>
                <div style="color:#64748b;font-size:11px;margin-top:1px;">${a.d}</div></div>
            </div>`).join('');
        return `
        <div style="background:#fff;border:1px solid ${s.corBd};border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
            <div style="background:${s.corBg};padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:22px;">${emoji}</span>
                    <div><div style="font-size:16px;font-weight:700;color:${s.cor};">Risco ${s.label}</div>
                    <div style="font-size:11px;color:#64748b;">Score: ${s.scoreRange}</div></div>
                </div>
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="text-align:center;"><div style="font-size:26px;font-weight:800;color:${s.cor};">${s.count}</div>
                    <div style="font-size:10px;color:#64748b;">clientes agora</div></div>
                    <button onclick="document.querySelector('[data-tab=preditiva]').click();setTimeout(()=>{const f=document.getElementById('predRiskFilter');if(f){f.value='${s.key === 'Altissimo' ? 'Alt\xEDssimo' : s.key === 'Medio' ? 'M\xE9dio' : s.label}';document.getElementById('btnFilterPredictive')?.click();}},500);"
                        style="background:${s.cor};color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
                        Ver clientes
                    </button>
                </div>
            </div>
            <div style="padding:14px 18px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:10px;">
                    <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Gatilhos de alerta</div>
                    <ul style="list-style:none;padding:0;margin:0;font-size:11px;color:#475569;">${gatHtml}</ul></div>
                    <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">Urgencia</div>
                    <div style="font-size:11px;font-weight:700;color:${s.urCor};padding:5px 8px;background:${s.corBg};border-radius:6px;margin-bottom:8px;">${s.urgencia}</div>
                    <div style="font-size:10px;color:#94a3b8;padding:5px 8px;background:#fafafa;border-radius:6px;border:1px solid #e2e8f0;">${s.nao}</div></div>
                </div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">Acoes em ordem de prioridade</div>
                ${acoHtml}
            </div>
        </div>`;
    }).join('');

    const tdBase = 'padding:9px 11px;white-space:normal;word-break:break-word;overflow:visible;text-overflow:clip;vertical-align:top;';
    const cenHtml = CENARIOS.map((c, i) => `
        <tr style="background:${i%2===0?'#fff':'#f8fafc'};">
            <td style="${tdBase}font-size:12px;font-weight:600;color:#1e293b;border-right:1px solid #e2e8f0;min-width:120px;">${c.motivo}</td>
            <td style="${tdBase}font-size:11px;color:#475569;border-right:1px solid #e2e8f0;min-width:200px;">${c.a1}</td>
            <td style="${tdBase}font-size:11px;color:#475569;border-right:1px solid #e2e8f0;min-width:200px;">${c.a2}</td>
            <td style="${tdBase}font-size:11px;color:#7c3aed;font-weight:600;min-width:180px;">${c.au}</td>
        </tr>`).join('');

    const tdDun = 'padding:7px 11px;white-space:normal;word-break:break-word;overflow:visible;text-overflow:clip;vertical-align:top;';
    const dunHtml = DUNNING.map((d, i) => `
        <tr style="background:${i%2===0?'#fff':'#f8fafc'};">
            <td style="${tdDun}font-weight:700;color:${d.dia==='D+7'?'#dc2626':d.dia.startsWith('D+')?'#ea580c':'#1e293b'};font-size:12px;white-space:nowrap;min-width:55px;">${d.dia}</td>
            <td style="${tdDun}font-size:11px;color:#475569;min-width:260px;">${d.acao}</td>
            <td style="${tdDun}font-size:11px;color:#64748b;min-width:120px;">${d.canal}</td>
        </tr>`).join('');

    const qsHtml = QUICKSTART.map(([n,t,d,c]) => `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;display:flex;gap:10px;">
            <div style="min-width:26px;height:26px;background:${c};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">${n}</div>
            <div><div style="font-weight:600;color:#1e293b;font-size:12px;">${t}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">${d}</div></div>
        </div>`).join('');

    pane.innerHTML = `
    <div style="padding:20px;max-width:1200px;margin:0 auto;">
        <div style="margin-bottom:18px;">
            <h2 style="font-size:20px;font-weight:700;color:#1e293b;margin:0 0 4px;">Plano de Acoes Anti-Churn</h2>
            <p style="font-size:12px;color:#64748b;margin:0;">Baseado em pesquisa com 15+ fontes especializadas em ISPs brasileiros. Acoes por nivel de risco com timing de resposta.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:22px;">
            ${STAGES.map((s,si) => `<div style="background:${s.corBg};border:1px solid ${s.corBd};border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:11px;font-weight:600;color:${s.cor};">${emojiReals[si]} ${s.label}</div>
                <div style="font-size:22px;font-weight:800;color:${s.cor};">${s.count}</div>
                <div style="font-size:10px;color:#94a3b8;">clientes</div></div>`).join('')}
            <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;">
                <div style="font-size:11px;font-weight:600;color:#475569;">Total monitorados</div>
                <div style="font-size:22px;font-weight:800;color:#1e293b;">${summary.Total||0}</div>
                <div style="font-size:10px;color:#94a3b8;">com algum sinal</div></div>
        </div>
        <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 10px;">Playbook por Nivel de Risco</h3>
        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:28px;">${stageHtml}</div>
        <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 10px;">Matriz: Motivo de Cancelamento x Acoes</h3>
        <div style="border:1px solid #e2e8f0;border-radius:10px;overflow-x:auto;margin-bottom:28px;">
            <table style="min-width:760px;width:100%;border-collapse:collapse;table-layout:auto;">
                <thead><tr style="background:#1e293b;color:#fff;">
                    <th style="padding:9px 11px;text-align:left;font-size:11px;white-space:nowrap;">Motivo</th>
                    <th style="padding:9px 11px;text-align:left;font-size:11px;white-space:nowrap;">1a Abordagem</th>
                    <th style="padding:9px 11px;text-align:left;font-size:11px;white-space:nowrap;">2a Abordagem (escalada)</th>
                    <th style="padding:9px 11px;text-align:left;font-size:11px;white-space:nowrap;">Ultimo recurso</th>
                </tr></thead>
                <tbody>${cenHtml}</tbody>
            </table>
        </div>
        <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 6px;">Regua de Cobranca (Dunning)</h3>
        <p style="font-size:11px;color:#64748b;margin:0 0 8px;">Ate 40% do churn e involuntario (inadimplencia). Dunning automatizado recupera ate 70% dos pagamentos em atraso.</p>
        <div style="border:1px solid #e2e8f0;border-radius:10px;overflow-x:auto;margin-bottom:28px;">
            <table style="min-width:500px;width:100%;border-collapse:collapse;table-layout:auto;">
                <thead><tr style="background:#1e293b;color:#fff;">
                    <th style="padding:7px 11px;text-align:left;font-size:11px;white-space:nowrap;">Dia</th>
                    <th style="padding:7px 11px;text-align:left;font-size:11px;white-space:nowrap;">Acao</th>
                    <th style="padding:7px 11px;text-align:left;font-size:11px;white-space:nowrap;">Canal</th>
                </tr></thead>
                <tbody>${dunHtml}</tbody>
            </table>
        </div>
        <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 10px;">Quick Start — Maior ROI para ISPs Pequenos</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:8px;margin-bottom:20px;">${qsHtml}</div>
        <p style="font-size:10px;color:#94a3b8;text-align:center;padding-top:8px;border-top:1px solid #f1f5f9;">
            Fontes: Sonar Software, TTEC, CustomerGauge, GoContact, Alloyal, Mundiale AI, MK Solutions — pesquisa consolidada 2025
        </p>
    </div>`;
}

// =====================================================================
// ABA: PADRÃO TEMPORAL DE SUPORTE
// =====================================================================

async function renderTemporalSuporteTab() {
    const tabContent = document.getElementById('tab-content-temporal_suporte');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div class="flex flex-wrap justify-center gap-4 mb-6 items-end">
            <div class="flex flex-col items-center">
                <label for="tempCityFilter" class="text-gray-700 font-medium mb-1 text-sm">Filtrar por Cidade:</label>
                <select id="tempCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm min-w-[180px]">
                    <option value="">Todas as Cidades</option>
                </select>
            </div>
            <div class="flex flex-col items-center">
                <label for="tempPeriodFilter" class="text-gray-700 font-medium mb-1 text-sm">Período:</label>
                <select id="tempPeriodFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="30">Últimos 30 dias</option>
                    <option value="90" selected>Últimos 90 dias</option>
                    <option value="180">Últimos 180 dias</option>
                    <option value="365">Último Ano</option>
                </select>
            </div>
            <div class="flex flex-col items-center">
                <label for="tempTypeFilter" class="text-gray-700 font-medium mb-1 text-sm">Tipo de Ticket:</label>
                <select id="tempTypeFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="both" selected>OS + Atendimentos</option>
                    <option value="os">Somente OS</option>
                    <option value="atendimento">Somente Atendimentos</option>
                </select>
            </div>
            <button id="btnFilterTemporal" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="temp-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="temp-charts-area" class="grid-stack"></div>
    `;

    tabContent.querySelector('#btnFilterTemporal').addEventListener('click', () => {
        const city = tabContent.querySelector('#tempCityFilter').value;
        const period = tabContent.querySelector('#tempPeriodFilter').value;
        const type = tabContent.querySelector('#tempTypeFilter').value;
        fetchTemporalSuporteData(city, period, type);
    });

    await fetchTemporalSuporteData();
}

async function fetchTemporalSuporteData(city = '', period = '90', ticket_type = 'both') {
    const chartsArea = document.getElementById('temp-charts-area');
    const kpiRow = document.getElementById('temp-kpi-row');
    if (!chartsArea || !kpiRow) return;

    if (chartsArea.gridstack) chartsArea.gridstack.destroy(false);
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';
    kpiRow.innerHTML = '';

    try {
        const params = new URLSearchParams({ city, period, ticket_type });
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/temporal_support?${params}`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar dados temporais.'));
        const data = await response.json();

        const cityFilter = document.getElementById('tempCityFilter');
        if (cityFilter && data.cities && cityFilter.options.length <= 1) {
            utils.populateCityFilter(cityFilter, data.cities, city);
        }

        // KPIs
        const kpis = data.kpis || {};
        kpiRow.innerHTML = `
            <div class="summary-card bg-blue-50"><p class="summary-card-title">Total de Tickets</p><p class="summary-card-value text-blue-700">${(kpis.total_tickets || 0).toLocaleString('pt-BR')}</p></div>
            <div class="summary-card bg-purple-50"><p class="summary-card-title">Hora de Pico</p><p class="summary-card-value text-purple-700">${kpis.peak_hour || '--'}</p></div>
            <div class="summary-card bg-orange-50"><p class="summary-card-title">Dia de Maior Volume</p><p class="summary-card-value text-orange-700" style="font-size:1.4rem">${kpis.peak_weekday || '--'}</p></div>
            <div class="summary-card bg-red-50"><p class="summary-card-title">Assunto Mais Frequente</p><p class="summary-card-value text-red-700" style="font-size:1rem;padding-top:8px">${kpis.top_subject || '--'}</p></div>
        `;

        chartsArea.innerHTML = '';

        const grid = GridStack.init({ cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false }, chartsArea);

        if (!grid) return;

        // Gráfico 1: Volume por hora
        const hourLabels = (data.by_hour || []).map(d => d.label);
        const hourData = (data.by_hour || []).map(d => d.total);
        grid.addWidget({ w: 12, h: 7, x: 0, y: 0, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Volume de Tickets por Hora do Dia</h3></div><div class="chart-canvas-container"><canvas id="tempHourChart"></canvas></div></div>` });

        // Gráfico 2: Volume por dia da semana
        const weekLabels = (data.by_weekday || []).map(d => d.label);
        const weekData = (data.by_weekday || []).map(d => d.total);
        grid.addWidget({ w: 6, h: 7, x: 0, y: 7, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Volume por Dia da Semana</h3></div><div class="chart-canvas-container"><canvas id="tempWeekChart"></canvas></div></div>` });

        // Gráfico 3: Top assuntos
        const subjLabels = (data.top_subjects || []).map(d => d.assunto);
        const subjData = (data.top_subjects || []).map(d => d.total);
        grid.addWidget({ w: 6, h: 7, x: 6, y: 7, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Top 10 Assuntos</h3></div><div class="chart-canvas-container"><canvas id="tempSubjChart"></canvas></div></div>` });

        // Gráfico 4: Tendência semanal
        const trendLabels = (data.weekly_trend || []).map(d => d.week);
        const trendData = (data.weekly_trend || []).map(d => d.total);
        grid.addWidget({ w: 12, h: 7, x: 0, y: 14, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Tendência Semanal de Abertura (últimas 12 semanas)</h3></div><div class="chart-canvas-container"><canvas id="tempTrendChart"></canvas></div></div>` });

        setTimeout(() => {
            renderChart('tempHourChart', 'bar_vertical', hourLabels, [{ label: 'Tickets', data: hourData }], 'Volume por Hora', { formatterType: 'number' });
            renderChart('tempWeekChart', 'bar_vertical', weekLabels, [{ label: 'Tickets', data: weekData }], 'Volume por Dia da Semana', { formatterType: 'number' });
            renderChart('tempSubjChart', 'bar_horizontal', subjLabels, [{ label: 'Tickets', data: subjData }], 'Top 10 Assuntos', { formatterType: 'number' });
            renderChart('tempTrendChart', 'line', trendLabels, [{ label: 'Tickets por Semana', data: trendData }], 'Tendência Semanal', { formatterType: 'number' });
        }, 50);

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// =====================================================================
// ABA: COMPORTAMENTO FINANCEIRO
// =====================================================================

async function renderFinanceiroAtivoTab() {
    const tabContent = document.getElementById('tab-content-financeiro_ativo');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div class="flex flex-wrap justify-center gap-4 mb-6 items-end">
            <div class="flex flex-col items-center">
                <label for="finCityFilter" class="text-gray-700 font-medium mb-1 text-sm">Filtrar por Cidade:</label>
                <select id="finCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm min-w-[180px]">
                    <option value="">Todas as Cidades</option>
                </select>
            </div>
            <div class="flex flex-col items-center">
                <label for="finPeriodFilter" class="text-gray-700 font-medium mb-1 text-sm">Período de Referência:</label>
                <select id="finPeriodFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="3">Últimos 3 meses</option>
                    <option value="6" selected>Últimos 6 meses</option>
                    <option value="12">Último Ano</option>
                </select>
            </div>
            <button id="btnFilterFinanceiro" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="fin-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="fin-charts-area" class="grid-stack"></div>
    `;

    tabContent.querySelector('#btnFilterFinanceiro').addEventListener('click', () => {
        const city = tabContent.querySelector('#finCityFilter').value;
        const period = tabContent.querySelector('#finPeriodFilter').value;
        fetchFinanceiroAtivoData(city, period);
    });

    await fetchFinanceiroAtivoData();
}

async function fetchFinanceiroAtivoData(city = '', period_months = '6') {
    const chartsArea = document.getElementById('fin-charts-area');
    const kpiRow = document.getElementById('fin-kpi-row');
    if (!chartsArea || !kpiRow) return;

    if (chartsArea.gridstack) chartsArea.gridstack.destroy(false);
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';
    kpiRow.innerHTML = '';

    try {
        const params = new URLSearchParams({ city, period_months });
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/financial_behavior?${params}`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar dados financeiros.'));
        const data = await response.json();

        const cityFilter = document.getElementById('finCityFilter');
        if (cityFilter && data.cities && cityFilter.options.length <= 1) {
            utils.populateCityFilter(cityFilter, data.cities, city);
        }

        const kpis = data.kpis || {};
        const fmtBRL = v => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        kpiRow.innerHTML = `
            <div class="summary-card bg-green-50"><p class="summary-card-title">Faturas Pagas em Dia</p><p class="summary-card-value text-green-700">${(kpis.pct_em_dia || 0).toFixed(1)}%</p></div>
            <div class="summary-card bg-red-50"><p class="summary-card-title">Receita em Risco</p><p class="summary-card-value text-red-700" style="font-size:1.5rem">${fmtBRL(kpis.valor_em_risco)}</p></div>
            <div class="summary-card bg-orange-50"><p class="summary-card-title">Média de Atraso</p><p class="summary-card-value text-orange-700">${(kpis.media_atraso || 0).toFixed(0)} dias</p></div>
            <div class="summary-card bg-purple-50"><p class="summary-card-title">Clientes c/ 2+ Faturas Vencidas</p><p class="summary-card-value text-purple-700">${(kpis.clientes_multiplos_vencidos || 0).toLocaleString('pt-BR')}</p></div>
        `;

        chartsArea.innerHTML = '';

        const grid = GridStack.init({ cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false }, chartsArea);
        if (!grid) return;

        // Gráfico 1: Distribuição de status (doughnut)
        const statusLabels = (data.status_distribution || []).map(d => d.status);
        const statusQtd = (data.status_distribution || []).map(d => d.qtd);
        grid.addWidget({ w: 5, h: 8, x: 0, y: 0, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Status das Faturas (Ativos)</h3></div><div class="chart-canvas-container"><canvas id="finStatusChart"></canvas></div></div>` });

        // Gráfico 2: Receita em risco por cidade
        const cidadeLabels = (data.risco_por_cidade || []).map(d => d.cidade);
        const cidadeValores = (data.risco_por_cidade || []).map(d => d.valor_vencido);
        grid.addWidget({ w: 7, h: 8, x: 5, y: 0, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Receita em Risco por Cidade (R$)</h3></div><div class="chart-canvas-container"><canvas id="finCidadeChart"></canvas></div></div>` });

        // Gráfico 3: Distribuição de atraso
        const atrasoLabels = (data.distribuicao_atraso || []).map(d => d.faixa);
        const atrasoData = (data.distribuicao_atraso || []).map(d => d.clientes);
        grid.addWidget({ w: 6, h: 7, x: 0, y: 8, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Distribuição de Atraso por Cliente</h3></div><div class="chart-canvas-container"><canvas id="finAtrasoChart"></canvas></div></div>` });

        // Gráfico 4: Concentração de pagamento por dia do mês
        const diaLabels = (data.concentracao_pagamento || []).map(d => `Dia ${d.dia_mes}`);
        const diaData = (data.concentracao_pagamento || []).map(d => d.pagamentos);
        grid.addWidget({ w: 6, h: 7, x: 6, y: 8, content: `<div class="grid-stack-item-content"><div class="chart-container-header"><h3 class="chart-title">Concentração de Pagamentos por Dia do Mês</h3></div><div class="chart-canvas-container"><canvas id="finDiaChart"></canvas></div></div>` });

        setTimeout(() => {
            renderChart('finStatusChart', 'doughnut', statusLabels, [{ label: 'Faturas', data: statusQtd }], 'Status das Faturas', { formatterType: 'number' });
            renderChart('finCidadeChart', 'bar_horizontal', cidadeLabels, [{ label: 'Valor Vencido (R$)', data: cidadeValores }], 'Receita em Risco por Cidade', { formatterType: 'currency' });
            renderChart('finAtrasoChart', 'bar_vertical', atrasoLabels, [{ label: 'Clientes', data: atrasoData }], 'Distribuição de Atraso', { formatterType: 'number' });
            renderChart('finDiaChart', 'bar_vertical', diaLabels, [{ label: 'Pagamentos', data: diaData }], 'Concentração por Dia do Mês', { formatterType: 'number' });
        }, 50);

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// =====================================================================
// ABA: INATIVIDADE DE CONEXÃO
// =====================================================================

async function renderInatividadeTab() {
    const tabContent = document.getElementById('tab-content-inatividade');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div class="flex flex-wrap justify-center gap-4 mb-6 items-end">
            <div class="flex flex-col items-center">
                <label for="inatCityFilter" class="text-gray-700 font-medium mb-1 text-sm">Filtrar por Cidade:</label>
                <select id="inatCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm min-w-[180px]">
                    <option value="">Todas as Cidades</option>
                </select>
            </div>
            <div class="flex flex-col items-center">
                <label for="inatMinDaysFilter" class="text-gray-700 font-medium mb-1 text-sm">Inatividade Mínima:</label>
                <select id="inatMinDaysFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="1">1+ dia</option>
                    <option value="8">8+ dias</option>
                    <option value="15">15+ dias</option>
                    <option value="30">30+ dias</option>
                </select>
            </div>
            <button id="btnFilterInat" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="inat-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="inat-charts-area" class="grid-stack"></div>
    `;

    tabContent.querySelector('#btnFilterInat').addEventListener('click', () => {
        const city = tabContent.querySelector('#inatCityFilter').value;
        const min_days = tabContent.querySelector('#inatMinDaysFilter').value;
        fetchInatividadeData(city, min_days);
    });

    await fetchInatividadeData();
}

async function fetchInatividadeData(city = '', min_days = '1') {
    const chartsArea = document.getElementById('inat-charts-area');
    const kpiRow = document.getElementById('inat-kpi-row');
    if (!chartsArea || !kpiRow) return;

    if (chartsArea.gridstack) chartsArea.gridstack.destroy(false);
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';
    kpiRow.innerHTML = '';

    try {
        const params = new URLSearchParams({ city, min_days });
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/connection_inactivity?${params}`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar dados de inatividade.'));
        const data = await response.json();

        const cityFilter = document.getElementById('inatCityFilter');
        if (cityFilter && data.cities && cityFilter.options.length <= 1) {
            utils.populateCityFilter(cityFilter, data.cities, city);
        }

        const kpis = data.kpis || {};
        kpiRow.innerHTML = `
            <div class="summary-card" style="border-left:4px solid #3b82f6;">
                <div class="summary-card-label">Total Monitorados</div>
                <div class="summary-card-value" style="color:#3b82f6;">${(kpis.total_monitorados || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #ef4444;">
                <div class="summary-card-label">Inativos 30+ dias</div>
                <div class="summary-card-value" style="color:#ef4444;">${(kpis.total_inativos_30d || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #f97316;">
                <div class="summary-card-label">Inativos 15+ dias</div>
                <div class="summary-card-value" style="color:#f97316;">${(kpis.total_inativos_15d || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #8b5cf6;">
                <div class="summary-card-label">Média de Inatividade</div>
                <div class="summary-card-value" style="color:#8b5cf6;">${(kpis.media_dias_inativo || 0).toFixed(0)} dias</div>
            </div>
        `;

        chartsArea.innerHTML = '';

        const grid = GridStack.init({ cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false }, chartsArea);
        if (!grid) return;

        // Chart 1: Distribuição por Período de Inatividade
        if (data.distribuicao?.length) {
            grid.addWidget({
                w: 6, h: 7, x: 0, y: 0,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Distribuição por Período de Inatividade</h3></div>
                    <div class="chart-canvas-container"><canvas id="inatHoraChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('inatHoraChart', 'bar_vertical',
                    data.distribuicao.map(d => d.faixa),
                    [{ label: 'Clientes', data: data.distribuicao.map(d => d.clientes) }],
                    'Distribuição por Período de Inatividade',
                    { formatterType: 'number' }
                );
            }, 50);
        }

        // Chart 2: Cidades com Mais Clientes Inativos (14+ dias)
        if (data.por_cidade?.length) {
            grid.addWidget({
                w: 6, h: 7, x: 6, y: 0,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Cidades com Mais Clientes Inativos (14+ dias)</h3></div>
                    <div class="chart-canvas-container"><canvas id="inatCidadeChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('inatCidadeChart', 'bar_horizontal',
                    data.por_cidade.map(d => d.cidade),
                    [{ label: 'Inativos', data: data.por_cidade.map(d => d.inativos) }],
                    'Cidades com Mais Clientes Inativos',
                    { formatterType: 'number' }
                );
            }, 50);
        }

        // Table: Lista dos clientes mais inativos
        if (data.lista_inativos?.length) {
            const rows = data.lista_inativos.map((r, i) => {
                const digits = (r.whatsapp || '').replace(/\D/g, '');
                const wa = digits ? (digits.startsWith('55') ? digits : '55' + digits) : null;
                const waLink = wa
                    ? `<a href="https://wa.me/${wa}" target="_blank" class="text-green-600 font-bold">💬</a>`
                    : '-';
                return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px 10px;font-size:.8rem;font-weight:600;">${r.contrato || ''}</td>
                    <td style="padding:6px 10px;font-size:.8rem;">${r.cliente || ''}</td>
                    <td style="padding:6px 10px;font-size:.8rem;">${r.cidade || ''}</td>
                    <td style="padding:6px 10px;font-size:.8rem;color:#dc2626;font-weight:700;">${r.dias_inativo || 0}d</td>
                    <td style="padding:6px 10px;font-size:.8rem;font-family:monospace;">${r.login || ''}</td>
                    <td style="padding:6px 10px;font-size:.8rem;">${r.telefone || '-'}</td>
                    <td style="padding:6px 10px;font-size:.8rem;text-align:center;">${waLink}</td>
                </tr>`;
            }).join('');

            const tableHtml = `
                <div class="grid-stack-item-content" style="overflow-y:auto;">
                    <h3 style="font-size:.85rem;font-weight:700;color:#1e293b;padding:10px 12px 4px;">Lista dos Clientes Mais Inativos</h3>
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
                            <thead><tr style="background:#1e293b;color:#fff;">
                                <th style="padding:7px 10px;text-align:left;white-space:nowrap;">Contrato</th>
                                <th style="padding:7px 10px;text-align:left;white-space:nowrap;">Cliente</th>
                                <th style="padding:7px 10px;text-align:left;white-space:nowrap;">Cidade</th>
                                <th style="padding:7px 10px;text-align:left;white-space:nowrap;">Dias Inativo</th>
                                <th style="padding:7px 10px;text-align:left;white-space:nowrap;">Login</th>
                                <th style="padding:7px 10px;text-align:left;white-space:nowrap;">Telefone</th>
                                <th style="padding:7px 10px;text-align:center;white-space:nowrap;">WhatsApp</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;

            grid.addWidget({ w: 12, h: 10, x: 0, y: 7, id: 'inatListaTable', content: tableHtml });
        }

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// =====================================================================
// ABA: SAZONALIDADE DE CANCELAMENTOS
// =====================================================================

async function renderSazonalidadeCanc() {
    const tabContent = document.getElementById('tab-content-sazonalidade_canc');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div class="flex flex-wrap justify-center gap-4 mb-6 items-end">
            <div class="flex flex-col items-center">
                <label for="sazCityFilter" class="text-gray-700 font-medium mb-1 text-sm">Filtrar por Cidade:</label>
                <select id="sazCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm min-w-[180px]">
                    <option value="">Todas as Cidades</option>
                </select>
            </div>
            <button id="btnFilterSaz" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="saz-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="saz-charts-area" class="grid-stack"></div>
    `;

    tabContent.querySelector('#btnFilterSaz').addEventListener('click', () => {
        const city = tabContent.querySelector('#sazCityFilter').value;
        fetchSazonalidadeCancData(city);
    });

    await fetchSazonalidadeCancData();
}

async function fetchSazonalidadeCancData(city = '') {
    const chartsArea = document.getElementById('saz-charts-area');
    const kpiRow = document.getElementById('saz-kpi-row');
    if (!chartsArea || !kpiRow) return;

    if (chartsArea.gridstack) chartsArea.gridstack.destroy(false);
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';
    kpiRow.innerHTML = '';

    try {
        const params = new URLSearchParams({ city });
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/cancellation_seasonality?${params}`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar sazonalidade de cancelamentos.'));
        const data = await response.json();

        const cityFilter = document.getElementById('sazCityFilter');
        if (cityFilter && data.cities && cityFilter.options.length <= 1) {
            utils.populateCityFilter(cityFilter, data.cities, city);
        }

        const kpis = data.kpis || {};
        kpiRow.innerHTML = `
            <div class="summary-card" style="border-left:4px solid #ef4444;">
                <div class="summary-card-title">Total Cancelamentos</div>
                <div class="summary-card-value" style="color:#ef4444;">${(kpis.total_cancelamentos || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #f97316;">
                <div class="summary-card-title">Mês de Maior Cancelamento</div>
                <div class="summary-card-value" style="color:#f97316;font-size:1.1rem;">${kpis.mes_pico || '--'}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #8b5cf6;">
                <div class="summary-card-title">Dia da Semana Pico</div>
                <div class="summary-card-value" style="color:#8b5cf6;font-size:1.1rem;">${kpis.dia_semana_pico || '--'}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #6b7280;">
                <div class="summary-card-title">Permanência Média até Cancelar</div>
                <div class="summary-card-value" style="color:#6b7280;">${(kpis.media_permanencia_meses || 0).toFixed(1)} meses</div>
            </div>
        `;

        chartsArea.innerHTML = '';

        const grid = GridStack.init({ cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false }, chartsArea);
        if (!grid) return;

        // Chart 1: Cancelamentos por Mês do Ano
        if (data.por_mes?.length) {
            grid.addWidget({
                w: 12, h: 7, x: 0, y: 0,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Cancelamentos por Mês do Ano</h3></div>
                    <div class="chart-canvas-container"><canvas id="sazMesChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('sazMesChart', 'bar_vertical',
                    data.por_mes.map(d => d.mes),
                    [{ label: 'Cancelamentos', data: data.por_mes.map(d => d.total) }],
                    'Cancelamentos por Mês do Ano',
                    { formatterType: 'number' }
                );
            }, 50);
        }

        // Chart 2: Cancelamentos por Dia da Semana
        if (data.por_dia_semana?.length) {
            grid.addWidget({
                w: 6, h: 7, x: 0, y: 7,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Cancelamentos por Dia da Semana</h3></div>
                    <div class="chart-canvas-container"><canvas id="sazDiaChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('sazDiaChart', 'bar_vertical',
                    data.por_dia_semana.map(d => d.dia),
                    [{ label: 'Cancelamentos', data: data.por_dia_semana.map(d => d.total) }],
                    'Cancelamentos por Dia da Semana',
                    { formatterType: 'number' }
                );
            }, 50);
        }

        // Chart 3: Permanência no Cancelamento
        if (data.por_permanencia?.length) {
            grid.addWidget({
                w: 6, h: 7, x: 6, y: 7,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Permanência no Cancelamento</h3></div>
                    <div class="chart-canvas-container"><canvas id="sazPermChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('sazPermChart', 'bar_horizontal',
                    data.por_permanencia.map(d => d.faixa),
                    [{ label: 'Cancelamentos', data: data.por_permanencia.map(d => d.total) }],
                    'Permanência no Cancelamento',
                    { formatterType: 'number' }
                );
            }, 50);
        }

        // Chart 4: Tendência Anual de Cancelamentos
        if (data.por_ano?.length) {
            grid.addWidget({
                w: 12, h: 6, x: 0, y: 14,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Tendência Anual de Cancelamentos</h3></div>
                    <div class="chart-canvas-container"><canvas id="sazAnoChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('sazAnoChart', 'line',
                    data.por_ano.map(d => String(d.ano)),
                    [{ label: 'Cancelamentos', data: data.por_ano.map(d => d.total) }],
                    'Tendência Anual de Cancelamentos',
                    { formatterType: 'number' }
                );
            }, 50);
        }

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// =====================================================================
// ABA: CAUSAS DE QUEDA DE SINAL
// =====================================================================

async function renderCausaQuedaTab() {
    const tabContent = document.getElementById('tab-content-causa_queda');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div id="cq-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="cq-charts-area" class="grid-stack"></div>
    `;

    await fetchCausaQuedaData();
}

async function fetchCausaQuedaData() {
    const chartsArea = document.getElementById('cq-charts-area');
    const kpiRow = document.getElementById('cq-kpi-row');
    if (!chartsArea || !kpiRow) return;

    if (chartsArea.gridstack) chartsArea.gridstack.destroy(false);
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';
    kpiRow.innerHTML = '';

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/signal_causes`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar monitoramento de ONUs.'));
        const data = await response.json();

        const kpis = data.kpis || {};
        kpiRow.innerHTML = `
            <div class="summary-card" style="border-left:4px solid #3b82f6;">
                <div class="summary-card-title">Total de ONUs</div>
                <div class="summary-card-value" style="color:#3b82f6;">${(kpis.total_onus || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #22c55e;">
                <div class="summary-card-title">Com Sinal</div>
                <div class="summary-card-value" style="color:#22c55e;">${(kpis.com_sinal || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #6b7280;">
                <div class="summary-card-title">Sem Sinal (offline)</div>
                <div class="summary-card-value" style="color:#6b7280;">${(kpis.sem_sinal || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-card" style="border-left:4px solid #ef4444;">
                <div class="summary-card-title">Sinal Crítico (< -27dBm)</div>
                <div class="summary-card-value" style="color:#ef4444;">${(kpis.pct_critico || 0).toFixed(1)}%</div>
            </div>
        `;

        chartsArea.innerHTML = '';
        const grid = GridStack.init({ cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false }, chartsArea);
        if (!grid) return;

        // Chart 1: Qualidade de Sinal (doughnut)
        if (data.qualidade_labels?.length) {
            grid.addWidget({
                w: 5, h: 8, x: 0, y: 0,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Qualidade de Sinal RX</h3></div>
                    <div class="chart-canvas-container"><canvas id="cqQualChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('cqQualChart', 'doughnut',
                    data.qualidade_labels,
                    [{ label: 'ONUs', data: data.qualidade_vals,
                       backgroundColor: ['#22c55e', '#84cc16', '#f97316', '#ef4444'] }],
                    'Qualidade de Sinal RX',
                    { formatterType: 'number' }
                );
            }, 50);
        }

        // Chart 2: Tipos de ONU (bar)
        if (data.por_onu_tipo?.length) {
            grid.addWidget({
                w: 7, h: 8, x: 5, y: 0,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">Distribuição por Tipo de ONU</h3></div>
                    <div class="chart-canvas-container"><canvas id="cqOnuChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('cqOnuChart', 'bar_vertical',
                    data.por_onu_tipo.map(d => d.tipo),
                    [{ label: 'Quantidade', data: data.por_onu_tipo.map(d => d.total) }],
                    'Distribuição por Tipo de ONU',
                    { formatterType: 'number' }
                );
            }, 50);
        }

        // Chart 3: ONUs por OLT com sinal médio
        if (data.por_olt?.length) {
            grid.addWidget({
                w: 12, h: 8, x: 0, y: 8,
                content: `<div class="grid-stack-item-content">
                    <div class="chart-container-header"><h3 class="chart-title">ONUs por OLT — Total e Sinal Médio (dBm)</h3></div>
                    <div class="chart-canvas-container"><canvas id="cqOltChart"></canvas></div>
                </div>`
            });
            setTimeout(() => {
                renderChart('cqOltChart', 'bar_vertical',
                    data.por_olt.map(d => d.olt),
                    [
                        { label: 'Total ONUs',   data: data.por_olt.map(d => d.total),   yAxisID: 'y' },
                        { label: 'Sinal Médio',  data: data.por_olt.map(d => d.avg_rx),  type: 'line', yAxisID: 'y1',
                          borderColor: '#ef4444', backgroundColor: 'transparent', pointRadius: 4 },
                    ],
                    'ONUs por OLT — Total e Sinal Médio',
                    { formatterType: 'number', dualAxis: true, y1Label: 'dBm' }
                );
            }, 50);
        }

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// =====================================================================
// ABA: LISTA DE RETENÇÃO ATIVA
// =====================================================================

async function renderListaRetencaoTab() {
    const tabContent = document.getElementById('tab-content-lista_retencao');
    if (!tabContent) return;

    let _retCurrentPage = 1;
    let _retFilters = { city: '', risk_level: '', min_score: 25 };

    tabContent.innerHTML = `
        <div id="ret-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div class="flex flex-wrap justify-center gap-4 mb-4 items-end">
            <div>
                <label class="text-sm font-medium text-gray-700 mr-1">Cidade:</label>
                <select id="retCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none sm:text-sm min-w-[160px]">
                    <option value="">Todas</option>
                </select>
            </div>
            <div>
                <label class="text-sm font-medium text-gray-700 mr-1">Nível de Risco:</label>
                <select id="retRiskFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none sm:text-sm">
                    <option value="">Todos</option>
                    <option value="Altíssimo">🚨 Altíssimo</option>
                    <option value="Alto">🔴 Alto</option>
                    <option value="Médio">🟠 Médio</option>
                    <option value="Baixo">🟡 Baixo</option>
                </select>
            </div>
            <button id="btnFilterRet" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
            <button id="btnExportRet" class="bg-green-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-green-700 transition font-semibold text-sm h-10">⬇ Baixar CSV</button>
        </div>
        <div id="ret-table-area"></div>
    `;

    const RISK_CLS = {
        'Altíssimo': 'background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;',
        'Alto':      'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
        'Médio':     'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
        'Baixo':     'background:#fefce8;color:#ca8a04;border:1px solid #fde047;',
    };

    function buildRetUrl(page) {
        const rowsPerPage = 50;
        const offset = (page - 1) * rowsPerPage;
        const p = new URLSearchParams({
            city: _retFilters.city,
            risk_level: _retFilters.risk_level,
            min_score: _retFilters.min_score,
            limit: rowsPerPage,
            offset
        });
        return `${state.API_BASE_URL}/api/behavior/contact_list?${p}`;
    }

    async function fetchAndRenderRetTable(page) {
        _retCurrentPage = page;
        const container = document.getElementById('ret-table-area');
        if (!container) return;
        container.innerHTML = '<div class="loading-spinner"></div>';

        try {
            const response = await fetch(buildRetUrl(page));
            if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar lista de retenção.'));
            const result = await response.json();

            // KPI tiles (on first page only to avoid re-render noise)
            const kpiRow = document.getElementById('ret-kpi-row');
            if (kpiRow && result.summary && page === 1) {
                const s = result.summary;
                kpiRow.innerHTML = `
                    <div class="summary-card" style="border-left:4px solid #7c3aed;cursor:pointer;" onclick="document.getElementById('retRiskFilter').value='Altíssimo';document.getElementById('btnFilterRet').click()">
                        <div class="summary-card-title">🚨 Altíssimo Risco</div>
                        <div class="summary-card-value" style="color:#7c3aed;">${s.altissimo || 0}</div>
                        <div style="font-size:0.7rem;color:#9ca3af;">Score &gt; 160 · clique para filtrar</div>
                    </div>
                    <div class="summary-card" style="border-left:4px solid #ef4444;cursor:pointer;" onclick="document.getElementById('retRiskFilter').value='Alto';document.getElementById('btnFilterRet').click()">
                        <div class="summary-card-title">🔴 Alto Risco</div>
                        <div class="summary-card-value" style="color:#ef4444;">${s.alto || 0}</div>
                        <div style="font-size:0.7rem;color:#9ca3af;">Score 60–160 · clique para filtrar</div>
                    </div>
                    <div class="summary-card" style="border-left:4px solid #f97316;cursor:pointer;" onclick="document.getElementById('retRiskFilter').value='Médio';document.getElementById('btnFilterRet').click()">
                        <div class="summary-card-title">🟠 Médio Risco</div>
                        <div class="summary-card-value" style="color:#f97316;">${s.medio || 0}</div>
                        <div style="font-size:0.7rem;color:#9ca3af;">Score 25–59 · clique para filtrar</div>
                    </div>
                    <div class="summary-card" style="border-left:4px solid #eab308;cursor:pointer;" onclick="document.getElementById('retRiskFilter').value='Baixo';document.getElementById('btnFilterRet').click()">
                        <div class="summary-card-title">🟡 Baixo Risco</div>
                        <div class="summary-card-value" style="color:#eab308;">${s.baixo || 0}</div>
                        <div style="font-size:0.7rem;color:#9ca3af;">Score 10–24 · clique para filtrar</div>
                    </div>
                `;
            }

            // City filter on first load
            const cityFilter = document.getElementById('retCityFilter');
            if (cityFilter && result.cities?.length && cityFilter.options.length <= 1) {
                utils.populateCityFilter(cityFilter, result.cities, _retFilters.city);
            }

            const rowsPerPage = 50;
            const n = result.total_rows || 0;
            const totalPages = Math.ceil(n / rowsPerPage);

            let tableHtml = '<p class="text-center text-gray-500 mt-4">Nenhum cliente encontrado para os filtros selecionados.</p>';
            if (result.data?.length > 0) {
                const rows = result.data.map((r, i) => {
                    const digits = (r.whatsapp || '').replace(/\D/g, '');
                    const wa = digits ? (digits.startsWith('55') ? digits : '55' + digits) : null;
                    const waCell = wa
                        ? `<a href="https://wa.me/${wa}" target="_blank" class="text-green-600 font-bold">💬 WhatsApp</a>`
                        : '-';
                    const riskStyle = RISK_CLS[r.risco] || '';
                    return `<tr data-contrato="${r.contrato}" style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};border-bottom:1px solid #f1f5f9;cursor:pointer;" title="Clique para ver detalhes">
                        <td style="padding:6px 10px;font-size:.78rem;color:#6b7280;">${(page - 1) * rowsPerPage + i + 1}</td>
                        <td style="padding:6px 10px;font-size:.78rem;font-family:monospace;">#${r.contrato || ''}</td>
                        <td style="padding:6px 10px;font-size:.8rem;font-weight:500;">${r.cliente || ''}</td>
                        <td style="padding:6px 10px;font-size:.78rem;">${r.cidade || ''}</td>
                        <td style="padding:6px 10px;">
                            <span style="padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;white-space:nowrap;${riskStyle}">${r.risco || ''}</span>
                        </td>
                        <td style="padding:6px 10px;font-size:.8rem;font-weight:700;font-family:monospace;">${r.score || 0}</td>
                        <td style="padding:6px 10px;font-size:.78rem;${r.fat_vencidas > 0 ? 'color:#dc2626;font-weight:700;' : ''}">${r.fat_vencidas || 0}</td>
                        <td style="padding:6px 10px;font-size:.78rem;${r.dias_vencido > 0 ? 'color:#dc2626;' : ''}">${r.dias_vencido > 0 ? r.dias_vencido + 'd' : '-'}</td>
                        <td style="padding:6px 10px;font-size:.78rem;">${r.atend_30d || 0}</td>
                        <td style="padding:6px 10px;font-size:.78rem;${r.sem_conexao > 0 ? 'color:#ca8a04;' : ''}">${r.sem_conexao > 0 ? r.sem_conexao + 'd' : '-'}</td>
                        <td style="padding:6px 10px;font-size:.78rem;">${r.telefone ? `<a href="tel:${r.telefone}">${r.telefone}</a>` : '-'}</td>
                        <td style="padding:6px 10px;font-size:.78rem;">${waCell}</td>
                    </tr>`;
                }).join('');

                tableHtml = `
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
                            <thead><tr style="background:#1e293b;color:#fff;position:sticky;top:0;">
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">#</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Contrato</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Cliente</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Cidade</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Risco</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Score</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Fat. Vencidas</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Dias Vencido</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Atend. 30d</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Sem Conexão</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Telefone</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">WhatsApp</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;
            }

            let paginationHtml = '';
            if (totalPages > 1) {
                paginationHtml = `
                    <div class="pagination-controls flex justify-center items-center gap-2 mt-4">
                        <button class="ret-page-btn bg-gray-200 px-3 py-1 rounded disabled:opacity-50"
                                data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
                        <span class="text-sm text-gray-500">Página ${page} de ${totalPages} · ${n.toLocaleString('pt-BR')} registros</span>
                        <button class="ret-page-btn bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
                                data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Próxima</button>
                    </div>`;
            } else if (n > 0) {
                paginationHtml = `<p class="text-sm text-gray-400 mt-2 text-center">${n.toLocaleString('pt-BR')} registros</p>`;
            }

            container.innerHTML = `<div class="border rounded-lg overflow-hidden"><div style="overflow-y:auto;max-height:560px;">${tableHtml}</div></div>${paginationHtml}`;
            container.querySelectorAll('.ret-page-btn').forEach(btn => {
                btn.addEventListener('click', () => fetchAndRenderRetTable(parseInt(btn.dataset.page)));
            });

        } catch (err) {
            const container = document.getElementById('ret-table-area');
            if (container) container.innerHTML = `<p class="text-red-500 p-4">${err.message}</p>`;
        }
    }

    // Delegated click → modal de detalhes
    tabContent.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-contrato]');
        if (tr && typeof showClientDetail === 'function') showClientDetail(tr.dataset.contrato);
    });

    // Filtrar button
    tabContent.querySelector('#btnFilterRet').addEventListener('click', () => {
        _retFilters.city       = document.getElementById('retCityFilter')?.value || '';
        _retFilters.risk_level = document.getElementById('retRiskFilter')?.value || '';
        fetchAndRenderRetTable(1);
    });

    // Export CSV button
    tabContent.querySelector('#btnExportRet').addEventListener('click', () => {
        const p = new URLSearchParams({
            city: _retFilters.city,
            risk_level: _retFilters.risk_level,
            min_score: _retFilters.min_score,
            limit: 5000,
            offset: 0
        });
        window.open(`${state.API_BASE_URL}/api/behavior/contact_list?${p}`);
    });

    await fetchAndRenderRetTable(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Alertas de Ação
// ─────────────────────────────────────────────────────────────────────────────
async function renderAlertasAcaoTab() {
    const tabContent = document.getElementById('tab-content-alertas_acao');
    if (!tabContent) return;

    let _alertaCurrentPage = 1;
    let _alertaFilters = { city: '', tier: '', cliente: '' };

    const TIER_STYLE = {
        'Crítico': 'background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;',
        'Alto':    'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
        'Médio':   'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
        'Baixo':   'background:#fefce8;color:#ca8a04;border:1px solid #fde047;',
    };

    tabContent.innerHTML = `
        <div id="alerta-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div class="flex flex-wrap justify-center gap-4 mb-4 items-end">
            <div>
                <label class="text-sm font-medium text-gray-700 mr-1">Cliente:</label>
                <input type="text" id="alertaClienteFilter" placeholder="Nome do cliente..."
                    class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none sm:text-sm min-w-[200px]">
            </div>
            <div>
                <label class="text-sm font-medium text-gray-700 mr-1">Cidade:</label>
                <select id="alertaCityFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none sm:text-sm min-w-[160px]">
                    <option value="">Todas</option>
                </select>
            </div>
            <div>
                <label class="text-sm font-medium text-gray-700 mr-1">Urgência:</label>
                <select id="alertaTierFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none sm:text-sm">
                    <option value="">Todos</option>
                    <option value="Crítico">Crítico</option>
                    <option value="Alto">Alto</option>
                    <option value="Médio">Médio</option>
                    <option value="Baixo">Baixo</option>
                </select>
            </div>
            <button id="btnFilterAlerta" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="alerta-table-area"></div>
    `;

    async function fetchAndRenderAlertaTable(page) {
        _alertaCurrentPage = page;
        const container = document.getElementById('alerta-table-area');
        if (!container) return;
        container.innerHTML = '<div class="loading-spinner"></div>';

        const rowsPerPage = 50;
        const offset = (page - 1) * rowsPerPage;
        const p = new URLSearchParams({
            city:    _alertaFilters.city,
            tier:    _alertaFilters.tier,
            cliente: _alertaFilters.cliente,
            limit:   rowsPerPage,
            offset
        });

        try {
            const response = await fetch(`${state.API_BASE_URL}/api/behavior/action_alerts?${p}`);
            if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar alertas de ação.'));
            const result = await response.json();

            // KPI tiles on first page
            const kpiRow = document.getElementById('alerta-kpi-row');
            if (kpiRow && result.summary && page === 1) {
                const s = result.summary;
                kpiRow.innerHTML = `
                    <div class="summary-card" style="border-left:4px solid #7c3aed;">
                        <div class="summary-card-title">Crítico</div>
                        <div class="summary-card-value" style="color:#7c3aed;">${s.critico || 0}</div>
                    </div>
                    <div class="summary-card" style="border-left:4px solid #ef4444;">
                        <div class="summary-card-title">Alto</div>
                        <div class="summary-card-value" style="color:#ef4444;">${s.alto || 0}</div>
                    </div>
                    <div class="summary-card" style="border-left:4px solid #f97316;">
                        <div class="summary-card-title">Médio</div>
                        <div class="summary-card-value" style="color:#f97316;">${s.medio || 0}</div>
                    </div>
                    <div class="summary-card" style="border-left:4px solid #eab308;">
                        <div class="summary-card-title">Baixo</div>
                        <div class="summary-card-value" style="color:#eab308;">${s.baixo || 0}</div>
                    </div>
                `;
            }

            // Populate city filter on first load
            const cityFilter = document.getElementById('alertaCityFilter');
            if (cityFilter && result.cities?.length && cityFilter.options.length <= 1) {
                utils.populateCityFilter(cityFilter, result.cities, _alertaFilters.city);
            }

            const n = result.total_rows || 0;
            const totalPages = Math.ceil(n / rowsPerPage);

            let tableHtml = '<p class="text-center text-gray-500 mt-4">Nenhum alerta encontrado para os filtros selecionados.</p>';
            if (result.data?.length > 0) {
                const rows = result.data.map((r, i) => {
                    const digits = (r.whatsapp || '').replace(/\D/g, '');
                    const wa = digits ? (digits.startsWith('55') ? digits : '55' + digits) : null;
                    const waCell = wa
                        ? `<a href="https://wa.me/${wa}" target="_blank" class="text-green-600 font-bold">💬 WhatsApp</a>`
                        : '-';
                    const tierStyle = TIER_STYLE[r.tier] || '';
                    const acaoText = (r.acao || '');
                    const acaoShort = acaoText.length > 80 ? acaoText.slice(0, 80) + '…' : acaoText;
                    return `<tr data-contrato="${r.contrato}" style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};border-bottom:1px solid #f1f5f9;cursor:pointer;" title="Clique para ver detalhes">
                        <td style="padding:6px 10px;font-size:.78rem;color:#6b7280;">${(page - 1) * rowsPerPage + i + 1}</td>
                        <td style="padding:6px 10px;font-size:.78rem;font-family:monospace;">#${r.contrato || ''}</td>
                        <td style="padding:6px 10px;font-size:.8rem;font-weight:500;">${r.cliente || ''}</td>
                        <td style="padding:6px 10px;font-size:.78rem;">${r.cidade || ''}</td>
                        <td style="padding:6px 10px;">
                            <span style="padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;white-space:nowrap;${tierStyle}">${r.tier || ''}</span>
                        </td>
                        <td style="padding:6px 10px;font-size:.78rem;" title="${acaoText}">${acaoShort}</td>
                        <td style="padding:6px 10px;font-size:.78rem;${r.fat_vencidas > 0 ? 'color:#dc2626;font-weight:700;' : ''}">${r.fat_vencidas || 0}</td>
                        <td style="padding:6px 10px;font-size:.78rem;${r.dias_vencido > 0 ? 'color:#dc2626;' : ''}">${r.dias_vencido > 0 ? r.dias_vencido + 'd' : '-'}</td>
                        <td style="padding:6px 10px;font-size:.78rem;${r.sem_conexao > 0 ? 'color:#ca8a04;' : ''}">${r.sem_conexao > 0 ? r.sem_conexao + 'd' : '-'}</td>
                        <td style="padding:6px 10px;font-size:.78rem;">${waCell}</td>
                    </tr>`;
                }).join('');

                tableHtml = `
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
                            <thead><tr style="background:#1e293b;color:#fff;position:sticky;top:0;">
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">#</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Contrato</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Cliente</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Cidade</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Urgência</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Ação Recomendada</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Fat. Vencidas</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Dias Venc.</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Sem Conexão</th>
                                <th style="padding:8px 10px;text-align:left;white-space:nowrap;">WhatsApp</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;
            }

            let paginationHtml = '';
            if (totalPages > 1) {
                paginationHtml = `
                    <div class="pagination-controls flex justify-center items-center gap-2 mt-4">
                        <button class="alerta-page-btn bg-gray-200 px-3 py-1 rounded disabled:opacity-50"
                                data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
                        <span class="text-sm text-gray-500">Página ${page} de ${totalPages} · ${n.toLocaleString('pt-BR')} registros</span>
                        <button class="alerta-page-btn bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
                                data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Próxima</button>
                    </div>`;
            } else if (n > 0) {
                paginationHtml = `<p class="text-sm text-gray-400 mt-2 text-center">${n.toLocaleString('pt-BR')} registros</p>`;
            }

            container.innerHTML = `<div class="border rounded-lg overflow-hidden"><div style="overflow-y:auto;max-height:560px;">${tableHtml}</div></div>${paginationHtml}`;
            container.querySelectorAll('.alerta-page-btn').forEach(btn => {
                btn.addEventListener('click', () => fetchAndRenderAlertaTable(parseInt(btn.dataset.page)));
            });

        } catch (err) {
            const container = document.getElementById('alerta-table-area');
            if (container) container.innerHTML = `<p class="text-red-500 p-4">${err.message}</p>`;
        }
    }

    tabContent.querySelector('#btnFilterAlerta').addEventListener('click', () => {
        _alertaFilters.city     = document.getElementById('alertaCityFilter')?.value || '';
        _alertaFilters.tier     = document.getElementById('alertaTierFilter')?.value || '';
        _alertaFilters.cliente  = document.getElementById('alertaClienteFilter')?.value.trim() || '';
        fetchAndRenderAlertaTable(1);
    });

    // Enter no campo cliente também filtra
    tabContent.querySelector('#alertaClienteFilter').addEventListener('keydown', e => {
        if (e.key === 'Enter') tabContent.querySelector('#btnFilterAlerta').click();
    });

    tabContent.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-contrato]');
        if (tr && typeof showClientDetail === 'function') showClientDetail(tr.dataset.contrato);
    });

    window._alertaRefresh = () => fetchAndRenderAlertaTable(_alertaCurrentPage);
    await fetchAndRenderAlertaTable(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Retorno
// ─────────────────────────────────────────────────────────────────────────────
let _retornoSelected = null;
let _retornoRegistros = [];

function _retornoMensagens(reg) {
    const nome     = (reg.cliente || '').split(' ')[0] || 'Cliente';
    const contrato = reg.contrato_id;
    const res      = reg.resultado || '';
    const obs      = reg.observacao ? `\n\n(Obs. anterior: ${reg.observacao})` : '';
    const base = {
        sem_resposta: [
            { icon: '💬', label: 'Retorno WhatsApp curto',    msg: `Olá, ${nome}! Aqui é da NetVale. Tentei contato sobre o contrato #${contrato} mas não consegui falar. Pode me responder agora? 😊` },
            { icon: '💬', label: 'Retorno WhatsApp amigável', msg: `Oi ${nome}! NetVale aqui. Há uma pendência no contrato #${contrato} que podemos resolver juntos. Quando podemos conversar?` },
            { icon: '📞', label: 'Script para ligação',       msg: `"Bom dia/tarde, posso falar com ${nome}? Aqui é [seu nome] da NetVale. Estou retornando contato sobre o contrato #${contrato}. Tem um momento?"` },
        ],
        reagendou: [
            { icon: '💬', label: 'Como combinamos',    msg: `Olá, ${nome}! NetVale aqui. Conforme combinamos, estou retornando sobre o contrato #${contrato}. Podemos resolver agora? 👍` },
            { icon: '📞', label: 'Script para ligação', msg: `"Bom dia/tarde, ${nome}? Aqui é [seu nome] da NetVale. Estou retornando conforme combinamos sobre o contrato #${contrato}."` },
        ],
        negociacao: [
            { icon: '💬', label: 'Continuação negociação', msg: `Olá, ${nome}! NetVale aqui. Dando continuidade à nossa conversa sobre o contrato #${contrato}. Como está? Conseguiu resolver? 🙏` },
            { icon: '📞', label: 'Script para ligação',     msg: `"Olá ${nome}, aqui é [seu nome] da NetVale. Retornando sobre a negociação do contrato #${contrato}. Houve algum avanço?"` },
        ],
        retido: [
            { icon: '💬', label: 'Acompanhamento pós-retenção', msg: `Olá, ${nome}! NetVale aqui. Fazendo um acompanhamento: está tudo ok com o serviço do contrato #${contrato}? Estamos à disposição! 😊` },
        ],
        cancelou: [
            { icon: '💬', label: 'Tentativa de reconexão', msg: `Olá, ${nome}! Aqui é da NetVale. Gostaríamos de entender melhor o motivo do cancelamento do contrato #${contrato} e ver se podemos ajudar. Tem um momento?` },
        ],
    };
    return (base[res] || [
        { icon: '💬', label: 'Contato geral',      msg: `Olá, ${nome}! Aqui é da NetVale. Entrando em contato sobre o contrato #${contrato}. Tem um momento? 👋` },
        { icon: '📞', label: 'Script para ligação', msg: `"Bom dia/tarde, ${nome}? Aqui é [seu nome] da NetVale. Tudo bem? Estou ligando sobre o contrato #${contrato}."` },
    ]);
}

function _retornoRenderRight(reg) {
    const panel = document.getElementById('retorno-panel');
    if (!panel) return;

    const tel      = reg.whatsapp || reg.telefone_cel || '—';
    const wa       = reg.whatsapp ? `<a href="https://wa.me/55${reg.whatsapp.replace(/\D/g,'')}" target="_blank" class="text-green-600 hover:underline">💬 ${reg.whatsapp}</a>` : '—';
    const msgs     = _retornoMensagens(reg);
    const diasAtra = reg.snooze_ate ? Math.floor((new Date() - new Date(reg.snooze_ate)) / 86400000) : null;
    const atrasoTxt = diasAtra !== null && diasAtra > 0 ? `<span class="text-red-600 font-semibold">${diasAtra}d atrasado</span>` : '<span class="text-green-600">hoje</span>';

    const RESULTADO_LABEL = { sem_resposta:'Sem resposta', reagendou:'Reagendou', negociacao:'Em negociação', retido:'Retido', cancelou:'Cancelou', '':'—' };
    const TIPO_LABEL      = { ligacao:'📞 Ligação', whatsapp:'💬 WhatsApp', visita:'🏠 Visita', email:'✉️ E-mail', '':'—' };

    panel.innerHTML = `
    <div class="p-5 flex flex-col gap-4 h-full">

      <!-- Cabeçalho cliente -->
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-bold text-gray-900 text-lg leading-tight">${reg.cliente || '—'}</div>
          <div class="text-sm text-gray-500">${reg.cidade || '—'} · Contrato <strong>#${reg.contrato_id}</strong></div>
        </div>
        <button onclick="if(typeof showClientDetail==='function') showClientDetail('${reg.contrato_id}')"
          class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex-shrink-0">
          📋 Detalhes / Nova Ação
        </button>
      </div>

      <!-- Contato -->
      <div class="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-2 text-sm">
        <div><span class="text-gray-500 text-xs">WhatsApp</span><div>${wa}</div></div>
        <div><span class="text-gray-500 text-xs">Telefone</span><div class="text-gray-800">${tel}</div></div>
        <div><span class="text-gray-500 text-xs">Retorno previsto</span><div class="text-gray-800">${reg.snooze_ate || '—'} · ${atrasoTxt}</div></div>
        <div><span class="text-gray-500 text-xs">Último contato por</span><div class="text-gray-800">${reg.usuario || '—'}</div></div>
      </div>

      <!-- Último atendimento -->
      <div class="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
        <div class="font-semibold text-blue-800 text-xs mb-2 uppercase tracking-wide">Último atendimento</div>
        <div class="grid grid-cols-2 gap-1 text-xs text-gray-700">
          <div><span class="text-gray-400">Data</span><div>${reg.data_registro?.slice(0,16) || '—'}</div></div>
          <div><span class="text-gray-400">Tipo</span><div>${TIPO_LABEL[reg.tipo_acao||''] || reg.tipo_acao || '—'}</div></div>
          <div><span class="text-gray-400">Resultado</span><div>${RESULTADO_LABEL[reg.resultado||''] || reg.resultado || '—'}</div></div>
          <div><span class="text-gray-400">Retorno marcado para</span><div>${reg.data_retorno || '—'}</div></div>
        </div>
        ${reg.observacao ? `<div class="mt-2 text-xs text-gray-600 italic border-t border-blue-100 pt-2">"${reg.observacao}"</div>` : ''}
      </div>

      <!-- Mensagens prontas -->
      <div>
        <div class="font-semibold text-sm text-gray-700 mb-2">✉️ Mensagens prontas</div>
        <div class="flex flex-col gap-2">
          ${msgs.map((m, i) => `
          <div class="bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition cursor-pointer group ret-msg-card" data-msg-idx="${i}">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-gray-600">${m.icon} ${m.label}</span>
              <span class="text-xs text-blue-500 group-hover:text-blue-700">Copiar</span>
            </div>
            <p class="text-xs text-gray-700 whitespace-pre-line leading-relaxed">${m.msg}</p>
            <div class="copy-ok hidden mt-1 text-xs text-green-600 font-medium">✅ Copiado!</div>
          </div>`).join('')}
        </div>
      </div>

    </div>`;

    // Guarda msgs no painel e adiciona listeners (evita aspas no onclick)
    panel._retMsgs = msgs;
    panel.querySelectorAll('.ret-msg-card').forEach(card => {
        card.addEventListener('click', function() {
            const idx = parseInt(this.dataset.msgIdx, 10);
            const txt = panel._retMsgs[idx]?.msg || '';
            navigator.clipboard.writeText(txt).then(() => {
                const ok = this.querySelector('.copy-ok');
                if (ok) { ok.classList.remove('hidden'); setTimeout(() => ok.classList.add('hidden'), 1800); }
            });
        });
    });
}

function _retornoRenderList() {
    const container = document.getElementById('retorno-cards');
    if (!container) return;
    if (!_retornoRegistros.length) {
        container.innerHTML = '<div class="p-6 text-center text-gray-400 text-sm">Nenhum retorno pendente. 🎉</div>';
        return;
    }
    const RESULTADO_CLS = { sem_resposta:'bg-red-100 text-red-700', reagendou:'bg-yellow-100 text-yellow-700', negociacao:'bg-blue-100 text-blue-700', retido:'bg-green-100 text-green-700', cancelou:'bg-gray-100 text-gray-600' };
    const RESULTADO_LBL = { sem_resposta:'Sem resposta', reagendou:'Reagendou', negociacao:'Em negociação', retido:'Retido', cancelou:'Cancelou' };

    container.innerHTML = _retornoRegistros.map(reg => {
        const diasAtra = reg.snooze_ate ? Math.floor((new Date() - new Date(reg.snooze_ate)) / 86400000) : 0;
        const resCls = RESULTADO_CLS[reg.resultado] || 'bg-gray-100 text-gray-600';
        const resLbl = RESULTADO_LBL[reg.resultado] || reg.resultado || '—';
        const ativo  = _retornoSelected === reg.id;
        return `<div class="border-b border-gray-100 p-3 cursor-pointer hover:bg-blue-50 transition ${ativo ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}"
                     data-retorno-contrato="${reg.contrato_id}"
                     onclick="window._retornoSelect(${reg.id})">
          <div class="flex items-center justify-between mb-0.5">
            <span class="font-medium text-sm text-gray-900 truncate max-w-[60%]">${reg.cliente || '—'}</span>
            ${diasAtra > 0 ? `<span class="text-xs text-red-600 font-semibold flex-shrink-0">${diasAtra}d atrasado</span>` : '<span class="text-xs text-green-600 flex-shrink-0">hoje</span>'}
          </div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs text-gray-400">${reg.cidade || '—'} · #${reg.contrato_id}</span>
            <span class="text-xs px-1.5 py-0.5 rounded-full font-medium ${resCls}">${resLbl}</span>
          </div>
          <div class="text-xs text-gray-400 mt-0.5">Retorno: ${reg.snooze_ate || '—'} · por ${reg.usuario || '—'}</div>
        </div>`;
    }).join('');
}

window._retornoSelect = function(id) {
    _retornoSelected = id;
    const reg = _retornoRegistros.find(r => r.id === id);
    _retornoRenderList(); // re-render para highlight ativo
    if (reg) _retornoRenderRight(reg);
};

async function renderRetornoTab() {
    const pane = document.getElementById('tab-content-retorno');
    if (!pane) return;
    pane.innerHTML = '<div class="p-8 text-center text-gray-500">Carregando...</div>';
    try {
        const d = await fetch('/api/behavior/retorno?limit=200').then(r => r.json());
        if (d.error) throw new Error(d.error);
        _retornoRegistros = d.registros || [];
        _retornoSelected  = null;

        pane.innerHTML = `
        <div class="flex" style="height:calc(100vh - 200px); min-height:520px;">
          <!-- Lista esquerda -->
          <div class="flex flex-col border-r border-gray-200" style="width:340px;flex-shrink:0;">
            <div class="px-3 py-2 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
              <span class="font-semibold text-sm text-gray-700">📅 Retornos Pendentes</span>
              <span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">${d.total}</span>
            </div>
            <div id="retorno-cards" class="overflow-y-auto flex-1"></div>
          </div>
          <!-- Painel direito -->
          <div id="retorno-panel" class="flex-1 overflow-y-auto">
            <div class="p-10 text-center text-gray-400 mt-8">
              <div class="text-5xl mb-3">👈</div>
              <div class="text-sm">Selecione um cliente para ver detalhes e mensagens prontas</div>
            </div>
          </div>
        </div>`;

        _retornoRenderList();
        // seleciona o primeiro automaticamente
        if (_retornoRegistros.length) window._retornoSelect(_retornoRegistros[0].id);
    } catch(e) {
        pane.innerHTML = `<div class="p-6 text-red-600">Erro: ${e.message}</div>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Motivos de Cancelamento
// ─────────────────────────────────────────────────────────────────────────────
async function renderMotivosCancTab() {
    const tabContent = document.getElementById('tab-content-motivos_canc');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div id="motivos-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="motivos-charts-area"></div>
    `;

    await fetchMotivosCancData();
}

async function fetchMotivosCancData() {
    const kpiRow = document.getElementById('motivos-kpi-row');
    const chartsArea = document.getElementById('motivos-charts-area');
    if (!chartsArea) return;
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/canc_reasons`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar motivos de cancelamento.'));
        const data = await response.json();

        if (kpiRow) {
            const k = data.kpis || {};
            kpiRow.innerHTML = `
                <div class="summary-card" style="border-left:4px solid #ef4444;">
                    <div class="summary-card-title">Com Motivo Registrado</div>
                    <div class="summary-card-value" style="color:#ef4444;">${(k.com_motivo || 0).toLocaleString('pt-BR')}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #6b7280;">
                    <div class="summary-card-title">Sem Motivo Registrado</div>
                    <div class="summary-card-value" style="color:#6b7280;">${(k.sem_motivo || 0).toLocaleString('pt-BR')}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #f97316;">
                    <div class="summary-card-title">Top Motivo</div>
                    <div class="summary-card-value" style="color:#f97316;font-size:0.95rem;">${k.top_motivo || '-'}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #7c3aed;">
                    <div class="summary-card-title">Permanência Média (Real Paga)</div>
                    <div class="summary-card-value" style="color:#7c3aed;">${(k.avg_permanencia || 0).toFixed(1)} meses</div>
                </div>
            `;
        }

        chartsArea.innerHTML = '';
        const grid = GridStack.init(
            { cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false },
            chartsArea
        );

        // Chart 1: Distribuição por Motivo (bar_vertical)
        const motLabels = (data.por_motivo || []).map(d => d.label);
        const motTotals = (data.por_motivo || []).map(d => d.total);
        grid.addWidget({ w: 7, h: 8, x: 0, y: 0, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-motivos-dist"></canvas></div>` });
        setTimeout(() => renderChart('chart-motivos-dist', 'bar_vertical', motLabels, [{ label: 'Cancelamentos', data: motTotals }], 'Distribuição por Motivo', { formatterType: 'number' }), 50);

        // Chart 2: Tempo Médio até Cancelar por Motivo (bar_horizontal)
        const avgMeses = (data.por_motivo || []).map(d => d.avg_meses);
        const blueShades = (data.por_motivo || []).map((_, i) => {
            const v = Math.round(80 + (i / Math.max((data.por_motivo.length - 1), 1)) * 120);
            return `rgb(30,${v},220)`;
        });
        grid.addWidget({ w: 5, h: 8, x: 7, y: 0, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-motivos-tempo"></canvas></div>` });
        setTimeout(() => renderChart('chart-motivos-tempo', 'bar_horizontal', motLabels, [{ label: 'Meses Médios', data: avgMeses, backgroundColor: blueShades }], 'Permanência Real Paga por Motivo (meses)', { formatterType: 'number' }), 50);

        // Chart 3: Tendência Anual por Motivo (line)
        // Build map: { ano: { label: total } }
        const anoMap = {};
        const labelsSet = new Set();
        (data.por_ano || []).forEach(d => {
            if (!anoMap[d.ano]) anoMap[d.ano] = {};
            anoMap[d.ano][d.label] = d.total;
            labelsSet.add(d.label);
        });
        const anos = Object.keys(anoMap).sort();
        const uniqueLabels = Array.from(labelsSet);
        const PALETTE = ['#3b82f6','#ef4444','#f97316','#22c55e','#7c3aed','#eab308','#06b6d4','#ec4899','#84cc16','#f43f5e'];
        const lineDatasets = uniqueLabels.map((lbl, idx) => ({
            label: lbl,
            data: anos.map(ano => anoMap[ano][lbl] || 0),
            borderColor: PALETTE[idx % PALETTE.length],
            backgroundColor: PALETTE[idx % PALETTE.length] + '33',
            fill: false,
        }));
        grid.addWidget({ w: 12, h: 8, x: 0, y: 8, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-motivos-tendencia"></canvas></div>` });
        setTimeout(() => renderChart('chart-motivos-tendencia', 'line', anos, lineDatasets, 'Tendência Anual por Motivo', {}), 50);

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Padrão Pré-Cancelamento
// ─────────────────────────────────────────────────────────────────────────────
async function renderPadraoPrecancTab() {
    const tabContent = document.getElementById('tab-content-padrao_pre_canc');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <p class="text-sm text-gray-500 text-center mb-4">Analisa o comportamento dos contratos cancelados para identificar padrões de alerta precoce.</p>
        <div id="precanc-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="precanc-charts-area"></div>
    `;

    await fetchPadraoPrecancData();
}

async function fetchPadraoPrecancData() {
    const kpiRow = document.getElementById('precanc-kpi-row');
    const chartsArea = document.getElementById('precanc-charts-area');
    if (!chartsArea) return;
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/pre_canc_behavior`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar padrão pré-cancelamento.'));
        const data = await response.json();

        const k = data.kpis || {};

        if (kpiRow) {
            kpiRow.innerHTML = `
                <div class="summary-card" style="border-left:4px solid #ef4444;">
                    <div class="summary-card-title">Tiveram Fatura Vencida</div>
                    <div class="summary-card-value" style="color:#ef4444;">${(k.pct_had_overdue || 0).toFixed(1)}%</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #f97316;">
                    <div class="summary-card-title">Abriram Atendimento</div>
                    <div class="summary-card-value" style="color:#f97316;">${(k.pct_had_tickets || 0).toFixed(1)}%</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #6b7280;">
                    <div class="summary-card-title">Total Cancelados Analisados</div>
                    <div class="summary-card-value" style="color:#6b7280;">${(k.total_cancelled || 0).toLocaleString('pt-BR')}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #3b82f6;">
                    <div class="summary-card-title">Permanência Média</div>
                    <div class="summary-card-value" style="color:#3b82f6;">${(k.avg_meses_contrato || 0).toFixed(1)} meses</div>
                </div>
            `;
            // Insight box after KPI row
            const insightDiv = document.createElement('div');
            insightDiv.style.cssText = 'background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:8px;font-size:0.875rem;color:#78350f;';
            insightDiv.innerHTML = `💡 <strong>Insight:</strong> ${(k.pct_had_overdue || 0).toFixed(1)}% dos clientes que cancelaram tinham faturas vencidas e ${(k.pct_had_tickets || 0).toFixed(1)}% tinham atendimentos recentes. Monitore esses dois sinais em conjunto para antecipar cancelamentos.`;
            kpiRow.appendChild(insightDiv);
        }

        chartsArea.innerHTML = '';
        const grid = GridStack.init(
            { cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false },
            chartsArea
        );

        // Chart 1: Sinais de Alerta (doughnut)
        const sinaisLabels = (data.por_num_sinais || []).map(d => {
            if (d.sinais === 0) return 'Nenhum Sinal';
            if (d.sinais === 1) return '1 Sinal';
            return '2 Sinais';
        });
        const sinaisTotals = (data.por_num_sinais || []).map(d => d.total);
        grid.addWidget({ w: 6, h: 8, x: 0, y: 0, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-precanc-sinais"></canvas></div>` });
        setTimeout(() => renderChart('chart-precanc-sinais', 'doughnut', sinaisLabels, [{ label: 'Contratos', data: sinaisTotals, backgroundColor: ['#22c55e', '#f97316', '#ef4444'] }], 'Sinais de Alerta Identificados antes do Cancelamento', { formatterType: 'number' }), 50);

        // Chart 2: Quando Cancelaram (bar_vertical)
        const permLabels = (data.por_permanencia || []).map(d => d.faixa);
        const permTotals = (data.por_permanencia || []).map(d => d.total);
        grid.addWidget({ w: 6, h: 8, x: 6, y: 0, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-precanc-permanencia"></canvas></div>` });
        setTimeout(() => renderChart('chart-precanc-permanencia', 'bar_vertical', permLabels, [{ label: 'Cancelamentos', data: permTotals }], 'Quando Cancelaram (Permanência)', {}), 50);

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Risco por Ciclo de Vida
// ─────────────────────────────────────────────────────────────────────────────
async function renderLifecycleRiskTab() {
    const tabContent = document.getElementById('tab-content-lifecycle_risk');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div id="lifecycle-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="lifecycle-charts-area"></div>
    `;

    await fetchLifecycleRiskData();
}

async function fetchLifecycleRiskData() {
    const kpiRow = document.getElementById('lifecycle-kpi-row');
    const chartsArea = document.getElementById('lifecycle-charts-area');
    if (!chartsArea) return;
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/lifecycle_risk`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar risco por ciclo de vida.'));
        const data = await response.json();

        const k = data.kpis || {};

        if (kpiRow) {
            kpiRow.innerHTML = `
                <div class="summary-card" style="border-left:4px solid #3b82f6;">
                    <div class="summary-card-title">Contratos Ativos</div>
                    <div class="summary-card-value" style="color:#3b82f6;">${(k.total_ativos || 0).toLocaleString('pt-BR')}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #ef4444;">
                    <div class="summary-card-title">Em Zona de Risco</div>
                    <div class="summary-card-value" style="color:#ef4444;">${(k.em_risco || 0).toLocaleString('pt-BR')}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #f97316;">
                    <div class="summary-card-title">Fase de Maior Risco</div>
                    <div class="summary-card-value" style="color:#f97316;font-size:0.9rem;">${k.faixa_maior_risco || '-'}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #7c3aed;">
                    <div class="summary-card-title">Fase de Maior Cancelamento</div>
                    <div class="summary-card-value" style="color:#7c3aed;font-size:0.9rem;">${k.faixa_mais_cancelamentos || '-'}</div>
                </div>
            `;
        }

        chartsArea.innerHTML = '';
        const grid = GridStack.init(
            { cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false },
            chartsArea
        );

        // Chart 1: Score Médio por Fase (bar + line dual axis)
        const faixasAtivos = (data.ativos_por_faixa || []).map(d => d.faixa);
        const avgScores = (data.ativos_por_faixa || []).map(d => d.avg_score);
        const pctRisco = (data.ativos_por_faixa || []).map(d => d.pct_em_risco);
        const barColors = avgScores.map(s => s > 40 ? '#ef4444' : s > 20 ? '#f97316' : '#22c55e');
        grid.addWidget({ w: 12, h: 8, x: 0, y: 0, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-lifecycle-score"></canvas></div>` });
        setTimeout(() => renderChart(
            'chart-lifecycle-score',
            'bar_vertical',
            faixasAtivos,
            [
                { label: 'Score Médio', data: avgScores, backgroundColor: barColors },
                { label: '% em Risco', data: pctRisco, type: 'line', yAxisID: 'y1', borderColor: '#ef4444', backgroundColor: '#ef444433', fill: false }
            ],
            'Score de Risco Médio por Fase do Contrato (Ativos)',
            { dualAxis: true, y1Label: '%' }
        ), 50);

        // Chart 2: Distribuição de Cancelamentos por Fase
        const faixasCancelados = (data.cancelados_por_faixa || []).map(d => d.faixa);
        const cancelTotals = (data.cancelados_por_faixa || []).map(d => d.total);
        const cancelPct = (data.cancelados_por_faixa || []).map(d => d.pct);
        grid.addWidget({ w: 12, h: 8, x: 0, y: 8, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-lifecycle-cancel"></canvas></div>` });
        setTimeout(() => renderChart(
            'chart-lifecycle-cancel',
            'bar_vertical',
            faixasCancelados,
            [
                { label: 'Cancelamentos', data: cancelTotals },
                { label: '% do Total', data: cancelPct, type: 'line', yAxisID: 'y1', borderColor: '#7c3aed', backgroundColor: '#7c3aed33', fill: false }
            ],
            'Distribuição de Cancelamentos por Fase',
            { dualAxis: true, y1Label: '%' }
        ), 50);

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Análise por Plano
// ─────────────────────────────────────────────────────────────────────────────
async function renderRiscoPlanoTab() {
    const tabContent = document.getElementById('tab-content-risco_plano');
    if (!tabContent) return;

    tabContent.innerHTML = `
        <div id="plano-kpi-row" class="summary-cards-container mb-4" style="border-bottom:none;padding-bottom:0;"></div>
        <div id="plano-charts-area"></div>
    `;

    await fetchRiscoPlanoData();
}

async function fetchRiscoPlanoData() {
    const kpiRow = document.getElementById('plano-kpi-row');
    const chartsArea = document.getElementById('plano-charts-area');
    if (!chartsArea) return;
    chartsArea.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/behavior/plan_risk`);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar análise por plano.'));
        const data = await response.json();

        const k = data.kpis || {};
        const planoLabel = (k.plano_maior_churn_label || '-');
        const planoLabelShort = planoLabel.length > 30 ? planoLabel.slice(0, 30) + '…' : planoLabel;

        if (kpiRow) {
            kpiRow.innerHTML = `
                <div class="summary-card" style="border-left:4px solid #3b82f6;">
                    <div class="summary-card-title">Total de Planos</div>
                    <div class="summary-card-value" style="color:#3b82f6;">${k.total_planos || 0}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #ef4444;" title="${planoLabel}">
                    <div class="summary-card-title">Plano de Maior Churn</div>
                    <div class="summary-card-value" style="color:#ef4444;font-size:0.8rem;">${planoLabelShort}</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #f97316;">
                    <div class="summary-card-title">Taxa de Churn Máxima</div>
                    <div class="summary-card-value" style="color:#f97316;">${(k.plano_maior_churn_rate || 0).toFixed(1)}%</div>
                </div>
                <div class="summary-card" style="border-left:4px solid #7c3aed;">
                    <div class="summary-card-title">Planos em Alto Risco (&gt;30% churn)</div>
                    <div class="summary-card-value" style="color:#7c3aed;">${k.total_em_risco || 0}</div>
                </div>
            `;
        }

        chartsArea.innerHTML = '';
        const grid = GridStack.init(
            { cellHeight: 70, minRow: 1, margin: 10, float: true, column: 12, disableOneColumnMode: false },
            chartsArea
        );

        const planos = (data.por_plano || []);
        const planoNames = planos.map(d => (d.plano || '').length > 25 ? (d.plano || '').slice(0, 25) + '…' : (d.plano || ''));
        const churnRates = planos.map(d => d.churn_rate);
        const churnColors = churnRates.map(r => r > 50 ? '#ef4444' : r > 30 ? '#f97316' : '#3b82f6');

        // Chart 1: Taxa de Churn por Plano
        grid.addWidget({ w: 12, h: 9, x: 0, y: 0, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-plano-churn"></canvas></div>` });
        setTimeout(() => renderChart(
            'chart-plano-churn',
            'bar_vertical',
            planoNames,
            [{ label: 'Taxa de Churn (%)', data: churnRates, backgroundColor: churnColors }],
            'Taxa de Churn por Plano',
            { formatterType: 'number' }
        ), 50);

        // Chart 2: Ativos vs Cancelados por Plano (stacked)
        grid.addWidget({ w: 7, h: 8, x: 0, y: 9, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-plano-ativos-canc"></canvas></div>` });
        setTimeout(() => renderChart(
            'chart-plano-ativos-canc',
            'bar_vertical',
            planoNames,
            [
                { label: 'Ativos', data: planos.map(d => d.ativos), backgroundColor: '#3b82f6' },
                { label: 'Cancelados', data: planos.map(d => d.cancelados), backgroundColor: '#ef4444' }
            ],
            'Ativos vs Cancelados por Plano',
            { stacked: true }
        ), 50);

        // Chart 3: Tempo Médio até Cancelar por Plano (bar_horizontal)
        const planoNamesH = planos.map(d => (d.plano || '').length > 25 ? (d.plano || '').slice(0, 25) + '…' : (d.plano || ''));
        grid.addWidget({ w: 5, h: 8, x: 7, y: 9, content: `<div style="padding:8px;height:100%;box-sizing:border-box;"><canvas id="chart-plano-tempo"></canvas></div>` });
        setTimeout(() => renderChart(
            'chart-plano-tempo',
            'bar_horizontal',
            planoNamesH,
            [{ label: 'Meses Médios', data: planos.map(d => d.avg_meses) }],
            'Tempo Médio até Cancelar por Plano',
            {}
        ), 50);

    } catch (err) {
        chartsArea.innerHTML = `<p class="text-center text-red-500 mt-4">Erro: ${err.message}</p>`;
    }
}

// ============================================================
// TAB: Perfil de Pagamento
// ============================================================
function renderPerfilPagamentoTab() {
    const pane = document.getElementById('tab-content-perfil_pagamento');
    if (!pane) return;

    let _pfFilters  = { city: '', perfil: '' };
    let _pfPage     = 0;
    const PAGE_SIZE = 50;

    pane.innerHTML = `
      <div class="p-4 space-y-4">
        <!-- Filtros -->
        <div class="flex flex-wrap gap-3 items-end">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Cidade</label>
            <select id="pf-city" class="rounded border border-gray-300 text-sm px-2 py-1">
              <option value="">Todas</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Perfil</label>
            <select id="pf-perfil" class="rounded border border-gray-300 text-sm px-2 py-1">
              <option value="">Todos</option>
              <option value="Atrasou pela 1ª vez">Atrasou pela 1ª vez</option>
              <option value="Sempre atrasa">Sempre atrasa</option>
              <option value="Atrasa com frequência">Atrasa com frequência</option>
              <option value="Raramente atrasa">Raramente atrasa</option>
              <option value="Nunca atrasou">Nunca atrasou</option>
              <option value="Sem histórico">Sem histórico</option>
            </select>
          </div>
          <button id="pf-filter-btn" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Filtrar</button>
        </div>

        <!-- KPIs -->
        <div id="pf-kpi-row" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>

        <!-- Gráficos -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white rounded-lg shadow p-4">
            <canvas id="chart-pf-perfil" height="220"></canvas>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <canvas id="chart-pf-faixa" height="220"></canvas>
          </div>
        </div>

        <!-- Alerta: Atrasou pela 1ª vez -->
        <div id="pf-primeira-vez-section" class="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 class="text-sm font-semibold text-red-700 mb-2">Atrasou pela 1ª vez — ação imediata recomendada</h3>
          <div id="pf-primeira-table"></div>
        </div>

        <!-- Tabela geral -->
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left">Contrato</th>
                  <th class="px-3 py-2 text-left">Cliente</th>
                  <th class="px-3 py-2 text-left">Cidade</th>
                  <th class="px-3 py-2 text-center">Perfil</th>
                  <th class="px-3 py-2 text-right">Pagas</th>
                  <th class="px-3 py-2 text-right">Atrasos</th>
                  <th class="px-3 py-2 text-right">% Atraso</th>
                  <th class="px-3 py-2 text-right">Med. Atraso</th>
                  <th class="px-3 py-2 text-right">Vencidas Hoje</th>
                </tr>
              </thead>
              <tbody id="pf-table-body" class="divide-y divide-gray-100"></tbody>
            </table>
          </div>
          <div class="flex items-center justify-between px-4 py-2 bg-gray-50">
            <span id="pf-pagination-info" class="text-xs text-gray-500"></span>
            <div class="flex gap-2">
              <button id="pf-prev" class="px-3 py-1 text-xs rounded border disabled:opacity-40">Anterior</button>
              <button id="pf-next" class="px-3 py-1 text-xs rounded border disabled:opacity-40">Proximo</button>
            </div>
          </div>
        </div>
      </div>`;

    const PERFIL_COLORS = {
        'Nunca atrasou':         '#22c55e',
        'Raramente atrasa':      '#86efac',
        'Atrasa com frequência': '#f97316',
        'Sempre atrasa':         '#ef4444',
        'Atrasou pela 1ª vez':   '#dc2626',
        'Sem histórico':         '#94a3b8',
    };

    async function _loadPf() {
        const params = new URLSearchParams({
            city:   _pfFilters.city,
            perfil: _pfFilters.perfil,
            limit:  PAGE_SIZE,
            offset: _pfPage * PAGE_SIZE,
        });
        const data = await fetchPerfilPagamentoData(params.toString());
        if (!data) return;

        // Populate city dropdown once
        const cityEl = document.getElementById('pf-city');
        if (cityEl && cityEl.options.length === 1 && data.cities) {
            data.cities.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c; opt.textContent = c;
                cityEl.appendChild(opt);
            });
            cityEl.value = _pfFilters.city;
        }

        // KPIs — adapta conforme filtro de perfil selecionado
        const s = data.summary || {};
        const kpiRow = document.getElementById('pf-kpi-row');
        if (kpiRow) {
            const pf = _pfFilters.perfil;
            let kpis;
            if (pf) {
                // filtro específico: mostra total filtrado + média de atraso + max atraso + sem_historico como contexto
                const PERFIL_COLOR_MAP = {
                    'Atrasou pela 1ª vez':   'red',
                    'Sempre atrasa':         'red',
                    'Atrasa com frequência': 'orange',
                    'Raramente atrasa':      'green',
                    'Nunca atrasou':         'green',
                    'Sem histórico':         'gray',
                };
                kpis = [
                    { label: 'Total Filtrado', value: s.total ?? 0, color: PERFIL_COLOR_MAP[pf] || 'blue' },
                    { label: 'Media de Atraso', value: s.media_geral_atraso ? s.media_geral_atraso + ' dias' : 'Em dia', color: 'blue' },
                    { label: 'Atrasou 1ª Vez', value: s.primeira_vez ?? 0, color: 'red' },
                    { label: 'Sempre Atrasa', value: s.sempre ?? 0, color: 'orange' },
                ];
            } else {
                kpis = [
                    { label: 'Media de Atraso (dias)', value: s.media_geral_atraso ?? 0, color: 'blue' },
                    { label: 'Atrasou 1ª Vez', value: s.primeira_vez ?? 0, color: 'red' },
                    { label: 'Sempre Atrasa', value: s.sempre ?? 0, color: 'orange' },
                    { label: 'Nunca Atrasou', value: s.nunca_atrasou ?? 0, color: 'green' },
                ];
            }
            kpiRow.innerHTML = kpis.map(k => `
              <div class="bg-white rounded-lg shadow p-3">
                <p class="summary-card-title text-xs text-gray-500">${k.label}</p>
                <p class="text-2xl font-bold text-${k.color}-600">${k.value}</p>
              </div>`).join('');
        }

        // Doughnut — distribuicao por perfil
        if (data.por_perfil && data.por_perfil.length) {
            const labels   = data.por_perfil.map(d => d.perfil);
            const totals   = data.por_perfil.map(d => d.total);
            const bgColors = labels.map(l => PERFIL_COLORS[l] || '#94a3b8');
            setTimeout(() => renderChart(
                'chart-pf-perfil', 'doughnut', labels,
                [{ label: 'Clientes', data: totals, backgroundColor: bgColors }],
                'Distribuicao por Perfil de Pagamento',
                { formatterType: 'number' }
            ), 50);
        }

        // Bar — faixa de atraso medio
        if (data.por_faixa_atraso && data.por_faixa_atraso.length) {
            const labels = data.por_faixa_atraso.map(d => d.faixa);
            const totals = data.por_faixa_atraso.map(d => d.total);
            setTimeout(() => renderChart(
                'chart-pf-faixa', 'bar_vertical', labels,
                [{ label: 'Clientes', data: totals, backgroundColor: '#3b82f6' }],
                'Faixa de Atraso Medio (dias)',
                { formatterType: 'number' }
            ), 50);
        }

        // Tabela "Atrasou pela 1a vez"
        const primeiraSection = document.getElementById('pf-primeira-vez-section');
        const primeiraTable   = document.getElementById('pf-primeira-table');
        if (primeiraTable) {
            if (!data.primeira_vez || data.primeira_vez.length === 0) {
                if (primeiraSection) primeiraSection.style.display = 'none';
            } else {
                if (primeiraSection) primeiraSection.style.display = '';
                primeiraTable.innerHTML = `
                  <div class="overflow-x-auto">
                  <table class="min-w-full text-xs">
                    <thead><tr class="text-red-700">
                      <th class="px-2 py-1 text-left">Contrato</th>
                      <th class="px-2 py-1 text-left">Cliente</th>
                      <th class="px-2 py-1 text-left">Cidade</th>
                      <th class="px-2 py-1 text-right">Faturas Vencidas</th>
                      <th class="px-2 py-1 text-right">Total Pagas</th>
                    </tr></thead>
                    <tbody class="divide-y divide-red-100">
                      ${data.primeira_vez.slice(0, 30).map(r => `
                        <tr class="cursor-pointer hover:bg-red-100" data-contrato="${r.contrato}" title="Clique para ver detalhes">
                          <td class="px-2 py-1">${r.contrato}</td>
                          <td class="px-2 py-1">${r.cliente}</td>
                          <td class="px-2 py-1">${r.cidade || '-'}</td>
                          <td class="px-2 py-1 text-right font-semibold text-red-600">${r.fat_vencidas_hoje}</td>
                          <td class="px-2 py-1 text-right">${r.total_pagas}</td>
                        </tr>`).join('')}
                    </tbody>
                  </table>
                  </div>`;
            }
        }

        // Tabela geral paginada
        const tbody = document.getElementById('pf-table-body');
        if (tbody) {
            const perfilBadge = p => {
                const cls = {
                    'Nunca atrasou':         'bg-green-100 text-green-800',
                    'Raramente atrasa':      'bg-green-50 text-green-700',
                    'Atrasa com frequência': 'bg-orange-100 text-orange-800',
                    'Sempre atrasa':         'bg-red-100 text-red-800',
                    'Atrasou pela 1ª vez':   'bg-red-200 text-red-900 font-bold',
                    'Sem histórico':         'bg-gray-100 text-gray-600',
                }[p] || 'bg-gray-100 text-gray-600';
                return `<span class="px-2 py-0.5 rounded-full text-xs ${cls}">${p}</span>`;
            };
            tbody.innerHTML = (data.data || []).map(r => `
              <tr class="hover:bg-gray-50 cursor-pointer" data-contrato="${r.contrato}" title="Clique para ver detalhes">
                <td class="px-3 py-2">${r.contrato}</td>
                <td class="px-3 py-2">${r.cliente}</td>
                <td class="px-3 py-2">${r.cidade || '-'}</td>
                <td class="px-3 py-2 text-center">${perfilBadge(r.perfil)}</td>
                <td class="px-3 py-2 text-right">${r.total_pagas}</td>
                <td class="px-3 py-2 text-right">${r.total_atrasos}</td>
                <td class="px-3 py-2 text-right">${r.pct_atraso}%</td>
                <td class="px-3 py-2 text-right">${r.media_atraso_dias > 0 ? r.media_atraso_dias + ' d' : '-'}</td>
                <td class="px-3 py-2 text-right ${r.fat_vencidas_hoje > 0 ? 'text-red-600 font-semibold' : ''}">${r.fat_vencidas_hoje || '-'}</td>
              </tr>`).join('');
        }

        // Pagination
        const total   = data.total_rows || 0;
        const info    = document.getElementById('pf-pagination-info');
        const prevBtn = document.getElementById('pf-prev');
        const nextBtn = document.getElementById('pf-next');
        if (info)    info.textContent = `${_pfPage * PAGE_SIZE + 1}–${Math.min((_pfPage + 1) * PAGE_SIZE, total)} de ${total}`;
        if (prevBtn) prevBtn.disabled = _pfPage === 0;
        if (nextBtn) nextBtn.disabled = (_pfPage + 1) * PAGE_SIZE >= total;
    }

    // Wire events
    pane.querySelector('#pf-filter-btn').addEventListener('click', () => {
        _pfFilters.city   = document.getElementById('pf-city').value;
        _pfFilters.perfil = document.getElementById('pf-perfil').value;
        _pfPage = 0;
        _loadPf();
    });
    pane.querySelector('#pf-prev').addEventListener('click', () => { if (_pfPage > 0) { _pfPage--; _loadPf(); } });
    pane.querySelector('#pf-next').addEventListener('click', () => { _pfPage++; _loadPf(); });

    // Delegated click → modal de detalhes
    pane.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-contrato]');
        if (tr && typeof showClientDetail === 'function') showClientDetail(tr.dataset.contrato);
    });

    _loadPf();
}

async function fetchPerfilPagamentoData(queryString) {
    try {
        const res = await fetch(`/api/behavior/payment_profile?${queryString}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('Erro ao buscar payment_profile:', err);
        return null;
    }
}

// ─── Análise de Retirada ───────────────────────────────────────────────────────

let _retData      = [];
let _retPage      = 1;
let _retPageSize  = 50;
let _retTotal     = 0;
let _retFilters   = {};
let _retFiltros   = {};
let _retExpanded  = new Set();
let _retSortBy    = '';
let _retSortDir   = 'desc';
let _retTecnicosMap = {}; // { id: nome }
let _retColabMes  = ''; // mês selecionado na tabela de produção (YYYY-MM)
const _retTabLoaded   = {};
const _retVisitasCache = {}; // { osId: count } — persiste entre re-renders

// Tabela dia×técnico compartilhada por Produção e Atividade
function _renderColabTable(colab, nDays, mes) {
    if (!colab.length) return '<div class="p-4 text-gray-400 text-sm">Nenhum técnico com OS neste mês.</div>';
    const days = Array.from({length: nDays}, (_, i) => i + 1);
    const _COL_COLORS = ['text-blue-600', 'text-blue-900'];
    const _BG_COLORS  = ['bg-blue-50',    'bg-blue-100'];
    const thDays = days.map((d,i) => {
        const bg = _BG_COLORS[i % _BG_COLORS.length];
        return `<th class="px-1 text-center text-[10px] font-bold min-w-[22px] ${bg} ${_COL_COLORS[i%_COL_COLORS.length]}">${String(d).padStart(2,'0')}</th>`;
    }).join('');
    const rows = colab.map(x => {
        const cells = days.map((d,i) => {
            const n = x.dias[d] || 0;
            const cls = _COL_COLORS[i % _COL_COLORS.length];
            const bg  = _BG_COLORS[i % _BG_COLORS.length];
            return n > 0
                ? `<td class="px-1 text-center text-[11px] font-bold tabular-nums ${cls} ${bg}">${n}</td>`
                : `<td class="px-1 text-center text-[11px] text-gray-400 ${bg}">-</td>`;
        }).join('');
        return `<tr class="border-b border-white hover:brightness-95">
            <td class="py-1.5 px-3 text-xs font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white">${x.nome}</td>
            ${cells}
            <td class="py-1.5 px-2 text-center text-xs font-bold text-gray-900 tabular-nums">${x.total}</td>
        </tr>`;
    }).join('');
    const totals = days.map(d => colab.reduce((s, x) => s + (x.dias[d] || 0), 0));
    const totalCells = totals.map((n, i) => {
        const cls = _COL_COLORS[i % _COL_COLORS.length];
        const bg  = _BG_COLORS[i % _BG_COLORS.length];
        return n > 0
            ? `<td class="px-1 text-center text-[11px] font-bold tabular-nums ${cls} ${bg}">${n}</td>`
            : `<td class="px-1 text-center text-[11px] text-gray-400 ${bg}">-</td>`;
    }).join('');
    const grandTotal = colab.reduce((s, x) => s + x.total, 0);
    return `<table class="text-left w-full" style="border-collapse:collapse;">
        <thead>
          <tr class="bg-gray-800 text-white">
            <th class="py-1.5 px-3 text-xs font-semibold whitespace-nowrap sticky left-0 bg-gray-800 z-10">Técnico</th>
            ${thDays}
            <th class="px-2 text-center text-xs font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="bg-gray-50 border-t-2 border-gray-200">
            <td class="py-1.5 px-3 text-xs font-bold text-gray-700 sticky left-0 bg-gray-50">Total</td>
            ${totalCells}
            <td class="px-2 text-center text-xs font-bold text-gray-900">${grandTotal}</td>
          </tr>
        </tfoot>
      </table>`;
}

// Carrega e renderiza a tabela de atividade diária (fotos/arquivos IXC) por técnico
async function _retLoadAtividadeTecnico(mes, container) {
    const wrap = (container || document).querySelector('#ret-atividade-tecnico-wrap');
    if (!wrap) return;
    const m = mes || new Date().toISOString().slice(0,7);
    wrap.innerHTML = `<div class="text-xs text-gray-400 px-2 py-1">Carregando atividade diária...</div>`;
    try {
        const d = await fetch(`/api/behavior/retiradas/atividade-tecnico?mes=${m}`).then(r => r.json());
        if (d.error) { wrap.innerHTML = ''; return; }
        const colab    = d.por_colaborador || [];
        const numDays  = d.num_days || 30;
        const mesSel   = d.mes || m;
        if (!colab.length) {
            wrap.innerHTML = `<div class="bg-white border border-gray-100 rounded-xl p-4 mt-2">
              <div class="text-sm font-semibold text-gray-700 mb-2">Atividade Diária por Técnico
                <span class="text-xs font-normal text-gray-400 ml-1">(fotos/arquivos enviados no IXC)</span>
              </div>
              <div class="text-xs text-gray-400 py-2">Nenhuma atividade no cache — clique em 🔄 Atualizar para buscar do IXC.</div>
            </div>`;
            return;
        }
        wrap.innerHTML = `
        <div class="bg-white border border-gray-100 rounded-xl p-4 mt-2">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span class="text-sm font-semibold text-gray-700">Atividade Diária por Técnico
              <span class="text-xs font-normal text-gray-400 ml-1">(fotos/arquivos enviados no IXC · clique 🔄 Atualizar para sincronizar)</span>
            </span>
          </div>
          <div class="overflow-x-auto">${_renderColabTable(colab, numDays, mesSel)}</div>
        </div>`;
    } catch(e) {
        wrap.innerHTML = '';
    }
}

// Exibe painel de atividade de hoje (arquivos/fotos enviadas) por técnico
function _retMostrarAtividadeHoje(atividade, pane) {
    const container = pane || document.getElementById('tab-content-retiradas');
    if (!container) return;
    let panel = container.querySelector('#ret-atividade-hoje-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ret-atividade-hoje-panel';
        panel.className = 'bg-white border border-blue-200 rounded-xl p-4 mt-4 mx-2';
        // Insere antes do primeiro filho do conteúdo principal
        const main = container.querySelector('#ret-results-wrap') || container;
        main.parentNode?.insertBefore(panel, main);
    }
    const hoje = new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'});
    const sorted = Object.entries(atividade).sort((a, b) => b[1] - a[1]);
    panel.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <span class="text-sm font-semibold text-blue-700">📸 Atividade Hoje (${hoje}) — fotos/arquivos enviados no IXC</span>
        <button onclick="this.closest('#ret-atividade-hoje-panel').remove()" class="ml-auto text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
      <div class="flex flex-wrap gap-2">
        ${sorted.map(([nome, cnt]) => `
          <div class="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
            <span class="text-xs font-semibold text-blue-800">${nome}</span>
            <span class="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 font-bold">${cnt} OS</span>
          </div>`).join('')}
        ${sorted.length === 0 ? '<span class="text-xs text-gray-400">Nenhuma atividade registrada hoje</span>' : ''}
      </div>`;
}

const _retNomeTecnico = (id) => _retTecnicosMap[String(id)] || String(id || '—');

const _RET_STATUS_CLS = {
    'Aberta':       'bg-red-100 text-red-800',
    'Encaminhada':  'bg-yellow-100 text-yellow-800',
    'Agendada':     'bg-blue-100 text-blue-800',
    'Finalizada':   'bg-green-100 text-green-700',
};
const _RET_ASSUNTO_SHORT = {
    'RETIRADA DE EQUIPAMENTO':                  'Retirada Equip.',
    'INADIMPLENCIA RETIRADA':                   'Inadim. Retirada',
    'EQUIPAMENTO NÃO RETIRADO':                 'Equip. Não Ret.',
    'RETIRADA DE EQUIPAMENTO PONTO ADICIONAL':  'Ret. Pto Adicional',
    'CANCELAMENTO RETIRADA':                    'Canc. Retirada',
};
const _RET_ASSUNTO_CLS = {
    'RETIRADA DE EQUIPAMENTO':                  'bg-orange-100 text-orange-800',
    'INADIMPLENCIA RETIRADA':                   'bg-red-100 text-red-800',
    'EQUIPAMENTO NÃO RETIRADO':                 'bg-purple-100 text-purple-800',
    'RETIRADA DE EQUIPAMENTO PONTO ADICIONAL':  'bg-blue-100 text-blue-800',
    'CANCELAMENTO RETIRADA':                    'bg-gray-100 text-gray-700',
};

export async function renderRetiradaTab() {
    const pane = document.getElementById('tab-content-retirada');
    if (!pane) return;
    pane.innerHTML = '<div class="p-8 text-center text-gray-500">Carregando...</div>';

    try {
        const [filtros] = await Promise.all([
            fetch('/api/behavior/retiradas/filtros').then(r => r.json()),
        ]);
        _retFiltros = filtros;
        _retTecnicosMap = filtros.tecnicos_map || {};
        _retFilters = { status: 'Aberta,Encaminhada,Agendada', assunto: '', filial: '', cidade: '', bairro: '', colaborador: '', equipamento: '', min_visitas: '', date_from: '', date_to: '', search: '' };
        _retPage    = 1;
        _retExpanded.clear();

        pane.innerHTML = _retShell(filtros);
        _retBindEvents(pane);
        await _retLoad();
    } catch(e) {
        pane.innerHTML = `<div class="p-6 text-red-600">Erro: ${e.message}</div>`;
    }
}

function _retShell(f) {
    const sel = (id, opts, ph) => `<select id="${id}" class="ret-filter border border-gray-300 rounded px-2 py-1 text-sm">
        <option value="">${ph}</option>${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
    </select>`;

    const STATUS_LIST    = ['Aberta','Encaminhada','Agendada','Finalizada'];
    const STATUS_DEFAULT = new Set(['Aberta','Encaminhada','Agendada']);
    const STATUS_CLS     = { Aberta:'text-red-700', Encaminhada:'text-yellow-700', Agendada:'text-blue-700', Finalizada:'text-green-700' };
    const multiStatus = `
<div class="ret-ms-wrap relative" id="ret-ms-status">
  <div class="ret-ms-trigger border border-gray-300 rounded px-2 py-1 text-sm cursor-pointer select-none flex justify-between items-center gap-2 min-w-[140px] bg-white" id="ret-ms-trigger">
    <span id="ret-ms-label" class="truncate">Aberta, Encaminhada, Agendada</span>
    <span class="text-gray-400 text-xs flex-shrink-0">▾</span>
  </div>
  <div class="ret-ms-dropdown hidden absolute z-50 bg-white border border-gray-300 rounded-lg shadow-lg mt-1 py-1 min-w-[160px]" id="ret-ms-dropdown">
    ${STATUS_LIST.map(s => `
    <label class="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm hover:bg-gray-50 ${STATUS_CLS[s]||''}">
      <input type="checkbox" value="${s}" class="ret-ms-cb accent-blue-600" ${STATUS_DEFAULT.has(s) ? 'checked' : ''}>
      <span class="font-medium">${s}</span>
    </label>`).join('')}
    <div class="border-t border-gray-100 mt-1 pt-1 px-3 pb-1">
      <button id="ret-ms-clear" class="text-xs text-gray-400 hover:text-gray-600">Limpar seleção</button>
    </div>
  </div>
</div>`;

    return `
<div class="p-4">
  <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
    <h2 class="text-xl font-bold text-gray-800">📦 Análise de Retirada de Equipamentos</h2>
    <span class="text-sm text-gray-500">Ordens de Serviço · Pendentes e Histórico</span>
  </div>

  <!-- KPIs -->
  <div id="ret-kpis" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4"></div>

  <!-- Abas principais -->
  <div class="flex gap-0 border-b border-gray-200 mb-4">
    <button id="ret-main-tab-ordens"
      class="px-5 py-2.5 text-sm font-semibold border-b-2 border-blue-600 text-blue-700 bg-white"
      onclick="window._retMainTab('ordens')">
      📋 Ordens
    </button>
    <button id="ret-main-tab-dashboard"
      class="px-5 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-blue-700 hover:bg-gray-50"
      onclick="window._retMainTab('dashboard')">
      📊 Dashboard
    </button>
  </div>

  <!-- Painel: Ordens -->
  <div id="ret-panel-ordens">
    <!-- Filtros -->
    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div class="flex flex-wrap gap-2 items-end">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Status</label>
          ${multiStatus}
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Tipo</label>
          ${sel('ret-f-assunto', (f.assuntos||[]).map(a => a), 'Todos tipos')}
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Filial</label>
          ${sel('ret-f-filial', f.filiais || [], 'Todas filiais')}
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Cidade</label>
          ${sel('ret-f-cidade', f.cidades || [], 'Todas cidades')}
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Bairro</label>
          ${sel('ret-f-bairro', f.bairros || [], 'Todos bairros')}
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Colaborador</label>
          <select id="ret-f-colab" class="ret-filter border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="">Todos colaboradores</option>
            ${(f.colaboradores || []).map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">De</label>
          <input type="date" id="ret-f-de" class="border border-gray-300 rounded px-2 py-1 text-sm">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Até</label>
          <input type="date" id="ret-f-ate" class="border border-gray-300 rounded px-2 py-1 text-sm">
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Equipamento</label>
          ${sel('ret-f-equip', f.equipamentos || [], 'Todos equipamentos')}
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Visitas (mín.)</label>
          <div class="flex items-center gap-1">
            <input type="number" id="ret-f-min-visitas" min="0" placeholder="0" class="border border-gray-300 rounded px-2 py-1 text-sm w-20">
            <button id="ret-btn-sync-visitas" title="Atualizar cache de visitas (busca do IXC)" class="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 rounded whitespace-nowrap">🔄 Atualizar</button>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 font-medium">Busca</label>
          <input type="text" id="ret-f-search" placeholder="Cliente, endereço, bairro..." class="border border-gray-300 rounded px-2 py-1 text-sm w-48">
        </div>
        <button id="ret-btn-filtrar" class="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700">Filtrar</button>
        <button id="ret-btn-limpar" class="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-300">Limpar</button>
      </div>
    </div>
    <!-- Tabela -->
    <div id="ret-table-wrap" class="overflow-x-auto rounded-lg border border-gray-200"></div>
    <!-- Paginação -->
    <div id="ret-pagination" class="flex justify-between items-center mt-3 text-sm text-gray-600"></div>
  </div>

  <!-- Painel: Dashboard -->
  <div id="ret-panel-dashboard" class="hidden">
    <div id="ret-dash-content" class="text-sm text-gray-400 italic py-4 text-center">
      Carregando dashboard...
    </div>
  </div>
</div>`;
}

function _retGetSelectedStatus() {
    return [...document.querySelectorAll('.ret-ms-cb:checked')].map(c => c.value).join(',');
}

function _retUpdateStatusLabel() {
    const selected = [...document.querySelectorAll('.ret-ms-cb:checked')].map(c => c.value);
    const lbl = document.getElementById('ret-ms-label');
    if (lbl) lbl.textContent = selected.length ? selected.join(', ') : 'Todos status';
}

function _retBindEvents(pane) {
    // Multi-select status dropdown toggle
    const trigger  = pane.querySelector('#ret-ms-trigger');
    const dropdown = pane.querySelector('#ret-ms-dropdown');
    if (trigger && dropdown) {
        trigger.addEventListener('click', e => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', () => dropdown.classList.add('hidden'));
        dropdown.addEventListener('click', e => e.stopPropagation());
        pane.querySelectorAll('.ret-ms-cb').forEach(cb => cb.addEventListener('change', _retUpdateStatusLabel));
        pane.querySelector('#ret-ms-clear')?.addEventListener('click', () => {
            pane.querySelectorAll('.ret-ms-cb').forEach(cb => cb.checked = false);
            _retUpdateStatusLabel();
        });
    }

    pane.querySelector('#ret-btn-filtrar')?.addEventListener('click', () => {
        _retFilters.status      = _retGetSelectedStatus();
        _retFilters.assunto     = pane.querySelector('#ret-f-assunto')?.value || '';
        _retFilters.filial      = pane.querySelector('#ret-f-filial')?.value || '';
        _retFilters.cidade      = pane.querySelector('#ret-f-cidade')?.value || '';
        _retFilters.bairro      = pane.querySelector('#ret-f-bairro')?.value || '';
        _retFilters.colaborador = pane.querySelector('#ret-f-colab')?.value || '';
        _retFilters.equipamento = pane.querySelector('#ret-f-equip')?.value || '';
        _retFilters.min_visitas = pane.querySelector('#ret-f-min-visitas')?.value || '';
        _retFilters.date_from   = pane.querySelector('#ret-f-de')?.value || '';
        _retFilters.date_to     = pane.querySelector('#ret-f-ate')?.value || '';
        _retFilters.search      = pane.querySelector('#ret-f-search')?.value || '';
        _retPage = 1;
        _retExpanded.clear();
        _retLoad();
    });
    pane.querySelector('#ret-btn-sync-visitas')?.addEventListener('click', async () => {
        const btn = pane.querySelector('#ret-btn-sync-visitas');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Buscando…';
        try {
            const q = new URLSearchParams({
                status:      _retFilters.status,
                assunto:     _retFilters.assunto,
                filial:      _retFilters.filial,
                cidade:      _retFilters.cidade,
                bairro:      _retFilters.bairro,
                colaborador: _retFilters.colaborador,
                equipamento: _retFilters.equipamento,
                date_from:   _retFilters.date_from,
                date_to:     _retFilters.date_to,
                search:      _retFilters.search,
            });
            const r = await fetch(`/api/behavior/retiradas/sync-visitas?${q}`, { method: 'POST' });
            const d = await r.json();
            if (d.error) {
                alert('Erro ao sincronizar visitas: ' + d.error);
            } else {
                // Popula cache local
                if (d.counts) {
                    Object.entries(d.counts).forEach(([k, v]) => { _retVisitasCache[parseInt(k)] = v; });
                }
                const bgCount = d.atividade_bg || 0;
                const bgMsg   = bgCount > 0 ? ` · 🔄 histórico: ${bgCount} em bg` : '';
                btn.innerHTML = `✅ ${d.synced} sincronizadas${bgMsg}`;
                setTimeout(() => { btn.innerHTML = origHtml; btn.disabled = false; }, bgCount > 0 ? 8000 : 3000);
                // Mostra atividade de hoje por técnico
                if (d.atividade_hoje && Object.keys(d.atividade_hoje).length > 0) {
                    _retMostrarAtividadeHoje(d.atividade_hoje, pane);
                }
                // Recarrega tabela de atividade diária com dados frescos do cache
                _retLoadAtividadeTecnico(_retColabMes, pane);
                // Se há sync em background, recarrega a tabela de atividade em 20s e 60s
                if (bgCount > 0) {
                    setTimeout(() => _retLoadAtividadeTecnico(_retColabMes, pane), 20000);
                    setTimeout(() => _retLoadAtividadeTecnico(_retColabMes, pane), 60000);
                }
                _retLoad();
                return;
            }
        } catch (e) {
            alert('Erro de conexão ao sincronizar visitas');
        }
        btn.innerHTML = origHtml;
        btn.disabled = false;
    });
    pane.querySelector('#ret-btn-limpar')?.addEventListener('click', () => {
        pane.querySelectorAll('.ret-ms-cb').forEach(cb => cb.checked = false);
        _retUpdateStatusLabel();
        ['#ret-f-assunto','#ret-f-filial','#ret-f-cidade','#ret-f-bairro','#ret-f-colab','#ret-f-equip','#ret-f-min-visitas','#ret-f-de','#ret-f-ate','#ret-f-search']
            .forEach(s => { const el = pane.querySelector(s); if (el) el.value = ''; });
        _retFilters = { status:'',assunto:'',filial:'',cidade:'',bairro:'',colaborador:'',equipamento:'',min_visitas:'',date_from:'',date_to:'',search:'' };
        _retSortBy  = '';
        _retSortDir = 'desc';
        _retPage = 1;
        _retExpanded.clear();
        _retLoad();
    });
}

async function _retLoad() {
    const wrap = document.getElementById('ret-table-wrap');
    const pgDiv = document.getElementById('ret-pagination');
    if (wrap) wrap.innerHTML = '<div class="p-6 text-center text-gray-400">Carregando...</div>';

    const q = new URLSearchParams({ ..._retFilters, page: _retPage, limit: _retPageSize, sort_by: _retSortBy, sort_dir: _retSortDir });
    const d = await fetch(`/api/behavior/retiradas?${q}`).then(r => r.json());
    if (d.error) { if(wrap) wrap.innerHTML = `<div class="p-4 text-red-600">Erro: ${d.error}</div>`; return; }

    // Cache de visitas vazio mas filtro ativo → sincroniza automaticamente e recarrega
    if (d.total === 0 && (d.visitas_sem_cache || 0) > 0 && _retFilters.min_visitas) {
        if (wrap) wrap.innerHTML = '<div class="p-6 text-center text-blue-500">🔄 Sincronizando visitas do IXC, aguarde...</div>';
        try {
            const syncQ = new URLSearchParams({
                status: _retFilters.status, assunto: _retFilters.assunto,
                filial: _retFilters.filial, cidade: _retFilters.cidade,
                bairro: _retFilters.bairro, colaborador: _retFilters.colaborador,
                equipamento: _retFilters.equipamento, date_from: _retFilters.date_from,
                date_to: _retFilters.date_to, search: _retFilters.search,
            });
            const sd = await fetch(`/api/behavior/retiradas/sync-visitas?${syncQ}`, { method: 'POST' }).then(r => r.json());
            if (sd.counts) {
                Object.entries(sd.counts).forEach(([k, v]) => { _retVisitasCache[parseInt(k)] = v; });
            }
            // Atualiza botão de sync se existir
            const syncBtn = document.getElementById('ret-btn-sync-visitas');
            if (syncBtn) { syncBtn.innerHTML = `✅ ${sd.synced || 0} sincronizadas`; setTimeout(() => { syncBtn.innerHTML = '🔄 Atualizar'; }, 3000); }
        } catch(e) { /* ignora erro de sync silencioso */ }
        // Recarrega com cache populado
        const d2 = await fetch(`/api/behavior/retiradas?${q}`).then(r => r.json());
        if (d2.error) { if(wrap) wrap.innerHTML = `<div class="p-4 text-red-600">Erro: ${d2.error}</div>`; return; }
        _retData  = d2.ordens || [];
        _retTotal = d2.total  || 0;
        if (d2.visitas_map) Object.entries(d2.visitas_map).forEach(([k, v]) => { _retVisitasCache[parseInt(k)] = v; });
        _retRenderKpis(d2.kpis, d2.por_assunto, d2.por_cidade);
        _retRenderMainDashboard(d2);
        _retRenderTable(wrap);
        _retRenderPagination(pgDiv, d2.page, d2.pages, d2.total);
        _retLoadVisitas();
        return;
    }

    _retData  = d.ordens || [];
    _retTotal = d.total  || 0;

    // Pré-popula cache com contagens vindas do servidor (evita re-fetch que mostraria 0)
    if (d.visitas_map) {
        Object.entries(d.visitas_map).forEach(([k, v]) => { _retVisitasCache[parseInt(k)] = v; });
    }

    _retRenderKpis(d.kpis, d.por_assunto, d.por_cidade);
    _retRenderMainDashboard(d);
    _retRenderTable(wrap);
    _retRenderPagination(pgDiv, d.page, d.pages, d.total);
    _retLoadVisitas(); // batch count de arquivos (assíncrono, não bloqueia)
}

function _retRenderKpis(k, porAssunto, porCidade) {
    const kpis = document.getElementById('ret-kpis');
    if (!kpis) return;

    const card = (val, lbl, cls) => `
        <div class="rounded-lg border p-3 ${cls}">
          <div class="text-2xl font-bold">${val}</div>
          <div class="text-xs mt-1">${lbl}</div>
        </div>`;

    kpis.innerHTML = `
        ${card(k.total, 'Total de Ordens', 'bg-gray-50 border-gray-200 text-gray-800')}
        ${card(k.abertas, 'Abertas', 'bg-red-50 border-red-200 text-red-800')}
        ${card(k.encaminhadas, 'Encaminhadas', 'bg-yellow-50 border-yellow-200 text-yellow-800')}
        ${card(k.agendadas, 'Agendadas', 'bg-blue-50 border-blue-200 text-blue-800')}
        ${card(k.finalizadas, 'Finalizadas', 'bg-green-50 border-green-200 text-green-800')}
        ${card(k.sem_agendamento, 'Pendentes s/ Agend.', 'bg-orange-50 border-orange-200 text-orange-800')}`;
}

function _retDiasAberto(o) {
    const inicio = o.abertura ? new Date(o.abertura) : null;
    if (!inicio) return { txt: '—', cls: 'text-gray-400' };
    const fim = (o.status === 'Finalizada' && (o.final || o.fechamento))
        ? new Date(o.final || o.fechamento)
        : new Date();
    const dias = Math.floor((fim - inicio) / 86400000);
    const txt  = dias === 0 ? 'hoje' : dias === 1 ? '1 dia' : `${dias} dias`;
    const cls  = o.status === 'Finalizada'
        ? 'text-gray-500'
        : dias >= 30 ? 'text-red-700 font-semibold'
        : dias >= 7  ? 'text-orange-600 font-medium'
        : 'text-green-700';
    return { txt, cls };
}

function _retRenderTable(wrap) {
    if (!wrap) return;
    if (!_retData.length) {
        wrap.innerHTML = '<div class="p-8 text-center text-gray-400">Nenhuma ordem encontrada.</div>';
        return;
    }

    const rows = _retData.map((o, i) => {
        const statusCls  = _RET_STATUS_CLS[o.status] || 'bg-gray-100 text-gray-700';
        const assuntoCls = _RET_ASSUNTO_CLS[o.assunto] || 'bg-gray-100 text-gray-700';
        const assuntoShort = _RET_ASSUNTO_SHORT[o.assunto] || o.assunto;
        const expanded   = _retExpanded.has(o.id);
        const abertura   = o.abertura ? o.abertura.slice(0,10) : '—';
        const agendTxt   = o.agendamento ? o.agendamento.slice(0,16).replace('T',' ') : '—';
        const telDisplay = o.whatsapp || o.telefone_cel || o.telefone_res || '—';
        const endDisplay = [o.endereco, o.bairro, o.cidade].filter(Boolean).join(' · ');
        const diasInfo   = _retDiasAberto(o);
        const equipTxt   = o.equipamentos_comodato || '—';

        const nomeTecnico = _retNomeTecnico(o.colaborador);
        let detail = '';
        if (expanded) {
            const rows2 = [
                ['🔧 Colaborador',       nomeTecnico],
                ['🏢 Filial',            o.filial || '—'],
                ['🚨 Prioridade',        o.prioridade || '—'],
                ['📡 SLA',               o.sla || '—'],
                ['🏠 Endereço',          [o.endereco, o.complemento].filter(Boolean).join(' | ') || '—'],
                ['📍 Bairro / Cidade',   [o.bairro, o.cidade].filter(Boolean).join(' / ') || '—'],
                ['📌 Referência',        o.referencia || '—'],
                ['📱 WhatsApp',          o.whatsapp || '—'],
                ['📞 Celular',           o.telefone_cel || '—'],
                ['☎️ Residencial',       o.telefone_res || '—'],
                ['📋 Mensagem / Motivo', o.mensagem || '—'],
                ['💬 Desc. Atendimento', o.atend_descricao || '—'],
                ['⏰ Melhor Horário',    o.melhor_horario || '—'],
                ['📅 Agendamento',       agendTxt],
                ['⏱️ Prazo Limite',      o.prazo_limite ? o.prazo_limite.slice(0,16) : '—'],
                ['✅ Início',            o.inicio ? o.inicio.slice(0,16).replace('T',' ') : '—'],
                ['🏁 Final',             o.final ? o.final.slice(0,16).replace('T',' ') : '—'],
                ['🔒 Fechamento',        o.fechamento ? o.fechamento.slice(0,16).replace('T',' ') : '—'],
                ['🔢 Protocolo',         o.protocolo || '—'],
                ['📝 Contrato',          o.contrato || '—'],
            ];
            detail = `<tr id="ret-detail-${o.id}">
              <td colspan="11" class="bg-blue-50 border-b border-blue-200 p-0">
                <div class="border-b border-blue-200 bg-blue-100 flex gap-0">
                  <button onclick="window._retTab(${o.id},'detalhes')" id="ret-tab-${o.id}-detalhes"
                    class="ret-dtab px-4 py-2 text-xs font-semibold border-b-2 border-blue-600 text-blue-700 bg-white">
                    🗂 Detalhes
                  </button>
                  <button onclick="window._retTab(${o.id},'mensagens')" id="ret-tab-${o.id}-mensagens"
                    class="ret-dtab px-4 py-2 text-xs font-semibold border-b-2 border-transparent text-gray-600 hover:text-blue-700 hover:bg-white">
                    💬 Mensagens
                  </button>
                  <button onclick="window._retTab(${o.id},'arquivos')" id="ret-tab-${o.id}-arquivos"
                    class="ret-dtab px-4 py-2 text-xs font-semibold border-b-2 border-transparent text-gray-600 hover:text-blue-700 hover:bg-white">
                    📎 Arquivos
                  </button>
                </div>
                <div id="ret-panel-${o.id}-detalhes" class="ret-dpanel px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
                  ${rows2.map(([lbl, val], idx) => {
                    // Endereço e campos longos ocupam 2 colunas
                    const wide = lbl.includes('Endereço') || lbl.includes('Mensagem') || lbl.includes('Desc.');
                    return `<div class="flex flex-col min-w-0 overflow-hidden ${wide ? 'col-span-2' : ''}">
                      <span class="text-xs text-gray-500 font-medium">${lbl}</span>
                      <span class="text-sm text-gray-900 break-all leading-snug">${val}</span>
                    </div>`;
                  }).join('')}
                </div>
                <div id="ret-panel-${o.id}-mensagens" class="ret-dpanel hidden px-6 py-4">
                  <div class="text-xs text-gray-400 italic">Clique na aba para carregar mensagens...</div>
                </div>
                <div id="ret-panel-${o.id}-arquivos" class="ret-dpanel hidden px-6 py-4">
                  <div class="text-xs text-gray-400 italic">Clique na aba para carregar arquivos...</div>
                </div>
              </td>
            </tr>`;
        }

        return `<tr class="hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${expanded ? 'bg-blue-50' : ''}"
                    onclick="window._retToggle(${o.id})">
          <td class="px-3 py-2 text-xs text-gray-500 font-mono">#${o.id}</td>
          <td class="px-3 py-2">
            <span class="inline-block text-xs px-2 py-0.5 rounded-full font-medium ${assuntoCls}">${assuntoShort}</span>
          </td>
          <td class="px-3 py-2">
            <span class="inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}">${o.status}</span>
          </td>
          <td class="px-3 py-2 text-sm text-gray-900 font-medium max-w-[180px] truncate" title="${o.cliente || ''}">${o.cliente || '—'}</td>
          <td class="px-3 py-2 text-xs text-gray-600 max-w-[240px] truncate" title="${endDisplay}">${endDisplay || '—'}</td>
          <td class="px-3 py-2 text-xs text-gray-600 max-w-[120px] truncate" title="${nomeTecnico}">${nomeTecnico}</td>
          <td class="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">${abertura}</td>
          <td class="px-3 py-2 text-xs ${o.agendamento ? 'text-blue-700 font-medium' : 'text-gray-400'} whitespace-nowrap">${agendTxt}</td>
          <td class="px-3 py-2 text-xs whitespace-nowrap ${diasInfo.cls}">${diasInfo.txt}</td>
          <td class="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate" title="${equipTxt}">${equipTxt}</td>
          <td class="px-3 py-2 text-xs whitespace-nowrap ret-visitas-cell" data-osid="${o.id}">${
            _retVisitasCache[o.id] !== undefined
              ? (_retVisitasCache[o.id] > 0 ? `<span class="text-blue-700 font-semibold">${_retVisitasCache[o.id]}</span>` : '<span class="text-gray-400">0</span>')
              : '<span class="text-gray-300">...</span>'
          }</td>
        </tr>${detail}`;
    }).join('');

    const _sortArrow = (col) => {
        if (_retSortBy !== col) return '<span class="text-gray-500 ml-1">⇅</span>';
        return _retSortDir === 'desc' ? '<span class="text-yellow-300 ml-1">↓</span>' : '<span class="text-yellow-300 ml-1">↑</span>';
    };
    const _sortTh = (col, label, extra = '') =>
        `<th class="px-3 py-2 font-semibold cursor-pointer hover:bg-gray-700 select-none whitespace-nowrap ${extra}"
             onclick="window._retSort('${col}')">${label}${_sortArrow(col)}</th>`;

    wrap.innerHTML = `
    <table class="min-w-full text-left">
      <thead>
        <tr class="bg-gray-800 text-white text-xs">
          ${_sortTh('id', 'ID')}
          <th class="px-3 py-2 font-semibold">Tipo</th>
          ${_sortTh('status', 'Status')}
          ${_sortTh('cliente', 'Cliente')}
          <th class="px-3 py-2 font-semibold">Endereço</th>
          ${_sortTh('colaborador', 'Colaborador')}
          ${_sortTh('abertura', 'Abertura')}
          ${_sortTh('agendamento', 'Agendamento')}
          ${_sortTh('tempo_aberto', 'Tempo Aberto')}
          <th class="px-3 py-2 font-semibold whitespace-nowrap">Equipamentos</th>
          ${_sortTh('visitas', 'Visitas')}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _retVisitasApply() {
    document.querySelectorAll('.ret-visitas-cell').forEach(cell => {
        const n = _retVisitasCache[cell.dataset.osid];
        if (n === undefined) return;
        cell.innerHTML = n > 0
            ? `<span class="text-blue-700 font-semibold">${n}</span>`
            : '<span class="text-gray-400">0</span>';
    });
}

async function _retLoadVisitas() {
    const cells = [...document.querySelectorAll('.ret-visitas-cell')];
    if (!cells.length) return;
    // só busca os IDs ainda não no cache
    const osIds = cells
        .map(c => parseInt(c.dataset.osid))
        .filter(id => id && _retVisitasCache[id] === undefined);
    if (!osIds.length) { _retVisitasApply(); return; }
    try {
        const d = await fetch('/api/behavior/retiradas/arquivos-counts', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({os_ids: osIds}),
        }).then(r => r.json());
        Object.assign(_retVisitasCache, d.counts || {});
        _retVisitasApply();
    } catch(e) {
        document.querySelectorAll('.ret-visitas-cell').forEach(c => { c.innerHTML = '<span class="text-gray-300">—</span>'; });
    }
}

function _retRenderPagination(el, page, pages, total) {
    if (!el) return;
    if (pages <= 1) { el.innerHTML = `<span>${total} ordens encontradas</span>`; return; }
    el.innerHTML = `
        <span>${total} ordens · Página ${page} de ${pages}</span>
        <div class="flex gap-1">
          ${page > 1 ? `<button onclick="window._retGoPage(${page-1})" class="px-3 py-1 rounded border text-sm hover:bg-gray-100">← Anterior</button>` : ''}
          ${page < pages ? `<button onclick="window._retGoPage(${page+1})" class="px-3 py-1 rounded border text-sm hover:bg-gray-100">Próxima →</button>` : ''}
        </div>`;
}

window._retMainTab = function(tab) {
    ['ordens','dashboard'].forEach(t => {
        const btn = document.getElementById(`ret-main-tab-${t}`);
        const panel = document.getElementById(`ret-panel-${t}`);
        if (btn) {
            btn.classList.toggle('border-blue-600', t === tab);
            btn.classList.toggle('text-blue-700', t === tab);
            btn.classList.toggle('bg-white', t === tab);
            btn.classList.toggle('border-transparent', t !== tab);
            btn.classList.toggle('text-gray-500', t !== tab);
        }
        if (panel) panel.classList.toggle('hidden', t !== tab);
    });
};

function _retRenderMainDashboard(d) {
    const el = document.getElementById('ret-dash-content');
    if (!el) return;

    const kpis = d.kpis || {};
    const tendencia  = d.tendencia  || [];
    const porAssunto = d.por_assunto || [];
    const porCidade  = d.por_cidade  || [];

    // ── Gráficos de evolução: um por assunto, 3 barras (Total / Finalizadas / Abertas) ──
    const _ASSUNTO_SHORT = {
        'RETIRADA DE EQUIPAMENTO':                    'Retirada de Equipamento',
        'INADIMPLENCIA RETIRADA':                     'Inadimplência Retirada',
        'EQUIPAMENTO NÃO RETIRADO':                   'Equip. Não Retirado',
        'RETIRADA DE EQUIPAMENTO PONTO ADICIONAL':    'Ret. Ponto Adicional',
        'CANCELAMENTO RETIRADA':                      'Cancelamento Retirada',
    };

    const _buildBars = (meses, assunto) => {
        if (!meses || !meses.length) return '';
        const maxT = Math.max(...meses.map(m => m.total), 1);
        return meses.slice(-18).map(m => {
            const abertas = m.abertas_status || 0;
            const pctT = Math.round((m.total      / maxT) * 100);
            const pctF = Math.round((m.finalizadas / maxT) * 100);
            const pctA = Math.round((abertas       / maxT) * 100);
            const [yy, mm] = m.mes.split('-');
            const da = `data-assunto="${assunto.replace(/"/g,'&quot;')}" data-mes="${m.mes}"`;
            return `<div class="flex flex-col items-center flex-1 min-w-0 group cursor-pointer ret-trend-col" ${da} data-st="" style="height:100%;">
                <span class="text-[8px] font-semibold text-gray-500 group-hover:text-blue-700 leading-none mb-0.5 flex-shrink-0">${m.total}</span>
                <div class="w-full flex-1 flex items-end" style="gap:1px;overflow:hidden;">
                    <div class="flex-1 bg-blue-400 rounded-t opacity-80 hover:opacity-100 hover:bg-blue-500 transition-all ret-trend-bar" ${da} data-st="" style="height:${pctT}%;min-height:2px;" title="Total: ${m.total}"></div>
                    <div class="flex-1 bg-green-400 rounded-t opacity-80 hover:opacity-100 hover:bg-green-500 transition-all ret-trend-bar" ${da} data-st="Finalizada" style="height:${pctF}%;min-height:${m.finalizadas?'2px':'0'};" title="Finalizadas: ${m.finalizadas}"></div>
                    <div class="flex-1 bg-orange-400 rounded-t opacity-80 hover:opacity-100 hover:bg-orange-500 transition-all ret-trend-bar" ${da} data-st="Aberta" style="height:${pctA}%;min-height:${abertas?'2px':'0'};" title="Abertas+Encaminhadas: ${abertas}"></div>
                </div>
                <span class="text-[11px] font-semibold text-gray-700 truncate w-full text-center leading-none mt-0.5 flex-shrink-0">${mm}/${yy.slice(2)}</span>
            </div>`;
        }).join('');
    };

    const _legend = `<div class="flex gap-3 text-[13px] text-gray-700 font-medium flex-shrink-0">
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-blue-400"></span>Total</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-green-400"></span>Finalizadas</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-orange-400"></span>Abertas</span>
    </div>`;

    let trendHtml = '';
    if (tendencia && typeof tendencia === 'object' && !Array.isArray(tendencia)) {
        const cards = Object.entries(tendencia).map(([assunto, meses]) => {
            const titulo = _ASSUNTO_SHORT[assunto] || assunto;
            const bars   = _buildBars(meses, assunto);
            const totMes = meses.length ? meses[meses.length-1] : null;
            const badge  = totMes ? `<span class="text-xs text-gray-400 ml-2">${totMes.total} em ${totMes.mes.slice(5)}/${totMes.mes.slice(2,4)}</span>` : '';
            return `<div class="bg-white border border-gray-100 rounded-xl p-3">
              <div class="flex items-center justify-between mb-2 flex-wrap gap-1">
                <span class="text-xs font-semibold text-gray-700">${titulo}${badge}</span>
                ${_legend}
              </div>
              <div class="flex items-stretch gap-0.5 px-0.5" style="height:160px;">${bars}</div>
            </div>`;
        }).join('');
        trendHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">${cards}</div>`;
    }

    // ── Horizontal bars helper ──
    const hBars = (title, items, colorCls) => {
        if (!items.length) return '';
        const maxV = Math.max(...items.map(x => x.total), 1);
        const rows = items.slice(0, 8).map(x => {
            const pct = Math.round((x.total / maxV) * 100);
            const label = x.assunto || x.cidade || x.nome || '—';
            const short = label.length > 28 ? label.slice(0, 28) + '…' : label;
            return `<div class="mb-1.5">
                <div class="flex justify-between text-xs mb-0.5">
                    <span class="text-gray-700 truncate" title="${label}">${short}</span>
                    <span class="font-semibold text-gray-800 ml-2 flex-shrink-0">${x.total}</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-2">
                    <div class="${colorCls} h-2 rounded-full transition-all" style="width:${pct}%"></div>
                </div>
            </div>`;
        }).join('');
        return `<div class="bg-white border border-gray-100 rounded-xl p-4">
            <div class="text-sm font-semibold text-gray-700 mb-3">${title}</div>
            ${rows}
        </div>`;
    };

    // ── Por tipo (assunto) ──
    const assuntoData = porAssunto.map(x => ({
        assunto: (x.assunto || '').replace('RETIRADA DE EQUIPAMENTO', 'Retirada Equip.')
                                  .replace('INADIMPLENCIA RETIRADA', 'Inadim. Retirada')
                                  .replace('EQUIPAMENTO NÃO RETIRADO', 'Equip. Não Ret.')
                                  .replace('RETIRADA DE EQUIPAMENTO PONTO ADICIONAL', 'Ret. Pto Adicional')
                                  .replace('CANCELAMENTO RETIRADA', 'Cancelamento'),
        total: x.total
    }));
    const tipoHtml   = hBars('Por Tipo de OS',  assuntoData, 'bg-orange-400');
    const cidadeHtml = hBars('Por Cidade',       porCidade,   'bg-indigo-400');

    // ── Taxa de finalização ──
    const total = kpis.total || 0;
    const finalizadas = kpis.finalizadas || 0;
    const taxaFin = total ? Math.round(finalizadas / total * 100) : 0;
    const abertas = (kpis.abertas || 0) + (kpis.encaminhadas || 0) + (kpis.agendadas || 0);
    const taxaAberta = total ? Math.round(abertas / total * 100) : 0;

    const metricCards = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div class="bg-white border border-gray-100 rounded-xl p-4 text-center">
        <div class="text-3xl font-bold text-gray-800">${total}</div>
        <div class="text-xs text-gray-500 mt-1">Total de OS</div>
      </div>
      <div class="bg-white border border-red-100 rounded-xl p-4 text-center">
        <div class="text-3xl font-bold text-red-600">${abertas}</div>
        <div class="text-xs text-gray-500 mt-1">Pendentes</div>
        <div class="mt-1 text-xs font-semibold text-red-500">${taxaAberta}% do total</div>
      </div>
      <div class="bg-white border border-green-100 rounded-xl p-4 text-center">
        <div class="text-3xl font-bold text-green-600">${finalizadas}</div>
        <div class="text-xs text-gray-500 mt-1">Finalizadas</div>
        <div class="mt-1 text-xs font-semibold text-green-500">${taxaFin}% do total</div>
      </div>
      <div class="bg-white border border-yellow-100 rounded-xl p-4 text-center">
        <div class="text-3xl font-bold text-yellow-600">${kpis.sem_agendamento || 0}</div>
        <div class="text-xs text-gray-500 mt-1">Sem Agendamento</div>
      </div>
    </div>`;

    // ── Produção por técnico: grid dia-a-dia ──
    const porColab  = d.por_colaborador || [];
    const numDays   = d.colab_num_days  || 31;
    const colabMes  = d.colab_mes       || '';
    if (!_retColabMes && colabMes) _retColabMes = colabMes;

    // Gera opções dos últimos 13 meses
    const _retMesOptions = (() => {
        const opts = [];
        const now = new Date();
        for (let i = 0; i <= 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const yy = d.getFullYear();
            opts.push({ val: ym, lbl: `${mm}/${yy}` });
        }
        return opts;
    })();

    const _retColabLabel = mes => {
        const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        if (!mes) return '';
        const [y, m] = mes.split('-');
        return meses[parseInt(m)-1] + ' ' + y;
    };

    let colabHtml = '';
    if (porColab.length || colabMes) {
        const selOpts = _retMesOptions.map(o =>
            `<option value="${o.val}" ${o.val === _retColabMes ? 'selected' : ''}>${o.lbl}</option>`
        ).join('');
        colabHtml = `
        <div class="bg-white border border-gray-100 rounded-xl p-4 mt-4">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span class="text-sm font-semibold text-gray-700">Produção por Técnico
              <span class="text-xs font-normal text-gray-400 ml-1">(Dom Pedro · Presidente Dutra · Tuntum · São Domingos)</span>
            </span>
            <select id="ret-colab-mes-sel" class="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white">
              ${selOpts}
            </select>
          </div>
          <div id="ret-colab-table-wrap" class="overflow-x-auto">
            ${_renderColabTable(porColab, numDays, _retColabMes)}
          </div>
        </div>`;
    }

    el.innerHTML = `
    <div>
      ${metricCards}
      ${trendHtml}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${tipoHtml}
        ${cidadeHtml}
      </div>
      ${colabHtml}
      <div id="ret-atividade-tecnico-wrap" class="mt-2"></div>
    </div>`;

    // Carrega tabela de atividade diária (cache de fotos/arquivos IXC)
    _retLoadAtividadeTecnico(_retColabMes, el);

    // Delegated click nos bars do gráfico de tendência
    el.querySelectorAll('.ret-trend-bar, .ret-trend-col').forEach(bar => {
        bar.addEventListener('click', e => {
            e.stopPropagation();
            const assunto = bar.dataset.assunto;
            const mes     = bar.dataset.mes;
            const st      = bar.dataset.st;
            if (assunto && mes) window._retTrendModal(assunto, mes, st);
        });
    });

    // Event listener para o seletor de mês da tabela de técnicos
    const mesSel = el.querySelector('#ret-colab-mes-sel');
    if (mesSel) {
        mesSel.addEventListener('change', async () => {
            _retColabMes = mesSel.value;
            const wrap = el.querySelector('#ret-colab-table-wrap');
            if (wrap) wrap.innerHTML = '<div class="p-4 text-center text-gray-400">Carregando...</div>';
            try {
                const r = await fetch(`/api/behavior/retiradas/producao-tecnico?mes=${_retColabMes}`).then(r => r.json());
                if (r.error) { wrap.innerHTML = `<div class="p-4 text-red-500">${r.error}</div>`; return; }
                wrap.innerHTML = _renderColabTable(r.por_colaborador || [], r.num_days || 31, _retColabMes);
            } catch(e) {
                if (wrap) wrap.innerHTML = '<div class="p-4 text-red-500">Erro ao carregar</div>';
            }
        });
    }
}

function _retRenderDashboard(d, o) {
    const STATUS_CLS = { Aberta:'bg-red-100 text-red-800', Encaminhada:'bg-yellow-100 text-yellow-800', Agendada:'bg-blue-100 text-blue-800', Finalizada:'bg-green-100 text-green-700' };
    const ASSUNTO_SHORT = { 'RETIRADA DE EQUIPAMENTO':'Retirada', 'INADIMPLENCIA RETIRADA':'Inadim.', 'EQUIPAMENTO NÃO RETIRADO':'Equip. N. Ret.', 'RETIRADA DE EQUIPAMENTO PONTO ADICIONAL':'Pto. Adicional', 'CANCELAMENTO RETIRADA':'Cancelamento' };

    // Cards topo
    const cards = [
        { val: d.total,       lbl: 'Total OS',          cls: 'bg-gray-50 border-gray-200 text-gray-800' },
        { val: d.finalizadas, lbl: 'Finalizadas',        cls: 'bg-green-50 border-green-200 text-green-800' },
        { val: d.abertas,     lbl: 'Pendentes',          cls: d.abertas > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-800' },
        { val: d.media_dias != null ? `${d.media_dias}d` : '—', lbl: 'Média p/ Finalizar', cls: 'bg-blue-50 border-blue-200 text-blue-800' },
    ].map(c => `<div class="rounded-lg border px-4 py-3 ${c.cls} text-center">
        <div class="text-2xl font-bold">${c.val}</div>
        <div class="text-xs font-medium mt-0.5">${c.lbl}</div>
    </div>`).join('');

    // Gráfico de barras por mês (CSS)
    let barChart = '';
    if (d.por_mes && d.por_mes.length > 0) {
        const maxV = Math.max(...d.por_mes.map(m => m.total), 1);
        const bars = d.por_mes.slice(-18).map(m => {
            const pct = Math.round((m.total / maxV) * 100);
            const mesLabel = m.mes.slice(5); // MM
            const [yy, mm] = m.mes.split('-');
            const label = `${mm}/${yy.slice(2)}`;
            return `<div class="flex flex-col items-center gap-1 flex-1 min-w-0" title="${m.mes}: ${m.total} OS">
                <span class="text-xs font-semibold text-blue-700">${m.total}</span>
                <div class="w-full bg-gray-100 rounded-t" style="height:60px; display:flex; align-items:flex-end;">
                    <div class="w-full bg-blue-500 rounded-t transition-all" style="height:${pct}%;min-height:2px;"></div>
                </div>
                <span class="text-xs text-gray-500 truncate w-full text-center">${label}</span>
            </div>`;
        }).join('');
        barChart = `<div class="mb-4">
            <div class="text-xs font-semibold text-gray-600 mb-2">OS por Mês</div>
            <div class="flex items-end gap-1 h-[88px] bg-white border border-gray-100 rounded-lg px-3 pt-3 pb-0">${bars}</div>
        </div>`;
    }

    // Tabela de histórico
    const rows = d.ordens.map(item => {
        const sc  = STATUS_CLS[item.status] || 'bg-gray-100 text-gray-700';
        const ass = ASSUNTO_SHORT[item.assunto] || item.assunto || '—';
        const ab  = item.abertura ? item.abertura.slice(0,10) : '—';
        const fe  = item.fechamento && !item.fechamento.startsWith('0000') ? item.fechamento.slice(0,10) : '—';
        const da  = item.dias_aberto != null ? `${item.dias_aberto}d` : '—';
        const isCurrent = item.id === o.id;
        return `<tr class="${isCurrent ? 'bg-yellow-50 font-semibold' : 'hover:bg-gray-50'} border-b border-gray-100 text-xs">
            <td class="px-2 py-1.5 font-mono text-gray-500">#${item.id}${isCurrent ? ' ★' : ''}</td>
            <td class="px-2 py-1.5"><span class="px-1.5 py-0.5 rounded-full text-xs ${sc}">${item.status}</span></td>
            <td class="px-2 py-1.5 text-gray-700">${ass}</td>
            <td class="px-2 py-1.5 text-gray-600">${ab}</td>
            <td class="px-2 py-1.5 text-gray-600">${fe}</td>
            <td class="px-2 py-1.5 ${item.dias_aberto > 30 ? 'text-red-600 font-semibold' : 'text-gray-600'}">${da}</td>
        </tr>`;
    }).join('');

    return `<div>
        <div class="text-sm font-semibold text-gray-700 mb-3">Histórico de Retiradas — <span class="text-gray-500 font-normal">${o.cliente || '—'}</span></div>
        <div class="grid grid-cols-4 gap-3 mb-4">${cards}</div>
        ${barChart}
        <div class="overflow-auto max-h-60 rounded-lg border border-gray-200">
            <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                        <th class="px-2 py-1.5 text-left font-semibold">OS</th>
                        <th class="px-2 py-1.5 text-left font-semibold">Status</th>
                        <th class="px-2 py-1.5 text-left font-semibold">Tipo</th>
                        <th class="px-2 py-1.5 text-left font-semibold">Abertura</th>
                        <th class="px-2 py-1.5 text-left font-semibold">Fechamento</th>
                        <th class="px-2 py-1.5 text-left font-semibold">Dias</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6" class="px-2 py-4 text-center text-gray-400">Nenhuma OS encontrada</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
}

window._retToggle = function(id) {
    if (_retExpanded.has(id)) {
        _retExpanded.delete(id);
        ['detalhes','mensagens','arquivos'].forEach(t => delete _retTabLoaded[`${id}-${t}`]);
    } else {
        _retExpanded.add(id);
    }
    _retRenderTable(document.getElementById('ret-table-wrap'));
    _retLoadVisitas(); // restaura counts após re-render
};

window._retGoPage = function(p) {
    _retPage = p;
    _retExpanded.clear();
    _retLoad();
};

window._retTrendModal = async function(assunto, mes, statusFilter) {
    // Remove modal anterior se existir
    document.getElementById('ret-trend-modal')?.remove();

    const [y, m] = mes.split('-');
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    const mesLabel = `${m}/${y.slice(2)}`;
    const statusLabel = statusFilter === 'Finalizada' ? 'Finalizadas' : statusFilter === 'Aberta' ? 'Abertas' : 'Todas';

    const modal = document.createElement('div');
    modal.id = 'ret-trend-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <div class="text-sm font-semibold text-gray-800">${assunto}</div>
              <div class="text-xs text-gray-400">${mesLabel} — ${statusLabel}</div>
            </div>
            <button onclick="document.getElementById('ret-trend-modal').remove()"
                    class="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">×</button>
          </div>
          <div id="ret-trend-modal-body" class="overflow-auto flex-1 p-4">
            <div class="text-center text-gray-400 py-8">Carregando...</div>
          </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    try {
        const q = new URLSearchParams({
            assunto,
            status:    statusFilter || '',
            date_from: `${y}-${m}-01`,
            date_to:   `${y}-${m}-${String(lastDay).padStart(2,'0')}`,
            limit:     200,
            page:      1,
        });
        const d = await fetch(`/api/behavior/retiradas?${q}`).then(r => r.json());
        const body = document.getElementById('ret-trend-modal-body');
        if (!body) return;
        if (d.error) { body.innerHTML = `<div class="text-red-500">${d.error}</div>`; return; }
        const ordens = d.ordens || [];
        if (!ordens.length) { body.innerHTML = '<div class="text-center text-gray-400 py-8">Nenhuma OS encontrada.</div>'; return; }

        const STATUS_CLS = {
            Aberta:      'bg-red-100 text-red-700',
            Encaminhada: 'bg-yellow-100 text-yellow-700',
            Agendada:    'bg-blue-100 text-blue-700',
            Finalizada:  'bg-green-100 text-green-700',
        };
        const rows = ordens.map(o => `
            <tr class="border-b border-gray-50 hover:bg-gray-50 text-xs">
                <td class="px-3 py-2 font-mono text-gray-500">${o.id}</td>
                <td class="px-3 py-2 max-w-[200px]">
                    <span class="font-medium text-blue-700 hover:underline cursor-pointer truncate block" title="${o.cliente}"
                          onclick="window._retClientePerfil('${(o.cliente||'').replace(/'/g,"\\'")}')">
                        ${o.cliente||'—'}
                    </span>
                </td>
                <td class="px-3 py-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLS[o.status]||'bg-gray-100 text-gray-600'}">${o.status||'—'}</span>
                </td>
                <td class="px-3 py-2 text-gray-600 truncate max-w-[160px]">${o.colaborador||'—'}</td>
                <td class="px-3 py-2 text-gray-500">${o.cidade||'—'}</td>
                <td class="px-3 py-2 text-gray-400 whitespace-nowrap">${(o.abertura||'').slice(0,10)}</td>
            </tr>`).join('');
        body.innerHTML = `
            <div class="text-xs text-gray-400 mb-2">${ordens.length} ordens${d.total > ordens.length ? ` (de ${d.total})` : ''}</div>
            <table class="w-full text-left">
                <thead>
                    <tr class="bg-gray-50 text-xs text-gray-500 font-semibold">
                        <th class="px-3 py-2">ID</th>
                        <th class="px-3 py-2">Cliente</th>
                        <th class="px-3 py-2">Status</th>
                        <th class="px-3 py-2">Colaborador</th>
                        <th class="px-3 py-2">Cidade</th>
                        <th class="px-3 py-2">Abertura</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    } catch(e) {
        const body = document.getElementById('ret-trend-modal-body');
        if (body) body.innerHTML = `<div class="text-red-500">Erro: ${e.message}</div>`;
    }
};

window._retClientePerfil = async function(nomeCliente) {
    document.getElementById('ret-cliente-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'ret-cliente-modal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/60';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
            <div>
              <div class="text-sm font-bold text-gray-800">${nomeCliente}</div>
              <div class="text-xs text-gray-400 mt-0.5">Perfil do Cliente</div>
            </div>
            <button onclick="document.getElementById('ret-cliente-modal').remove()"
                    class="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none">×</button>
          </div>
          <div class="flex border-b border-gray-100 px-5 gap-1 bg-white" id="ret-cp-tabs">
            ${['ordens','contratos','atendimentos','faturas','equipamentos'].map((t,i)=>
              `<button data-tab="${t}" class="ret-cp-tab px-3 py-2.5 text-xs font-semibold border-b-2 ${i===0?'border-blue-600 text-blue-700':'border-transparent text-gray-500 hover:text-blue-600'}">${
                {ordens:'📋 OS',contratos:'📄 Contratos',atendimentos:'🎧 Atendimentos',faturas:'💰 Faturas',equipamentos:'📦 Equipamentos'}[t]
              }</button>`).join('')}
          </div>
          <div id="ret-cp-body" class="overflow-auto flex-1 p-4 text-sm">
            <div class="text-center text-gray-400 py-8">Carregando...</div>
          </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Tab switching
    let _cpData = null;
    const _cpRender = (tab) => {
        const body = document.getElementById('ret-cp-body');
        if (!body || !_cpData) return;
        modal.querySelectorAll('.ret-cp-tab').forEach(b => {
            const active = b.dataset.tab === tab;
            b.className = `ret-cp-tab px-3 py-2.5 text-xs font-semibold border-b-2 ${active?'border-blue-600 text-blue-700':'border-transparent text-gray-500 hover:text-blue-600'}`;
        });

        const STATUS_CLS = { Aberta:'bg-red-100 text-red-700', Encaminhada:'bg-yellow-100 text-yellow-700',
            Agendada:'bg-blue-100 text-blue-700', Finalizada:'bg-green-100 text-green-700',
            Ativo:'bg-green-100 text-green-700', Cancelado:'bg-gray-100 text-gray-500',
            Suspenso:'bg-orange-100 text-orange-700', Pago:'bg-green-100 text-green-700',
            Aberto:'bg-red-100 text-red-700', Baixado:'bg-green-100 text-green-700' };
        const badge = (s) => `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLS[s]||'bg-gray-100 text-gray-600'}">${s||'—'}</span>`;
        const fmt = v => v ? v.slice(0,10) : '—';
        const money = v => v != null ? `R$ ${parseFloat(v).toFixed(2).replace('.',',')}` : '—';

        if (tab === 'ordens') {
            const rows = _cpData.ordens.map(o => `<tr class="border-b border-gray-50 hover:bg-gray-50">
                <td class="px-3 py-2 font-mono text-gray-400 text-xs">${o.id}</td>
                <td class="px-3 py-2 text-xs max-w-[180px] truncate" title="${o.assunto}">${o.assunto||'—'}</td>
                <td class="px-3 py-2">${badge(o.status)}</td>
                <td class="px-3 py-2 text-xs text-gray-600">${o.colaborador||'—'}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${o.cidade||'—'}</td>
                <td class="px-3 py-2 text-xs text-gray-400">${fmt(o.abertura)}</td>
                <td class="px-3 py-2 text-xs text-gray-400">${fmt(o.agendamento)}</td>
            </tr>`).join('');
            body.innerHTML = `<div class="text-xs text-gray-400 mb-2">${_cpData.ordens.length} ordens</div>
            <div class="overflow-x-auto"><table class="w-full text-left">
                <thead><tr class="bg-gray-50 text-[11px] text-gray-500 font-semibold">
                    <th class="px-3 py-2">ID</th><th class="px-3 py-2">Assunto</th><th class="px-3 py-2">Status</th>
                    <th class="px-3 py-2">Colaborador</th><th class="px-3 py-2">Cidade</th>
                    <th class="px-3 py-2">Abertura</th><th class="px-3 py-2">Agendamento</th>
                </tr></thead><tbody>${rows||'<tr><td colspan="7" class="px-3 py-4 text-center text-gray-400">Nenhuma OS</td></tr>'}</tbody>
            </table></div>`;
        } else if (tab === 'contratos') {
            const rows = _cpData.contratos.map(c => `<tr class="border-b border-gray-50 hover:bg-gray-50">
                <td class="px-3 py-2 font-mono text-gray-400 text-xs">${c.id}</td>
                <td class="px-3 py-2">${badge(c.status)}</td>
                <td class="px-3 py-2">${badge(c.status_acesso)}</td>
                <td class="px-3 py-2 text-xs max-w-[160px] truncate" title="${c.plano||''}">${c.plano||'—'}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${c.cidade||'—'}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${fmt(c.ativacao)}</td>
                <td class="px-3 py-2 text-xs text-gray-400">${fmt(c.pago_ate)}</td>
                <td class="px-3 py-2 text-xs text-gray-400">Dia ${c.vencimento_dia||'—'}</td>
            </tr>`).join('');
            body.innerHTML = `<div class="text-xs text-gray-400 mb-2">${_cpData.contratos.length} contratos</div>
            <div class="overflow-x-auto"><table class="w-full text-left">
                <thead><tr class="bg-gray-50 text-[11px] text-gray-500 font-semibold">
                    <th class="px-3 py-2">ID</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Acesso</th>
                    <th class="px-3 py-2">Plano</th><th class="px-3 py-2">Cidade</th>
                    <th class="px-3 py-2">Ativação</th><th class="px-3 py-2">Pago até</th><th class="px-3 py-2">Venc.</th>
                </tr></thead><tbody>${rows||'<tr><td colspan="8" class="px-3 py-4 text-center text-gray-400">Nenhum contrato</td></tr>'}</tbody>
            </table></div>`;
        } else if (tab === 'atendimentos') {
            const rows = _cpData.atendimentos.map(a => `<tr class="border-b border-gray-50 hover:bg-gray-50">
                <td class="px-3 py-2 font-mono text-gray-400 text-xs">${a.id}</td>
                <td class="px-3 py-2 text-xs max-w-[180px] truncate" title="${a.assunto||''}">${a.assunto||'—'}</td>
                <td class="px-3 py-2">${badge(a.status)}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${a.departamento||'—'}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${a.responsavel||'—'}</td>
                <td class="px-3 py-2 text-xs text-gray-400">${fmt(a.criado_em)}</td>
            </tr>`).join('');
            body.innerHTML = `<div class="text-xs text-gray-400 mb-2">${_cpData.atendimentos.length} atendimentos</div>
            <div class="overflow-x-auto"><table class="w-full text-left">
                <thead><tr class="bg-gray-50 text-[11px] text-gray-500 font-semibold">
                    <th class="px-3 py-2">ID</th><th class="px-3 py-2">Assunto</th><th class="px-3 py-2">Status</th>
                    <th class="px-3 py-2">Depto</th><th class="px-3 py-2">Responsável</th><th class="px-3 py-2">Data</th>
                </tr></thead><tbody>${rows||'<tr><td colspan="6" class="px-3 py-4 text-center text-gray-400">Nenhum atendimento</td></tr>'}</tbody>
            </table></div>`;
        } else if (tab === 'faturas') {
            const rows = _cpData.faturas.map(f => `<tr class="border-b border-gray-50 hover:bg-gray-50">
                <td class="px-3 py-2 font-mono text-gray-400 text-xs">${f.id}</td>
                <td class="px-3 py-2">${badge(f.status)}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${fmt(f.vencimento)}</td>
                <td class="px-3 py-2 text-xs font-semibold ${parseFloat(f.valor||0)>0?'text-gray-800':'text-gray-400'}">${money(f.valor)}</td>
                <td class="px-3 py-2 text-xs text-green-600">${f.recebido ? money(f.recebido) : '—'}</td>
                <td class="px-3 py-2 text-xs text-gray-400">${fmt(f.pagamento)}</td>
                <td class="px-3 py-2 text-xs">${f.inadimplente ? '<span class="text-red-500 font-semibold">Sim</span>' : '—'}</td>
            </tr>`).join('');
            body.innerHTML = `<div class="text-xs text-gray-400 mb-2">${_cpData.faturas.length} faturas</div>
            <div class="overflow-x-auto"><table class="w-full text-left">
                <thead><tr class="bg-gray-50 text-[11px] text-gray-500 font-semibold">
                    <th class="px-3 py-2">ID</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Vencimento</th>
                    <th class="px-3 py-2">Valor</th><th class="px-3 py-2">Recebido</th>
                    <th class="px-3 py-2">Pgto</th><th class="px-3 py-2">Inadimpl.</th>
                </tr></thead><tbody>${rows||'<tr><td colspan="7" class="px-3 py-4 text-center text-gray-400">Nenhuma fatura</td></tr>'}</tbody>
            </table></div>`;
        } else if (tab === 'equipamentos') {
            const rows = _cpData.equipamentos.map(e => `<tr class="border-b border-gray-50 hover:bg-gray-50">
                <td class="px-3 py-2 font-mono text-gray-400 text-xs">${e.contrato}</td>
                <td class="px-3 py-2 text-xs text-gray-800">${e.descricao||'—'}</td>
                <td class="px-3 py-2 text-xs text-gray-500">${e.quantidade||1}x</td>
                <td class="px-3 py-2">${badge(e.status)}</td>
            </tr>`).join('');
            body.innerHTML = `<div class="text-xs text-gray-400 mb-2">${_cpData.equipamentos.length} equipamentos</div>
            <div class="overflow-x-auto"><table class="w-full text-left">
                <thead><tr class="bg-gray-50 text-[11px] text-gray-500 font-semibold">
                    <th class="px-3 py-2">Contrato</th><th class="px-3 py-2">Equipamento</th>
                    <th class="px-3 py-2">Qtd</th><th class="px-3 py-2">Status</th>
                </tr></thead><tbody>${rows||'<tr><td colspan="4" class="px-3 py-4 text-center text-gray-400">Nenhum equipamento</td></tr>'}</tbody>
            </table></div>`;
        }
    };

    modal.querySelectorAll('.ret-cp-tab').forEach(btn => {
        btn.addEventListener('click', () => _cpRender(btn.dataset.tab));
    });

    try {
        const r = await fetch(`/api/behavior/retiradas/cliente-perfil?cliente=${encodeURIComponent(nomeCliente)}`).then(r => r.json());
        if (r.error) { document.getElementById('ret-cp-body').innerHTML = `<div class="text-red-500 p-4">${r.error}</div>`; return; }
        _cpData = r;
        _cpRender('ordens');
    } catch(e) {
        const b = document.getElementById('ret-cp-body');
        if (b) b.innerHTML = `<div class="text-red-500 p-4">Erro: ${e.message}</div>`;
    }
};

window._retSort = function(col) {
    if (_retSortBy === col) {
        _retSortDir = _retSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        _retSortBy  = col;
        _retSortDir = 'desc'; // primeiro clique sempre maior→menor
    }
    _retPage = 1;
    _retExpanded.clear();
    _retLoad();
};

window._retTab = async function(id, tab) {
    // Update tab button styles
    ['detalhes','mensagens','arquivos'].forEach(t => {
        const btn = document.getElementById(`ret-tab-${id}-${t}`);
        if (btn) {
            if (t === tab) {
                btn.classList.add('border-blue-600','text-blue-700','bg-white');
                btn.classList.remove('border-transparent','text-gray-600');
            } else {
                btn.classList.remove('border-blue-600','text-blue-700','bg-white');
                btn.classList.add('border-transparent','text-gray-600');
            }
        }
        const panel = document.getElementById(`ret-panel-${id}-${t}`);
        if (panel) panel.classList.toggle('hidden', t !== tab);
    });

    const key = `${id}-${tab}`;
    if (_retTabLoaded[key]) return;
    _retTabLoaded[key] = true;

    if (tab === 'mensagens') {
        const panel = document.getElementById(`ret-panel-${id}-mensagens`);
        if (!panel) return;
        panel.innerHTML = '<div class="text-xs text-gray-400 py-2">Carregando mensagens...</div>';
        try {
            const resp = await fetch(`/api/behavior/retiradas/${id}/mensagens`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status} – route not found or server error`);
            const d = await resp.json();
            const msgs = d.mensagens || [];
            if (!msgs.length) {
                panel.innerHTML = '<div class="text-xs text-gray-400 py-2">Nenhuma mensagem encontrada.</div>';
                return;
            }
            // Status comes as full text from IXC: "Aberta", "Encaminhada", "Finalizada"
            const _CLS_MSG = {
                'Aberta':       'bg-orange-100 text-orange-700 border border-orange-200',
                'Encaminhada':  'bg-yellow-100 text-yellow-700 border border-yellow-200',
                'Agendada':     'bg-blue-100 text-blue-700 border border-blue-200',
                'Finalizada':   'bg-green-100 text-green-700 border border-green-200',
            };
            panel.innerHTML = `
            <div class="overflow-x-auto">
            <table class="min-w-full text-xs border-collapse">
              <thead>
                <tr class="bg-gray-700 text-white text-left">
                  <th class="px-3 py-2">ID</th>
                  <th class="px-3 py-2">Status</th>
                  <th class="px-3 py-2 whitespace-nowrap">Data</th>
                  <th class="px-3 py-2">Mensagem</th>
                  <th class="px-3 py-2">Histórico</th>
                  <th class="px-3 py-2">Colaborador</th>
                  <th class="px-3 py-2">Finaliza</th>
                  <th class="px-3 py-2">Operador</th>
                </tr>
              </thead>
              <tbody>
                ${msgs.map(m => {
                  // IXC pode retornar com ou sem prefixo de tabela
                  const _f = (k1, k2) => m[k1] || m[k2] || '';
                  const st  = _f('status','su_oss_chamado_mensagem.status');
                  const cls = _CLS_MSG[st] || 'bg-gray-100 text-gray-700';
                  const dt  = _f('data','su_oss_chamado_mensagem.data').slice(0,16).replace('T',' ');
                  const msg = _f('mensagem','su_oss_chamado_mensagem.mensagem');
                  const his = _f('historico','su_oss_chamado_mensagem.historico');
                  const col = _f('funcionario','nome_colaborador') || _f('colaborador','su_oss_chamado_mensagem.colaborador');
                  const op  = _f('id_operador','su_oss_chamado_mensagem.id_operador');
                  const fin = String(_f('finaliza_processo','su_oss_chamado_mensagem.finaliza_processo')).toUpperCase();
                  return `<tr class="border-b border-gray-100 align-top hover:bg-gray-50">
                    <td class="px-3 py-2 font-mono text-gray-400">#${m.id||'—'}</td>
                    <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full font-medium text-xs ${cls}">${st||'—'}</span></td>
                    <td class="px-3 py-2 whitespace-nowrap text-gray-600">${dt||'—'}</td>
                    <td class="px-3 py-2 max-w-xs break-words text-gray-900 font-medium">${msg||'—'}</td>
                    <td class="px-3 py-2 text-gray-600 max-w-[220px] break-words">${his&&his!=='-'?his:'—'}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-gray-700">${col||'—'}</td>
                    <td class="px-3 py-2 text-center">${fin==='S'||fin==='SIM'?'✅':'Não'}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-gray-600">${op||'—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
            </div>`;
        } catch(e) {
            const panel2 = document.getElementById(`ret-panel-${id}-mensagens`);
            if (panel2) panel2.innerHTML = `<div class="text-xs text-red-500 py-2">Erro ao carregar: ${e.message}</div>`;
            _retTabLoaded[key] = false;
        }
    }

    if (tab === 'arquivos') {
        const panel = document.getElementById(`ret-panel-${id}-arquivos`);
        if (!panel) return;
        panel.innerHTML = '<div class="text-xs text-gray-400 py-2">Carregando arquivos...</div>';
        try {
            const resp = await fetch(`/api/behavior/retiradas/${id}/arquivos`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status} – route not found or server error`);
            const d = await resp.json();
            const arqs = d.arquivos || [];
            if (!arqs.length) {
                panel.innerHTML = '<div class="text-xs text-gray-400 py-2">Nenhum arquivo encontrado.</div>';
                return;
            }
            // Modal lightbox (cria uma única vez)
            if (!document.getElementById('ret-file-modal')) {
                const m = document.createElement('div');
                m.id = 'ret-file-modal';
                m.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);flex-direction:column;align-items:center;justify-content:center;gap:12px';
                m.innerHTML = `
                  <button id="ret-file-modal-close"
                    style="position:absolute;top:16px;right:20px;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:22px;width:36px;height:36px;border-radius:50%;cursor:pointer;line-height:1">✕</button>
                  <div id="ret-file-modal-body" style="max-width:92vw;max-height:88vh;display:flex;align-items:center;justify-content:center"></div>
                  <div id="ret-file-modal-label" style="color:rgba(255,255,255,.7);font-size:12px;max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>`;
                m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
                m.querySelector('#ret-file-modal-close').addEventListener('click', () => { m.style.display = 'none'; });
                document.body.appendChild(m);
            }
            const IMG_EXTS = new Set(['JPG','JPEG','PNG','GIF','WEBP','BMP','SVG']);
            // Busca binário via endpoint visualizar_arquivo_os (mesmo padrão do app-netvale-acs)
            window._retVerArquivo = async function(arquivoId, extHint, label) {
                const modal = document.getElementById('ret-file-modal');
                const body  = document.getElementById('ret-file-modal-body');
                const lbl   = document.getElementById('ret-file-modal-label');
                body.innerHTML = '<div style="color:#fff;font-size:13px">Carregando...</div>';
                lbl.textContent = label;
                modal.style.display = 'flex';
                try {
                    const resp = await fetch(`/api/behavior/ixc-file?id=${encodeURIComponent(arquivoId)}`);
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const blob = await resp.blob();
                    const url  = URL.createObjectURL(blob);
                    const ct   = blob.type || '';  // Content-Type real da resposta
                    const isImg = ct.startsWith('image/') || IMG_EXTS.has(extHint);
                    const isPdf = ct === 'application/pdf' || extHint === 'PDF';
                    body.innerHTML = '';
                    if (isImg) {
                        const img = document.createElement('img');
                        img.src = url;
                        img.style.cssText = 'max-width:90vw;max-height:82vh;border-radius:6px;box-shadow:0 4px 32px rgba(0,0,0,.6);object-fit:contain';
                        img.onclick = e => e.stopPropagation();
                        body.appendChild(img);
                    } else if (isPdf) {
                        body.innerHTML = `<iframe src="${url}" style="width:88vw;height:80vh;border-radius:6px;border:none"></iframe>`;
                    } else {
                        // Tenta mostrar como imagem mesmo assim (IXC às vezes não define content-type)
                        const img = document.createElement('img');
                        img.src = url;
                        img.style.cssText = 'max-width:90vw;max-height:82vh;border-radius:6px;box-shadow:0 4px 32px rgba(0,0,0,.6);object-fit:contain';
                        img.onclick = e => e.stopPropagation();
                        img.onerror = () => {
                            body.innerHTML = `<a href="${url}" download="${label}"
                              style="color:#60a5fa;font-size:14px;text-decoration:underline">⬇ Baixar ${label}</a>`;
                        };
                        body.appendChild(img);
                    }
                } catch(e) {
                    body.innerHTML = `<div style="color:#f87171;font-size:13px">Erro: ${e.message}</div>`;
                }
            };

            panel.innerHTML = `
            <div class="overflow-x-auto">
            <table class="min-w-full text-xs border-collapse">
              <thead>
                <tr class="bg-gray-700 text-white text-left">
                  <th class="px-3 py-2">ID</th>
                  <th class="px-3 py-2">Descrição</th>
                  <th class="px-3 py-2">Extensão</th>
                  <th class="px-3 py-2">Data</th>
                  <th class="px-3 py-2">Arquivo</th>
                </tr>
              </thead>
              <tbody>
                ${arqs.map(a => {
                  const dt    = (a.data_envio || a.data || '').slice(0,16);
                  const loc   = a.local_arquivo || a.local || a.arquivo || a.caminho || '';
                  const fname = a.nome_arquivo || a.nome || loc.split('/').pop() || '';
                  const ext   = (fname.includes('.') ? fname.split('.').pop() : '').toUpperCase();
                  const lbl = (a.descricao||fname||'arquivo').replace(/'/g, "\\'");
                  const btn = a.id
                    ? `<button onclick="window._retVerArquivo('${a.id}','${ext}','${lbl}')"
                         class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                         👁 Ver</button>`
                    : '—';
                  return `<tr class="border-b border-gray-100 hover:bg-gray-50 align-middle">
                    <td class="px-3 py-2 font-mono text-gray-500">${a.id||'—'}</td>
                    <td class="px-3 py-2 text-gray-900">${a.descricao||fname||'—'}</td>
                    <td class="px-3 py-2"><span class="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded text-xs font-mono">${ext||'—'}</span></td>
                    <td class="px-3 py-2 whitespace-nowrap text-gray-600">${dt||'—'}</td>
                    <td class="px-3 py-2">${btn}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
            </div>`;
        } catch(e) {
            const panel2 = document.getElementById(`ret-panel-${id}-arquivos`);
            if (panel2) panel2.innerHTML = `<div class="text-xs text-red-500 py-2">Erro ao carregar: ${e.message}</div>`;
            _retTabLoaded[key] = false;
        }
    }
};

// ─── Acompanhamento de Clientes (aba visão geral) ─────────────────────────────

let _acompPage = 1;
const _ACOMP_PAGE_SIZE = 25;
let _acompData = [];

async function renderAcompanhamentoTab() {
    const pane = document.getElementById('tab-content-acompanhamento');
    if (!pane) return;

    pane.innerHTML = `
    <div class="p-4">
      <h2 class="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Acompanhamento de Clientes</h2>
      <div class="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status Snooze</label>
          <select id="acomp-filter-status" class="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-gray-100">
            <option value="">Todos</option>
            <option value="ativos">Com retorno agendado</option>
            <option value="vencidos">Sem snooze / vencido</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Usuário</label>
          <select id="acomp-filter-usuario" class="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-gray-100">
            <option value="">Todos</option>
          </select>
        </div>
        <button id="acomp-filter-btn" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded">Filtrar</button>
      </div>
      <div id="acomp-table-wrap" class="overflow-x-auto">
        <div class="text-gray-400 text-sm py-8 text-center">Carregando...</div>
      </div>
      <div id="acomp-pagination" class="flex gap-2 justify-center mt-3"></div>
    </div>`;

    document.getElementById('acomp-filter-btn').addEventListener('click', () => {
        _acompPage = 1;
        _loadAcompanhamento();
    });

    await _loadAcompanhamento();
}

async function _loadAcompanhamento() {
    const status  = document.getElementById('acomp-filter-status')?.value  || '';
    const usuario = document.getElementById('acomp-filter-usuario')?.value || '';
    const wrap    = document.getElementById('acomp-table-wrap');
    if (!wrap) return;

    wrap.innerHTML = '<div class="text-gray-400 text-sm py-8 text-center">Carregando...</div>';

    try {
        const params = new URLSearchParams();
        if (status)  params.set('status',  status);
        if (usuario) params.set('usuario', usuario);

        params.set('limit', '10000');
        const res = await fetch(`/api/behavior/acompanhamento/all?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        _acompData = data.registros || [];

        // Populate usuario dropdown
        const selUsr = document.getElementById('acomp-filter-usuario');
        if (selUsr) {
            const usuarios = (data.usuarios || []).filter(Boolean);
            const curVal = selUsr.value;
            selUsr.innerHTML = '<option value="">Todos</option>' +
                usuarios.map(u => `<option value="${u}"${u===curVal?' selected':''}>${u}</option>`).join('');
        }

        _renderAcompTable();
    } catch (err) {
        wrap.innerHTML = `<div class="text-red-500 text-sm py-8 text-center">Erro ao carregar dados.</div>`;
        console.error('Erro acompanhamento/all:', err);
    }
}

function _renderAcompTable() {
    const wrap  = document.getElementById('acomp-table-wrap');
    const pgDiv = document.getElementById('acomp-pagination');
    if (!wrap) return;

    const isAdmin = window._currentUser?.is_admin || window._currentUser?.username === 'admin';

    const total = _acompData.length;
    const pages = Math.max(1, Math.ceil(total / _ACOMP_PAGE_SIZE));
    if (_acompPage > pages) _acompPage = pages;

    const slice = _acompData.slice((_acompPage - 1) * _ACOMP_PAGE_SIZE, _acompPage * _ACOMP_PAGE_SIZE);

    if (!slice.length) {
        wrap.innerHTML = '<div class="text-gray-400 text-sm py-8 text-center">Nenhum registro encontrado.</div>';
        if (pgDiv) pgDiv.innerHTML = '';
        return;
    }

    const statusBadge = (r) => {
        if (!r.snooze_ate) return '<span class="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">–</span>';
        const past = r.snooze_ate < new Date().toISOString().slice(0, 10);
        return past
            ? `<span class="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">Vencido ${r.snooze_ate}</span>`
            : `<span class="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">Até ${r.snooze_ate}</span>`;
    };

    const esc = s => (s ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const acoesHeader = isAdmin ? '<th class="px-3 py-2 border-b border-gray-200">Ações</th>' : '';
    const acoesCell = (r) => isAdmin ? `
        <td class="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
          <button onclick="_acompEdit(${r.id})" class="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 mr-1">Editar</button>
          <button onclick="_acompDelete(${r.id})" class="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">Excluir</button>
        </td>` : '';

    wrap.innerHTML = `
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
          <th class="px-3 py-2 border-b border-gray-200">Contrato</th>
          <th class="px-3 py-2 border-b border-gray-200">Cliente</th>
          <th class="px-3 py-2 border-b border-gray-200">Cidade</th>
          <th class="px-3 py-2 border-b border-gray-200">Tipo Ação</th>
          <th class="px-3 py-2 border-b border-gray-200">Resultado</th>
          <th class="px-3 py-2 border-b border-gray-200 max-w-xs">Observação</th>
          <th class="px-3 py-2 border-b border-gray-200">Registrado em</th>
          <th class="px-3 py-2 border-b border-gray-200">Retorno</th>
          <th class="px-3 py-2 border-b border-gray-200">Snooze</th>
          <th class="px-3 py-2 border-b border-gray-200">Usuário</th>
          ${acoesHeader}
        </tr>
      </thead>
      <tbody id="acomp-tbody">
        ${slice.map((r, i) => `
        <tr id="acomp-row-${r.id}" class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50">
          <td class="px-3 py-2 border-b border-gray-100 font-mono text-blue-700">${esc(r.contrato_id)}</td>
          <td class="px-3 py-2 border-b border-gray-100">${esc(r.cliente)}</td>
          <td class="px-3 py-2 border-b border-gray-100">${esc(r.cidade)}</td>
          <td class="px-3 py-2 border-b border-gray-100">${esc(r.tipo_acao)}</td>
          <td class="px-3 py-2 border-b border-gray-100">${esc(r.resultado)}</td>
          <td class="px-3 py-2 border-b border-gray-100 max-w-xs truncate" title="${esc(r.observacao)}">${esc(r.observacao)}</td>
          <td class="px-3 py-2 border-b border-gray-100 whitespace-nowrap">${esc((r.data_registro||'').slice(0,16))}</td>
          <td class="px-3 py-2 border-b border-gray-100 whitespace-nowrap">${esc(r.data_retorno||'–')}</td>
          <td class="px-3 py-2 border-b border-gray-100">${statusBadge(r)}</td>
          <td class="px-3 py-2 border-b border-gray-100">${esc(r.usuario)}</td>
          ${acoesCell(r)}
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="text-xs text-gray-400 mt-2 px-1">${total} registro${total !== 1 ? 's' : ''}</div>`;

    // Pagination
    if (pgDiv) {
        pgDiv.innerHTML = '';
        if (pages > 1) {
            const btn = (label, page, disabled) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.disabled = disabled;
                b.className = `px-3 py-1 rounded text-sm border ${disabled
                    ? 'border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600 cursor-default'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`;
                if (!disabled) b.addEventListener('click', () => { _acompPage = page; _renderAcompTable(); });
                return b;
            };
            pgDiv.appendChild(btn('«', 1, _acompPage === 1));
            pgDiv.appendChild(btn('‹', _acompPage - 1, _acompPage === 1));
            const info = document.createElement('span');
            info.className = 'px-2 py-1 text-sm text-gray-500';
            info.textContent = `${_acompPage} / ${pages}`;
            pgDiv.appendChild(info);
            pgDiv.appendChild(btn('›', _acompPage + 1, _acompPage === pages));
            pgDiv.appendChild(btn('»', pages, _acompPage === pages));
        }
    }
}

window._acompEdit = function(id) {
    const r = _acompData.find(x => x.id === id);
    if (!r) return;

    const row = document.getElementById(`acomp-row-${id}`);
    if (!row) return;

    const tipoOpts = ['ligacao','whatsapp','visita','email']
        .map(v => `<option value="${v}"${r.tipo_acao===v?' selected':''}>${v}</option>`).join('');
    const resOpts = ['retido','nao_atendeu','cancelou','pendente','resolvido']
        .map(v => `<option value="${v}"${r.resultado===v?' selected':''}>${v}</option>`).join('');

    const cols = row.children.length;
    row.innerHTML = `
      <td colspan="${cols}" class="px-3 py-3 border-b border-blue-200 bg-blue-50">
        <div class="flex flex-wrap gap-2 items-end">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Tipo Ação</label>
            <select id="ae-tipo" class="border rounded px-2 py-1 text-sm">${tipoOpts}</select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Resultado</label>
            <select id="ae-resultado" class="border rounded px-2 py-1 text-sm">${resOpts}</select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Data Retorno</label>
            <input id="ae-retorno" type="date" value="${r.data_retorno||''}" class="border rounded px-2 py-1 text-sm">
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Snooze até</label>
            <input id="ae-snooze" type="date" value="${r.snooze_ate||''}" class="border rounded px-2 py-1 text-sm">
          </div>
          <div style="flex:1;min-width:180px;">
            <label class="block text-xs text-gray-500 mb-1">Observação</label>
            <input id="ae-obs" type="text" value="${(r.observacao||'').replace(/"/g,'&quot;')}" class="border rounded px-2 py-1 text-sm w-full">
          </div>
          <button onclick="_acompEditSave(${id})" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded">Salvar</button>
          <button onclick="_loadAcompanhamento()" class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded">Cancelar</button>
        </div>
      </td>`;
};

window._acompEditSave = async function(id) {
    const body = {
        tipo_acao:    document.getElementById('ae-tipo')?.value      || '',
        resultado:    document.getElementById('ae-resultado')?.value || '',
        observacao:   document.getElementById('ae-obs')?.value       || '',
        data_retorno: document.getElementById('ae-retorno')?.value   || '',
        snooze_ate:   document.getElementById('ae-snooze')?.value    || '',
    };
    try {
        const res = await fetch(`/api/behavior/acompanhamento/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Erro ao salvar'); return; }
        await _loadAcompanhamento();
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
};

window._acompDelete = async function(id) {
    if (!confirm('Excluir este registro de acompanhamento?')) return;
    try {
        const res = await fetch(`/api/behavior/acompanhamento/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Erro ao excluir'); return; }
        _acompData = _acompData.filter(r => r.id !== id);
        _renderAcompTable();
    } catch (err) {
        alert('Erro ao excluir: ' + err.message);
    }
};
