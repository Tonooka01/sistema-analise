import * as state from './state.js';
import * as dom from './dom.js';
import * as utils from './utils.js';
import { renderChartsForCurrentCollection } from './chartCollection.js';
import { destroyAllMainCharts } from './charts.js';
import { getGridStack } from './state.js';

// --- Lógica Principal de Análise (Coleções Padrão) ---

/**
 * Busca e renderiza as análises gráficas para uma coleção de dados padrão (botões azuis).
 * @param {string} collectionName - O nome da coleção (ex: 'Clientes').
 * @param {string} startDate - Data inicial para filtrar os dados (opcional).
 * @param {string} endDate - Data final para filtrar os dados (opcional).
 * @param {string} city - A cidade para filtrar os dados (opcional, usado em 'OS', 'Contratos', 'Contas a Receber').
 */
export async function fetchAndRenderMainAnalysis(collectionName, startDate = '', endDate = '', city = '') {
    utils.showLoading(true);
    
    // Limpa apenas a área de conteúdo principal, mantendo a área de gráficos
    if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = '';
    
    // Garante que a área de gráficos esteja visível e seja adicionada se removida
    if (dom.mainChartsArea) {
         if (dom.dashboardContentDiv && !dom.dashboardContentDiv.contains(dom.mainChartsArea)) {
             dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
         }
         dom.mainChartsArea.classList.remove('hidden'); // Garante visibilidade
         dom.mainChartsArea.innerHTML = ''; // Limpa conteúdo anterior da área de gráficos
    } else {
         console.error("fetchAndRenderMainAnalysis: mainChartsArea não encontrado no DOM.");
         utils.showError("Erro interno: Área de gráficos não encontrada.");
         utils.showLoading(false);
         return;
    }

     // Limpa gráficos anteriores e remove widgets do GridStack ANTES de buscar novos dados
     destroyAllMainCharts();
     const grid = getGridStack();
     if (grid) grid.removeAll();

    state.setModalCurrentCollection(collectionName);
    // Atualiza a cidade selecionada no estado global
    state.setCurrentSelectedCity(city);

    const apiCollectionName = collectionName.replace(/ /g, '_');

    // Mapeamento dos endpoints da API para cada coleção
    const endpointMap = {
        'Clientes': 'summary',
        'Contratos': 'summary',
        'Contas a Receber': 'finance_summary',
        'Atendimentos': 'atendimento_summary',
        'OS': 'os_summary',
        'Logins': 'summary',
        'Cidade': 'summary', 
        'Vendedor': 'summary',
    };

    const endpoint = endpointMap[collectionName];

    // Se não houver endpoint de resumo gráfico definido
    if (!endpoint) {
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhuma análise gráfica configurada para a coleção "${collectionName}". Use o botão abaixo para ver a tabela.</p>`;
        }
        if (dom.viewTableBtn) dom.viewTableBtn.classList.remove('hidden');
        if (dom.financialFiltersDiv) dom.financialFiltersDiv.classList.add('hidden'); // Esconde filtros principais
        utils.showLoading(false);
        return;
    }

    // Constrói a URL da API com parâmetros de filtro de DATA
    let url = `${state.API_BASE_URL}/api/${endpoint}/${apiCollectionName}`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    // Adiciona filtro de cidade para coleções específicas que suportam
    const collectionsWithCityFilterAPI = ['OS', 'Contratos', 'Contas a Receber'];
    if (city && collectionsWithCityFilterAPI.includes(collectionName)) {
        params.append('city', city);
    }

    if (params.toString()) {
        url += `?${params.toString()}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, `Falha ao carregar análise para "${collectionName}"`);
            throw new Error(errorMessage);
        }
        const analysisData = await response.json();
        state.setGlobalCurrentAnalysisData(analysisData); // Salva os dados no estado global

        // --- Lógica para Exibir Filtros (Atualizada para Datas) ---
        // Coleções que suportam filtro de data (anteriormente ano/mês, agora range completo)
        const collectionsWithDateFilter = ['Contas a Receber', 'Atendimentos', 'OS', 'Clientes', 'Contratos', 'Logins'];

        if (dom.financialFiltersDiv) {
             const showDateFilters = collectionsWithDateFilter.includes(collectionName);
             dom.financialFiltersDiv.classList.toggle('hidden', !showDateFilters);
             
             // Preenche os inputs de data com os valores atuais se o filtro estiver visível
             if (showDateFilters) {
                 if (dom.generalStartDate) dom.generalStartDate.value = startDate;
                 if (dom.generalEndDate) dom.generalEndDate.value = endDate;
             }
        }

        // Mostra filtro de Cidade para coleções específicas que o suportam
        const collectionsWithCityFilterUI = ['OS', 'Contratos', 'Contas a Receber'];
        if (dom.cityFilterContainer) {
             const showCityFilter = collectionsWithCityFilterUI.includes(collectionName);
             dom.cityFilterContainer.classList.toggle('hidden', !showCityFilter);
             
             // Popula o select de cidades se houver dados retornados pela API
             if (showCityFilter && analysisData.cities && dom.cityFilterSelect) {
                 utils.populateCityFilter(dom.cityFilterSelect, analysisData.cities, state.getCurrentSelectedCity());
             }
        }

        // Renderiza os gráficos usando a função central do chartCollection.js
        renderChartsForCurrentCollection();

        if (dom.viewTableBtn) dom.viewTableBtn.classList.remove('hidden'); // Mostra o botão da tabela

    } catch (error) {
        utils.showError(error.message);
        // Garante que filtros e botão da tabela sejam escondidos em caso de erro
        if (dom.financialFiltersDiv) dom.financialFiltersDiv.classList.add('hidden');
        if (dom.cityFilterContainer) dom.cityFilterContainer.classList.add('hidden');
        if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');
    } finally {
        utils.showLoading(false);
    }
}