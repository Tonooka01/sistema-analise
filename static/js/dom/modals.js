/**
 * dom/modals.js
 * Referências de todos os modais.
 */

// Modal principal de tabela
export let tableModal;
export let modalTitle;
export let modalTableHead;
export let modalTableBody;
export let modalLoadingDiv;
export let modalErrorMessageDiv;
export let modalErrorTextSpan;
export let modalPaginationControls;
export let modalPrevPageBtn;
export let modalNextPageBtn;
export let modalPageInfoSpan;
export let modalCloseButton;
export let exportTableBtn;

// Modal detalhe fatura
export let invoiceDetailModal;
export let invoiceDetailModalTitle;
export let invoiceDetailCloseButton;
export let exportInvoiceBtn;
export let invoiceDetailContent;
export let invoiceDetailLoading;
export let invoiceDetailErrorDiv;
export let invoiceDetailErrorText;
export let invoiceDetailPaginationControls;
export let invoiceDetailPrevPageBtn;
export let invoiceDetailNextPageBtn;
export let invoiceDetailPageInfo;

// Modal detalhe com abas
export let detailsModal;
export let detailsModalTitle;
export let detailsModalCloseButton;
export let detailsModalTabs;
export let detailsModalTabContent;

// Modal histórico cancelamento
export let cancellationDetailModal;
export let cancellationDetailModalTitle;
export let cancellationDetailCloseButton;
export let cancellationDetailContent;
export let cancellationDetailLoading;
export let cancellationDetailErrorDiv;
export let cancellationDetailErrorText;

// Modal detalhe vendedor
export let sellerDetailModal;
export let sellerDetailModalTitle;
export let sellerDetailCloseButton;
export let sellerDetailContent;
export let sellerDetailLoading;
export let sellerDetailErrorDiv;
export let sellerDetailErrorText;
export let sellerDetailPaginationControls;
export let sellerDetailPrevPageBtn;
export let sellerDetailNextPageBtn;
export let sellerDetailPageInfo;

// Modal detalhe cidade
export let cityDetailModal;
export let cityDetailModalTitle;
export let cityDetailCloseButton;
export let cityDetailContent;
export let cityDetailLoading;
export let cityDetailErrorDiv;
export let cityDetailErrorText;
export let cityDetailPaginationControls;
export let cityDetailPrevPageBtn;
export let cityDetailNextPageBtn;
export let cityDetailPageInfo;

// Modal detalhe bairro
export let neighborhoodDetailModal;
export let neighborhoodDetailModalTitle;
export let neighborhoodDetailCloseButton;
export let neighborhoodDetailContent;
export let neighborhoodDetailLoading;
export let neighborhoodDetailErrorDiv;
export let neighborhoodDetailErrorText;
export let neighborhoodDetailPaginationControls;
export let neighborhoodDetailPrevPageBtn;
export let neighborhoodDetailNextPageBtn;
export let neighborhoodDetailPageInfo;

// Modal equipamento cancelamento
export let equipmentDetailModal;
export let equipmentDetailModalTitle;
export let equipmentDetailCloseButton;
export let equipmentDetailBody;

// Modal ativação vendedor
export let sellerActivationDetailModal;
export let sellerActivationDetailModalTitle;
export let sellerActivationDetailCloseButton;
export let sellerActivationDetailContent;
export let sellerActivationDetailLoading;
export let sellerActivationDetailErrorDiv;
export let sellerActivationDetailErrorText;
export let sellerActivationDetailPaginationControls;
export let sellerActivationDetailPrevPageBtn;
export let sellerActivationDetailNextPageBtn;
export let sellerActivationDetailPageInfo;

// Modal equipamento ativo
export let activeEquipmentDetailModal;
export let activeEquipmentDetailModalTitle;
export let activeEquipmentDetailCloseButton;
export let activeEquipmentDetailContent;
export let activeEquipmentDetailLoading;
export let activeEquipmentDetailErrorDiv;
export let activeEquipmentDetailErrorText;
export let activeEquipmentDetailPaginationControls;
export let activeEquipmentDetailPrevPageBtn;
export let activeEquipmentDetailNextPageBtn;
export let activeEquipmentDetailPageInfo;

// Modal admin
export let adminSettingsModal;
export let openAdminSettingsModalBtn;
export let closeAdminSettingsModalBtn;
export let timeoutInput;
export let saveTimeoutBtn;
export let timeoutStatus;
export let usersTableBody;
export let refreshUsersBtn;
export let toggleCreateUserBtn;
export let createUserFormContainer;

export function initModalsDom() {
    tableModal             = document.getElementById('tableModal');
    modalTitle             = document.getElementById('modalTitle');
    const modalTable       = document.getElementById('modalTable');
    modalTableHead         = modalTable ? modalTable.querySelector('thead tr') : null;
    modalTableBody         = modalTable ? modalTable.querySelector('tbody') : null;
    modalLoadingDiv        = document.getElementById('modal-table-loading');
    modalErrorMessageDiv   = document.getElementById('modal-table-error-message');
    modalErrorTextSpan     = document.getElementById('modal-table-error-text');
    modalPaginationControls = document.getElementById('modal-pagination-controls');
    modalPrevPageBtn       = document.getElementById('modalPrevPageBtn');
    modalNextPageBtn       = document.getElementById('modalNextPageBtn');
    modalPageInfoSpan      = document.getElementById('modalPageInfo');
    modalCloseButton       = document.getElementById('modalCloseButton');
    exportTableBtn         = document.getElementById('exportTableBtn');

    invoiceDetailModal           = document.getElementById('invoiceDetailModal');
    invoiceDetailModalTitle      = document.getElementById('invoiceDetailModalTitle');
    invoiceDetailCloseButton     = document.getElementById('invoiceDetailCloseButton');
    exportInvoiceBtn             = document.getElementById('exportInvoiceBtn');
    invoiceDetailContent         = document.getElementById('invoice-detail-content');
    invoiceDetailLoading         = document.getElementById('invoice-detail-loading');
    invoiceDetailErrorDiv        = document.getElementById('invoice-detail-error');
    invoiceDetailErrorText       = document.getElementById('invoice-detail-error-text');
    invoiceDetailPaginationControls = document.getElementById('invoice-detail-pagination-controls');
    invoiceDetailPrevPageBtn     = document.getElementById('invoiceDetailPrevPageBtn');
    invoiceDetailNextPageBtn     = document.getElementById('invoiceDetailNextPageBtn');
    invoiceDetailPageInfo        = document.getElementById('invoiceDetailPageInfo');

    detailsModal             = document.getElementById('detailsModal');
    detailsModalTitle        = document.getElementById('detailsModalTitle');
    detailsModalCloseButton  = document.getElementById('detailsModalCloseButton');
    detailsModalTabs         = document.getElementById('detailsModalTabs');
    detailsModalTabContent   = document.getElementById('detailsModalTabContent');

    cancellationDetailModal        = document.getElementById('cancellationDetailModal');
    cancellationDetailModalTitle   = document.getElementById('cancellationDetailModalTitle');
    cancellationDetailCloseButton  = document.getElementById('cancellationDetailCloseButton');
    cancellationDetailContent      = document.getElementById('cancellation-detail-content');
    cancellationDetailLoading      = document.getElementById('cancellation-detail-loading');
    cancellationDetailErrorDiv     = document.getElementById('cancellation-detail-error');
    cancellationDetailErrorText    = document.getElementById('cancellation-detail-error-text');

    sellerDetailModal             = document.getElementById('sellerDetailModal');
    sellerDetailModalTitle        = document.getElementById('sellerDetailModalTitle');
    sellerDetailCloseButton       = document.getElementById('sellerDetailCloseButton');
    sellerDetailContent           = document.getElementById('seller-detail-content');
    sellerDetailLoading           = document.getElementById('seller-detail-loading');
    sellerDetailErrorDiv          = document.getElementById('seller-detail-error');
    sellerDetailErrorText         = document.getElementById('seller-detail-error-text');
    sellerDetailPaginationControls = document.getElementById('seller-detail-pagination-controls');
    sellerDetailPrevPageBtn       = document.getElementById('sellerDetailPrevPageBtn');
    sellerDetailNextPageBtn       = document.getElementById('sellerDetailNextPageBtn');
    sellerDetailPageInfo          = document.getElementById('sellerDetailPageInfo');

    cityDetailModal             = document.getElementById('cityDetailModal');
    cityDetailModalTitle        = document.getElementById('cityDetailModalTitle');
    cityDetailCloseButton       = document.getElementById('cityDetailCloseButton');
    cityDetailContent           = document.getElementById('city-detail-content');
    cityDetailLoading           = document.getElementById('city-detail-loading');
    cityDetailErrorDiv          = document.getElementById('city-detail-error');
    cityDetailErrorText         = document.getElementById('city-detail-error-text');
    cityDetailPaginationControls = document.getElementById('city-detail-pagination-controls');
    cityDetailPrevPageBtn       = document.getElementById('cityDetailPrevPageBtn');
    cityDetailNextPageBtn       = document.getElementById('cityDetailNextPageBtn');
    cityDetailPageInfo          = document.getElementById('cityDetailPageInfo');

    neighborhoodDetailModal             = document.getElementById('neighborhoodDetailModal');
    neighborhoodDetailModalTitle        = document.getElementById('neighborhoodDetailModalTitle');
    neighborhoodDetailCloseButton       = document.getElementById('neighborhoodDetailCloseButton');
    neighborhoodDetailContent           = document.getElementById('neighborhood-detail-content');
    neighborhoodDetailLoading           = document.getElementById('neighborhood-detail-loading');
    neighborhoodDetailErrorDiv          = document.getElementById('neighborhood-detail-error');
    neighborhoodDetailErrorText         = document.getElementById('neighborhood-detail-error-text');
    neighborhoodDetailPaginationControls = document.getElementById('neighborhood-detail-pagination-controls');
    neighborhoodDetailPrevPageBtn       = document.getElementById('neighborhoodDetailPrevPageBtn');
    neighborhoodDetailNextPageBtn       = document.getElementById('neighborhoodDetailNextPageBtn');
    neighborhoodDetailPageInfo          = document.getElementById('neighborhoodDetailPageInfo');

    equipmentDetailModal       = document.getElementById('equipmentDetailModal');
    equipmentDetailModalTitle  = document.getElementById('equipmentDetailModalTitle');
    equipmentDetailCloseButton = document.getElementById('equipmentDetailCloseButton');
    equipmentDetailBody        = equipmentDetailModal ? equipmentDetailModal.querySelector('.modal-body') : null;

    sellerActivationDetailModal             = document.getElementById('sellerActivationDetailModal');
    sellerActivationDetailModalTitle        = document.getElementById('sellerActivationDetailModalTitle');
    sellerActivationDetailCloseButton       = document.getElementById('sellerActivationDetailCloseButton');
    sellerActivationDetailContent           = document.getElementById('seller-activation-detail-content');
    sellerActivationDetailLoading           = document.getElementById('seller-activation-detail-loading');
    sellerActivationDetailErrorDiv          = document.getElementById('seller-activation-detail-error');
    sellerActivationDetailErrorText         = document.getElementById('seller-activation-detail-error-text');
    sellerActivationDetailPaginationControls = document.getElementById('seller-activation-detail-pagination-controls');
    sellerActivationDetailPrevPageBtn       = document.getElementById('sellerActivationDetailPrevPageBtn');
    sellerActivationDetailNextPageBtn       = document.getElementById('sellerActivationDetailNextPageBtn');
    sellerActivationDetailPageInfo          = document.getElementById('sellerActivationDetailPageInfo');

    activeEquipmentDetailModal             = document.getElementById('activeEquipmentDetailModal');
    activeEquipmentDetailModalTitle        = document.getElementById('activeEquipmentDetailModalTitle');
    activeEquipmentDetailCloseButton       = document.getElementById('activeEquipmentDetailCloseButton');
    activeEquipmentDetailContent           = document.getElementById('active-equipment-detail-content');
    activeEquipmentDetailLoading           = document.getElementById('active-equipment-detail-loading');
    activeEquipmentDetailErrorDiv          = document.getElementById('active-equipment-detail-error');
    activeEquipmentDetailErrorText         = document.getElementById('active-equipment-detail-error-text');
    activeEquipmentDetailPaginationControls = document.getElementById('active-equipment-detail-pagination-controls');
    activeEquipmentDetailPrevPageBtn       = document.getElementById('activeEquipmentDetailPrevPageBtn');
    activeEquipmentDetailNextPageBtn       = document.getElementById('activeEquipmentDetailNextPageBtn');
    activeEquipmentDetailPageInfo          = document.getElementById('activeEquipmentDetailPageInfo');

    adminSettingsModal        = document.getElementById('adminSettingsModal');
    openAdminSettingsModalBtn = document.getElementById('openAdminSettingsModalBtn');
    closeAdminSettingsModalBtn = document.getElementById('closeAdminSettingsModalBtn');
    timeoutInput              = document.getElementById('inactivityTimeout');
    saveTimeoutBtn            = document.getElementById('saveTimeoutBtn');
    timeoutStatus             = document.getElementById('timeoutStatus');
    usersTableBody            = document.getElementById('usersTableBody');
    refreshUsersBtn           = document.getElementById('refreshUsersBtn');
    toggleCreateUserBtn       = document.getElementById('toggleCreateUserBtn');
    createUserFormContainer   = document.getElementById('createUserFormContainer');
}
