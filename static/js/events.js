import * as dom from './dom.js';
import * as grid from './grid.js';
import * as analysis from './analysis.js';
// Importa as funções de análise dos novos arquivos
import * as customTables from './customAnalysisTables.js';
import * as customCharts from './customAnalysisCharts.js';
import * as behaviorAnalysis from './behaviorAnalysis.js';

// Importa funções específicas de modals e utils
import {
    openModal,
    closeModal,
    fetchAndDisplayTableInModal,
    openInvoiceDetailModal,
    closeInvoiceDetailModal,
    fetchAndDisplayInvoiceDetails,
    openDetailsModal,
    closeDetailsModal,
    fetchAndRenderTabData,
    openCancellationDetailModal,
    closeCancellationDetailModal,
    openSellerDetailModal,
    closeSellerDetailModal,
    fetchAndDisplaySellerDetails,
    openCityDetailModal,
    closeCityDetailModal,
    fetchAndDisplayCityDetails,
    openNeighborhoodDetailModal,
    closeNeighborhoodDetailModal,
    fetchAndDisplayNeighborhoodDetails,
    openEquipmentDetailModal,
    closeEquipmentDetailModal,
    fetchAndDisplayEquipmentDetails,
    openActiveEquipmentDetailModal,
    closeActiveEquipmentDetailModal,
    fetchAndDisplayActiveEquipmentDetails,
    openSellerActivationDetailModal,
    closeSellerActivationDetailModal,
    fetchAndDisplaySellerActivationDetails
} from './modals.js';
import * as state from './state.js';
import * as utils from './utils.js';
import { destroyAllMainCharts } from './charts.js';
import { renderChartsForCurrentCollection } from './chartCollection.js';
import { exportTableToCSV } from './utils.js'; // Função de exportação

// --- Função Central para Lógica de Análise Personalizada ---

/**
 * Lida com a mudança no seletor de Análise Personalizada.
 * Mostra os filtros relevantes e inicia a busca dos dados.
 * @param {number} [page=1] - A página a ser buscada (para análises paginadas).
 */
function handleCustomAnalysisChange(page = 1) {
    const selectedAnalysis = dom.customAnalysisSelector?.value;
    if (!selectedAnalysis) return;

    // Obtém o termo de busca atual, se aplicável
    const searchTerm = dom.clientSearchInput?.value || '';

    // Esconde todos os filtros personalizados antes de mostrar o correto
    utils.hideAllCustomFilters();
    
    // Garante que o botão "Ver Tabela" comece escondido ao trocar de análise
    if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');

    // Garante que a área de conteúdo principal está visível e limpa
    if (dom.dashboardContentDiv) {
        dom.dashboardContentDiv.classList.remove('hidden');
        dom.dashboardContentDiv.innerHTML = ''; // Limpa antes de carregar nova análise
    }
     // Esconde a área de gráficos padrão
     if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
     
     // Limpa gráficos anteriores e grid
     destroyAllMainCharts();
     const gridStackInstance = state.getGridStack();
     if(gridStackInstance) gridStackInstance.removeAll();


    // --- Mostra Filtros e Chama Função de Fetch ---
    switch (selectedAnalysis) {
        // --- NOVO: Lógica do Comparativo Diário (Faltava no seu arquivo) ---
        case 'comparativo_diario':
            // Esconde filtros padrões pois essa tela tem lógica própria de data (hoje)
            customTables.fetchAndRenderDailyComparison();
            break;

        case 'analise_juros_atraso':
            if (dom.latePaymentFiltersDiv) dom.latePaymentFiltersDiv.classList.remove('hidden');
            const lateYear = dom.latePaymentYearFilter?.value || '';
            const lateMonth = dom.latePaymentMonthFilter?.value || '';
            customCharts.fetchAndRenderLateInterestAnalysis(lateYear, lateMonth);
            break;
            
        case 'faturamento_por_cidade':
            if (dom.faturamentoCidadeFiltersDiv) dom.faturamentoCidadeFiltersDiv.classList.remove('hidden');
            if(dom.faturamentoCityFilter) dom.faturamentoCityFilter.closest('.flex-col')?.classList.remove('hidden');
            const fStartDate = dom.faturamentoStartDate?.value || '';
            const fEndDate = dom.faturamentoEndDate?.value || '';
            const fCity = dom.faturamentoCityFilter?.value || '';
            customCharts.fetchAndRenderBillingByCityAnalysis(fStartDate, fEndDate, fCity);
            break;

        case 'active_clients_evolution':
            if (dom.faturamentoCidadeFiltersDiv) dom.faturamentoCidadeFiltersDiv.classList.remove('hidden');
            if(dom.faturamentoCityFilter) dom.faturamentoCityFilter.closest('.flex-col')?.classList.remove('hidden');
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            customTables.populateContractStatusFilters();

            const acStartDate = dom.faturamentoStartDate?.value || '';
            const acEndDate = dom.faturamentoEndDate?.value || '';
            const acCity = dom.faturamentoCityFilter?.value || '';
            const statusContrato = dom.contractStatusFilter?.value || '';
            const statusAcesso = dom.accessStatusFilter?.value || '';
            
            customCharts.fetchAndRenderActiveClientsEvolution(acStartDate, acEndDate, acCity, statusContrato, statusAcesso);
            break;

        case 'analise_comportamento':
            if (dom.behaviorAnalysisContainer) dom.behaviorAnalysisContainer.classList.remove('hidden');
            behaviorAnalysis.initializeBehaviorAnalysis();
            break;

        case 'atrasos_e_nao_pagos':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            customTables.fetchAndRenderLatePaymentsAnalysis(searchTerm, page);
            break;

        case 'saude_financeira_contrato_atraso':
        case 'saude_financeira_contrato_bloqueio':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            customTables.populateContractStatusFilters();
            
            const analysisType = selectedAnalysis.endsWith('_bloqueio') ? 'bloqueio' : 'atraso';
            const relevanceFinancial = dom.relevanceFilterSearch?.value || '';
            
            customTables.fetchAndRenderFinancialHealthAnalysis(searchTerm, analysisType, page, relevanceFinancial); 
            
            if (dom.viewTableBtn) {
                dom.viewTableBtn.classList.remove('hidden');
                dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
            }
            break;

        case 'cancellations':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            const relevanceSearch = dom.relevanceFilterSearch?.value || '';
            customTables.fetchAndRenderCancellationAnalysis(searchTerm, page, relevanceSearch);
            break;

        case 'negativacao':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            const relevanceSearchNeg = dom.relevanceFilterSearch?.value || '';
            customTables.fetchAndRenderNegativacaoAnalysis(searchTerm, page, relevanceSearchNeg);
            break;

        case 'vendedores':
            if (dom.sellerAnalysisFiltersDiv) dom.sellerAnalysisFiltersDiv.classList.remove('hidden');
            const sellerYear = dom.sellerYearFilter?.value || '';
            const sellerMonth = dom.sellerMonthFilter?.value || '';
            customCharts.fetchAndRenderSellerAnalysis(sellerYear, sellerMonth);
            break;

        case 'activations_by_seller':
            if (dom.activationSellerFiltersDiv) dom.activationSellerFiltersDiv.classList.remove('hidden');
            const activationCity = dom.activationSellerCityFilter?.value || '';
            const activationYear = dom.activationSellerYearFilter?.value || '';
            const activationMonth = dom.activationSellerMonthFilter?.value || '';
            customCharts.fetchAndRenderActivationsBySeller(activationCity, activationYear, activationMonth);
            break;

        case 'cancellations_by_city':
            if (dom.cityCancellationFiltersDiv) dom.cityCancellationFiltersDiv.classList.remove('hidden');
            const cityYear = dom.cityCancellationYearFilter?.value || '';
            const cityMonth = dom.cityCancellationMonthFilter?.value || '';
            const relevanceCity = dom.relevanceFilterCity?.value || '';
            customCharts.fetchAndRenderCancellationsByCity(cityYear, cityMonth, relevanceCity);
            break;

        case 'cancellations_by_neighborhood':
            if (dom.neighborhoodAnalysisFiltersDiv) dom.neighborhoodAnalysisFiltersDiv.classList.remove('hidden');
            const selectedCity = dom.neighborhoodAnalysisCityFilter?.value || '';
            const neighborhoodYear = dom.neighborhoodAnalysisYearFilter?.value || '';
            const neighborhoodMonth = dom.neighborhoodAnalysisMonthFilter?.value || '';
            const relevanceNeighborhood = dom.relevanceFilterNeighborhood?.value || '';
            customCharts.fetchAndRenderCancellationsByNeighborhood(selectedCity, neighborhoodYear, neighborhoodMonth, relevanceNeighborhood);
            break;

        case 'cancellations_by_equipment':
            if (dom.equipmentAnalysisFiltersDiv) dom.equipmentAnalysisFiltersDiv.classList.remove('hidden');
            if (dom.equipmentYearFilterContainer) dom.equipmentYearFilterContainer.classList.remove('hidden');
            if (dom.equipmentMonthFilterContainer) dom.equipmentMonthFilterContainer.classList.remove('hidden');
            const equipmentYear = dom.equipmentAnalysisYearFilter?.value || '';
            const equipmentMonth = dom.equipmentAnalysisMonthFilter?.value || '';
            const equipmentCity = dom.equipmentAnalysisCityFilter?.value || '';
            const relevanceEquipment = dom.relevanceFilterEquipment?.value || '';
            customCharts.fetchAndRenderCancellationsByEquipment(equipmentYear, equipmentMonth, equipmentCity, relevanceEquipment);
            break;

        case 'equipment_by_olt':
            if (dom.equipmentAnalysisFiltersDiv) dom.equipmentAnalysisFiltersDiv.classList.remove('hidden');
            if (dom.equipmentYearFilterContainer) dom.equipmentYearFilterContainer.classList.add('hidden');
            if (dom.equipmentMonthFilterContainer) dom.equipmentMonthFilterContainer.classList.add('hidden');
             if(dom.equipmentAnalysisCityFilter) dom.equipmentAnalysisCityFilter.closest('.flex-col')?.classList.remove('hidden');
            const equipmentOltCity = dom.equipmentAnalysisCityFilter?.value || '';
            customCharts.fetchAndRenderEquipmentByOlt(equipmentOltCity);
            break;

        case 'cohort_retention':
            if (dom.cohortAnalysisFiltersDiv) dom.cohortAnalysisFiltersDiv.classList.remove('hidden');
            const cohortCity = dom.cohortCityFilter?.value || '';
            const cohortYear = dom.cohortYearFilter?.value || '';
            const cohortMonth = dom.cohortMonthFilter?.value || '';
            customCharts.fetchAndRenderCohortAnalysis(cohortCity, cohortYear, cohortMonth);
            break;

        case 'daily_evolution_by_city':
            if (dom.dailyEvolutionFiltersDiv) dom.dailyEvolutionFiltersDiv.classList.remove('hidden');
            const dailyStartDate = dom.dailyEvolutionStartDate?.value || '';
            const dailyEndDate = dom.dailyEvolutionEndDate?.value || '';
            customCharts.fetchAndRenderDailyEvolution(dailyStartDate, dailyEndDate);
            break;

        default:
            console.warn(`Análise personalizada não reconhecida: ${selectedAnalysis}`);
            if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = `<p class="text-red-500">Erro: Análise '${selectedAnalysis}' não implementada.</p>`;
    }
}


// --- Inicialização dos Event Listeners ---

export function initializeEventListeners() {

    // Botão Salvar Layout
    dom.saveLayoutBtn?.addEventListener('click', grid.saveLayout);

    // Seletores de Coleção Principal (Botões Azuis)
    const collectionSelector = document.querySelector('.collection-selector');
    collectionSelector?.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON' && e.target.id && e.target.id !== 'saveLayoutBtn') {
            const buttonText = e.target.textContent;
            if (buttonText) {
                utils.resetAllFilters(); // Reseta filtros
                utils.setActiveControl(e.target); // Marca botão como ativo
                if (dom.customAnalysisSelector) dom.customAnalysisSelector.value = ""; // Reseta dropdown
                utils.hideAllCustomFilters(); // Esconde filtros personalizados
                analysis.fetchAndRenderMainAnalysis(buttonText.trim()); // Busca dados da coleção
            }
        }
    });

    // Listeners dos botões de Exportação (Excel)
    dom.exportTableBtn?.addEventListener('click', () => {
        const title = dom.modalTitle?.textContent || 'tabela_dados';
        const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        exportTableToCSV('modalTable', `${safeTitle}.csv`);
    });

    dom.exportInvoiceBtn?.addEventListener('click', () => {
        const container = dom.invoiceDetailContent;
        const table = container ? container.querySelector('table') : null;
        if (table) {
            if (!table.id) table.id = 'temp_invoice_table';
            exportTableToCSV(table.id, 'detalhes_fatura.csv');
        } else {
            console.warn("Tabela de fatura não encontrada para exportação.");
        }
    });

    // Seletor de Análise Personalizada (Dropdown Roxo)
    dom.customAnalysisSelector?.addEventListener('change', () => {
        const selectedValue = dom.customAnalysisSelector.value;
        if (!selectedValue) return;

        dom.customAnalysisSelector.blur(); 
        
        utils.resetAllFilters();
        utils.setActiveControl(dom.customAnalysisSelector);

        handleCustomAnalysisChange(1);
    });

    // --- Listeners para Filtros Específicos das Análises Personalizadas ---

    dom.applyClientSearchBtn?.addEventListener('click', () => handleCustomAnalysisChange(1));
    dom.clientSearchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCustomAnalysisChange(1);
    });

    const filterElementsToWatch = [
        dom.yearFilterSelect, dom.monthFilterSelect, dom.cityFilterSelect,
        dom.contractStatusFilter, dom.accessStatusFilter,
        dom.sellerYearFilter, dom.sellerMonthFilter,
        dom.cityCancellationYearFilter, dom.cityCancellationMonthFilter,
        dom.neighborhoodAnalysisCityFilter, dom.neighborhoodAnalysisYearFilter, dom.neighborhoodAnalysisMonthFilter,
        dom.equipmentAnalysisYearFilter, dom.equipmentAnalysisMonthFilter, dom.equipmentAnalysisCityFilter,
        dom.dailyEvolutionStartDate, dom.dailyEvolutionEndDate,
        
        dom.relevanceFilterSearch,
        dom.relevanceFilterCity,
        dom.relevanceFilterNeighborhood,
        dom.relevanceFilterEquipment,

        dom.activationSellerCityFilter, dom.activationSellerYearFilter, dom.activationSellerMonthFilter,
        dom.cohortCityFilter, dom.cohortYearFilter, dom.cohortMonthFilter,
        dom.faturamentoStartDate, dom.faturamentoEndDate, dom.faturamentoCityFilter,

        dom.latePaymentYearFilter, dom.latePaymentMonthFilter
    ];

    filterElementsToWatch.forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                const currentAnalysisState = state.getCustomAnalysisState();
                const currentAnalysis = currentAnalysisState ? currentAnalysisState.currentAnalysis : null;
                const mainCollection = state.getModalCurrentCollection();
                const customSelectorValue = dom.customAnalysisSelector ? dom.customAnalysisSelector.value : null;

                if (customSelectorValue && currentAnalysis) {
                    handleCustomAnalysisChange(1);
                } else if (mainCollection && ['yearFilter', 'monthFilter', 'cityFilter'].includes(el.id)) {
                    analysis.fetchAndRenderMainAnalysis(mainCollection, dom.yearFilterSelect?.value || '', dom.monthFilterSelect?.value || '', dom.cityFilterSelect?.value || '');
                }
            });
        }
    });


    // --- Listeners de Botões e Modais ---

    dom.viewTableBtn?.addEventListener('click', () => {
        const selectedAnalysis = dom.customAnalysisSelector?.value;
        if (selectedAnalysis === 'saude_financeira_contrato_atraso' || selectedAnalysis === 'saude_financeira_contrato_bloqueio') {
            openModal(selectedAnalysis);
        } else {
            openModal(state.getModalCurrentCollection());
        }
    });

    const closeButtonMap = [
        { button: dom.modalCloseButton, closeFn: closeModal },
        { button: dom.invoiceDetailCloseButton, closeFn: closeInvoiceDetailModal },
        { button: dom.detailsModalCloseButton, closeFn: closeDetailsModal },
        { button: dom.cancellationDetailCloseButton, closeFn: closeCancellationDetailModal },
        { button: dom.sellerDetailCloseButton, closeFn: closeSellerDetailModal },
        { button: dom.cityDetailCloseButton, closeFn: closeCityDetailModal },
        { button: dom.neighborhoodDetailCloseButton, closeFn: closeNeighborhoodDetailModal },
        { button: dom.equipmentDetailCloseButton, closeFn: closeEquipmentDetailModal },
        { button: dom.sellerActivationDetailCloseButton, closeFn: closeSellerActivationDetailModal },
        { button: dom.activeEquipmentDetailCloseButton, closeFn: closeActiveEquipmentDetailModal },
    ];
    closeButtonMap.forEach(({ button, closeFn }) => {
        if (button) {
            button.addEventListener('click', closeFn);
        }
    });

    // --- Listeners de Paginação (Usando Delegação de Eventos) ---

    dom.modalPaginationControls?.addEventListener('click', (e) => {
        const currentPage = state.getModalCurrentPage();
        const totalRows = state.getModalTotalRows();
        const rowsPerPage = state.MODAL_ROWS_PER_PAGE;
        const totalPages = Math.ceil(totalRows / rowsPerPage);
        let targetPage = currentPage;

        if (e.target.id === 'modalPrevPageBtn' && currentPage > 1) {
            targetPage = currentPage - 1;
        } else if (e.target.id === 'modalNextPageBtn' && currentPage < totalPages) {
            targetPage = currentPage + 1;
        }
         if (targetPage !== currentPage) {
            const currentCollectionOrAnalysis = state.getModalCurrentCollection();
            fetchAndDisplayTableInModal(currentCollectionOrAnalysis, targetPage);
        }
    });

    dom.invoiceDetailPaginationControls?.addEventListener('click', (e) => {
        const currentPage = state.getInvoiceDetailCurrentPage();
        const totalRows = state.getInvoiceDetailTotalRows();
        const rowsPerPage = state.INVOICE_DETAIL_ROWS_PER_PAGE;
        const totalPages = Math.ceil(totalRows / rowsPerPage);
        let targetPage = currentPage;

        if (e.target.id === 'invoiceDetailPrevPageBtn' && currentPage > 1) {
            targetPage = currentPage - 1;
        } else if (e.target.id === 'invoiceDetailNextPageBtn' && currentPage < totalPages) {
            targetPage = currentPage + 1;
        }
        if (targetPage !== currentPage) {
             fetchAndDisplayInvoiceDetails(targetPage);
        }
    });

    dom.sellerDetailPaginationControls?.addEventListener('click', (e) => {
        const currentState = state.getSellerDetailState();
        const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
        let targetPage = currentState.currentPage;

        if (e.target.id === 'sellerDetailPrevPageBtn' && currentState.currentPage > 1) {
            targetPage = currentState.currentPage - 1;
        } else if (e.target.id === 'sellerDetailNextPageBtn' && currentState.currentPage < totalPages) {
            targetPage = currentState.currentPage + 1;
        }
        if (targetPage !== currentState.currentPage) {
            fetchAndDisplaySellerDetails(targetPage);
        }
    });

    dom.cityDetailPaginationControls?.addEventListener('click', (e) => {
        const currentState = state.getCityDetailState();
        const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
        let targetPage = currentState.currentPage;

        if (e.target.id === 'cityDetailPrevPageBtn' && currentState.currentPage > 1) {
             targetPage = currentState.currentPage - 1;
        } else if (e.target.id === 'cityDetailNextPageBtn' && currentState.currentPage < totalPages) {
             targetPage = currentState.currentPage + 1;
        }
        if (targetPage !== currentState.currentPage) {
            fetchAndDisplayCityDetails(targetPage);
        }
    });

    dom.neighborhoodDetailPaginationControls?.addEventListener('click', (e) => {
        const currentState = state.getNeighborhoodDetailState();
        const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
        let targetPage = currentState.currentPage;

        if (e.target.id === 'neighborhoodDetailPrevPageBtn' && currentState.currentPage > 1) {
             targetPage = currentState.currentPage - 1;
        } else if (e.target.id === 'neighborhoodDetailNextPageBtn' && currentState.currentPage < totalPages) {
             targetPage = currentState.currentPage + 1;
        }
        if (targetPage !== currentState.currentPage) {
             fetchAndDisplayNeighborhoodDetails(targetPage);
        }
    });

    dom.equipmentDetailModal?.addEventListener('click', (e) => {
        const pageButton = e.target.closest('.equipment-page-btn');
        if (pageButton && !pageButton.disabled) {
            const page = parseInt(pageButton.dataset.page);
            if (!isNaN(page)) {
                fetchAndDisplayEquipmentDetails(page);
            }
        }
    });

     dom.activeEquipmentDetailPaginationControls?.addEventListener('click', (e) => {
         const currentState = state.getActiveEquipmentDetailState();
         const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
         let targetPage = currentState.currentPage;

         if (e.target.id === 'activeEquipmentDetailPrevPageBtn' && currentState.currentPage > 1) {
             targetPage = currentState.currentPage - 1;
         } else if (e.target.id === 'activeEquipmentDetailNextPageBtn' && currentState.currentPage < totalPages) {
             targetPage = currentState.currentPage + 1;
         }
          if (targetPage !== currentState.currentPage) {
            fetchAndDisplayActiveEquipmentDetails(targetPage);
        }
     });

    dom.sellerActivationDetailPaginationControls?.addEventListener('click', (e) => {
        const currentState = state.getSellerActivationDetailState();
        const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
        let targetPage = currentState.currentPage;

        if (e.target.id === 'sellerActivationDetailPrevPageBtn' && currentState.currentPage > 1) {
            targetPage = currentState.currentPage - 1;
        } else if (e.target.id === 'sellerActivationDetailNextPageBtn' && currentState.currentPage < totalPages) {
            targetPage = currentState.currentPage + 1;
        }
         if (targetPage !== currentState.currentPage) {
           fetchAndDisplaySellerActivationDetails(targetPage);
       }
    });


     dom.behaviorAnalysisTabContent?.addEventListener('click', e => {
         const pageButton = e.target.closest('.predictive-page-btn');
         if(pageButton && !pageButton.disabled) {
             const page = parseInt(pageButton.dataset.page);
             if (!isNaN(page)) {
                 behaviorAnalysis.fetchAndRenderPredictiveChurnTable(page);
             }
         }
     });


    // --- Listeners Globais com Delegação de Eventos ---

    document.body.addEventListener('click', (e) => {
        const invoiceDetailTrigger = e.target.closest('.invoice-detail-trigger');
        if (invoiceDetailTrigger) {
            const { contractId, clientName, type } = invoiceDetailTrigger.dataset;
            openInvoiceDetailModal(contractId, clientName, type);
            return;
        }

        const detailTrigger = e.target.closest('.detail-trigger');
        if(detailTrigger) {
             const { contractId, clientName, type } = detailTrigger.dataset;
             openDetailsModal(contractId, clientName, type);
             return;
        }

        const cancellationDetailTrigger = e.target.closest('.cancellation-detail-trigger');
        if(cancellationDetailTrigger) {
            const { clientName, contractId } = cancellationDetailTrigger.dataset;
            openCancellationDetailModal(clientName, contractId, true);
            return;
        }

        const sellerDetailTrigger = e.target.closest('.seller-detail-trigger');
        if (sellerDetailTrigger) {
            const { sellerId, sellerName, type } = sellerDetailTrigger.dataset;
            const year = dom.sellerYearFilter?.value || '';
            const month = dom.sellerMonthFilter?.value || '';
            openSellerDetailModal(sellerId, sellerName, type, year, month);
            return;
        }

        const cityDetailTrigger = e.target.closest('.city-detail-trigger');
        if (cityDetailTrigger) {
            const { city, type } = cityDetailTrigger.dataset;
            const year = dom.cityCancellationYearFilter?.value || '';
            const month = dom.cityCancellationMonthFilter?.value || '';
            const relevance = dom.relevanceFilterCity?.value || '';
            openCityDetailModal(city, type, year, month, relevance);
            return;
        }

        const neighborhoodDetailTrigger = e.target.closest('.neighborhood-detail-trigger');
        if (neighborhoodDetailTrigger) {
            const { city, neighborhood, type } = neighborhoodDetailTrigger.dataset;
            const year = dom.neighborhoodAnalysisYearFilter?.value || '';
            const month = dom.neighborhoodAnalysisMonthFilter?.value || '';
            const relevance = dom.relevanceFilterNeighborhood?.value || '';
            openNeighborhoodDetailModal(city, neighborhood, type, year, month, relevance);
            return;
        }

        const equipmentDetailTrigger = e.target.closest('.equipment-detail-trigger');
        if (equipmentDetailTrigger) {
            const { equipmentName } = equipmentDetailTrigger.dataset;
            const year = dom.equipmentAnalysisYearFilter?.value || '';
            const month = dom.equipmentAnalysisMonthFilter?.value || '';
            const city = dom.equipmentAnalysisCityFilter?.value || '';
            const relevance = dom.relevanceFilterEquipment?.value || '';
            openEquipmentDetailModal(equipmentName, year, month, city, relevance);
            return;
        }
        
        const sellerActivationTrigger = e.target.closest('.seller-activation-trigger');
        if (sellerActivationTrigger) {
            const { sellerId, sellerName, type } = sellerActivationTrigger.dataset;
            const city = dom.activationSellerCityFilter?.value || '';
            const year = dom.activationSellerYearFilter?.value || '';
            const month = dom.activationSellerMonthFilter?.value || '';
            openSellerActivationDetailModal(sellerId, sellerName, type, city, year, month);
            return;
        }


        const detailTabButton = e.target.closest('#detailsModalTabContent .prev-page-btn, #detailsModalTabContent .next-page-btn');
        if (detailTabButton && dom.detailsModal?.classList.contains('show')) {
            const tab = detailTabButton.dataset.tab;
            const targetPage = parseInt(detailTabButton.dataset.page);
            if (tab && !isNaN(targetPage) && !detailTabButton.disabled) {
                fetchAndRenderTabData(tab, targetPage);
            }
            return;
        }

         const customPrevBtn = e.target.closest('#customPrevPageBtn');
         const customNextBtn = e.target.closest('#customNextPageBtn');
         const currentState = state.getCustomAnalysisState();
         if (customPrevBtn && !customPrevBtn.disabled) {
             if (currentState.currentPage > 1) {
                 handleCustomAnalysisChange(currentState.currentPage - 1);
             }
         } else if (customNextBtn && !customNextBtn.disabled) {
             const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
             if (currentState.currentPage < totalPages) {
                 handleCustomAnalysisChange(currentState.currentPage + 1);
             }
         }

    });

    dom.detailsModalTabs?.addEventListener('click', (e) => {
        e.preventDefault();
        const tabLink = e.target.closest('.tab-link');
        if (tabLink && !tabLink.classList.contains('active')) {
            const tabName = tabLink.dataset.tab;
            dom.detailsModalTabs.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
            dom.detailsModalTabContent?.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            tabLink.classList.add('active');
            const targetPane = document.getElementById(`tab-content-${tabName}`);
            if (targetPane) {
                 targetPane.classList.add('active');
                 fetchAndRenderTabData(tabName, 1);
            }
        }
    });

    dom.behaviorAnalysisTabs?.addEventListener('click', (e) => {
        e.preventDefault();
        const tabLink = e.target.closest('.tab-link');
        if (tabLink && !tabLink.classList.contains('active')) {
            behaviorAnalysis.handleBehaviorTabChange(tabLink.dataset.tab);
        }
    });

    dom.dashboardContentWrapper?.addEventListener('change', e => {
        if(e.target.matches('input[type="radio"]') && e.target.closest('.chart-type-options')) {
             if (state.getGlobalCurrentAnalysisData()) {
                  renderChartsForCurrentCollection();
             }
             const currentCustomAnalysis = state.getCustomAnalysisState().currentAnalysis;
             if (currentCustomAnalysis === 'faturamento_por_cidade') {
                  const fStartDate = dom.faturamentoStartDate?.value || '';
                  const fEndDate = dom.faturamentoEndDate?.value || '';
                  const fCity = dom.faturamentoCityFilter?.value || '';
                  customCharts.fetchAndRenderBillingByCityAnalysis(fStartDate, fEndDate, fCity);
             }
        }
    });


    console.log("Todos os event listeners inicializados.");
}