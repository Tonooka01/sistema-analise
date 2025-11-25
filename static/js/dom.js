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

// Filtros Análise Principal (Coleções)
export let financialFiltersDiv;
export let yearFilterSelect;
export let monthFilterSelect;
export let cityFilterSelect;
export let cityFilterContainer;

// Filtros Análise Personalizada Geral (Cancelamento, Negativação)
export let customSearchFilterDiv;
export let clientSearchInput;
export let applyClientSearchBtn;
export let relevanceFilterSearch; // NOVO FILTRO DE RELEVÂNCIA

// Filtros Saúde Financeira
export let financialHealthFiltersDiv;
export let contractStatusFilter;
export let accessStatusFilter;

// Filtros Análise Vendedores
export let sellerAnalysisFiltersDiv;
export let sellerYearFilter;
export let sellerMonthFilter;

// Filtros Cancelamento/Negativação por Cidade
export let cityCancellationFiltersDiv;
export let cityCancellationYearFilter;
export let cityCancellationMonthFilter;
export let relevanceFilterCity; // NOVO FILTRO DE RELEVÂNCIA

// Filtros Cancelamento/Negativação por Bairro
export let neighborhoodAnalysisFiltersDiv;
export let neighborhoodAnalysisCityFilter;
export let neighborhoodAnalysisYearFilter;
export let neighborhoodAnalysisMonthFilter;
export let relevanceFilterNeighborhood; // NOVO FILTRO DE RELEVÂNCIA

// Filtros Análise de Equipamento (Cancelamento e Ativo por OLT)
export let equipmentAnalysisFiltersDiv;
export let equipmentAnalysisYearFilter;
export let equipmentAnalysisMonthFilter;
export let equipmentAnalysisCityFilter;
export let equipmentYearFilterContainer;
export let equipmentMonthFilterContainer;
export let relevanceFilterEquipment; // NOVO FILTRO DE RELEVÂNCIA

// Filtros Evolução Diária
export let dailyEvolutionFiltersDiv;
export let dailyEvolutionStartDate;
export let dailyEvolutionEndDate;

// Filtros Análise de Comportamento (Dentro das Abas)
export let behaviorAnalysisContainer;
export let behaviorAnalysisTabs;
export let behaviorAnalysisTabContent;
// Elementos específicos das abas (serão buscados dentro das funções de renderização das abas)

// Filtros Faturamento por Cidade/Período
export let faturamentoCidadeFiltersDiv;
export let faturamentoStartDate;
export let faturamentoEndDate;
export let faturamentoCityFilter;

// NOVOS FILTROS DE ATIVAÇÃO POR VENDEDOR
export let activationSellerFiltersDiv;
export let activationSellerCityFilter;
export let activationSellerYearFilter;
export let activationSellerMonthFilter;

// NOVOS FILTROS DE COORTE
export let cohortAnalysisFiltersDiv;
export let cohortCityFilter;
export let cohortYearFilter;
export let cohortMonthFilter;

// NOVOS FILTROS DE ANÁLISE DE JUROS
export let latePaymentFiltersDiv;
export let latePaymentYearFilter;
export let latePaymentMonthFilter;


// --- Elementos dos Modais ---

// Modal Principal (Tabela Genérica)
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

// Modal Detalhes da Fatura (Atrasos/Não Pagas)
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

// Modal Unificado de Detalhes com Abas (Financeiro, OS, Atend., Logins, Comodato)
export let detailsModal;
export let detailsModalTitle;
export let detailsModalCloseButton;
export let detailsModalTabs;
export let detailsModalTabContent; // O container das abas

// Modal Detalhes Cancelamento/Negativação (Histórico Cliente)
export let cancellationDetailModal;
export let cancellationDetailModalTitle;
export let cancellationDetailCloseButton;
export let cancellationDetailContent;
export let cancellationDetailLoading;
export let cancellationDetailErrorDiv;
export let cancellationDetailErrorText;
// (Não tem paginação própria, mostra tudo)

// Modal Detalhes do Vendedor
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

// Modal Detalhes da Cidade
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

// Modal Detalhes do Bairro
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

// Modal Detalhes do Equipamento (Cancelamento)
export let equipmentDetailModal;
export let equipmentDetailModalTitle;
export let equipmentDetailCloseButton;
export let equipmentDetailBody; // Referência direta ao body para innerHTML
// (Paginação é adicionada dinamicamente ao body)

// NOVO MODAL - Detalhes de Ativação do Vendedor
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

// Modal Detalhes Equipamento Ativo
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


/**
 * Função para preencher as variáveis de referência do DOM.
 * Deve ser chamada APÓS o evento DOMContentLoaded.
 */
export function initializeDom() {
    console.log("Inicializando referências do DOM...");

    // Elementos Principais
    dashboardContentWrapper = document.getElementById('dashboard-content-wrapper');
    dashboardContentDiv = document.getElementById('dashboard-content');
    mainChartsArea = document.getElementById('main-charts-area');
    chartLoadingDiv = document.getElementById('chart-loading');
    chartErrorMsgDiv = document.getElementById('chart-error-message');
    chartErrorTextSpan = document.getElementById('chart-error-text');

    // --- DEBUG LOG ---
    console.log("Elemento 'dashboard-content' encontrado:", dashboardContentDiv);
    // --- FIM DEBUG LOG ---

    // Seletores Principais
    collectionSelectorButtons = document.querySelectorAll('.collection-selector button:not(#saveLayoutBtn)');
    customAnalysisSelector = document.getElementById('customAnalysisSelector');
    saveLayoutBtn = document.getElementById('saveLayoutBtn');
    viewTableBtn = document.getElementById('viewTableBtn');

    // Filtros Análise Principal
    financialFiltersDiv = document.getElementById('financial-filters');
    yearFilterSelect = document.getElementById('yearFilter');
    monthFilterSelect = document.getElementById('monthFilter');
    cityFilterSelect = document.getElementById('cityFilter');
    cityFilterContainer = document.getElementById('city-filter-container');

    // Filtros Análise Personalizada Geral
    customSearchFilterDiv = document.getElementById('custom-search-filter');
    clientSearchInput = document.getElementById('clientSearchInput');
    applyClientSearchBtn = document.getElementById('applyClientSearch');
    relevanceFilterSearch = document.getElementById('relevanceFilterSearch'); // NOVO

    // Filtros Saúde Financeira
    financialHealthFiltersDiv = document.getElementById('financial-health-filters');
    contractStatusFilter = document.getElementById('contractStatusFilter');
    accessStatusFilter = document.getElementById('accessStatusFilter');

    // Filtros Análise Vendedores
    sellerAnalysisFiltersDiv = document.getElementById('seller-analysis-filters');
    sellerYearFilter = document.getElementById('sellerYearFilter');
    sellerMonthFilter = document.getElementById('sellerMonthFilter');

    // Filtros Cancelamento/Negativação por Cidade
    cityCancellationFiltersDiv = document.getElementById('city-cancellation-filters');
    cityCancellationYearFilter = document.getElementById('cityCancellationYearFilter');
    cityCancellationMonthFilter = document.getElementById('cityCancellationMonthFilter');
    relevanceFilterCity = document.getElementById('relevanceFilterCity'); // NOVO

    // Filtros Cancelamento/Negativação por Bairro
    neighborhoodAnalysisFiltersDiv = document.getElementById('neighborhood-analysis-filters');
    neighborhoodAnalysisCityFilter = document.getElementById('neighborhoodAnalysisCityFilter');
    neighborhoodAnalysisYearFilter = document.getElementById('neighborhoodAnalysisYearFilter');
    neighborhoodAnalysisMonthFilter = document.getElementById('neighborhoodAnalysisMonthFilter');
    relevanceFilterNeighborhood = document.getElementById('relevanceFilterNeighborhood'); // NOVO

    // Filtros Análise de Equipamento
    equipmentAnalysisFiltersDiv = document.getElementById('equipment-analysis-filters');
    equipmentAnalysisYearFilter = document.getElementById('equipmentAnalysisYearFilter');
    equipmentAnalysisMonthFilter = document.getElementById('equipmentAnalysisMonthFilter');
    equipmentAnalysisCityFilter = document.getElementById('equipmentAnalysisCityFilter');
    equipmentYearFilterContainer = document.getElementById('equipmentYearFilterContainer');
    equipmentMonthFilterContainer = document.getElementById('equipmentMonthFilterContainer');
    relevanceFilterEquipment = document.getElementById('relevanceFilterEquipment'); // NOVO

    // Filtros Evolução Diária
    dailyEvolutionFiltersDiv = document.getElementById('daily-evolution-filters');
    dailyEvolutionStartDate = document.getElementById('dailyEvolutionStartDate');
    dailyEvolutionEndDate = document.getElementById('dailyEvolutionEndDate');

    // Filtros Análise de Comportamento
    behaviorAnalysisContainer = document.getElementById('behavior-analysis-container');
    behaviorAnalysisTabs = document.getElementById('behavior-analysis-tabs');
    behaviorAnalysisTabContent = document.getElementById('behavior-analysis-tab-content');

    // Filtros Faturamento por Cidade/Período
    faturamentoCidadeFiltersDiv = document.getElementById('faturamento-cidade-filters');
    faturamentoStartDate = document.getElementById('faturamentoStartDate');
    faturamentoEndDate = document.getElementById('faturamentoEndDate');
    faturamentoCityFilter = document.getElementById('faturamentoCityFilter');

    // NOVOS FILTROS DE ATIVAÇÃO POR VENDEDOR
    activationSellerFiltersDiv = document.getElementById('activation-seller-filters');
    activationSellerCityFilter = document.getElementById('activationSellerCityFilter');
    activationSellerYearFilter = document.getElementById('activationSellerYearFilter');
    activationSellerMonthFilter = document.getElementById('activationSellerMonthFilter');

    // NOVOS FILTROS DE COORTE
    cohortAnalysisFiltersDiv = document.getElementById('cohort-analysis-filters');
    cohortCityFilter = document.getElementById('cohortCityFilter');
    cohortYearFilter = document.getElementById('cohortYearFilter');
    cohortMonthFilter = document.getElementById('cohortMonthFilter');

    // NOVOS FILTROS DE ANÁLISE DE JUROS
    latePaymentFiltersDiv = document.getElementById('late-payment-filters');
    latePaymentYearFilter = document.getElementById('latePaymentYearFilter');
    latePaymentMonthFilter = document.getElementById('latePaymentMonthFilter');

    // --- Elementos dos Modais ---
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

    // NOVO MODAL - Detalhes de Ativação do Vendedor
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

    console.log("Referências do DOM inicializadas.");

    // Verifica se algum elemento essencial não foi encontrado
    if (!dashboardContentWrapper || !customAnalysisSelector || !tableModal || !dashboardContentDiv || !chartLoadingDiv || !chartErrorMsgDiv) {
        console.error("ERRO: Um ou mais elementos essenciais do DOM não foram encontrados. Verifique os IDs no HTML.");
    }
}