/**
 * events/customAnalysis.js
 * Lógica do dropdown de Análise Personalizada e seus botões de filtro.
 */

import * as dom from '../dom.js';
import * as state from '../state.js';
import * as utils from '../utils.js';
import * as customTables from '../customAnalysisTables.js';
import * as customCharts from '../customAnalysisCharts.js';
import * as behaviorAnalysis from '../behaviorAnalysis.js';
import { destroyAllMainCharts } from '../charts.js';

/**
 * Lida com a mudança no seletor de Análise Personalizada.
 * @param {number} [page=1]
 * @param {boolean} [triggerFetch=true]
 */
export function handleCustomAnalysisChange(page = 1, triggerFetch = true) {
    const selectedAnalysis = dom.customAnalysisSelector?.value;
    if (!selectedAnalysis) return;

    const searchTerm = dom.clientSearchInput?.value || '';
    const currentSortOrder = state.getCustomAnalysisState().sortOrder;
    const sortAsc = currentSortOrder === 'asc';

    utils.hideAllCustomFilters();

    if (dom.filterActiveClientsBtn) dom.filterActiveClientsBtn.classList.remove('hidden');
    if (dom.applyClientSearchBtn) dom.applyClientSearchBtn.classList.remove('hidden');
    if (dom.btnFilterFaturamento) dom.btnFilterFaturamento.classList.remove('hidden');
    if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');

    let shouldFetch = true;
    if (selectedAnalysis === 'real_permanence' && !triggerFetch) shouldFetch = false;

    if (!shouldFetch) {
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.classList.remove('hidden');
            dom.dashboardContentDiv.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-500">
                    <svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <p class="text-xl font-medium">Selecione os filtros acima e clique em "Filtrar" para visualizar os dados.</p>
                </div>`;
        }
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        destroyAllMainCharts();
        const gridStackInstance = state.getGridStack();
        if (gridStackInstance) gridStackInstance.removeAll();
    } else {
        if (dom.dashboardContentDiv) dom.dashboardContentDiv.classList.remove('hidden');
    }

    switch (selectedAnalysis) {
        case 'comparativo_diario':
            if (shouldFetch) customTables.fetchAndRenderDailyComparison();
            break;

        case 'analise_juros_atraso':
            if (dom.latePaymentFiltersDiv) dom.latePaymentFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderLateInterestAnalysis(
                    dom.latePaymentStartDate?.value || '',
                    dom.latePaymentEndDate?.value || ''
                );
            }
            break;

        case 'faturamento_por_cidade':
            if (dom.faturamentoCidadeFiltersDiv) dom.faturamentoCidadeFiltersDiv.classList.remove('hidden');
            if (dom.faturamentoCityFilter) dom.faturamentoCityFilter.closest('.flex-col')?.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderBillingByCityAnalysis(
                    dom.faturamentoStartDate?.value || '',
                    dom.faturamentoEndDate?.value || '',
                    dom.faturamentoCityFilter?.value || ''
                );
            }
            break;

        case 'active_clients_evolution':
            if (dom.faturamentoCidadeFiltersDiv) dom.faturamentoCidadeFiltersDiv.classList.remove('hidden');
            if (dom.faturamentoCityFilter) dom.faturamentoCityFilter.closest('.flex-col')?.classList.remove('hidden');
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            if (dom.filterActiveClientsBtn) dom.filterActiveClientsBtn.classList.add('hidden');
            customTables.populateContractStatusFilters();
            if (shouldFetch) {
                customCharts.fetchAndRenderActiveClientsEvolution(
                    dom.faturamentoStartDate?.value || '',
                    dom.faturamentoEndDate?.value || '',
                    dom.faturamentoCityFilter?.value || ''
                );
            }
            break;

        case 'analise_comportamento':
            if (dom.behaviorAnalysisContainer) dom.behaviorAnalysisContainer.classList.remove('hidden');
            if (shouldFetch) behaviorAnalysis.initializeBehaviorAnalysis();
            break;

        case 'atrasos_e_nao_pagos':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.add('hidden');
            if (dom.relevanceFilterContainer) dom.relevanceFilterContainer.classList.add('hidden');
            if (shouldFetch) customTables.fetchAndRenderLatePaymentsAnalysis(searchTerm, page);
            break;

        case 'saude_financeira_contrato_atraso':
        case 'saude_financeira_contrato_bloqueio':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.add('hidden');
            if (dom.relevanceFilterContainer) dom.relevanceFilterContainer.classList.add('hidden');
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            if (dom.financialHealthDateContainer) dom.financialHealthDateContainer.classList.remove('hidden');
            if (dom.applyClientSearchBtn) dom.applyClientSearchBtn.classList.add('hidden');
            customTables.populateContractStatusFilters();
            if (triggerFetch || shouldFetch) {
                const analysisType = selectedAnalysis.endsWith('_bloqueio') ? 'bloqueio' : 'atraso';
                customTables.fetchAndRenderFinancialHealthAnalysis(
                    searchTerm, analysisType, page,
                    dom.financialHealthStartDate?.value || '',
                    dom.financialHealthEndDate?.value || ''
                );
                if (dom.viewTableBtn) {
                    dom.viewTableBtn.classList.remove('hidden');
                    dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
                }
            }
            break;

        case 'cancellations':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.remove('hidden');
            if (dom.relevanceFilterContainer) dom.relevanceFilterContainer.classList.remove('hidden');
            if (dom.customStartDateLabel) dom.customStartDateLabel.textContent = 'Data Inicial (Cancelamento):';
            if (dom.customEndDateLabel) dom.customEndDateLabel.textContent = 'Data Final (Cancelamento):';
            if (shouldFetch) {
                customTables.fetchAndRenderCancellationAnalysis(
                    searchTerm, page,
                    dom.relevanceFilterSearch?.value || '', sortAsc,
                    dom.customStartDate?.value || '',
                    dom.customEndDate?.value || ''
                );
            }
            break;

        case 'negativacao':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.remove('hidden');
            if (dom.relevanceFilterContainer) dom.relevanceFilterContainer.classList.remove('hidden');
            if (dom.customStartDateLabel) dom.customStartDateLabel.textContent = 'Data Inicial (Negativação):';
            if (dom.customEndDateLabel) dom.customEndDateLabel.textContent = 'Data Final (Negativação):';
            if (shouldFetch) {
                customTables.fetchAndRenderNegativacaoAnalysis(
                    searchTerm, page,
                    dom.relevanceFilterSearch?.value || '', sortAsc,
                    dom.customStartDate?.value || '',
                    dom.customEndDate?.value || ''
                );
            }
            break;

        case 'real_permanence':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.remove('hidden');
            if (dom.relevanceFilterContainer) dom.relevanceFilterContainer.classList.remove('hidden');
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            if (dom.filterActiveClientsBtn) dom.filterActiveClientsBtn.classList.add('hidden');
            if (dom.financialHealthDateContainer) dom.financialHealthDateContainer.classList.add('hidden');
            if (dom.customStartDateLabel) dom.customStartDateLabel.textContent = 'Data Inicial (Ativação):';
            if (dom.customEndDateLabel) dom.customEndDateLabel.textContent = 'Data Final (Ativação):';
            customTables.populateContractStatusFilters();
            if (shouldFetch) {
                customTables.fetchAndRenderRealPermanenceAnalysis(
                    searchTerm, page,
                    dom.relevanceFilterSearch?.value || '',
                    dom.customStartDate?.value || '',
                    dom.customEndDate?.value || ''
                );
            }
            break;

        case 'vendedores':
            if (dom.sellerAnalysisFiltersDiv) dom.sellerAnalysisFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderSellerAnalysis(
                    dom.sellerStartDate?.value || '',
                    dom.sellerEndDate?.value || ''
                );
            }
            break;

        case 'activations_by_seller':
            if (dom.activationSellerFiltersDiv) dom.activationSellerFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderActivationsBySeller(
                    dom.activationSellerCityFilter?.value || '',
                    dom.activationSellerStartDate?.value || '',
                    dom.activationSellerEndDate?.value || ''
                );
            }
            break;

        case 'cancellations_by_city':
            if (dom.cityCancellationFiltersDiv) dom.cityCancellationFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderCancellationsByCity(
                    dom.cityCancellationStartDate?.value || '',
                    dom.cityCancellationEndDate?.value || '',
                    dom.relevanceFilterCity?.value || ''
                );
            }
            break;

        case 'cancellations_by_neighborhood':
            if (dom.neighborhoodAnalysisFiltersDiv) dom.neighborhoodAnalysisFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderCancellationsByNeighborhood(
                    dom.neighborhoodAnalysisCityFilter?.value || '',
                    dom.neighborhoodAnalysisStartDate?.value || '',
                    dom.neighborhoodAnalysisEndDate?.value || '',
                    dom.relevanceFilterNeighborhood?.value || ''
                );
            }
            break;

        case 'cancellations_by_equipment':
            if (dom.equipmentAnalysisFiltersDiv) dom.equipmentAnalysisFiltersDiv.classList.remove('hidden');
            if (dom.equipmentDateFilterContainer) dom.equipmentDateFilterContainer.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderCancellationsByEquipment(
                    dom.equipmentAnalysisStartDate?.value || '',
                    dom.equipmentAnalysisEndDate?.value || '',
                    dom.equipmentAnalysisCityFilter?.value || '',
                    dom.relevanceFilterEquipment?.value || ''
                );
            }
            break;

        case 'equipment_by_olt':
            if (dom.equipmentAnalysisFiltersDiv) dom.equipmentAnalysisFiltersDiv.classList.remove('hidden');
            if (dom.equipmentDateFilterContainer) dom.equipmentDateFilterContainer.classList.add('hidden');
            if (dom.equipmentAnalysisCityFilter) dom.equipmentAnalysisCityFilter.closest('.flex-col')?.classList.remove('hidden');
            if (shouldFetch) customCharts.fetchAndRenderEquipmentByOlt(dom.equipmentAnalysisCityFilter?.value || '');
            break;

        case 'cohort_retention':
            if (dom.cohortAnalysisFiltersDiv) dom.cohortAnalysisFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderCohortAnalysis(
                    dom.cohortCityFilter?.value || '',
                    dom.cohortStartDate?.value || '',
                    dom.cohortEndDate?.value || ''
                );
            }
            break;

        case 'daily_evolution_by_city':
            if (dom.dailyEvolutionFiltersDiv) dom.dailyEvolutionFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                customCharts.fetchAndRenderDailyEvolution(
                    dom.dailyEvolutionStartDate?.value || '',
                    dom.dailyEvolutionEndDate?.value || ''
                );
            }
            break;

        default:
            if (shouldFetch) {
                console.warn(`Análise personalizada não reconhecida: ${selectedAnalysis}`);
                if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = `<p class="text-red-500">Erro: Análise '${selectedAnalysis}' não implementada.</p>`;
            }
    }
}

/**
 * Registra todos os listeners relacionados a filtros e ao dropdown de análise personalizada.
 */
export function setupCustomAnalysisListeners() {
    // Dropdown de análise personalizada
    dom.customAnalysisSelector?.addEventListener('change', () => {
        if (!dom.customAnalysisSelector.value) return;
        dom.customAnalysisSelector.blur();
        utils.resetAllFilters();
        utils.setActiveControl(dom.customAnalysisSelector);
        handleCustomAnalysisChange(1, false);
    });

    // Botão Filtrar principal (saúde financeira / evolução)
    dom.filterActiveClientsBtn?.addEventListener('click', () => {
        const currentState = state.getCustomAnalysisState();
        if (currentState.currentAnalysis === 'active_clients_evolution') {
            customCharts.fetchAndRenderActiveClientsEvolution(
                dom.faturamentoStartDate?.value || '',
                dom.faturamentoEndDate?.value || '',
                dom.faturamentoCityFilter?.value || ''
            );
        } else if (currentState.currentAnalysis === 'saude_financeira') {
            customTables.fetchAndRenderFinancialHealthAnalysis(
                dom.clientSearchInput?.value || '',
                currentState.currentAnalysisType || 'atraso', 1,
                dom.financialHealthStartDate?.value || '',
                dom.financialHealthEndDate?.value || ''
            );
        }
    });

    // Botão Filtrar geral (coleções principais)
    dom.btnFilterGeneral?.addEventListener('click', () => {
        // importado inline para evitar dependência circular
        import('../analysis.js').then(analysis => {
            const collection = state.getModalCurrentCollection();
            if (collection) {
                analysis.fetchAndRenderMainAnalysis(
                    collection,
                    dom.generalStartDate?.value || '',
                    dom.generalEndDate?.value || '',
                    dom.cityFilterSelect?.value || ''
                );
            }
        });
    });

    // Botão Limpar Filtros
    dom.clearFiltersBtn?.addEventListener('click', () => {
        utils.resetAllFilters();
        handleCustomAnalysisChange(1, false);
    });

    // Botões de filtro de cada análise personalizada
    const customFilterButtons = [
        dom.btnFilterFaturamento, dom.btnFilterSeller, dom.btnFilterActivationSeller,
        dom.btnFilterCohort, dom.btnFilterCityCancellation, dom.btnFilterNeighborhood,
        dom.btnFilterEquipment, dom.btnFilterDailyEvolution, dom.btnFilterLatePayment
    ];
    customFilterButtons.forEach(btn => btn?.addEventListener('click', () => handleCustomAnalysisChange(1, true)));

    // Botão aplicar busca de cliente + Enter
    dom.applyClientSearchBtn?.addEventListener('click', () => handleCustomAnalysisChange(1, true));
    dom.clientSearchInput?.addEventListener('keypress', e => {
        if (e.key === 'Enter') handleCustomAnalysisChange(1, true);
    });
}
