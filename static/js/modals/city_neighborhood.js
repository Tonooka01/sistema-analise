/**
 * modals/city_neighborhood.js
 * openCityDetailModal + openNeighborhoodDetailModal
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import { handleFetchError, renderGenericDetailTable, renderGenericPagination } from '../utils.js';

// --- Modal Cidade ---

export function openCityDetailModal(city, type, startDate, endDate, relevance) {
    state.setCityDetailState({ currentPage: 1, currentCity: city, currentType: type, currentStartDate: startDate, currentEndDate: endDate, totalRows: 0, currentRelevance: relevance });
    const typeText = type === 'cancelado' ? 'Cancelados' : 'Negativados';
    if (dom.cityDetailModalTitle) dom.cityDetailModalTitle.textContent = `Clientes ${typeText} de ${city}`;
    if (dom.cityDetailModal) dom.cityDetailModal.classList.add('show');
    fetchAndDisplayCityDetails(1);
}

export function closeCityDetailModal() {
    if (dom.cityDetailModal) dom.cityDetailModal.classList.remove('show');
}

export async function fetchAndDisplayCityDetails(page) {
    state.setCityDetailState({ currentPage: page });
    const currentState = state.getCityDetailState();
    const offset = (page - 1) * currentState.rowsPerPage;

    if (dom.cityDetailLoading) dom.cityDetailLoading.classList.remove('hidden');
    if (dom.cityDetailErrorDiv) dom.cityDetailErrorDiv.classList.add('hidden');
    if (dom.cityDetailContent) dom.cityDetailContent.innerHTML = '';
    if (dom.cityDetailPaginationControls) dom.cityDetailPaginationControls.classList.add('hidden');

    const params = new URLSearchParams({
        city: currentState.currentCity, type: currentState.currentType,
        start_date: currentState.currentStartDate || '', end_date: currentState.currentEndDate || '',
        limit: currentState.rowsPerPage, offset: offset
    });
    if (currentState.currentRelevance) params.append('relevance', currentState.currentRelevance);
    const url = `${state.API_BASE_URL}/api/details/city_clients?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes da cidade.'));
        const result = await response.json();
        state.setCityDetailState({ totalRows: result.total_rows });

        if (!result.data || result.data.length === 0) {
            if (dom.cityDetailContent) dom.cityDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p>';
            return;
        }

        const columns = [
            { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
            { header: 'Contrato ID', key: 'Contrato_ID' },
            { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
            { header: 'Data Final', key: 'end_date', isDate: true },
            { header: 'Permanência (Dias)', key: 'permanencia_dias' },
            { header: 'Permanência (Meses)', key: 'permanencia_meses' }
        ];

        if (dom.cityDetailContent) dom.cityDetailContent.innerHTML = renderGenericDetailTable(null, result.data, columns, true);
        renderGenericPagination(dom.cityDetailPaginationControls, dom.cityDetailPageInfo, dom.cityDetailPrevPageBtn, dom.cityDetailNextPageBtn, state.getCityDetailState());

    } catch (error) {
        console.error("Erro ao buscar detalhes da cidade:", error);
        if (dom.cityDetailErrorText) dom.cityDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.cityDetailErrorDiv) dom.cityDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.cityDetailLoading) dom.cityDetailLoading.classList.add('hidden');
    }
}

// --- Modal Bairro ---

export function openNeighborhoodDetailModal(city, neighborhood, type, year, month, relevance) {
    state.setNeighborhoodDetailState({ currentPage: 1, currentCity: city, currentNeighborhood: neighborhood, currentType: type, currentYear: year, currentMonth: month, totalRows: 0, currentRelevance: relevance });
    const typeText = type === 'cancelado' ? 'Cancelados' : 'Negativados';
    const title = `Clientes ${typeText} de ${neighborhood}, ${city} (${year || 'Todos Anos'}${month ? '/' + month : ''})`;
    if (dom.neighborhoodDetailModalTitle) dom.neighborhoodDetailModalTitle.textContent = title;
    if (dom.neighborhoodDetailModal) dom.neighborhoodDetailModal.classList.add('show');
    fetchAndDisplayNeighborhoodDetails(1);
}

export function closeNeighborhoodDetailModal() {
    if (dom.neighborhoodDetailModal) dom.neighborhoodDetailModal.classList.remove('show');
}

export async function fetchAndDisplayNeighborhoodDetails(page) {
    state.setNeighborhoodDetailState({ currentPage: page });
    const currentState = state.getNeighborhoodDetailState();
    const offset = (page - 1) * currentState.rowsPerPage;

    if (dom.neighborhoodDetailLoading) dom.neighborhoodDetailLoading.classList.remove('hidden');
    if (dom.neighborhoodDetailErrorDiv) dom.neighborhoodDetailErrorDiv.classList.add('hidden');
    if (dom.neighborhoodDetailContent) dom.neighborhoodDetailContent.innerHTML = '';
    if (dom.neighborhoodDetailPaginationControls) dom.neighborhoodDetailPaginationControls.classList.add('hidden');

    const params = new URLSearchParams({
        city: currentState.currentCity, neighborhood: currentState.currentNeighborhood,
        type: currentState.currentType, year: currentState.currentYear, month: currentState.currentMonth,
        limit: currentState.rowsPerPage, offset: offset
    });
    if (currentState.currentRelevance) params.append('relevance', currentState.currentRelevance);
    const url = `${state.API_BASE_URL}/api/details/neighborhood_clients?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes do bairro.'));
        const result = await response.json();
        state.setNeighborhoodDetailState({ totalRows: result.total_rows });

        if (!result.data || result.data.length === 0) {
            if (dom.neighborhoodDetailContent) dom.neighborhoodDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p>';
            return;
        }

        const columns = [
            { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
            { header: 'Contrato ID', key: 'Contrato_ID' },
            { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
            { header: 'Data Final', key: 'end_date', isDate: true },
            { header: 'Permanência (Dias)', key: 'permanencia_dias' },
            { header: 'Permanência (Meses)', key: 'permanencia_meses' }
        ];

        if (dom.neighborhoodDetailContent) dom.neighborhoodDetailContent.innerHTML = renderGenericDetailTable(null, result.data, columns, true);
        renderGenericPagination(dom.neighborhoodDetailPaginationControls, dom.neighborhoodDetailPageInfo, dom.neighborhoodDetailPrevPageBtn, dom.neighborhoodDetailNextPageBtn, state.getNeighborhoodDetailState());

    } catch (error) {
        console.error("Erro ao buscar detalhes do bairro:", error);
        if (dom.neighborhoodDetailErrorText) dom.neighborhoodDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.neighborhoodDetailErrorDiv) dom.neighborhoodDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.neighborhoodDetailLoading) dom.neighborhoodDetailLoading.classList.add('hidden');
    }
}
