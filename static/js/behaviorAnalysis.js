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
 * Renderiza o conteúdo (placeholder) da aba "Padrão de Churn".
 */
function renderChurnPatternTab() {
    const tabContent = document.getElementById('tab-content-churn');
    if (tabContent) {
        tabContent.innerHTML = `<p class="text-center text-gray-500 p-4">Análise de Padrão de Churn - Em desenvolvimento.</p>`;
    }
}

/**
 * Prepara a UI e busca os dados para a aba "Análise Preditiva de Churn".
 */
function renderPredictiveChurnTab() {
    const tabContent = document.getElementById('tab-content-preditiva');
    if (!tabContent) return;

    // Estrutura HTML da aba com filtros e botão
    tabContent.innerHTML = `
        <div id="predictive-churn-filters" class="flex flex-wrap justify-center items-end gap-4 my-4">
            <div>
                <label for="predictiveContractStatusFilter" class="text-gray-700 font-medium mr-2 text-sm">Status Contrato:</label>
                <select id="predictiveContractStatusFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="Ativo" selected>Ativo</option>
                    <!-- Outros status podem ser populados dinamicamente se necessário -->
                </select>
            </div>
            <div>
                <label for="predictiveAccessStatusFilter" class="text-gray-700 font-medium mr-2 text-sm">Status Acesso:</label>
                <select id="predictiveAccessStatusFilter" class="py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="">Todos</option>
                </select>
            </div>
            <button id="btnFilterPredictive" class="bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-semibold text-sm h-10">Filtrar</button>
        </div>
        <div id="predictive-churn-table-container"></div> <!-- Container para a tabela e paginação -->
    `;

    // Popula o filtro de Status de Acesso
    const mainAccessFilter = dom.accessStatusFilter; // Pega do DOM principal
    const predictiveAccessFilter = tabContent.querySelector('#predictiveAccessStatusFilter');

    const populatePredictiveFilter = () => {
         if (mainAccessFilter && predictiveAccessFilter) {
             predictiveAccessFilter.innerHTML = mainAccessFilter.innerHTML;
             if (predictiveAccessFilter.options[0]?.value !== '') {
                  const todosOption = document.createElement('option');
                  todosOption.value = '';
                  todosOption.textContent = 'Todos';
                  predictiveAccessFilter.insertBefore(todosOption, predictiveAccessFilter.firstChild);
             }
             predictiveAccessFilter.value = '';
         }
    };

    if (mainAccessFilter && mainAccessFilter.options.length > 1) {
        populatePredictiveFilter();
    } else {
        populateContractStatusFilters().then(populatePredictiveFilter);
    }

    // Adiciona listener ao botão
    const btnFilter = tabContent.querySelector('#btnFilterPredictive');
    if (btnFilter) btnFilter.addEventListener('click', () => fetchAndRenderPredictiveChurnTable(1));

    // Carrega a tabela inicial
    fetchAndRenderPredictiveChurnTable(1);
}

/**
 * Busca os dados e renderiza a tabela paginada da "Análise Preditiva de Churn".
 * @param {number} page - Número da página a ser buscada.
 */
export async function fetchAndRenderPredictiveChurnTable(page = 1) {
    const container = document.getElementById('predictive-churn-table-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"></div>'; // Mostra loading

    const contractStatus = document.getElementById('predictiveContractStatusFilter')?.value || 'Ativo';
    const accessStatus = document.getElementById('predictiveAccessStatusFilter')?.value || '';
    const rowsPerPage = 50; // Pode ser ajustável se necessário
    const offset = (page - 1) * rowsPerPage;

    const params = new URLSearchParams({
        limit: rowsPerPage,
        offset: offset,
        status_contrato: contractStatus
    });
    // Adiciona status_acesso apenas se um valor for selecionado
    if (accessStatus) {
        params.append('status_acesso', accessStatus);
    }
    const url = `${state.API_BASE_URL}/api/behavior/predictive_churn?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(await utils.handleFetchError(response, 'Não foi possível carregar a análise preditiva.'));
        }
        const result = await response.json();

        // Guarda o estado atual da paginação para esta tabela específica
        const tableState = { currentPage: page, totalRows: result.total_rows || 0, rowsPerPage: rowsPerPage };

        // Define as colunas
        const columns = [
            { header: 'Cliente', render: r => `<span title="${r.Razao_Social}">${r.Razao_Social}</span>` },
            { header: 'Contrato ID', key: 'Contrato_ID' },
             // Simplificado para indicar que o evento ocorreu, mas ainda linka para detalhes financeiros
            { header: 'Teve Atraso >10d?', render: r => `<span class="detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="financial" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">Sim</span>` },
            { header: 'Tem Reclamações?', render: r => `<span class="detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="complaints" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">Sim</span>` },
            { header: 'Última Conexão', render: r => r.Ultima_Conexao ? `<span class="detail-trigger cursor-pointer text-blue-600 hover:underline" data-type="logins" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${utils.formatDate(r.Ultima_Conexao)}</span>` : 'N/A' }
        ];

        // Renderiza a tabela ou mensagem de "nenhum resultado"
        let tableHtml = '<p class="text-center text-gray-500 mt-4">Nenhum cliente com perfil de risco encontrado para os filtros selecionados.</p>';
        if (result.data && result.data.length > 0) {
            tableHtml = utils.renderGenericDetailTable(null, result.data, columns, true);
        }

        // Renderiza a paginação usando a função utilitária
        const paginationHtml = utils.createGenericPaginationHtml('predictive-page-btn', tableState);

        // Atualiza o container com a tabela e a paginação
        container.innerHTML = `<div class="table-wrapper border rounded-lg overflow-hidden">${tableHtml}</div>` + paginationHtml;

    } catch (error) {
        container.innerHTML = `<p class="text-red-500 p-4">${error.message}</p>`;
    }
}