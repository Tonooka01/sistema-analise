/**
 * modals/seller.js
 * openSellerDetailModal + openSellerActivationDetailModal
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import { handleFetchError, renderGenericDetailTable, renderGenericPagination } from '../utils.js';

// --- Modal Detalhes do Vendedor (Churn) ---

export function openSellerDetailModal(sellerId, sellerName, type, year, month) {
    state.setSellerDetailState({ currentPage: 1, currentSellerId: sellerId, currentSellerName: sellerName, currentType: type, currentYear: year, currentMonth: month, totalRows: 0 });
    const typeText = type === 'cancelado' ? 'Cancelados' : 'Negativados';
    const title = `Clientes ${typeText} de ${sellerName || 'Vendedor Não Identificado'} (${year || 'Todos Anos'}${month ? '/' + month : ''})`;
    if (dom.sellerDetailModalTitle) dom.sellerDetailModalTitle.textContent = title;
    if (dom.sellerDetailModal) dom.sellerDetailModal.classList.add('show');
    fetchAndDisplaySellerDetails(1);
}

export function closeSellerDetailModal() {
    if (dom.sellerDetailModal) dom.sellerDetailModal.classList.remove('show');
}

export async function fetchAndDisplaySellerDetails(page) {
    state.setSellerDetailState({ currentPage: page });
    const currentState = state.getSellerDetailState();
    const offset = (page - 1) * currentState.rowsPerPage;

    if (dom.sellerDetailLoading) dom.sellerDetailLoading.classList.remove('hidden');
    if (dom.sellerDetailErrorDiv) dom.sellerDetailErrorDiv.classList.add('hidden');
    if (dom.sellerDetailContent) dom.sellerDetailContent.innerHTML = '';
    if (dom.sellerDetailPaginationControls) dom.sellerDetailPaginationControls.classList.add('hidden');

    const params = new URLSearchParams({
        seller_id: currentState.currentSellerId, type: currentState.currentType,
        year: currentState.currentYear, month: currentState.currentMonth,
        limit: currentState.rowsPerPage, offset: offset
    });
    const url = `${state.API_BASE_URL}/api/details/seller_clients?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes do vendedor.'));
        const result = await response.json();
        state.setSellerDetailState({ totalRows: result.total_rows });

        if (!result.data || result.data.length === 0) {
            if (dom.sellerDetailContent) dom.sellerDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p>';
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

        if (dom.sellerDetailContent) dom.sellerDetailContent.innerHTML = renderGenericDetailTable(null, result.data, columns, true);
        renderGenericPagination(dom.sellerDetailPaginationControls, dom.sellerDetailPageInfo, dom.sellerDetailPrevPageBtn, dom.sellerDetailNextPageBtn, state.getSellerDetailState());

    } catch (error) {
        console.error("Erro ao buscar detalhes do vendedor:", error);
        if (dom.sellerDetailErrorText) dom.sellerDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.sellerDetailErrorDiv) dom.sellerDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.sellerDetailLoading) dom.sellerDetailLoading.classList.add('hidden');
    }
}

// --- Modal Ativação do Vendedor ---

export function openSellerActivationDetailModal(sellerId, sellerName, type, city, year, month) {
    state.setSellerActivationDetailState({ currentPage: 1, currentSellerId: sellerId, currentSellerName: sellerName, currentType: type, currentCity: city, currentYear: year, currentMonth: month, totalRows: 0 });

    let typeText = 'Clientes Ativados';
    if (type === 'ativo_permanece')    typeText = 'Clientes que Permanecem Ativos';
    else if (type === 'cancelado')     typeText = 'Clientes Cancelados';
    else if (type === 'negativado')    typeText = 'Clientes Negativados';

    const title = `${typeText} de ${sellerName || 'Vendedor Não Identificado'} (${city || 'Todas Cidades'} / ${year || 'Todos Anos'}${month ? '/' + month : ''})`;
    if (dom.sellerActivationDetailModalTitle) dom.sellerActivationDetailModalTitle.textContent = title;
    if (dom.sellerActivationDetailModal) dom.sellerActivationDetailModal.classList.add('show');
    fetchAndDisplaySellerActivationDetails(1);
}

export function closeSellerActivationDetailModal() {
    if (dom.sellerActivationDetailModal) dom.sellerActivationDetailModal.classList.remove('show');
}

export async function fetchAndDisplaySellerActivationDetails(page) {
    state.setSellerActivationDetailState({ currentPage: page });
    const currentState = state.getSellerActivationDetailState();
    const offset = (page - 1) * currentState.rowsPerPage;

    if (dom.sellerActivationDetailLoading) dom.sellerActivationDetailLoading.classList.remove('hidden');
    if (dom.sellerActivationDetailErrorDiv) dom.sellerActivationDetailErrorDiv.classList.add('hidden');
    if (dom.sellerActivationDetailContent) dom.sellerActivationDetailContent.innerHTML = '';
    if (dom.sellerActivationDetailPaginationControls) dom.sellerActivationDetailPaginationControls.classList.add('hidden');

    const params = new URLSearchParams({
        seller_id: currentState.currentSellerId, type: currentState.currentType,
        city: currentState.currentCity, year: currentState.currentYear, month: currentState.currentMonth,
        limit: currentState.rowsPerPage, offset: offset
    });
    const url = `${state.API_BASE_URL}/api/details/seller_activations?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes de ativação do vendedor.'));
        const result = await response.json();

        if (!result.data || result.data.length === 0) {
            if (dom.sellerActivationDetailContent) dom.sellerActivationDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado para este filtro.</p>';
            return;
        }

        state.setSellerActivationDetailState({ totalRows: result.total_rows });
        const updatedState = state.getSellerActivationDetailState();

        const columns = [
            { header: 'Cliente', render: r => {
                const nome = r.Cliente || 'Não identificado';
                return `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${nome.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${nome}</span>`;
            }},
            { header: 'Contrato ID', key: 'Contrato_ID' },
            { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
            { header: 'Status Contrato', key: 'Status_contrato' },
            { header: 'Data Final (Churn)', key: 'end_date', isDate: true },
            { header: 'Permanência (Meses)', key: 'permanencia_meses' }
        ];

        if (dom.sellerActivationDetailContent) dom.sellerActivationDetailContent.innerHTML = renderGenericDetailTable(null, result.data, columns, true);
        renderGenericPagination(dom.sellerActivationDetailPaginationControls, dom.sellerActivationDetailPageInfo, dom.sellerActivationDetailPrevPageBtn, dom.sellerActivationDetailNextPageBtn, updatedState);

    } catch (error) {
        console.error("Erro ao buscar detalhes de ativação do vendedor:", error);
        if (dom.sellerActivationDetailErrorText) dom.sellerActivationDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.sellerActivationDetailErrorDiv) dom.sellerActivationDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.sellerActivationDetailLoading) dom.sellerActivationDetailLoading.classList.add('hidden');
    }
}
