// --- Variáveis para guardar referências aos elementos do DOM ---
// Estas serão preenchidas pela função initializeDom() após o carregamento da página.

// Elementos Principais e de Conteúdo
export let dashboardContentWrapper;
export let dashboardContentDiv;
export let mainChartsArea;
export let chartLoadingDiv;
export let chartErrorMsgDiv;
export let chartErrorTextSpan;

// Seletores e Filtros Principais
export let collectionSelectorButtons; // Será preenchido com querySelectorAll
export let customAnalysisSelector;
export let saveLayoutBtn;
export let viewTableBtn;

// --- Filtros Específicos por Análise ---

// Filtros Análise Principal (Coleções) - AGORA COM DATA
export let financialFiltersDiv;
export let generalStartDate; // Renomeado de yearFilter
export let generalEndDate;   // Renomeado de monthFilter
export let cityFilterSelect;
export let cityFilterContainer;

// Filtros Análise Personalizada Geral (Cancelamento, Negativação)
export let customSearchFilterDiv;
export let clientSearchInput;
export let applyClientSearchBtn;
export let relevanceFilterSearch;
export let sortPermanenceAsc; // <--- NOVO: Referência ao checkbox de ordenação

// Filtros Saúde Financeira / Evolução Ativos
export let financialHealthFiltersDiv;
export let contractStatusFilter;
export let accessStatusContainer;
export let filterActiveClientsBtn;

// Filtros Análise Vendedores - AGORA COM DATA
export let sellerAnalysisFiltersDiv;
export let sellerStartDate;
export let sellerEndDate;

// Filtros Cancelamento/Negativação por Cidade - AGORA COM DATA
export let cityCancellationFiltersDiv;
export let cityCancellationStartDate;
export let cityCancellationEndDate;
export let relevanceFilterCity;

// Filtros Cancelamento/Negativação por Bairro - AGORA COM DATA
export let neighborhoodAnalysisFiltersDiv;
export let neighborhoodAnalysisCityFilter;
export let neighborhoodAnalysisStartDate;
export let neighborhoodAnalysisEndDate;
export let relevanceFilterNeighborhood;

// Filtros Análise de Equipamento - AGORA COM DATA
export let equipmentAnalysisFiltersDiv;
export let equipmentAnalysisStartDate;
export let equipmentAnalysisEndDate;
export let equipmentAnalysisCityFilter;
export let equipmentDateFilterContainer; // Container para datas
export let relevanceFilterEquipment;

// Filtros Evolução Diária
export let dailyEvolutionFiltersDiv;
export let dailyEvolutionStartDate;
export let dailyEvolutionEndDate;

// Filtros Análise de Comportamento
export let behaviorAnalysisContainer;
export let behaviorAnalysisTabs;
export let behaviorAnalysisTabContent;

// Filtros Faturamento por Cidade/Período
export let faturamentoCidadeFiltersDiv;
export let faturamentoStartDate;
export let faturamentoEndDate;
export let faturamentoCityFilter;

// NOVOS FILTROS DE ATIVAÇÃO POR VENDEDOR - AGORA COM DATA
export let activationSellerFiltersDiv;
export let activationSellerCityFilter;
export let activationSellerStartDate;
export let activationSellerEndDate;

// NOVOS FILTROS DE COORTE - AGORA COM DATA
export let cohortAnalysisFiltersDiv;
export let cohortCityFilter;
export let cohortStartDate;
export let cohortEndDate;

// NOVOS FILTROS DE ANÁLISE DE JUROS - AGORA COM DATA
export let latePaymentFiltersDiv;
export let latePaymentStartDate;
export let latePaymentEndDate;


// --- Elementos dos Modais ---
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

export let detailsModal;
export let detailsModalTitle;
export let detailsModalCloseButton;
export let detailsModalTabs;
export let detailsModalTabContent;

export let cancellationDetailModal;
export let cancellationDetailModalTitle;
export let cancellationDetailCloseButton;
export let cancellationDetailContent;
export let cancellationDetailLoading;
export let cancellationDetailErrorDiv;
export let cancellationDetailErrorText;

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

export let equipmentDetailModal;
export let equipmentDetailModalTitle;
export let equipmentDetailCloseButton;
export let equipmentDetailBody;

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


/**
 * Função para preencher as variáveis de referência do DOM.
 * Deve ser chamada APÓS o evento DOMContentLoaded.
 */
export function initializeDom() {
    console.log("Inicializando referências do DOM...");

    dashboardContentWrapper = document.getElementById('dashboard-content-wrapper');
    dashboardContentDiv = document.getElementById('dashboard-content');
    mainChartsArea = document.getElementById('main-charts-area');
    chartLoadingDiv = document.getElementById('chart-loading');
    chartErrorMsgDiv = document.getElementById('chart-error-message');
    chartErrorTextSpan = document.getElementById('chart-error-text');

    collectionSelectorButtons = document.querySelectorAll('.collection-selector button:not(#saveLayoutBtn)');
    customAnalysisSelector = document.getElementById('customAnalysisSelector');
    saveLayoutBtn = document.getElementById('saveLayoutBtn');
    viewTableBtn = document.getElementById('viewTableBtn');

    // Filtros Análise Principal
    financialFiltersDiv = document.getElementById('financial-filters');
    generalStartDate = document.getElementById('generalStartDate'); // NOVO
    generalEndDate = document.getElementById('generalEndDate');     // NOVO
    cityFilterSelect = document.getElementById('cityFilter');
    cityFilterContainer = document.getElementById('city-filter-container');

    customSearchFilterDiv = document.getElementById('custom-search-filter');
    clientSearchInput = document.getElementById('clientSearchInput');
    applyClientSearchBtn = document.getElementById('applyClientSearch');
    relevanceFilterSearch = document.getElementById('relevanceFilterSearch');
    sortPermanenceAsc = document.getElementById('sortPermanenceAsc'); // <--- NOVO: Inicialização da variável

    financialHealthFiltersDiv = document.getElementById('financial-health-filters');
    contractStatusFilter = document.getElementById('contractStatusFilter');
    accessStatusContainer = document.getElementById('accessStatusContainer');
    filterActiveClientsBtn = document.getElementById('filterActiveClientsBtn');

    // Filtros Análise Vendedores
    sellerAnalysisFiltersDiv = document.getElementById('seller-analysis-filters');
    sellerStartDate = document.getElementById('sellerStartDate'); // NOVO
    sellerEndDate = document.getElementById('sellerEndDate');     // NOVO

    // Filtros Cancelamento/Negativação por Cidade
    cityCancellationFiltersDiv = document.getElementById('city-cancellation-filters');
    cityCancellationStartDate = document.getElementById('cityCancellationStartDate'); // NOVO
    cityCancellationEndDate = document.getElementById('cityCancellationEndDate');     // NOVO
    relevanceFilterCity = document.getElementById('relevanceFilterCity');

    // Filtros Cancelamento/Negativação por Bairro
    neighborhoodAnalysisFiltersDiv = document.getElementById('neighborhood-analysis-filters');
    neighborhoodAnalysisCityFilter = document.getElementById('neighborhoodAnalysisCityFilter');
    neighborhoodAnalysisStartDate = document.getElementById('neighborhoodAnalysisStartDate'); // NOVO
    neighborhoodAnalysisEndDate = document.getElementById('neighborhoodAnalysisEndDate');     // NOVO
    relevanceFilterNeighborhood = document.getElementById('relevanceFilterNeighborhood');

    // Filtros Análise de Equipamento
    equipmentAnalysisFiltersDiv = document.getElementById('equipment-analysis-filters');
    equipmentAnalysisStartDate = document.getElementById('equipmentAnalysisStartDate'); // NOVO
    equipmentAnalysisEndDate = document.getElementById('equipmentAnalysisEndDate');     // NOVO
    equipmentAnalysisCityFilter = document.getElementById('equipmentAnalysisCityFilter');
    equipmentDateFilterContainer = document.getElementById('equipmentDateFilterContainer'); // NOVO
    relevanceFilterEquipment = document.getElementById('relevanceFilterEquipment');

    dailyEvolutionFiltersDiv = document.getElementById('daily-evolution-filters');
    dailyEvolutionStartDate = document.getElementById('dailyEvolutionStartDate');
    dailyEvolutionEndDate = document.getElementById('dailyEvolutionEndDate');

    behaviorAnalysisContainer = document.getElementById('behavior-analysis-container');
    behaviorAnalysisTabs = document.getElementById('behavior-analysis-tabs');
    behaviorAnalysisTabContent = document.getElementById('behavior-analysis-tab-content');

    faturamentoCidadeFiltersDiv = document.getElementById('faturamento-cidade-filters');
    faturamentoStartDate = document.getElementById('faturamentoStartDate');
    faturamentoEndDate = document.getElementById('faturamentoEndDate');
    faturamentoCityFilter = document.getElementById('faturamentoCityFilter');

    activationSellerFiltersDiv = document.getElementById('activation-seller-filters');
    activationSellerCityFilter = document.getElementById('activationSellerCityFilter');
    activationSellerStartDate = document.getElementById('activationSellerStartDate'); // NOVO
    activationSellerEndDate = document.getElementById('activationSellerEndDate');     // NOVO

    cohortAnalysisFiltersDiv = document.getElementById('cohort-analysis-filters');
    cohortCityFilter = document.getElementById('cohortCityFilter');
    cohortStartDate = document.getElementById('cohortStartDate'); // NOVO
    cohortEndDate = document.getElementById('cohortEndDate');     // NOVO

    latePaymentFiltersDiv = document.getElementById('late-payment-filters');
    latePaymentStartDate = document.getElementById('latePaymentStartDate'); // NOVO
    latePaymentEndDate = document.getElementById('latePaymentEndDate');     // NOVO

    // Modais (IDs mantidos)
    tableModal = document.getElementById('tableModal');
    modalTitle = document.getElementById('modalTitle');
    const modalTable = document.getElementById('modalTable');
    modalTableHead = modalTable ? modalTable.querySelector('thead tr') : null;
    modalTableBody = modalTable ? modalTable.querySelector('tbody') : null;
    modalLoadingDiv = document.getElementById('modal-table-loading');
    modalErrorMessageDiv = document.getElementById('modal-table-error-message');
    modalErrorTextSpan = document.getElementById('modal-table-error-text');
    modalPaginationControls = document.getElementById('modal-pagination-controls');
    modalPrevPageBtn = document.getElementById('modalPrevPageBtn');
    modalNextPageBtn = document.getElementById('modalNextPageBtn');
    modalPageInfoSpan = document.getElementById('modalPageInfo');
    modalCloseButton = document.getElementById('modalCloseButton');
    exportTableBtn = document.getElementById('exportTableBtn');

    invoiceDetailModal = document.getElementById('invoiceDetailModal');
    invoiceDetailModalTitle = document.getElementById('invoiceDetailModalTitle');
    invoiceDetailCloseButton = document.getElementById('invoiceDetailCloseButton');
    exportInvoiceBtn = document.getElementById('exportInvoiceBtn');
    invoiceDetailContent = document.getElementById('invoice-detail-content');
    invoiceDetailLoading = document.getElementById('invoice-detail-loading');
    invoiceDetailErrorDiv = document.getElementById('invoice-detail-error');
    invoiceDetailErrorText = document.getElementById('invoice-detail-error-text');
    invoiceDetailPaginationControls = document.getElementById('invoice-detail-pagination-controls');
    invoiceDetailPrevPageBtn = document.getElementById('invoiceDetailPrevPageBtn');
    invoiceDetailNextPageBtn = document.getElementById('invoiceDetailNextPageBtn');
    invoiceDetailPageInfo = document.getElementById('invoiceDetailPageInfo');

    detailsModal = document.getElementById('detailsModal');
    detailsModalTitle = document.getElementById('detailsModalTitle');
    detailsModalCloseButton = document.getElementById('detailsModalCloseButton');
    detailsModalTabs = document.getElementById('detailsModalTabs');
    detailsModalTabContent = document.getElementById('detailsModalTabContent');

    cancellationDetailModal = document.getElementById('cancellationDetailModal');
    cancellationDetailModalTitle = document.getElementById('cancellationDetailModalTitle');
    cancellationDetailCloseButton = document.getElementById('cancellationDetailCloseButton');
    cancellationDetailContent = document.getElementById('cancellation-detail-content');
    cancellationDetailLoading = document.getElementById('cancellation-detail-loading');
    cancellationDetailErrorDiv = document.getElementById('cancellation-detail-error');
    cancellationDetailErrorText = document.getElementById('cancellation-detail-error-text');

    sellerDetailModal = document.getElementById('sellerDetailModal');
    sellerDetailModalTitle = document.getElementById('sellerDetailModalTitle');
    sellerDetailCloseButton = document.getElementById('sellerDetailCloseButton');
    sellerDetailContent = document.getElementById('seller-detail-content');
    sellerDetailLoading = document.getElementById('seller-detail-loading');
    sellerDetailErrorDiv = document.getElementById('seller-detail-error');
    sellerDetailErrorText = document.getElementById('seller-detail-error-text');
    sellerDetailPaginationControls = document.getElementById('seller-detail-pagination-controls');
    sellerDetailPrevPageBtn = document.getElementById('sellerDetailPrevPageBtn');
    sellerDetailNextPageBtn = document.getElementById('sellerDetailNextPageBtn');
    sellerDetailPageInfo = document.getElementById('sellerDetailPageInfo');

    cityDetailModal = document.getElementById('cityDetailModal');
    cityDetailModalTitle = document.getElementById('cityDetailModalTitle');
    cityDetailCloseButton = document.getElementById('cityDetailCloseButton');
    cityDetailContent = document.getElementById('city-detail-content');
    cityDetailLoading = document.getElementById('city-detail-loading');
    cityDetailErrorDiv = document.getElementById('city-detail-error');
    cityDetailErrorText = document.getElementById('city-detail-error-text');
    cityDetailPaginationControls = document.getElementById('city-detail-pagination-controls');
    cityDetailPrevPageBtn = document.getElementById('cityDetailPrevPageBtn');
    cityDetailNextPageBtn = document.getElementById('cityDetailNextPageBtn');
    cityDetailPageInfo = document.getElementById('cityDetailPageInfo');

    neighborhoodDetailModal = document.getElementById('neighborhoodDetailModal');
    neighborhoodDetailModalTitle = document.getElementById('neighborhoodDetailModalTitle');
    neighborhoodDetailCloseButton = document.getElementById('neighborhoodDetailCloseButton');
    neighborhoodDetailContent = document.getElementById('neighborhood-detail-content');
    neighborhoodDetailLoading = document.getElementById('neighborhood-detail-loading');
    neighborhoodDetailErrorDiv = document.getElementById('neighborhood-detail-error');
    neighborhoodDetailErrorText = document.getElementById('neighborhood-detail-error-text');
    neighborhoodDetailPaginationControls = document.getElementById('neighborhood-detail-pagination-controls');
    neighborhoodDetailPrevPageBtn = document.getElementById('neighborhoodDetailPrevPageBtn');
    neighborhoodDetailNextPageBtn = document.getElementById('neighborhoodDetailNextPageBtn');
    neighborhoodDetailPageInfo = document.getElementById('neighborhoodDetailPageInfo');

    equipmentDetailModal = document.getElementById('equipmentDetailModal');
    equipmentDetailModalTitle = document.getElementById('equipmentDetailModalTitle');
    equipmentDetailCloseButton = document.getElementById('equipmentDetailCloseButton');
    equipmentDetailBody = equipmentDetailModal ? equipmentDetailModal.querySelector('.modal-body') : null;

    sellerActivationDetailModal = document.getElementById('sellerActivationDetailModal');
    sellerActivationDetailModalTitle = document.getElementById('sellerActivationDetailModalTitle');
    sellerActivationDetailCloseButton = document.getElementById('sellerActivationDetailCloseButton');
    sellerActivationDetailContent = document.getElementById('seller-activation-detail-content');
    sellerActivationDetailLoading = document.getElementById('seller-activation-detail-loading');
    sellerActivationDetailErrorDiv = document.getElementById('seller-activation-detail-error');
    sellerActivationDetailErrorText = document.getElementById('seller-activation-detail-error-text');
    sellerActivationDetailPaginationControls = document.getElementById('seller-activation-detail-pagination-controls');
    sellerActivationDetailPrevPageBtn = document.getElementById('sellerActivationDetailPrevPageBtn');
    sellerActivationDetailNextPageBtn = document.getElementById('sellerActivationDetailNextPageBtn');
    sellerActivationDetailPageInfo = document.getElementById('sellerActivationDetailPageInfo');

    activeEquipmentDetailModal = document.getElementById('activeEquipmentDetailModal');
    activeEquipmentDetailModalTitle = document.getElementById('activeEquipmentDetailModalTitle');
    activeEquipmentDetailCloseButton = document.getElementById('activeEquipmentDetailCloseButton');
    activeEquipmentDetailContent = document.getElementById('active-equipment-detail-content');
    activeEquipmentDetailLoading = document.getElementById('active-equipment-detail-loading');
    activeEquipmentDetailErrorDiv = document.getElementById('active-equipment-detail-error');
    activeEquipmentDetailErrorText = document.getElementById('active-equipment-detail-error-text');
    activeEquipmentDetailPaginationControls = document.getElementById('active-equipment-detail-pagination-controls');
    activeEquipmentDetailPrevPageBtn = document.getElementById('activeEquipmentDetailPrevPageBtn');
    activeEquipmentDetailNextPageBtn = document.getElementById('activeEquipmentDetailNextPageBtn');
    activeEquipmentDetailPageInfo = document.getElementById('activeEquipmentDetailPageInfo');

    adminSettingsModal = document.getElementById('adminSettingsModal');
    openAdminSettingsModalBtn = document.getElementById('openAdminSettingsModalBtn');
    closeAdminSettingsModalBtn = document.getElementById('closeAdminSettingsModalBtn');
    timeoutInput = document.getElementById('inactivityTimeout');
    saveTimeoutBtn = document.getElementById('saveTimeoutBtn');
    timeoutStatus = document.getElementById('timeoutStatus');
    usersTableBody = document.getElementById('usersTableBody');
    refreshUsersBtn = document.getElementById('refreshUsersBtn');
    toggleCreateUserBtn = document.getElementById('toggleCreateUserBtn');
    createUserFormContainer = document.getElementById('createUserFormContainer');

    console.log("Referências do DOM inicializadas.");
}