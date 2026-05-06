/**
 * modals/equipment.js
 * openEquipmentDetailModal + openActiveEquipmentDetailModal
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import { handleFetchError, renderGenericDetailTable, renderGenericPagination, createGenericPaginationHtml } from '../utils.js';

// --- Modal Equipamento Cancelamento ---

export function openEquipmentDetailModal(equipmentName, year, month, city, relevance) {
    state.setEquipmentDetailState({ currentPage: 1, currentEquipment: equipmentName, currentYear: year, currentMonth: month, currentCity: city, totalRows: 0, currentRelevance: relevance });
    const title = `Clientes com ${equipmentName} cancelados (${year || 'Todos Anos'}${month ? '/' + month : ''}${city ? '/' + city : ''})`;
    if (dom.equipmentDetailModalTitle) dom.equipmentDetailModalTitle.textContent = title;
    if (dom.equipmentDetailModal) dom.equipmentDetailModal.classList.add('show');
    fetchAndDisplayEquipmentDetails(1);
}

export function closeEquipmentDetailModal() {
    if (dom.equipmentDetailModal) dom.equipmentDetailModal.classList.remove('show');
}

export async function fetchAndDisplayEquipmentDetails(page) {
    state.setEquipmentDetailState({ currentPage: page });
    const currentState = state.getEquipmentDetailState();
    const offset = (page - 1) * currentState.rowsPerPage;

    if (dom.equipmentDetailBody) dom.equipmentDetailBody.innerHTML = '<div class="text-center text-gray-600 mb-4"><div class="loading-spinner"></div>Carregando clientes...</div>';

    const params = new URLSearchParams({
        equipment_name: currentState.currentEquipment, year: currentState.currentYear,
        month: currentState.currentMonth, city: currentState.currentCity,
        limit: currentState.rowsPerPage, offset: offset
    });
    if (currentState.currentRelevance) params.append('relevance', currentState.currentRelevance);
    const url = `${state.API_BASE_URL}/api/details/equipment_clients?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes do equipamento.'));
        const result = await response.json();
        state.setEquipmentDetailState({ totalRows: result.total_rows });

        let contentHtml = '';
        if (!result.data || result.data.length === 0) {
            contentHtml = '<div class="table-wrapper"><p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p></div>';
        } else {
            const columns = [
                { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
                { header: 'Contrato ID', key: 'Contrato_ID' },
                { header: 'Data Cancelamento', key: 'Data_cancelamento', isDate: true },
                { header: 'Data Negativação', key: 'Data_negativacao', isDate: true },
                { header: 'Cidade', key: 'Cidade' },
                { header: 'Permanência (Meses)', key: 'permanencia_meses' }
            ];
            contentHtml = `<div class="table-wrapper">${renderGenericDetailTable(null, result.data, columns, true)}</div>`;
        }

        const paginationHtml = createGenericPaginationHtml('equipment-page-btn', state.getEquipmentDetailState());
        if (dom.equipmentDetailBody) dom.equipmentDetailBody.innerHTML = contentHtml + paginationHtml;

    } catch (error) {
        console.error("Erro ao buscar detalhes do equipamento:", error);
        if (dom.equipmentDetailBody) dom.equipmentDetailBody.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert"><strong>Erro!</strong> ${error.message}</div>`;
    }
}

// --- Modal Equipamento Ativo ---

export function openActiveEquipmentDetailModal(equipmentName, city) {
    state.setActiveEquipmentDetailState({ currentPage: 1, currentEquipment: equipmentName, currentCity: city, totalRows: 0 });
    const cityText = city ? `em ${city}` : '';
    const title = `Clientes Ativos com ${equipmentName} ${cityText}`;
    if (dom.activeEquipmentDetailModalTitle) dom.activeEquipmentDetailModalTitle.textContent = title;
    if (dom.activeEquipmentDetailModal) dom.activeEquipmentDetailModal.classList.add('show');
    fetchAndDisplayActiveEquipmentDetails(1);
}

export function closeActiveEquipmentDetailModal() {
    if (dom.activeEquipmentDetailModal) dom.activeEquipmentDetailModal.classList.remove('show');
}

export async function fetchAndDisplayActiveEquipmentDetails(page) {
    state.setActiveEquipmentDetailState({ currentPage: page });
    const currentState = state.getActiveEquipmentDetailState();
    const offset = (page - 1) * currentState.rowsPerPage;

    if (dom.activeEquipmentDetailLoading) dom.activeEquipmentDetailLoading.classList.remove('hidden');
    if (dom.activeEquipmentDetailErrorDiv) dom.activeEquipmentDetailErrorDiv.classList.add('hidden');
    if (dom.activeEquipmentDetailContent) dom.activeEquipmentDetailContent.innerHTML = '';
    if (dom.activeEquipmentDetailPaginationControls) dom.activeEquipmentDetailPaginationControls.classList.add('hidden');

    const params = new URLSearchParams({
        equipment_name: currentState.currentEquipment, city: currentState.currentCity,
        limit: currentState.rowsPerPage, offset: offset
    });
    const url = `${state.API_BASE_URL}/api/details/active_equipment_clients?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes do equipamento ativo.'));
        const result = await response.json();
        state.setActiveEquipmentDetailState({ totalRows: result.total_rows });

        if (!result.data || result.data.length === 0) {
            if (dom.activeEquipmentDetailContent) dom.activeEquipmentDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente ativo encontrado com este equipamento.</p>';
            return;
        }

        const columns = [
            { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
            { header: 'Contrato ID', key: 'Contrato_ID' },
            { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
            { header: 'Status Contrato', key: 'Status_contrato' },
            { header: 'Cidade', key: 'Cidade' }
        ];

        if (dom.activeEquipmentDetailContent) dom.activeEquipmentDetailContent.innerHTML = renderGenericDetailTable(null, result.data, columns, true);
        renderGenericPagination(dom.activeEquipmentDetailPaginationControls, dom.activeEquipmentDetailPageInfo, dom.activeEquipmentDetailPrevPageBtn, dom.activeEquipmentDetailNextPageBtn, state.getActiveEquipmentDetailState());

    } catch (error) {
        console.error("Erro ao buscar detalhes do equipamento ativo:", error);
        if (dom.activeEquipmentDetailErrorText) dom.activeEquipmentDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.activeEquipmentDetailErrorDiv) dom.activeEquipmentDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.activeEquipmentDetailLoading) dom.activeEquipmentDetailLoading.classList.add('hidden');
    }
}
