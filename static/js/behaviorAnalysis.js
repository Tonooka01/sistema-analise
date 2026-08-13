import * as state from './state.js';
import * as dom from './dom.js';
import * as utils from './utils.js';
import { renderChart, destroySpecificChart } from './charts.js'; // Remove importações desnecessárias
import { getGridStack } from './state.js';
import { populateContractStatusFilters } from './customAnalysisTables.js';

// --- LÓGICA DA ANÁLISE DE COMPORTAMENTO (Abas) ---

/**
 * Inicializa a primeira aba da Análise de Comportamento.
 */
export function initializeBehaviorAnalysis() {
    const firstTab = dom.behaviorAnalysisTabs?.querySelector('.tab-link');
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

        // --- INICIALIZAÇÃO DO GRIDSTACK ---
        // Inicializa uma NOVA instância GridStack especificamente para esta div
        const grid = GridStack.init({
            cellHeight: 70,
            minRow: 1,
            margin: 10,
            float: true,
            column: 12,
            disableOneColumnMode: false
        }, chartsArea);

        // Renderiza Gráficos no GridStack Local
        if (grid) {
            // Gráfico 1: Top Assuntos
            if (hasSubjectData) {
                const chartId = 'complaintChart';
                // Conteúdo do Widget
                const content = `
                    <div class="grid-stack-item-content">
                        <div class="chart-container-header">
                            <h3 id="${chartId}Title" class="chart-title">Top Assuntos de Reclamação ${filterText}</h3>
                        </div>
                        <div class="chart-canvas-container"><canvas id="${chartId}"></canvas></div>
                    </div>`;
                
                // --- ALTERAÇÃO AQUI: Aumentado para largura total (12) e altura maior (14) ---
                grid.addWidget({w: 12, h: 14, x: 0, y: 0, content: content, id: 'topSubjectsWidget'});
                
                // Renderiza o gráfico usando a função global, que busca o canvas pelo ID
                // Pequeno delay para garantir que o DOM do widget foi inserido
                setTimeout(() => {
                    renderChart(chartId, 'bar_vertical', data.top_subjects.map(d => d.Assunto), [{ label: 'Contagem', data: data.top_subjects.map(d => d.Count) }], `Top Assuntos de Reclamação ${filterText}`, { formatterType: 'number' });
                    _addChartClickHandler(chartId, label => {
                        const url = `${state.API_BASE_URL}/api/behavior/complaint_clients?subject=${encodeURIComponent(label)}&city=${encodeURIComponent(city)}`;
                        _openBehaviorDetailModal(`Reclamações: "${label}"`, url, true);
                    });
                }, 50);
            }
        } else {
             chartsArea.innerHTML = '<p class="text-red-500">Erro: Falha ao inicializar a grade de gráficos.</p>';
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
                <div class="summary-card" style="border-left:4px solid #ef4444;cursor:pointer;" onclick="document.getElementById('predRiskFilter').value='Alto';document.getElementById('btnFilterPredictive').click()">
                    <div class="summary-card-label">🔴 Alto Risco</div>
                    <div class="summary-card-value" style="color:#ef4444;">${s.Alto || 0}</div>
                    <div style="font-size:0.7rem;color:#9ca3af;">Score ≥ 60 · clique para filtrar</div>
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
            'Alto':  'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
            'Médio': 'background:#ffedd5;color:#ea580c;border:1px solid #fdba74;',
            'Baixo': 'background:#fefce8;color:#ca8a04;border:1px solid #fde047;',
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