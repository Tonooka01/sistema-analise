/**
 * events/delegation.js
 * Delegação global de cliques no document.body (triggers de modal, ordenação, etc.)
 */

import * as dom from '../dom.js';
import * as state from '../state.js';
import * as customTables from '../customAnalysisTables.js';
import {
    openInvoiceDetailModal, openDetailsModal, openCancellationDetailModal,
    openSellerDetailModal, openCityDetailModal, openNeighborhoodDetailModal,
    openEquipmentDetailModal, openSellerActivationDetailModal,
    fetchAndRenderTabData
} from '../modals.js';
import { handleCustomAnalysisChange } from './customAnalysis.js';

export function setupDelegationListeners() {
    document.body.addEventListener('click', e => {

        // Ordenação da coluna Permanência
        const sortHeader = e.target.closest('.sort-permanence-header');
        if (sortHeader) {
            const currentState = state.getCustomAnalysisState();
            const newSortOrder = currentState.sortOrder === 'asc' ? 'desc' : 'asc';
            state.setCustomAnalysisState({ sortOrder: newSortOrder });
            const searchTerm = dom.clientSearchInput?.value || '';
            const relevance = dom.relevanceFilterSearch?.value || '';
            const isAsc = newSortOrder === 'asc';
            const permStart = dom.customStartDate?.value || '';
            const permEnd = dom.customEndDate?.value || '';
            if (currentState.currentAnalysis === 'cancellations') {
                customTables.fetchAndRenderCancellationAnalysis(searchTerm, 1, relevance, isAsc, permStart, permEnd);
            } else if (currentState.currentAnalysis === 'negativacao') {
                customTables.fetchAndRenderNegativacaoAnalysis(searchTerm, 1, relevance, isAsc, permStart, permEnd);
            } else if (currentState.currentAnalysis === 'real_permanence') {
                customTables.fetchAndRenderRealPermanenceAnalysis(searchTerm, 1, relevance, permStart, permEnd);
            }
            return;
        }

        // Trigger de fatura
        const invoiceDetailTrigger = e.target.closest('.invoice-detail-trigger');
        if (invoiceDetailTrigger) {
            const { contractId, clientName, type } = invoiceDetailTrigger.dataset;
            openInvoiceDetailModal(contractId, clientName, type);
            return;
        }

        // Trigger de detalhes (abas)
        const detailTrigger = e.target.closest('.detail-trigger');
        if (detailTrigger) {
            const { contractId, clientName, type } = detailTrigger.dataset;
            openDetailsModal(contractId, clientName, type);
            return;
        }

        // Trigger de histórico cancelamento
        const cancellationDetailTrigger = e.target.closest('.cancellation-detail-trigger');
        if (cancellationDetailTrigger) {
            const { clientName, contractId } = cancellationDetailTrigger.dataset;
            openCancellationDetailModal(clientName, contractId, true);
            return;
        }

        // Trigger de detalhes do vendedor
        const sellerDetailTrigger = e.target.closest('.seller-detail-trigger');
        if (sellerDetailTrigger) {
            const { sellerId, sellerName, type } = sellerDetailTrigger.dataset;
            openSellerDetailModal(sellerId, sellerName, type, dom.sellerStartDate?.value || '', dom.sellerEndDate?.value || '');
            return;
        }

        // Trigger de detalhes da cidade
        const cityDetailTrigger = e.target.closest('.city-detail-trigger');
        if (cityDetailTrigger) {
            const { city, type } = cityDetailTrigger.dataset;
            openCityDetailModal(city, type, dom.cityCancellationStartDate?.value || '', dom.cityCancellationEndDate?.value || '', dom.relevanceFilterCity?.value || '');
            return;
        }

        // Trigger de detalhes do bairro
        const neighborhoodDetailTrigger = e.target.closest('.neighborhood-detail-trigger');
        if (neighborhoodDetailTrigger) {
            const { city, neighborhood, type } = neighborhoodDetailTrigger.dataset;
            openNeighborhoodDetailModal(city, neighborhood, type, dom.neighborhoodAnalysisStartDate?.value || '', dom.neighborhoodAnalysisEndDate?.value || '', dom.relevanceFilterNeighborhood?.value || '');
            return;
        }

        // Trigger de detalhes do equipamento
        const equipmentDetailTrigger = e.target.closest('.equipment-detail-trigger');
        if (equipmentDetailTrigger) {
            const { equipmentName } = equipmentDetailTrigger.dataset;
            openEquipmentDetailModal(equipmentName, dom.equipmentAnalysisStartDate?.value || '', dom.equipmentAnalysisEndDate?.value || '', dom.equipmentAnalysisCityFilter?.value || '', dom.relevanceFilterEquipment?.value || '');
            return;
        }

        // Trigger de ativação do vendedor
        const sellerActivationTrigger = e.target.closest('.seller-activation-trigger');
        if (sellerActivationTrigger) {
            const { sellerId, sellerName, type } = sellerActivationTrigger.dataset;
            openSellerActivationDetailModal(sellerId, sellerName, type, dom.activationSellerCityFilter?.value || '', dom.activationSellerStartDate?.value || '', dom.activationSellerEndDate?.value || '');
            return;
        }

        // Paginação das abas do modal de detalhes
        const detailTabButton = e.target.closest('#detailsModalTabContent .prev-page-btn, #detailsModalTabContent .next-page-btn');
        if (detailTabButton && dom.detailsModal?.classList.contains('show')) {
            const tab = detailTabButton.dataset.tab;
            const targetPage = parseInt(detailTabButton.dataset.page);
            if (tab && !isNaN(targetPage) && !detailTabButton.disabled) fetchAndRenderTabData(tab, targetPage);
            return;
        }

        // Paginação inline da análise personalizada (fallback)
        const customPrevBtn = e.target.closest('#customPrevPageBtn');
        const customNextBtn = e.target.closest('#customNextPageBtn');
        const cs = state.getCustomAnalysisState();
        if (customPrevBtn && !customPrevBtn.disabled && cs.currentPage > 1) {
            handleCustomAnalysisChange(cs.currentPage - 1, true);
        } else if (customNextBtn && !customNextBtn.disabled) {
            const totalPages = Math.ceil(cs.totalRows / cs.rowsPerPage);
            if (cs.currentPage < totalPages) handleCustomAnalysisChange(cs.currentPage + 1, true);
        }
    });
}
