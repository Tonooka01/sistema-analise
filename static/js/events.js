import * as dom from './dom.js';
import * as grid from './grid.js';
import * as analysis from './analysis.js';
import * as customTables from './customAnalysisTables.js';
import * as customCharts from './customAnalysisCharts.js';
import * as behaviorAnalysis from './behaviorAnalysis.js';
import {
    openModal, closeModal, fetchAndDisplayTableInModal, openInvoiceDetailModal, closeInvoiceDetailModal,
    fetchAndDisplayInvoiceDetails, openDetailsModal, closeDetailsModal, fetchAndRenderTabData,
    openCancellationDetailModal, closeCancellationDetailModal, openSellerDetailModal, closeSellerDetailModal,
    fetchAndDisplaySellerDetails, openCityDetailModal, closeCityDetailModal, fetchAndDisplayCityDetails,
    openNeighborhoodDetailModal, closeNeighborhoodDetailModal, fetchAndDisplayNeighborhoodDetails,
    openEquipmentDetailModal, closeEquipmentDetailModal, fetchAndDisplayEquipmentDetails,
    openActiveEquipmentDetailModal, closeActiveEquipmentDetailModal, fetchAndDisplayActiveEquipmentDetails,
    openSellerActivationDetailModal, closeSellerActivationDetailModal, fetchAndDisplaySellerActivationDetails
} from './modals.js';
import * as state from './state.js';
import * as utils from './utils.js';
import { destroyAllMainCharts } from './charts.js';
import { renderChartsForCurrentCollection } from './chartCollection.js';
import { exportTableToCSV } from './utils.js';

/**
 * Lida com a mudança no seletor de Análise Personalizada.
 * Mostra os filtros relevantes e inicia a busca dos dados APENAS se solicitado.
 * @param {number} [page=1] - A página a ser buscada.
 * @param {boolean} [forceFetch=false] - Se deve forçar a busca de dados (usado pelos botões de filtro).
 */
function handleCustomAnalysisChange(page = 1, forceFetch = false) {
    const selectedAnalysis = dom.customAnalysisSelector?.value;
    if (!selectedAnalysis) return;

    // Obtém o termo de busca atual, se aplicável
    const searchTerm = dom.clientSearchInput?.value || '';
    
    // Obtém a preferência de ordenação do ESTADO
    const currentSortOrder = state.getCustomAnalysisState().sortOrder; 
    const sortAsc = currentSortOrder === 'asc';

    // Esconde todos os filtros personalizados antes de mostrar o correto
    utils.hideAllCustomFilters();
    
    // --- RESET DE VISIBILIDADE DOS BOTÕES ---
    if (dom.filterActiveClientsBtn) dom.filterActiveClientsBtn.classList.remove('hidden');
    if (dom.applyClientSearchBtn) dom.applyClientSearchBtn.classList.remove('hidden');
    if (dom.btnFilterFaturamento) dom.btnFilterFaturamento.classList.remove('hidden');
    
    if (dom.viewTableBtn) dom.viewTableBtn.classList.add('hidden');

    // Lógica para determinar se deve buscar dados automaticamente ou esperar filtro
    // O padrão é carregar (true), exceto para análises específicas que exigem filtro prévio
    let shouldFetch = true;
    if (selectedAnalysis === 'real_permanence' && !forceFetch) {
        shouldFetch = false;
    }

    // Se NÃO for buscar dados (apenas mudou o dropdown para uma análise pesada), limpa a tela e mostra mensagem
    if (!shouldFetch) {
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.classList.remove('hidden');
            dom.dashboardContentDiv.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-500">
                    <svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <p class="text-xl font-medium">Selecione os filtros acima e clique em "Filtrar" para visualizar os dados.</p>
                </div>
            `;
        }
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');
        destroyAllMainCharts();
        const gridStackInstance = state.getGridStack();
        if(gridStackInstance) gridStackInstance.removeAll();
    } else {
        // Se for disparar fetch, a limpeza ocorre dentro das funções de renderização específicas
        if (dom.dashboardContentDiv) {
            dom.dashboardContentDiv.classList.remove('hidden');
        }
    }


    // --- Configuração de Filtros e Execução (se shouldFetch=true) ---
    switch (selectedAnalysis) {
        case 'comparativo_diario':
            if (shouldFetch) customTables.fetchAndRenderDailyComparison();
            break;

        case 'analise_juros_atraso':
            if (dom.latePaymentFiltersDiv) dom.latePaymentFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                const lateStart = dom.latePaymentStartDate?.value || '';
                const lateEnd = dom.latePaymentEndDate?.value || '';
                customCharts.fetchAndRenderLateInterestAnalysis(lateStart, lateEnd);
            }
            break;
            
        case 'faturamento_por_cidade':
            if (dom.faturamentoCidadeFiltersDiv) dom.faturamentoCidadeFiltersDiv.classList.remove('hidden');
            if(dom.faturamentoCityFilter) dom.faturamentoCityFilter.closest('.flex-col')?.classList.remove('hidden');
            if (shouldFetch) {
                const fStartDate = dom.faturamentoStartDate?.value || '';
                const fEndDate = dom.faturamentoEndDate?.value || '';
                const fCity = dom.faturamentoCityFilter?.value || '';
                customCharts.fetchAndRenderBillingByCityAnalysis(fStartDate, fEndDate, fCity);
            }
            break;

        case 'active_clients_evolution':
            if (dom.faturamentoCidadeFiltersDiv) dom.faturamentoCidadeFiltersDiv.classList.remove('hidden');
            if(dom.faturamentoCityFilter) dom.faturamentoCityFilter.closest('.flex-col')?.classList.remove('hidden');
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            if (dom.filterActiveClientsBtn) dom.filterActiveClientsBtn.classList.add('hidden');
            
            customTables.populateContractStatusFilters();

            if (shouldFetch) {
                const acStartDate = dom.faturamentoStartDate?.value || '';
                const acEndDate = dom.faturamentoEndDate?.value || '';
                const acCity = dom.faturamentoCityFilter?.value || '';
                customCharts.fetchAndRenderActiveClientsEvolution(acStartDate, acEndDate, acCity);
            }
            break;

        case 'analise_comportamento':
            if (dom.behaviorAnalysisContainer) dom.behaviorAnalysisContainer.classList.remove('hidden');
            if (shouldFetch) behaviorAnalysis.initializeBehaviorAnalysis();
            break;

        case 'atrasos_e_nao_pagos':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.add('hidden');
            if (shouldFetch) customTables.fetchAndRenderLatePaymentsAnalysis(searchTerm, page);
            break;

        case 'saude_financeira_contrato_atraso':
        case 'saude_financeira_contrato_bloqueio':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.add('hidden'); 
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            if (dom.applyClientSearchBtn) dom.applyClientSearchBtn.classList.add('hidden');

            customTables.populateContractStatusFilters();
            
            if (shouldFetch) {
                const analysisType = selectedAnalysis.endsWith('_bloqueio') ? 'bloqueio' : 'atraso';
                const relevanceFinancial = dom.relevanceFilterSearch?.value || '';
                customTables.fetchAndRenderFinancialHealthAnalysis(searchTerm, analysisType, page, relevanceFinancial); 
                
                if (dom.viewTableBtn) {
                    dom.viewTableBtn.classList.remove('hidden');
                    dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
                }
            }
            break;

        case 'cancellations':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.remove('hidden');
            
            if (shouldFetch) {
                const relevanceSearch = dom.relevanceFilterSearch?.value || '';
                const cancelStart = dom.customStartDate?.value || '';
                const cancelEnd = dom.customEndDate?.value || '';
                customTables.fetchAndRenderCancellationAnalysis(searchTerm, page, relevanceSearch, sortAsc, cancelStart, cancelEnd);
            }
            break;

        case 'negativacao':
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.remove('hidden');
            
            if (shouldFetch) {
                const relevanceSearchNeg = dom.relevanceFilterSearch?.value || '';
                const negStart = dom.customStartDate?.value || '';
                const negEnd = dom.customEndDate?.value || '';
                customTables.fetchAndRenderNegativacaoAnalysis(searchTerm, page, relevanceSearchNeg, sortAsc, negStart, negEnd);
            }
            break;

        case 'real_permanence':
            // 1. Filtros de Busca e Data
            if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
            if (dom.customDateFilterContainer) dom.customDateFilterContainer.classList.remove('hidden');
            // 2. Filtros de Status
            if (dom.financialHealthFiltersDiv) dom.financialHealthFiltersDiv.classList.remove('hidden');
            if (dom.filterActiveClientsBtn) dom.filterActiveClientsBtn.classList.add('hidden');
            
            customTables.populateContractStatusFilters();

            // SÓ EXECUTA SE shouldFetch FOR TRUE (Clicou em Filtrar ou forceFetch=true)
            if (shouldFetch) {
                const relevancePermanence = dom.relevanceFilterSearch?.value || '';
                const permStart = dom.customStartDate?.value || '';
                const permEnd = dom.customEndDate?.value || '';
                
                customTables.fetchAndRenderRealPermanenceAnalysis(searchTerm, page, relevancePermanence, permStart, permEnd);
            }
            break;

        case 'vendedores':
            if (dom.sellerAnalysisFiltersDiv) dom.sellerAnalysisFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                const sellerStart = dom.sellerStartDate?.value || '';
                const sellerEnd = dom.sellerEndDate?.value || '';
                customCharts.fetchAndRenderSellerAnalysis(sellerStart, sellerEnd);
            }
            break;

        case 'activations_by_seller':
            if (dom.activationSellerFiltersDiv) dom.activationSellerFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                const activationCity = dom.activationSellerCityFilter?.value || '';
                const activationStart = dom.activationSellerStartDate?.value || '';
                const activationEnd = dom.activationSellerEndDate?.value || '';
                customCharts.fetchAndRenderActivationsBySeller(activationCity, activationStart, activationEnd);
            }
            break;

        case 'cancellations_by_city':
            if (dom.cityCancellationFiltersDiv) dom.cityCancellationFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                const cityStart = dom.cityCancellationStartDate?.value || '';
                const cityEnd = dom.cityCancellationEndDate?.value || '';
                const relevanceCity = dom.relevanceFilterCity?.value || '';
                customCharts.fetchAndRenderCancellationsByCity(cityStart, cityEnd, relevanceCity);
            }
            break;

        case 'cancellations_by_neighborhood':
            if (dom.neighborhoodAnalysisFiltersDiv) dom.neighborhoodAnalysisFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                const selectedCity = dom.neighborhoodAnalysisCityFilter?.value || '';
                const neighborhoodStart = dom.neighborhoodAnalysisStartDate?.value || '';
                const neighborhoodEnd = dom.neighborhoodAnalysisEndDate?.value || '';
                const relevanceNeighborhood = dom.relevanceFilterNeighborhood?.value || '';
                customCharts.fetchAndRenderCancellationsByNeighborhood(selectedCity, neighborhoodStart, neighborhoodEnd, relevanceNeighborhood);
            }
            break;

        case 'cancellations_by_equipment':
            if (dom.equipmentAnalysisFiltersDiv) dom.equipmentAnalysisFiltersDiv.classList.remove('hidden');
            if (dom.equipmentDateFilterContainer) dom.equipmentDateFilterContainer.classList.remove('hidden');
            if (shouldFetch) {
                const equipmentStart = dom.equipmentAnalysisStartDate?.value || '';
                const equipmentEnd = dom.equipmentAnalysisEndDate?.value || '';
                const equipmentCity = dom.equipmentAnalysisCityFilter?.value || '';
                const relevanceEquipment = dom.relevanceFilterEquipment?.value || '';
                customCharts.fetchAndRenderCancellationsByEquipment(equipmentStart, equipmentEnd, equipmentCity, relevanceEquipment);
            }
            break;

        case 'equipment_by_olt':
            if (dom.equipmentAnalysisFiltersDiv) dom.equipmentAnalysisFiltersDiv.classList.remove('hidden');
            if (dom.equipmentDateFilterContainer) dom.equipmentDateFilterContainer.classList.add('hidden');
             if(dom.equipmentAnalysisCityFilter) dom.equipmentAnalysisCityFilter.closest('.flex-col')?.classList.remove('hidden');
            if (shouldFetch) {
                const equipmentOltCity = dom.equipmentAnalysisCityFilter?.value || '';
                customCharts.fetchAndRenderEquipmentByOlt(equipmentOltCity);
            }
            break;

        case 'cohort_retention':
            if (dom.cohortAnalysisFiltersDiv) dom.cohortAnalysisFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                const cohortCity = dom.cohortCityFilter?.value || '';
                const cohortStart = dom.cohortStartDate?.value || '';
                const cohortEnd = dom.cohortEndDate?.value || '';
                customCharts.fetchAndRenderCohortAnalysis(cohortCity, cohortStart, cohortEnd);
            }
            break;

        case 'daily_evolution_by_city':
            if (dom.dailyEvolutionFiltersDiv) dom.dailyEvolutionFiltersDiv.classList.remove('hidden');
            if (shouldFetch) {
                const dailyStartDate = dom.dailyEvolutionStartDate?.value || '';
                const dailyEndDate = dom.dailyEvolutionEndDate?.value || '';
                customCharts.fetchAndRenderDailyEvolution(dailyStartDate, dailyEndDate);
            }
            break;

        default:
            if (shouldFetch) {
                console.warn(`Análise personalizada não reconhecida: ${selectedAnalysis}`);
                if (dom.dashboardContentDiv) dom.dashboardContentDiv.innerHTML = `<p class="text-red-500">Erro: Análise '${selectedAnalysis}' não implementada.</p>`;
            }
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

        // Chama com forceFetch = false. A lógica interna decidirá se deve buscar ou não.
        handleCustomAnalysisChange(1, false);
    });

    // --- Listener do Botão FILTRAR (Atualizado) ---
    dom.filterActiveClientsBtn?.addEventListener('click', () => {
         const currentState = state.getCustomAnalysisState();
         const currentAnalysis = currentState.currentAnalysis;

         // 1. Evolução de Clientes Ativos (Se o botão estiver visível)
         if (currentAnalysis === 'active_clients_evolution') {
             const acStartDate = dom.faturamentoStartDate?.value || '';
             const acEndDate = dom.faturamentoEndDate?.value || '';
             const acCity = dom.faturamentoCityFilter?.value || '';
             customCharts.fetchAndRenderActiveClientsEvolution(acStartDate, acEndDate, acCity);
         }
         // 2. Saúde Financeira (Atraso ou Bloqueio)
         else if (currentAnalysis === 'saude_financeira') {
             const searchTerm = dom.clientSearchInput?.value || '';
             const analysisType = currentState.currentAnalysisType || 'atraso';
             const relevance = dom.relevanceFilterSearch?.value || '';
             
             // Dispara a busca manual ao clicar
             customTables.fetchAndRenderFinancialHealthAnalysis(searchTerm, analysisType, 1, relevance);
         }
    });

    // --- LISTENER DO BOTÃO FILTRAR GERAL (Coleções Principais) ---
    dom.btnFilterGeneral?.addEventListener('click', () => {
        const collection = state.getModalCurrentCollection();
        if (collection) {
            const start = dom.generalStartDate?.value || '';
            const end = dom.generalEndDate?.value || '';
            const city = dom.cityFilterSelect?.value || '';
            analysis.fetchAndRenderMainAnalysis(collection, start, end, city);
        }
    });
    
    // --- NOVO LISTENER: Botão Limpar Filtros ---
    dom.clearFiltersBtn?.addEventListener('click', () => {
        utils.resetAllFilters(); // Reseta os valores dos inputs e estados
        // Recarrega a análise, mas com forceFetch=false para voltar ao estado inicial (sem dados se for real_permanence)
        handleCustomAnalysisChange(1, false); 
    });

    // --- LISTENERS DOS BOTÕES DE FILTRO PERSONALIZADOS ---
    // Todos chamam handleCustomAnalysisChange(1, true) para forçar a busca
    const customFilterButtons = [
        dom.btnFilterFaturamento, 
        dom.btnFilterSeller, 
        dom.btnFilterActivationSeller,
        dom.btnFilterCohort, 
        dom.btnFilterCityCancellation, 
        dom.btnFilterNeighborhood,
        dom.btnFilterEquipment, 
        dom.btnFilterDailyEvolution, 
        dom.btnFilterLatePayment
    ];

    customFilterButtons.forEach(btn => {
        btn?.addEventListener('click', () => handleCustomAnalysisChange(1, true));
    });

    // Listener para o botão de filtro principal (usado em cancelamento/negativação/permanência)
    dom.applyClientSearchBtn?.addEventListener('click', () => handleCustomAnalysisChange(1, true));
    
    // O Enter no input de busca também deve disparar
    dom.clientSearchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCustomAnalysisChange(1, true);
    });


    // --- Listeners de Botões e Modais ---

    dom.viewTableBtn?.addEventListener('click', () => {
        const selectedAnalysis = dom.customAnalysisSelector?.value;
        // Lista de análises que possuem suporte a modal de "Tabela Completa/Excel"
        const supportedCustomModalAnalyses = [
            'saude_financeira_contrato_atraso', 
            'saude_financeira_contrato_bloqueio',
            'cancellations',
            'negativacao'
        ];

        if (supportedCustomModalAnalyses.includes(selectedAnalysis)) {
            openModal(selectedAnalysis);
        } else {
            // Fallback para coleções padrão
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
        
        // --- Listener para ordenação da coluna Permanência ---
        const sortHeader = e.target.closest('.sort-permanence-header');
        if (sortHeader) {
            const currentState = state.getCustomAnalysisState();
            
            // Inverte a ordem atual: 'desc' -> 'asc' ou 'asc' -> 'desc'
            const newSortOrder = currentState.sortOrder === 'asc' ? 'desc' : 'asc';
            state.setCustomAnalysisState({ sortOrder: newSortOrder });

            // Recarrega a análise correta com os parâmetros atuais
            const searchTerm = dom.clientSearchInput?.value || '';
            const relevance = dom.relevanceFilterSearch?.value || '';
            const isAsc = newSortOrder === 'asc';
            const permStart = dom.customStartDate?.value || '';
            const permEnd = dom.customEndDate?.value || '';
            
            if (currentState.currentAnalysis === 'cancellations') {
                customTables.fetchAndRenderCancellationAnalysis(searchTerm, 1, relevance, isAsc, permStart, permEnd);
            } else if (currentState.currentAnalysis === 'negativacao') {
                customTables.fetchAndRenderNegativacaoAnalysis(searchTerm, 1, relevance, isAsc, permStart, permEnd);
            } else if (currentState.currentAnalysis === 'real_permanence') { // Adicionado para a nova análise
                customTables.fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, relevance, permStart, permEnd);
            }
            return;
        }
        // ------------------------------------------------------------

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
            const startDate = dom.sellerStartDate?.value || '';
            const endDate = dom.sellerEndDate?.value || '';
            openSellerDetailModal(sellerId, sellerName, type, startDate, endDate);
            return;
        }

        const cityDetailTrigger = e.target.closest('.city-detail-trigger');
        if (cityDetailTrigger) {
            const { city, type } = cityDetailTrigger.dataset;
            const startDate = dom.cityCancellationStartDate?.value || '';
            const endDate = dom.cityCancellationEndDate?.value || '';
            const relevance = dom.relevanceFilterCity?.value || '';
            openCityDetailModal(city, type, startDate, endDate, relevance);
            return;
        }

        const neighborhoodDetailTrigger = e.target.closest('.neighborhood-detail-trigger');
        if (neighborhoodDetailTrigger) {
            const { city, neighborhood, type } = neighborhoodDetailTrigger.dataset;
            const startDate = dom.neighborhoodAnalysisStartDate?.value || '';
            const endDate = dom.neighborhoodAnalysisEndDate?.value || '';
            const relevance = dom.relevanceFilterNeighborhood?.value || '';
            openNeighborhoodDetailModal(city, neighborhood, type, startDate, endDate, relevance);
            return;
        }

        const equipmentDetailTrigger = e.target.closest('.equipment-detail-trigger');
        if (equipmentDetailTrigger) {
            const { equipmentName } = equipmentDetailTrigger.dataset;
            const startDate = dom.equipmentAnalysisStartDate?.value || '';
            const endDate = dom.equipmentAnalysisEndDate?.value || '';
            const city = dom.equipmentAnalysisCityFilter?.value || '';
            const relevance = dom.relevanceFilterEquipment?.value || '';
            openEquipmentDetailModal(equipmentName, startDate, endDate, city, relevance);
            return;
        }
        
        const sellerActivationTrigger = e.target.closest('.seller-activation-trigger');
        if (sellerActivationTrigger) {
            const { sellerId, sellerName, type } = sellerActivationTrigger.dataset;
            const city = dom.activationSellerCityFilter?.value || '';
            const startDate = dom.activationSellerStartDate?.value || '';
            const endDate = dom.activationSellerEndDate?.value || '';
            openSellerActivationDetailModal(sellerId, sellerName, type, city, startDate, endDate);
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
                 handleCustomAnalysisChange(currentState.currentPage - 1, true); // Paginação dispara fetch
             }
         } else if (customNextBtn && !customNextBtn.disabled) {
             const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
             if (currentState.currentPage < totalPages) {
                 handleCustomAnalysisChange(currentState.currentPage + 1, true); // Paginação dispara fetch
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