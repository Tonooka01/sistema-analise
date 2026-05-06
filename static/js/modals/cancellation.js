/**
 * modals/cancellation.js
 * Modal de histórico de cancelamento/negativação
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import { handleFetchError, renderGenericDetailTable } from '../utils.js';

export function openCancellationDetailModal(clientName, contractId, isLink = false) {
    if (isLink) {
        const openModal = document.querySelector('.modal.show');
        if (openModal) openModal.classList.remove('show');
    }
    if (dom.cancellationDetailModalTitle) dom.cancellationDetailModalTitle.textContent = `Histórico de ${clientName} (Contrato: ${contractId})`;
    if (dom.cancellationDetailModal) dom.cancellationDetailModal.classList.add('show');
    _fetchAndRenderCancellationDetails(contractId, clientName);
}

export function closeCancellationDetailModal() {
    if (dom.cancellationDetailModal) dom.cancellationDetailModal.classList.remove('show');
}

async function _fetchAndRenderCancellationDetails(contractId, clientName) {
    if (dom.cancellationDetailLoading) dom.cancellationDetailLoading.classList.remove('hidden');
    if (dom.cancellationDetailErrorDiv) dom.cancellationDetailErrorDiv.classList.add('hidden');
    if (dom.cancellationDetailContent) dom.cancellationDetailContent.innerHTML = '';

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/details/cancellation_context/${contractId}/${encodeURIComponent(clientName)}`);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar o histórico do cliente.'));
        const data = await response.json();

        let contentHtml = '';

        if (data.equipamentos && data.equipamentos.length > 0) {
            const columns = [
                { header: 'Produto', key: 'Descricao_produto' },
                { header: 'Status', key: 'Status_comodato' },
                { header: 'Data', key: 'Data', isDate: true }
            ];
            contentHtml += `<h3 class="text-lg font-semibold mt-4 mb-2 text-gray-700">Equipamentos em Comodato</h3>`;
            contentHtml += `<div class="table-wrapper border rounded-lg">${renderGenericDetailTable(null, data.equipamentos, columns, true)}</div>`;
        }

        if (data.os && data.os.length > 0) {
            const columns = [
                { header: 'ID', key: 'ID' },
                { header: 'Abertura', key: 'Abertura', isDate: true },
                { header: 'Assunto', key: 'Assunto' },
                { header: 'Mensagem', key: 'Mensagem', render: r => r.Mensagem || 'N/A' }
            ];
            contentHtml += `<h3 class="text-lg font-semibold mt-6 mb-2 text-gray-700">Ordens de Serviço (OS)</h3>`;
            contentHtml += `<div class="table-wrapper border rounded-lg">${renderGenericDetailTable(null, data.os, columns, true)}</div>`;
        }

        if (data.atendimentos && data.atendimentos.length > 0) {
            const columns = [
                { header: 'ID', key: 'ID' },
                { header: 'Criação', key: 'Criado_em', isDate: true },
                { header: 'Assunto', key: 'Assunto' },
                { header: 'Status', key: 'Novo_status' },
                { header: 'Descrição', key: 'Descri_o', render: r => r.Descri_o || 'N/A' }
            ];
            contentHtml += `<h3 class="text-lg font-semibold mt-6 mb-2 text-gray-700">Atendimentos</h3>`;
            contentHtml += `<div class="table-wrapper border rounded-lg">${renderGenericDetailTable(null, data.atendimentos, columns, true)}</div>`;
        }

        if (contentHtml === '') {
            contentHtml = '<p class="text-center text-gray-500 p-4">Nenhum histórico de OS, atendimentos ou equipamentos encontrado para este cliente antes do evento.</p>';
        }

        if (dom.cancellationDetailContent) dom.cancellationDetailContent.innerHTML = contentHtml;

    } catch (error) {
        console.error("Erro ao buscar histórico de cancelamento:", error);
        if (dom.cancellationDetailErrorText) dom.cancellationDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.cancellationDetailErrorDiv) dom.cancellationDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.cancellationDetailLoading) dom.cancellationDetailLoading.classList.add('hidden');
    }
}
