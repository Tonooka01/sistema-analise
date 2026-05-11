/**
 * events/pagination.js
 * Listeners de paginação para todos os modais.
 */

import * as dom from '../dom.js';
import * as state from '../state.js';
import {
    fetchAndDisplayTableInModal,
    fetchAndDisplayInvoiceDetails,
    fetchAndDisplaySellerDetails,
    fetchAndDisplayCityDetails,
    fetchAndDisplayNeighborhoodDetails,
    fetchAndDisplayEquipmentDetails,
    fetchAndDisplayActiveEquipmentDetails,
    fetchAndDisplaySellerActivationDetails
} from '../modals.js';

export function setupPaginationListeners() {
    // Modal principal de tabela
    dom.modalPaginationControls?.addEventListener('click', e => {
        const currentPage = state.getModalCurrentPage();
        const totalPages = Math.ceil(state.getModalTotalRows() / state.MODAL_ROWS_PER_PAGE);
        let target = currentPage;
        if (e.target.id === 'modalPrevPageBtn' && currentPage > 1) target = currentPage - 1;
        else if (e.target.id === 'modalNextPageBtn' && currentPage < totalPages) target = currentPage + 1;
        if (target !== currentPage) fetchAndDisplayTableInModal(state.getModalCurrentCollection(), target);
    });

    // Modal de fatura
    dom.invoiceDetailPaginationControls?.addEventListener('click', e => {
        const currentPage = state.getInvoiceDetailCurrentPage();
        const totalPages = Math.ceil(state.getInvoiceDetailTotalRows() / state.INVOICE_DETAIL_ROWS_PER_PAGE);
        let target = currentPage;
        if (e.target.id === 'invoiceDetailPrevPageBtn' && currentPage > 1) target = currentPage - 1;
        else if (e.target.id === 'invoiceDetailNextPageBtn' && currentPage < totalPages) target = currentPage + 1;
        if (target !== currentPage) fetchAndDisplayInvoiceDetails(target);
    });

    // Modal vendedor
    dom.sellerDetailPaginationControls?.addEventListener('click', e => {
        const s = state.getSellerDetailState();
        const totalPages = Math.ceil(s.totalRows / s.rowsPerPage);
        let target = s.currentPage;
        if (e.target.id === 'sellerDetailPrevPageBtn' && s.currentPage > 1) target = s.currentPage - 1;
        else if (e.target.id === 'sellerDetailNextPageBtn' && s.currentPage < totalPages) target = s.currentPage + 1;
        if (target !== s.currentPage) fetchAndDisplaySellerDetails(target);
    });

    // Modal cidade
    dom.cityDetailPaginationControls?.addEventListener('click', e => {
        const s = state.getCityDetailState();
        const totalPages = Math.ceil(s.totalRows / s.rowsPerPage);
        let target = s.currentPage;
        if (e.target.id === 'cityDetailPrevPageBtn' && s.currentPage > 1) target = s.currentPage - 1;
        else if (e.target.id === 'cityDetailNextPageBtn' && s.currentPage < totalPages) target = s.currentPage + 1;
        if (target !== s.currentPage) fetchAndDisplayCityDetails(target);
    });

    // Modal bairro
    dom.neighborhoodDetailPaginationControls?.addEventListener('click', e => {
        const s = state.getNeighborhoodDetailState();
        const totalPages = Math.ceil(s.totalRows / s.rowsPerPage);
        let target = s.currentPage;
        if (e.target.id === 'neighborhoodDetailPrevPageBtn' && s.currentPage > 1) target = s.currentPage - 1;
        else if (e.target.id === 'neighborhoodDetailNextPageBtn' && s.currentPage < totalPages) target = s.currentPage + 1;
        if (target !== s.currentPage) fetchAndDisplayNeighborhoodDetails(target);
    });

    // Modal equipamento (usa data-page em botões)
    dom.equipmentDetailModal?.addEventListener('click', e => {
        const pageButton = e.target.closest('.equipment-page-btn');
        if (pageButton && !pageButton.disabled) {
            const page = parseInt(pageButton.dataset.page);
            if (!isNaN(page)) fetchAndDisplayEquipmentDetails(page);
        }
    });

    // Modal equipamento ativo
    dom.activeEquipmentDetailPaginationControls?.addEventListener('click', e => {
        const s = state.getActiveEquipmentDetailState();
        const totalPages = Math.ceil(s.totalRows / s.rowsPerPage);
        let target = s.currentPage;
        if (e.target.id === 'activeEquipmentDetailPrevPageBtn' && s.currentPage > 1) target = s.currentPage - 1;
        else if (e.target.id === 'activeEquipmentDetailNextPageBtn' && s.currentPage < totalPages) target = s.currentPage + 1;
        if (target !== s.currentPage) fetchAndDisplayActiveEquipmentDetails(target);
    });

    // Modal ativação vendedor
    dom.sellerActivationDetailPaginationControls?.addEventListener('click', e => {
        const s = state.getSellerActivationDetailState();
        const totalPages = Math.ceil(s.totalRows / s.rowsPerPage);
        let target = s.currentPage;
        if (e.target.id === 'sellerActivationDetailPrevPageBtn' && s.currentPage > 1) target = s.currentPage - 1;
        else if (e.target.id === 'sellerActivationDetailNextPageBtn' && s.currentPage < totalPages) target = s.currentPage + 1;
        if (target !== s.currentPage) fetchAndDisplaySellerActivationDetails(target);
    });

    // Paginação das abas de análise preditiva (behaviorAnalysis)
    dom.behaviorAnalysisTabContent?.addEventListener('click', e => {
        const pageButton = e.target.closest('.predictive-page-btn');
        if (pageButton && !pageButton.disabled) {
            const page = parseInt(pageButton.dataset.page);
            if (!isNaN(page)) {
                import('../behaviorAnalysis.js').then(ba => ba.fetchAndRenderPredictiveChurnTable(page));
            }
        }
    });
}
