import * as state from './state.js';
import * as dom from './dom.js';
import { formatDate, handleFetchError, renderGenericDetailTable, renderGenericPagination, createGenericPaginationHtml } from './utils.js';
import { renderChart } from './charts.js'; // Importação necessária para o gráfico

// --- Modal Principal de Tabela ---

/**
 * Abre o modal da tabela principal para a coleção especificada.
 * @param {string} collectionName - O nome da coleção OU o identificador da análise personalizada.
 */
export function openModal(collectionName) {
    state.setModalCurrentCollection(collectionName);
    state.setModalCurrentPage(1);
    
    // Define o título baseado no tipo de coleção/análise
    let title = `Dados da Tabela: ${collectionName}`;
    if (collectionName === 'saude_financeira_contrato_atraso') {
        title = 'Análise Completa: Saúde Financeira (Atraso > 10 dias)';
    } else if (collectionName === 'saude_financeira_contrato_bloqueio') {
        title = 'Análise Completa: Saúde Financeira (Bloqueio Automático)';
    } else if (collectionName === 'cancellations') {
        title = 'Análise Completa: Cancelamentos';
    } else if (collectionName === 'negativacao') {
        title = 'Análise Completa: Negativações';
    }

    if (dom.modalTitle) dom.modalTitle.textContent = title;
    if (dom.tableModal) dom.tableModal.classList.add('show');
    
    fetchAndDisplayTableInModal(collectionName, 1);
}

export function closeModal() {
    if (dom.tableModal) dom.tableModal.classList.remove('show');
}

/**
 * Busca e exibe os dados paginados no modal da tabela principal.
 * Suporta coleções padrão E análises personalizadas.
 * @param {string} collectionName - O nome da coleção/análise.
 * @param {number} page - O número da página a ser buscada.
 */
export async function fetchAndDisplayTableInModal(collectionName, page = 1) {
    if (dom.modalLoadingDiv) dom.modalLoadingDiv.classList.remove('hidden');
    if (dom.modalErrorMessageDiv) dom.modalErrorMessageDiv.classList.add('hidden');
    if (dom.modalTableHead) dom.modalTableHead.innerHTML = '';
    if (dom.modalTableBody) dom.modalTableBody.innerHTML = '';
    if (dom.modalPaginationControls) dom.modalPaginationControls.classList.add('hidden');

    // Configuração Padrão (Paginação normal para outras tabelas)
    let limit = state.MODAL_ROWS_PER_PAGE;
    let offset = (page - 1) * limit;
    let url = '';
    let isFullView = false; // Flag para indicar modo "ver tudo" (Excel)

    // --- LÓGICA DE SELEÇÃO DE URL ---
    // Verifica se é uma das análises personalizadas que suportam modal
    const customAnalysesTypes = [
        'saude_financeira_contrato_atraso', 
        'saude_financeira_contrato_bloqueio',
        'cancellations',
        'negativacao'
    ];

    if (customAnalysesTypes.includes(collectionName)) {
        // *** MODO "EXCEL": Traz tudo em uma página (limite alto) ***
        isFullView = true;
        limit = 100000; // Define um limite alto para trazer "todos" os registros
        offset = 0;     // Sempre começa do início

        let endpoint = '';
        let params = new URLSearchParams({ limit, offset });
        
        // Pega os filtros atuais do DOM para aplicar na tabela completa
        const searchTerm = dom.clientSearchInput?.value || '';
        if (searchTerm) params.append('search_term', searchTerm);

        // --- CORREÇÃO: Obter o estado atual dos filtros de gráfico ---
        const currentState = state.getCustomAnalysisState();
        // ----------------------------------------------------------------

        if (collectionName.startsWith('saude_financeira')) {
            endpoint = collectionName.includes('bloqueio') ? 'financial_health_auto_block' : 'financial_health';
            
            const contractStatus = dom.contractStatusFilter?.value || '';
            
            let accessStatus = '';
            if (dom.accessStatusContainer) {
                 const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
                 accessStatus = Array.from(checked).map(cb => cb.value).join(',');
            }

            if (contractStatus) params.append('status_contrato', contractStatus);
            if (accessStatus) params.append('status_acesso', accessStatus);
            if (dom.relevanceFilterSearch?.value) params.append('relevance', dom.relevanceFilterSearch.value);

        } else if (collectionName === 'cancellations') {
            endpoint = 'cancellations';
            if (dom.customStartDate?.value) params.append('start_date', dom.customStartDate.value);
            if (dom.customEndDate?.value) params.append('end_date', dom.customEndDate.value);
            if (dom.relevanceFilterSearch?.value) params.append('relevance', dom.relevanceFilterSearch.value);
            
            // --- INSERIR ISTO: Passar os filtros do gráfico para o Modal ---
            if (currentState.chartFilterColumn && currentState.chartFilterValue) {
                params.append('filter_column', currentState.chartFilterColumn);
                params.append('filter_value', currentState.chartFilterValue);
            }
            // -------------------------------------------------------------

            params.append('sort_order', state.getCustomAnalysisState().sortOrder || 'desc');

        } else if (collectionName === 'negativacao') {
            endpoint = 'negativacao';
            if (dom.customStartDate?.value) params.append('start_date', dom.customStartDate.value);
            if (dom.customEndDate?.value) params.append('end_date', dom.customEndDate.value);
            if (dom.relevanceFilterSearch?.value) params.append('relevance', dom.relevanceFilterSearch.value);
            
            // --- INSERIR ISTO: Passar os filtros do gráfico para o Modal ---
            if (currentState.chartFilterColumn && currentState.chartFilterValue) {
                params.append('filter_column', currentState.chartFilterColumn);
                params.append('filter_value', currentState.chartFilterValue);
            }
            // -------------------------------------------------------------

            params.append('sort_order', state.getCustomAnalysisState().sortOrder || 'desc');
        }

        url = `${state.API_BASE_URL}/api/custom_analysis/${endpoint}?${params.toString()}`;

    } else {
        // É uma coleção padrão -> URL padrão (/api/data/...) com paginação normal
        const apiCollectionName = collectionName.replace(/ /g, '_');
        url = `${state.API_BASE_URL}/api/data/${apiCollectionName}?limit=${limit}&offset=${offset}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await handleFetchError(response, 'Não foi possível carregar os dados da tabela.');
            throw new Error(errorMessage);
        }
        const result = await response.json();
        state.setModalTotalRows(result.total_rows);
        state.setModalCurrentPage(page);

        if (!result.data || result.data.length === 0) {
            if (dom.modalTableBody) dom.modalTableBody.innerHTML = '<tr><td colspan="50" class="text-center py-4 text-gray-500">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
            return;
        }
        
        // Renderiza usando a função auxiliar
        renderDataTableInModal(result.data);
        
        // Lógica de exibição da paginação
        if (isFullView) {
            // No modo Excel (Full View), esconde os botões de paginação pois tudo está em uma tela
             if (dom.modalPaginationControls) {
                 dom.modalPaginationControls.classList.remove('hidden');
                 // Substitui os botões por uma mensagem informativa
                 dom.modalPaginationControls.innerHTML = `
                    <div class="text-center w-full text-gray-600 text-sm">
                        Exibindo <strong>${result.data.length}</strong> registros filtrados (Total Original: ${result.total_rows}). Role a tabela para ver mais.
                    </div>
                 `;
             }
        } else {
            // Modo normal: restaura e mostra os botões
            renderModalPaginationControls();
        }

    } catch (error) {
        console.error('Erro no modal:', error);
        if (dom.modalErrorTextSpan) dom.modalErrorTextSpan.textContent = `Erro: ${error.message}.`;
        if (dom.modalErrorMessageDiv) dom.modalErrorMessageDiv.classList.remove('hidden');
    } finally {
        if (dom.modalLoadingDiv) dom.modalLoadingDiv.classList.add('hidden');
    }
}

/**
 * Renderiza os dados da tabela no corpo do modal principal.
 * @param {object[]} data - Array de objetos com os dados da tabela.
 */
function renderDataTableInModal(data) {
    if (!dom.modalTableHead || !dom.modalTableBody || !data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    
    // Renderiza Cabeçalho com nomes amigáveis e sticky (fixo no topo)
    dom.modalTableHead.innerHTML = headers.map(h => 
        `<th class="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-100 sticky top-0 border-b border-gray-200 z-10 shadow-sm">${h.replace(/_/g, ' ')}</th>`
    ).join('');

    // Renderiza Corpo
    dom.modalTableBody.innerHTML = data.map(item => `
        <tr class="border-b border-gray-200 hover:bg-gray-50 transition duration-150">
            ${headers.map(h => {
                let value = item[h];
                if (value === null || value === undefined) value = '';
                
                // Formatação básica de data (YYYY-MM-DD)
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                    value = formatDate(value);
                }
                
                return `<td class="py-3 px-4 text-sm text-gray-800 whitespace-nowrap" title="${item[h] || ''}">${value}</td>`;
            }).join('')}
        </tr>`).join('');
}

/**
 * Renderiza os controles de paginação para o modal da tabela principal (Modo Normal).
 */
function renderModalPaginationControls() {
    // Restaura o HTML original dos controles se tiver sido alterado pelo modo Full View
    if (dom.modalPaginationControls && !dom.modalPaginationControls.querySelector('button')) {
        dom.modalPaginationControls.innerHTML = `
            <button id="modalPrevPageBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed">Página Anterior</button>
            <span id="modalPageInfo" class="text-gray-700 font-medium"></span>
            <button id="modalNextPageBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Próxima Página</button>
        `;
    }

    const totalRows = state.getModalTotalRows();
    const totalPages = Math.ceil(totalRows / state.MODAL_ROWS_PER_PAGE);
    
    if (totalPages <= 1 && totalRows > 0) {
        if (dom.modalPaginationControls) dom.modalPaginationControls.classList.add('hidden');
        return;
    }
    
    // Re-seleciona elementos internos caso tenham sido recriados
    const pageInfo = document.getElementById('modalPageInfo');
    const prevBtn = document.getElementById('modalPrevPageBtn');
    const nextBtn = document.getElementById('modalNextPageBtn');
    
    if (!dom.modalPaginationControls || !pageInfo || !prevBtn || !nextBtn) return;

    pageInfo.textContent = `Página ${state.getModalCurrentPage()} de ${totalPages} (${totalRows} registros)`;
    prevBtn.disabled = state.getModalCurrentPage() <= 1;
    nextBtn.disabled = state.getModalCurrentPage() >= totalPages;
    dom.modalPaginationControls.classList.remove('hidden');
}

// --- Outros modais ---

export function openInvoiceDetailModal(contractId, clientName, type) {
    state.setCurrentInvoiceDetailContractId(contractId);
    state.setCurrentInvoiceDetailType(type);
    state.setInvoiceDetailCurrentPage(1);
    
    let typeText = '';
    if (type === 'atrasos_pagos') {
        typeText = 'Atrasos Pagos';
    } else if (type === 'faturas_nao_pagas') {
        typeText = 'Faturas Vencidas e Não Pagas';
    } else if (type === 'all_invoices') {
        typeText = 'Todas as Faturas';
    }

    if (dom.invoiceDetailModalTitle) dom.invoiceDetailModalTitle.textContent = `Detalhes: ${typeText} para ${clientName} (Contrato: ${contractId})`;
    if (dom.invoiceDetailModal) dom.invoiceDetailModal.classList.add('show');
    fetchAndDisplayInvoiceDetails(1);
}

export function closeInvoiceDetailModal() {
    if (dom.invoiceDetailModal) dom.invoiceDetailModal.classList.remove('show');
}

export async function fetchAndDisplayInvoiceDetails(page) {
    state.setInvoiceDetailCurrentPage(page);
    const offset = (page - 1) * state.INVOICE_DETAIL_ROWS_PER_PAGE;

    if (dom.invoiceDetailLoading) dom.invoiceDetailLoading.classList.remove('hidden');
    if (dom.invoiceDetailErrorDiv) dom.invoiceDetailErrorDiv.classList.add('hidden');
    if (dom.invoiceDetailContent) dom.invoiceDetailContent.innerHTML = '';
    if (dom.invoiceDetailPaginationControls) dom.invoiceDetailPaginationControls.classList.add('hidden');

    const url = `${state.API_BASE_URL}/api/details/invoice_details?contract_id=${state.getCurrentInvoiceDetailContractId()}&type=${state.getCurrentInvoiceDetailType()}&limit=${state.INVOICE_DETAIL_ROWS_PER_PAGE}&offset=${offset}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await handleFetchError(response, 'Não foi possível carregar os detalhes da fatura.');
            throw new Error(errorMessage);
        }
        const result = await response.json();
        state.setInvoiceDetailTotalRows(result.total_rows);
        renderInvoiceDetailTable(result.data);
        renderInvoiceDetailPagination();
    } catch (error) {
        console.error("Erro ao buscar detalhes da fatura:", error);
        if (dom.invoiceDetailErrorText) dom.invoiceDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.invoiceDetailErrorDiv) dom.invoiceDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.invoiceDetailLoading) dom.invoiceDetailLoading.classList.add('hidden');
    }
}

function renderInvoiceDetailTable(data) {
    if (!dom.invoiceDetailContent) return;
    if (!data || data.length === 0) {
        dom.invoiceDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum detalhe encontrado.</p>';
        return;
    }

    // --- CÁLCULO DE ESTATÍSTICAS PARA O GRÁFICO ---
    let adiantadoCount = 0;
    let emDiaCount = 0;
    let atrasadoCount = 0;

    data.forEach(row => {
        const payDate = row.Data_pagamento;
        const dueDate = row.Vencimento;

        if (payDate && dueDate) {
            try {
                const dPay = new Date(payDate.split(' ')[0]);
                const dDue = new Date(dueDate.split(' ')[0]);

                if (!isNaN(dPay) && !isNaN(dDue)) {
                    const diffTime = dPay - dDue;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays > 0) {
                        atrasadoCount++;
                    } else if (diffDays < 0) {
                        adiantadoCount++;
                    } else {
                        emDiaCount++;
                    }
                }
            } catch (e) {
                // Ignora erros de parse na contagem
            }
        }
    });

    // --- HTML DO GRÁFICO (Canvas) ---
    // Inserimos o canvas antes da tabela apenas se houver dados de pagamento
    let chartHtml = '';
    const totalPagos = adiantadoCount + emDiaCount + atrasadoCount;
    
    if (totalPagos > 0) {
        chartHtml = `
            <div class="flex justify-center items-center mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div style="max-width: 300px; width: 100%;">
                    <h3 class="text-center text-sm font-semibold text-gray-600 mb-2">Comportamento de Pagamento (Página Atual)</h3>
                    <div class="chart-canvas-container" style="height: 200px; position: relative;">
                        <canvas id="invoicePaymentBehaviorChart"></canvas>
                    </div>
                </div>
            </div>
        `;
    }

    const columns = [
        { header: 'ID', key: 'ID' },
        { header: 'Emissão', key: 'Emissao', isDate: true },
        { header: 'Vencimento', key: 'Vencimento', isDate: true },
        { 
            header: 'Data Pagamento', 
            render: (row) => {
                const payDate = row.Data_pagamento;
                if (!payDate) return 'N/A';
                
                const formattedDate = formatDate(payDate);
                const dueDate = row.Vencimento;

                if (!dueDate) return formattedDate;

                try {
                    // Normaliza para comparar apenas as datas (ignora horas se existirem)
                    const dPay = new Date(payDate.split(' ')[0]);
                    const dDue = new Date(dueDate.split(' ')[0]);

                    if (isNaN(dPay) || isNaN(dDue)) return formattedDate;

                    // Diferença em milissegundos
                    const diffTime = dPay - dDue; 
                    // Converte para dias
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    let badge = '';
                    if (diffDays > 0) {
                        // Atrasado (Vermelho)
                        badge = `<span class="ml-2 text-xs font-bold text-red-600 bg-red-100 px-1 rounded border border-red-200" title="Atraso de ${diffDays} dias">+${diffDays}d</span>`;
                    } else if (diffDays < 0) {
                        // Adiantado (Verde)
                        badge = `<span class="ml-2 text-xs font-bold text-green-600 bg-green-100 px-1 rounded border border-green-200" title="Adiantado ${Math.abs(diffDays)} dias">${diffDays}d</span>`;
                    } else {
                        // Em dia (Cinza/Neutro)
                        badge = `<span class="ml-2 text-xs font-bold text-gray-500 bg-gray-100 px-1 rounded border border-gray-200" title="Pago no dia">0d</span>`;
                    }

                    return `<div class="flex items-center">${formattedDate}${badge}</div>`;
                } catch (e) {
                    return formattedDate;
                }
            }
        },
        { header: 'Valor', key: 'Valor', isCurrency: true },
        { header: 'Status', key: 'Status' }
    ];
    
    // Gera o HTML da tabela
    const tableHtml = renderGenericDetailTable(null, data, columns, true);
    
    // Combina Gráfico + Tabela
    dom.invoiceDetailContent.innerHTML = chartHtml + tableHtml;

    // --- RENDERIZA O GRÁFICO (Se aplicável) ---
    if (totalPagos > 0) {
        // Pequeno timeout para garantir que o canvas está no DOM
        setTimeout(() => {
            renderChart(
                'invoicePaymentBehaviorChart',
                'pie',
                ['Adiantado', 'Em dia', 'Atrasado'],
                [{
                    data: [adiantadoCount, emDiaCount, atrasadoCount],
                    backgroundColor: ['#10b981', '#6b7280', '#ef4444'], // Verde, Cinza, Vermelho
                    borderColor: '#ffffff',
                    borderWidth: 2
                }],
                '', // Sem título interno (já tem no HTML)
                {
                    formatterType: 'percent_only', // Mostra porcentagem nas fatias
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            );
        }, 50);
    }
}

function renderInvoiceDetailPagination() {
     renderGenericPagination(
         dom.invoiceDetailPaginationControls,
         dom.invoiceDetailPageInfo,
         dom.invoiceDetailPrevPageBtn,
         dom.invoiceDetailNextPageBtn,
         {
             currentPage: state.getInvoiceDetailCurrentPage(),
             totalRows: state.getInvoiceDetailTotalRows(),
             rowsPerPage: state.INVOICE_DETAIL_ROWS_PER_PAGE
         }
     );
}

// --- Modal Unificado de Detalhes com Abas ---

export function openDetailsModal(contractId, clientName, type) {
    state.setCurrentDetailsContractInfo(contractId, clientName);
    if (dom.detailsModalTitle) dom.detailsModalTitle.textContent = `Detalhes de ${clientName} (Contrato: ${contractId})`;
    if (dom.detailsModal) dom.detailsModal.classList.add('show');

    document.querySelectorAll('#detailsModalTabs .tab-link').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#detailsModalTabContent .tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.innerHTML = ''; 
    });

    let initialTab = 'financeiro';
    if (type === 'complaints') {
        initialTab = 'os';
    } else if (type === 'logins') {
        initialTab = 'logins';
    }

    const initialTabElement = document.querySelector(`#detailsModalTabs .tab-link[data-tab="${initialTab}"]`);
    const initialPaneElement = document.getElementById(`tab-content-${initialTab}`);
    if(initialTabElement && initialPaneElement) {
        initialTabElement.classList.add('active');
        initialPaneElement.classList.add('active');
        fetchAndRenderTabData(initialTab, 1);
    } else {
        console.error(`Aba inicial '${initialTab}' ou seu painel não encontrado.`);
    }
}

export function closeDetailsModal() {
    if (dom.detailsModal) dom.detailsModal.classList.remove('show');
    state.resetDetailsState();
}

export async function fetchAndRenderTabData(tab, page = 1) {
    const tabContent = document.getElementById(`tab-content-${tab}`);
    if (!tabContent) {
        console.error(`Painel de conteúdo para aba '${tab}' não encontrado.`);
        return;
    }

    state.setDetailsState(tab, { currentPage: page });
    const currentTabState = state.getDetailsState()[tab];
    const offset = (page - 1) * currentTabState.rowsPerPage;
    const limit = currentTabState.rowsPerPage;

    tabContent.innerHTML = '<div class="loading-spinner"></div>';

    let url;
    const currentContractId = state.getDetailsState().currentContractId;
    const currentClientName = state.getDetailsState().currentClientName;
    const params = new URLSearchParams({ limit, offset });

    switch (tab) {
        case 'financeiro':
            url = `${state.API_BASE_URL}/api/details/financial/${currentContractId}?${params.toString()}`;
            break;
        case 'os':
            url = `${state.API_BASE_URL}/api/details/complaints/${encodeURIComponent(currentClientName)}?type=os&${params.toString()}`;
            break;
        case 'atendimentos':
             url = `${state.API_BASE_URL}/api/details/complaints/${encodeURIComponent(currentClientName)}?type=atendimentos&${params.toString()}`;
            break;
        case 'logins':
            url = `${state.API_BASE_URL}/api/details/logins/${currentContractId}?${params.toString()}`;
            break;
        case 'comodato':
             url = `${state.API_BASE_URL}/api/details/comodato/${currentContractId}`;
             params.delete('limit');
             params.delete('offset');
             break;
        default:
            console.error(`Tipo de aba desconhecido: ${tab}`);
            tabContent.innerHTML = `<p class="text-red-500">Erro: Tipo de aba desconhecido.</p>`;
            return;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await handleFetchError(response, `Não foi possível carregar dados para ${tab}.`);
            throw new Error(errorMessage);
        }
        const result = await response.json();
        state.setDetailsState(tab, { totalRows: result.total_rows || 0 });
        renderDetailTabContent(tab, result.data || []);
    } catch (error) {
        console.error(`Erro ao buscar dados da aba ${tab}:`, error);
        tabContent.innerHTML = `<p class="text-red-500">${error.message}</p>`;
    }
}

function renderDetailTabContent(tab, data) {
    const tabContent = document.getElementById(`tab-content-${tab}`);
    if (!tabContent) return;

    if (!data || data.length === 0) {
        tabContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum dado encontrado.</p>';
        return;
    }

    let columns = [];
    switch(tab) {
        case 'financeiro':
            columns = [
                { header: 'ID', key: 'ID' }, { header: 'Parcela', key: 'Parcela_R' },
                { header: 'Emissão', key: 'Emissao', isDate: true }, { header: 'Vencimento', key: 'Vencimento', isDate: true },
                { header: 'Pagamento', key: 'Data_pagamento', isDate: true }, { header: 'Valor', key: 'Valor', isCurrency: true }, { header: 'Status', key: 'Status' }
            ]; break;
        case 'os':
            columns = [ { header: 'ID', key: 'ID' }, { header: 'Abertura', key: 'Abertura', isDate: true }, { header: 'Assunto', key: 'Assunto' }, { header: 'Status', key: 'Status' }]; break;
        case 'atendimentos':
            columns = [{ header: 'ID', key: 'ID' }, { header: 'Criação', key: 'Criado_em', isDate: true }, { header: 'Assunto', key: 'Assunto' }, { header: 'Status', key: 'Novo_status' }]; break;
        case 'logins':
            columns = [ { header: 'Login', key: 'Login' }, { header: 'Última Conexão', key: 'ltima_conex_o_inicial', isDate: true }, { header: 'Sinal RX', key: 'Sinal_RX' }, { header: 'ONU/Plano', key: 'ONU_tipo' }, { header: 'IPV4', key: 'IPV4' }, { header: 'Transmissor', key: 'Transmissor' }]; break;
        case 'comodato':
            columns = [{ header: 'Produto', key: 'Descricao_produto' }, { header: 'Status', key: 'Status_comodato' }]; break;
    }

    const tableHtml = renderGenericDetailTable(null, data, columns, true);

    const currentTabState = state.getDetailsState()[tab];
    let paginationHtml = '';
    const totalPages = Math.ceil(currentTabState.totalRows / currentTabState.rowsPerPage);
    if (totalPages > 1 && tab !== 'comodato') {
        paginationHtml = `
            <div class="pagination-controls flex justify-center items-center gap-2 mt-4">
                <button data-tab="${tab}" data-page="${currentTabState.currentPage - 1}" class="prev-page-btn bg-gray-200 px-3 py-1 rounded disabled:opacity-50" ${currentTabState.currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
                <span>Página ${currentTabState.currentPage} de ${totalPages}</span>
                <button data-tab="${tab}" data-page="${currentTabState.currentPage + 1}" class="next-page-btn bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50" ${currentTabState.currentPage >= totalPages ? 'disabled' : ''}>Próxima</button>
            </div>`;
    }

    tabContent.innerHTML = `<div class="table-wrapper border rounded-lg overflow-hidden">${tableHtml}</div>` + paginationHtml;
}

// --- Modal de Detalhes de Cancelamento/Negativação (Histórico) ---

export function openCancellationDetailModal(clientName, contractId, isLink = false) {
     if (isLink) {
        const openModal = document.querySelector('.modal.show');
        if(openModal) openModal.classList.remove('show');
    }
    if (dom.cancellationDetailModalTitle) dom.cancellationDetailModalTitle.textContent = `Histórico de ${clientName} (Contrato: ${contractId})`;
    if (dom.cancellationDetailModal) dom.cancellationDetailModal.classList.add('show');
    fetchAndRenderCancellationDetails(contractId, clientName);
}

export function closeCancellationDetailModal() {
    if (dom.cancellationDetailModal) dom.cancellationDetailModal.classList.remove('show');
}

async function fetchAndRenderCancellationDetails(contractId, clientName) {
    if (dom.cancellationDetailLoading) dom.cancellationDetailLoading.classList.remove('hidden');
    if (dom.cancellationDetailErrorDiv) dom.cancellationDetailErrorDiv.classList.add('hidden');
    if (dom.cancellationDetailContent) dom.cancellationDetailContent.innerHTML = '';

    try {
        const response = await fetch(`${state.API_BASE_URL}/api/details/cancellation_context/${contractId}/${encodeURIComponent(clientName)}`);
        if (!response.ok) {
            const errorMessage = await handleFetchError(response, 'Não foi possível carregar o histórico do cliente.');
            throw new Error(errorMessage);
        }
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

        if(contentHtml === '') {
            contentHtml = '<p class="text-center text-gray-500 p-4">Nenhum histórico de OS, atendimentos ou equipamentos encontrado para este cliente antes do evento.</p>';
        }

        if (dom.cancellationDetailContent) dom.cancellationDetailContent.innerHTML = contentHtml;

    } catch(error) {
        console.error("Erro ao buscar histórico de cancelamento:", error);
        if (dom.cancellationDetailErrorText) dom.cancellationDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.cancellationDetailErrorDiv) dom.cancellationDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.cancellationDetailLoading) dom.cancellationDetailLoading.classList.add('hidden');
    }
}

// --- Modal de Detalhes do Vendedor (Análise Vendedores) ---

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
        seller_id: currentState.currentSellerId,
        type: currentState.currentType,
        year: currentState.currentYear,
        month: currentState.currentMonth,
        limit: currentState.rowsPerPage,
        offset: offset
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


// --- Modal de Detalhes da Cidade (Cancel./Negat. por Cidade) ---

export function openCityDetailModal(city, type, startDate, endDate, relevance) {
    // --- CORREÇÃO: Usa 'currentStartDate' e 'currentEndDate' ---
    state.setCityDetailState({ 
        currentPage: 1, 
        currentCity: city, 
        currentType: type, 
        currentStartDate: startDate, // Antes: currentYear
        currentEndDate: endDate,     // Antes: currentMonth
        totalRows: 0, 
        currentRelevance: relevance 
    });
    
    const typeText = type === 'cancelado' ? 'Cancelados' : 'Negativados';
    const title = `Clientes ${typeText} de ${city}`; // Simplificado o título
    
    if (dom.cityDetailModalTitle) dom.cityDetailModalTitle.textContent = title;
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

    // --- CORREÇÃO: Envia start_date e end_date ---
    const params = new URLSearchParams({
        city: currentState.currentCity,
        type: currentState.currentType,
        start_date: currentState.currentStartDate || '', 
        end_date: currentState.currentEndDate || '',
        limit: currentState.rowsPerPage,
        offset: offset
    });
    if (currentState.currentRelevance) {
        params.append('relevance', currentState.currentRelevance);
    }
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

// --- Modal de Detalhes do Bairro (Cancel./Negat. por Bairro) ---

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
        city: currentState.currentCity,
        neighborhood: currentState.currentNeighborhood,
        type: currentState.currentType,
        year: currentState.currentYear,
        month: currentState.currentMonth,
        limit: currentState.rowsPerPage,
        offset: offset
    });
    if (currentState.currentRelevance) {
        params.append('relevance', currentState.currentRelevance);
    }
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

// --- Modal de Detalhes do Equipamento (Cancelamento) ---

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
        equipment_name: currentState.currentEquipment,
        year: currentState.currentYear,
        month: currentState.currentMonth,
        city: currentState.currentCity,
        limit: currentState.rowsPerPage,
        offset: offset
    });
    if (currentState.currentRelevance) {
        params.append('relevance', currentState.currentRelevance);
    }
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


// --- Modal de Detalhes de Equipamento Ativo (por OLT/Cidade) ---

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
        equipment_name: currentState.currentEquipment,
        city: currentState.currentCity,
        limit: currentState.rowsPerPage,
        offset: offset
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

// --- NOVO MODAL: Detalhes de Ativação do Vendedor ---

export function openSellerActivationDetailModal(sellerId, sellerName, type, city, year, month) {
    state.setSellerActivationDetailState({
        currentPage: 1,
        currentSellerId: sellerId,
        currentSellerName: sellerName,
        currentType: type,
        currentCity: city,
        currentYear: year,
        currentMonth: month,
        totalRows: 0
    });

    let typeText = 'Clientes Ativados';
    if (type === 'ativo_permanece') {
        typeText = 'Clientes que Permanecem Ativos';
    } else if (type === 'cancelado') {
        typeText = 'Clientes Cancelados';
    } else if (type === 'negativado') {
        typeText = 'Clientes Negativados';
    }
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
        seller_id: currentState.currentSellerId,
        type: currentState.currentType,
        city: currentState.currentCity,
        year: currentState.currentYear,
        month: currentState.currentMonth,
        limit: currentState.rowsPerPage,
        offset: offset
    });
    const url = `${state.API_BASE_URL}/api/details/seller_activations?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await handleFetchError(response, 'Não foi possível carregar os detalhes de ativação do vendedor.'));

        const result = await response.json();
        state.setSellerActivationDetailState({ totalRows: result.total_rows });

        if (!result.data || result.data.length === 0) {
            if (dom.sellerActivationDetailContent) dom.sellerActivationDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado para este filtro.</p>';
            return;
        }

        const columns = [
            { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
            { header: 'Contrato ID', key: 'Contrato_ID' },
            { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
            { header: 'Status Contrato', key: 'Status_contrato' },
            { header: 'Data Final (Churn)', key: 'end_date', isDate: true },
            { header: 'Permanência (Meses)', key: 'permanencia_meses' }
        ];

        if (dom.sellerActivationDetailContent) dom.sellerActivationDetailContent.innerHTML = renderGenericDetailTable(null, result.data, columns, true);
        
        renderGenericPagination(
            dom.sellerActivationDetailPaginationControls, 
            dom.sellerActivationDetailPageInfo, 
            dom.sellerActivationDetailPrevPageBtn, 
            dom.sellerActivationDetailNextPageBtn, 
            currentState 
        );

    } catch (error) {
        console.error("Erro ao buscar detalhes de ativação do vendedor:", error);
        if (dom.sellerActivationDetailErrorText) dom.sellerActivationDetailErrorText.textContent = `Erro: ${error.message}.`;
        if (dom.sellerActivationDetailErrorDiv) dom.sellerActivationDetailErrorDiv.classList.remove('hidden');
    } finally {
        if (dom.sellerActivationDetailLoading) dom.sellerActivationDetailLoading.classList.add('hidden');
    }
}