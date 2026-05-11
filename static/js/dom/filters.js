/**
 * dom/filters.js
 * Referências de filtros — análise principal, busca, saúde financeira,
 * vendedor, cidade, bairro, equipamento, evolução, comportamento,
 * faturamento, ativação, coorte, juros.
 */

// Filtros Análise Principal
export let financialFiltersDiv;
export let generalStartDate;
export let generalEndDate;
export let cityFilterSelect;
export let cityFilterContainer;
export let btnFilterGeneral;

// Filtros Busca e Datas Personalizadas
export let customSearchFilterDiv;
export let clientSearchInput;
export let applyClientSearchBtn;
export let clearFiltersBtn;
export let relevanceFilterSearch;
export let relevanceFilterContainer;
export let sortPermanenceAsc;
export let customDateFilterContainer;
export let customStartDate;
export let customEndDate;
export let customStartDateLabel;
export let customEndDateLabel;

// Filtros Saúde Financeira
export let financialHealthFiltersDiv;
export let financialHealthDateContainer;
export let financialHealthStartDate;
export let financialHealthEndDate;
export let contractStatusFilter;
export let accessStatusContainer;
export let filterActiveClientsBtn;

// Filtros Vendedores
export let sellerAnalysisFiltersDiv;
export let sellerStartDate;
export let sellerEndDate;
export let btnFilterSeller;

// Filtros Cancelamento/Negativação por Cidade
export let cityCancellationFiltersDiv;
export let cityCancellationStartDate;
export let cityCancellationEndDate;
export let relevanceFilterCity;
export let btnFilterCityCancellation;

// Filtros Cancelamento/Negativação por Bairro
export let neighborhoodAnalysisFiltersDiv;
export let neighborhoodAnalysisCityFilter;
export let neighborhoodAnalysisStartDate;
export let neighborhoodAnalysisEndDate;
export let relevanceFilterNeighborhood;
export let btnFilterNeighborhood;

// Filtros Equipamento
export let equipmentAnalysisFiltersDiv;
export let equipmentAnalysisStartDate;
export let equipmentAnalysisEndDate;
export let equipmentAnalysisCityFilter;
export let equipmentDateFilterContainer;
export let relevanceFilterEquipment;
export let btnFilterEquipment;

// Filtros Evolução Diária
export let dailyEvolutionFiltersDiv;
export let dailyEvolutionStartDate;
export let dailyEvolutionEndDate;
export let btnFilterDailyEvolution;

// Filtros Análise de Comportamento
export let behaviorAnalysisContainer;
export let behaviorAnalysisTabs;
export let behaviorAnalysisTabContent;

// Filtros Faturamento por Cidade/Período
export let faturamentoCidadeFiltersDiv;
export let faturamentoStartDate;
export let faturamentoEndDate;
export let faturamentoCityFilter;
export let btnFilterFaturamento;

// Filtros Ativação por Vendedor
export let activationSellerFiltersDiv;
export let activationSellerCityFilter;
export let activationSellerStartDate;
export let activationSellerEndDate;
export let btnFilterActivationSeller;

// Filtros Coorte
export let cohortAnalysisFiltersDiv;
export let cohortCityFilter;
export let cohortStartDate;
export let cohortEndDate;
export let btnFilterCohort;

// Filtros Juros/Atraso
export let latePaymentFiltersDiv;
export let latePaymentStartDate;
export let latePaymentEndDate;
export let btnFilterLatePayment;

export function initFiltersDom() {
    financialFiltersDiv = document.getElementById('financial-filters');
    generalStartDate    = document.getElementById('generalStartDate');
    generalEndDate      = document.getElementById('generalEndDate');
    cityFilterSelect    = document.getElementById('cityFilter');
    cityFilterContainer = document.getElementById('city-filter-container');
    btnFilterGeneral    = document.getElementById('btnFilterGeneral');

    customSearchFilterDiv    = document.getElementById('custom-search-filter');
    clientSearchInput        = document.getElementById('clientSearchInput');
    applyClientSearchBtn     = document.getElementById('applyClientSearch');
    clearFiltersBtn          = document.getElementById('clearFiltersBtn');
    relevanceFilterSearch    = document.getElementById('relevanceFilterSearch');
    relevanceFilterContainer = document.getElementById('relevanceFilterContainer');
    sortPermanenceAsc        = document.getElementById('sortPermanenceAsc');
    customDateFilterContainer = document.getElementById('custom-date-filters');
    customStartDate          = document.getElementById('customStartDate');
    customEndDate            = document.getElementById('customEndDate');
    customStartDateLabel     = document.querySelector('label[for="customStartDate"]');
    customEndDateLabel       = document.querySelector('label[for="customEndDate"]');

    financialHealthFiltersDiv    = document.getElementById('financial-health-filters');
    financialHealthDateContainer = document.getElementById('financialHealthDateContainer');
    financialHealthStartDate     = document.getElementById('financialHealthStartDate');
    financialHealthEndDate       = document.getElementById('financialHealthEndDate');
    contractStatusFilter         = document.getElementById('contractStatusFilter');
    accessStatusContainer        = document.getElementById('accessStatusContainer');
    filterActiveClientsBtn       = document.getElementById('filterActiveClientsBtn');

    sellerAnalysisFiltersDiv = document.getElementById('seller-analysis-filters');
    sellerStartDate          = document.getElementById('sellerStartDate');
    sellerEndDate            = document.getElementById('sellerEndDate');
    btnFilterSeller          = document.getElementById('btnFilterSeller');

    cityCancellationFiltersDiv  = document.getElementById('city-cancellation-filters');
    cityCancellationStartDate   = document.getElementById('cityCancellationStartDate');
    cityCancellationEndDate     = document.getElementById('cityCancellationEndDate');
    relevanceFilterCity         = document.getElementById('relevanceFilterCity');
    btnFilterCityCancellation   = document.getElementById('btnFilterCityCancellation');

    neighborhoodAnalysisFiltersDiv  = document.getElementById('neighborhood-analysis-filters');
    neighborhoodAnalysisCityFilter  = document.getElementById('neighborhoodAnalysisCityFilter');
    neighborhoodAnalysisStartDate   = document.getElementById('neighborhoodAnalysisStartDate');
    neighborhoodAnalysisEndDate     = document.getElementById('neighborhoodAnalysisEndDate');
    relevanceFilterNeighborhood     = document.getElementById('relevanceFilterNeighborhood');
    btnFilterNeighborhood           = document.getElementById('btnFilterNeighborhood');

    equipmentAnalysisFiltersDiv  = document.getElementById('equipment-analysis-filters');
    equipmentAnalysisStartDate   = document.getElementById('equipmentAnalysisStartDate');
    equipmentAnalysisEndDate     = document.getElementById('equipmentAnalysisEndDate');
    equipmentAnalysisCityFilter  = document.getElementById('equipmentAnalysisCityFilter');
    equipmentDateFilterContainer = document.getElementById('equipmentDateFilterContainer');
    relevanceFilterEquipment     = document.getElementById('relevanceFilterEquipment');
    btnFilterEquipment           = document.getElementById('btnFilterEquipment');

    dailyEvolutionFiltersDiv  = document.getElementById('daily-evolution-filters');
    dailyEvolutionStartDate   = document.getElementById('dailyEvolutionStartDate');
    dailyEvolutionEndDate     = document.getElementById('dailyEvolutionEndDate');
    btnFilterDailyEvolution   = document.getElementById('btnFilterDailyEvolution');

    behaviorAnalysisContainer  = document.getElementById('behavior-analysis-container');
    behaviorAnalysisTabs       = document.getElementById('behavior-analysis-tabs');
    behaviorAnalysisTabContent = document.getElementById('behavior-analysis-tab-content');

    faturamentoCidadeFiltersDiv = document.getElementById('faturamento-cidade-filters');
    faturamentoStartDate        = document.getElementById('faturamentoStartDate');
    faturamentoEndDate          = document.getElementById('faturamentoEndDate');
    faturamentoCityFilter       = document.getElementById('faturamentoCityFilter');
    btnFilterFaturamento        = document.getElementById('btnFilterFaturamento');

    activationSellerFiltersDiv  = document.getElementById('activation-seller-filters');
    activationSellerCityFilter  = document.getElementById('activationSellerCityFilter');
    activationSellerStartDate   = document.getElementById('activationSellerStartDate');
    activationSellerEndDate     = document.getElementById('activationSellerEndDate');
    btnFilterActivationSeller   = document.getElementById('btnFilterActivationSeller');

    cohortAnalysisFiltersDiv = document.getElementById('cohort-analysis-filters');
    cohortCityFilter         = document.getElementById('cohortCityFilter');
    cohortStartDate          = document.getElementById('cohortStartDate');
    cohortEndDate            = document.getElementById('cohortEndDate');
    btnFilterCohort          = document.getElementById('btnFilterCohort');

    latePaymentFiltersDiv = document.getElementById('late-payment-filters');
    latePaymentStartDate  = document.getElementById('latePaymentStartDate');
    latePaymentEndDate    = document.getElementById('latePaymentEndDate');
    btnFilterLatePayment  = document.getElementById('btnFilterLatePayment');
}
