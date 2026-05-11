/**
 * utils/filters.js
 * Funções de manipulação de filtros, selects e controles ativos.
 */

import * as dom from '../dom.js';
import * as state from '../state.js';

export function setActiveControl(element) {
    if (dom.collectionSelectorButtons) {
        dom.collectionSelectorButtons.forEach(btn => btn.classList.remove('active'));
    }
    if (dom.customAnalysisSelector) dom.customAnalysisSelector.classList.remove('active');
    if (element) element.classList.add('active');
}

export function getSelectedChartType(radioName, defaultType) {
    const radio = document.querySelector(`input[name="${radioName}"]:checked`);
    return radio ? radio.value : defaultType;
}

export function populateYearFilter(selectElement, years, selectedYear = '') {
    if (!selectElement) return;
    const currentVal = selectElement.value;
    selectElement.innerHTML = '<option value="">Todos os Anos</option>';
    if (years && Array.isArray(years) && years.length > 0) {
        [...years].sort((a, b) => b - a).forEach(y => {
            if (y) {
                const opt = document.createElement('option');
                opt.value = y; opt.textContent = y;
                selectElement.appendChild(opt);
            }
        });
    }
    selectElement.value = selectedYear || currentVal || '';
}

export function populateCityFilter(selectElement, cities, selectedCity = '') {
    if (!selectElement) return;
    const currentVal = selectElement.value;
    const placeholder = selectElement.options[0]?.text || 'Selecione...';
    selectElement.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = ''; defaultOpt.textContent = placeholder;
    selectElement.appendChild(defaultOpt);
    if (cities && Array.isArray(cities) && cities.length > 0) {
        [...cities].sort((a, b) => a.localeCompare(b)).forEach(c => {
            if (c && typeof c === 'string' && c.trim() !== '') {
                const opt = document.createElement('option');
                opt.value = c; opt.textContent = c;
                selectElement.appendChild(opt);
            }
        });
    }
    selectElement.value = selectedCity || currentVal || '';
}

export function resetAllFilters() {
    const inputs = [
        dom.clientSearchInput, dom.contractStatusFilter, dom.accessStatusFilter,
        dom.yearFilterSelect, dom.monthFilterSelect, dom.cityFilterSelect,
        dom.sellerYearFilter, dom.sellerMonthFilter,
        dom.cityCancellationYearFilter, dom.cityCancellationMonthFilter,
        dom.neighborhoodAnalysisCityFilter, dom.neighborhoodAnalysisYearFilter, dom.neighborhoodAnalysisMonthFilter,
        dom.equipmentAnalysisYearFilter, dom.equipmentAnalysisMonthFilter, dom.equipmentAnalysisCityFilter,
        dom.dailyEvolutionStartDate, dom.dailyEvolutionEndDate,
        dom.faturamentoStartDate, dom.faturamentoEndDate, dom.faturamentoCityFilter,
        dom.activationSellerCityFilter, dom.activationSellerYearFilter, dom.activationSellerMonthFilter,
        dom.cohortCityFilter, dom.cohortYearFilter, dom.cohortMonthFilter,
        dom.relevanceFilterSearch, dom.relevanceFilterCity, dom.relevanceFilterNeighborhood, dom.relevanceFilterEquipment,
        dom.latePaymentYearFilter, dom.latePaymentMonthFilter,
    ];
    inputs.forEach(el => { if (el) el.value = ''; });

    state.resetCustomAnalysisState();
    state.resetSellerDetailState();
    state.resetCityDetailState();
    state.resetNeighborhoodDetailState();
    state.resetEquipmentDetailState();
    state.resetActiveEquipmentDetailState();
    state.resetSellerActivationDetailState();
    state.resetDetailsState();
    state.resetInvoiceDetailState();

    console.log("Todos os filtros foram resetados.");
}

export function hideAllCustomFilters() {
    const divs = [
        dom.customSearchFilterDiv, dom.financialHealthFiltersDiv, dom.sellerAnalysisFiltersDiv,
        dom.financialFiltersDiv, dom.cityCancellationFiltersDiv, dom.neighborhoodAnalysisFiltersDiv,
        dom.equipmentAnalysisFiltersDiv, dom.dailyEvolutionFiltersDiv, dom.behaviorAnalysisContainer,
        dom.faturamentoCidadeFiltersDiv, dom.activationSellerFiltersDiv, dom.cohortAnalysisFiltersDiv,
        dom.latePaymentFiltersDiv,
    ];
    divs.forEach(d => d?.classList.add('hidden'));
}
