import * as state from './state.js';
import * as dom from './dom.js';
import * as utils from './utils.js';
import { renderChartsForCurrentCollection } from './chartCollection.js';
import { destroyAllMainCharts } from './charts.js';
import { getGridStack } from './state.js';

// --- Lógica Principal de Análise (Coleções Padrão) ---

/**
 * Busca e renderiza as análises gráficas para uma coleção de dados padrão (botões azuis).
 */
export async function fetchAndRenderMainAnalysis(collectionName, startDate = '', endDate = '', city = '') {
    utils.showLoading(true);
    
    if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = '';
    
    if (dom.mainChartsArea) {
         if (dom.dashboardContentDiv && !dom.dashboardContentDiv.contains(dom.mainChartsArea)) {
             dom.dashboardContentDiv.appendChild(dom.mainChartsArea);
         }
         dom.mainChartsArea.classList.remove('hidden');
         dom.mainChartsArea.innerHTML = '';
    } else {
         console.error("fetchAndRenderMainAnalysis: mainChartsArea não encontrado no DOM.");
         utils.showError("Erro interno: Área de gráficos não encontrada.");
         utils.showLoading(false);
         return;
    }

    destroyAllMainCharts();
    const grid = getGridStack();
    if (grid) grid.removeAll();

    state.setModalCurrentCollection(collectionName);
    state.setCurrentSelectedCity(city);

    const apiCollectionName = collectionName.replace(/ /g, '_');

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

    if (!endpoint) {
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhuma análise gráfica configurada para a coleção "${collectionName}". Use o botão abaixo para ver a tabela.</p>`;
        }
        if (dom.viewTableBtn) dom.viewTableBtn.classList.remove('hidden');
        if (dom.financialFiltersDiv) dom.financialFiltersDiv.classList.add('hidden');
        utils.showLoading(false);
        return;
    }

    let url = `${state.API_BASE_URL}/api/${endpoint}/${apiCollectionName}`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

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
        state.setGlobalCurrentAnalysisData(analysisData);

        const collectionsWithDateFilter = ['Contas a Receber', 'Atendimentos', 'OS', 'Clientes', 'Contratos', 'Logins'];

        if (dom.financialFiltersDiv) {
             const showDateFilters = collectionsWithDateFilter.includes(collectionName);
             dom.financialFiltersDiv.classList.toggle('hidden', !showDateFilters);
             
             if (showDateFilters) {
                 if (dom.generalStartDate) dom.generalStartDate.value = startDate;
                 if (dom.generalEndDate) dom.generalEndDate.value = endDate;
             }
        }

        const collectionsWithCityFilterUI = ['OS', 'Contratos', 'Contas a Receber'];
        if (dom.cityFilterContainer) {
             const showCityFilter = collectionsWithCityFilterUI.includes(collectionName);
             dom.cityFilterContainer.classList.toggle('hidden', !showCityFilter);
             
             if (showCityFilter && analysisData.cities && dom.cityFilterSelect) {
                 utils.populateCityFilter(dom.cityFilterSelect, analysisData.cities, state.getCurrentSelectedCity());
             }
        }

        renderChartsForCurrentCollection();

        if (dom.viewTableBtn) dom.viewTableBtn.classList.remove('hidden');

    } catch (error) {
        utils.showError(error.message);
        if (dom.financialFiltersDiv) dom.financialFiltersDiv.classList.add('hidden');
        if (dom.cityFilterContainer) dom.cityFilterContainer.classList.add('hidden');
        if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');
    } finally {
        utils.showLoading(false);
    }
}

// --- Lógica Específica para Permanência Real (Nova Coluna Adicionada) ---

/**
 * Função para carregar os dados de permanência real chamando a API de Churn.
 */
export async function loadPermanenceReal() {
    const container = document.getElementById('analysis-content-container');
    if (!container) return;

    utils.showLoading(true);

    try {
        // Busca filtros do estado global ou inputs
        const filters = {
            start_date: dom.generalStartDate?.value || '',
            end_date: dom.generalEndDate?.value || '',
            search_term: document.getElementById('search-permanence')?.value || ''
        };

        const params = new URLSearchParams(filters);
        const response = await fetch(`${state.API_BASE_URL}/api/churn/real_permanence?${params.toString()}`);
        
        if (!response.ok) throw new Error("Erro ao buscar dados de permanência.");
        
        const result = await response.json();
        renderPermanenceTable(result.data, container);
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Erro: ${error.message}</div>`;
    } finally {
        utils.showLoading(false);
    }
}

/**
 * Renderiza a tabela de Permanência Real com a coluna Data de Ativação.
 */
export function renderPermanenceTable(data, container) {
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhum dado encontrado para os filtros selecionados.</div>';
        return;
    }

    let html = `
        <div class="table-responsive p-3">
            <h5 class="mb-3"><i class="fas fa-history mr-2"></i>Análise de Permanência Real</h5>
            <table class="table table-hover custom-table w-100" id="table-permanence-real">
                <thead class="thead-light">
                    <tr>
                        <th>ID</th>
                        <th>Cliente</th>
                        <th>Cidade</th>
                        <th>Data Ativação</th>
                        <th>Data Canc.</th>
                        <th title="Baseado em faturas pagas">Perm. Paga (M)</th>
                        <th title="Diferença entre Ativação e Cancelamento">Perm. Real (M)</th>
                        <th>Vendedor</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.forEach(item => {
        // Formatação simples de data YYYY-MM-DD -> DD/MM/YYYY
        const fmtDate = (d) => d ? d.split('-').reverse().join('/') : '<span class="text-muted">N/D</span>';
        
        html += `
            <tr>
                <td><small class="text-muted">${item.Contrato_ID}</small></td>
                <td class="font-weight-bold">${item.Cliente}</td>
                <td>${item.Cidade}</td>
                <td class="text-nowrap">${fmtDate(item.data_ativacao)}</td>
                <td class="text-nowrap">${fmtDate(item.Data_cancelamento)}</td>
                <td class="text-center font-weight-bold text-success">${item.Permanencia_Paga || 0}</td>
                <td class="text-center font-weight-bold text-primary">${item.Permanencia_Real_Calendario || 0}</td>
                <td><small>${item.Vendedor_Nome || 'N/A'}</small></td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
    
    // Inicialização do DataTable (se disponível)
    if (window.$ && $.fn.DataTable) {
        if ($.fn.DataTable.isDataTable('#table-permanence-real')) {
            $('#table-permanence-real').DataTable().destroy();
        }
        $('#table-permanence-real').DataTable({
            language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/pt-BR.json' },
            order: [[5, 'desc']], 
            pageLength: 15,
            dom: 'Bfrtip',
            buttons: ['copy', 'excel', 'pdf']
        });
    }
}