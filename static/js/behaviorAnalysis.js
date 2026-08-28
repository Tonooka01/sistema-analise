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
    let _alertaFilters = { city: '', tier: '' };

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
            city: _alertaFilters.city,
            tier: _alertaFilters.tier,
            limit: rowsPerPage,
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
        _alertaFilters.city = document.getElementById('alertaCityFilter')?.value || '';
        _alertaFilters.tier = document.getElementById('alertaTierFilter')?.value || '';
        fetchAndRenderAlertaTable(1);
    });

    tabContent.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-contrato]');
        if (tr && typeof showClientDetail === 'function') showClientDetail(tr.dataset.contrato);
    });

    await fetchAndRenderAlertaTable(1);
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
        </tr>
      </thead>
      <tbody>
        ${slice.map((r, i) => `
        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50">
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
