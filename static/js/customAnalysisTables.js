import * as state from './state.js';
import * as dom from './dom.js';
import * as utils from './utils.js';

// --- Lógica para Análises Personalizadas (Tabelas) ---

/**
 * Busca os status de contrato e acesso para preencher os filtros da análise de Saúde Financeira.
 */
export async function populateContractStatusFilters() {
    try {
        const response = await fetch(`${state.API_BASE_URL}/api/filters/contract_statuses`);
        if (!response.ok) {
            const errorMsg = await utils.handleFetchError(response, 'Falha ao buscar status.');
            throw new Error(errorMsg);
        }
        const data = await response.json();

        if (dom.contractStatusFilter && data.status_contrato) {
            dom.contractStatusFilter.innerHTML = '<option value="">Todos</option>';
            data.status_contrato.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                dom.contractStatusFilter.appendChild(option);
            });
        }

        if (dom.accessStatusContainer && data.status_acesso) {
            dom.accessStatusContainer.innerHTML = '';

            data.status_acesso.forEach(status => {
                const wrapper = document.createElement('div');
                wrapper.className = 'flex items-center mb-1 hover:bg-gray-50 p-1 rounded';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = status;
                checkbox.className = 'mr-2 form-checkbox h-4 w-4 text-purple-600 transition duration-150 ease-in-out cursor-pointer';
                const uniqueId = `chk_access_${status.replace(/\s+/g, '_')}`;
                checkbox.id = uniqueId;

                const label = document.createElement('label');
                label.textContent = status;
                label.htmlFor = uniqueId;
                label.className = 'text-gray-700 cursor-pointer select-none w-full text-xs';

                wrapper.appendChild(checkbox);
                wrapper.appendChild(label);
                dom.accessStatusContainer.appendChild(wrapper);
            });
        }
    } catch (error) {
        console.error("Erro ao popular filtros de status:", error);
    }
}

/**
 * Renderiza uma tabela de dados personalizada no painel principal, incluindo paginação.
 */
function renderCustomTable(result, title, columns) {
    const { data, total_rows } = result;
    state.setCustomAnalysisState({ totalRows: total_rows });

    const currentState = state.getCustomAnalysisState();

    if (!dom.dashboardContentDiv) {
        console.error("renderCustomTable: dashboardContentDiv não encontrado.");
        return;
    }

    const titleHtml = `<h2 class="text-2xl font-semibold mb-4 text-gray-800">${title}</h2>`;

    let tableHtml = '<p class="text-center text-gray-500 mt-4">Nenhum resultado encontrado.</p>';
    if (data && data.length > 0) {
        const generatedTableHtml = utils.renderGenericDetailTable(null, data, columns, true);
        tableHtml = `<div class="table-wrapper border rounded-lg shadow-sm bg-white">${generatedTableHtml}</div>`;
    }

    let paginationHtml = '';
    const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);
    if (totalPages > 1) {
        paginationHtml = `
            <div id="custom-analysis-pagination-controls" class="pagination-controls flex justify-center items-center gap-4 mt-8">
                <button id="customPrevPageBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed">Página Anterior</button>
                <span id="customPageInfo" class="text-gray-700 font-medium"></span>
                <button id="customNextPageBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Próxima Página</button>
            </div>
        `;
    }

    dom.dashboardContentDiv.innerHTML = titleHtml + tableHtml + paginationHtml;

    if (totalPages > 1) {
        renderCustomAnalysisPagination();
    }
}

/**
 * Atualiza os textos e estados (disabled) dos controles de paginação.
 */
function renderCustomAnalysisPagination() {
    const currentState = state.getCustomAnalysisState();
    const totalPages = Math.ceil(currentState.totalRows / currentState.rowsPerPage);

    const pageInfo = document.getElementById('customPageInfo');
    const prevBtn = document.getElementById('customPrevPageBtn');
    const nextBtn = document.getElementById('customNextPageBtn');
    const paginationControls = document.getElementById('custom-analysis-pagination-controls');

    if (paginationControls) {
        if (totalPages > 1 && currentState.totalRows > 0) {
            if(pageInfo) pageInfo.textContent = `Página ${currentState.currentPage} de ${totalPages}`;
            if(prevBtn) prevBtn.disabled = currentState.currentPage <= 1;
            if(nextBtn) nextBtn.disabled = currentState.currentPage >= totalPages;
            paginationControls.classList.remove('hidden');
        } else {
            paginationControls.classList.add('hidden');
        }
    }
}


// --- FUNÇÕES DE FETCH ---

export async function fetchAndRenderLatePaymentsAnalysis(searchTerm = '', page = 1) {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'atrasos_e_nao_pagos', currentSearchTerm: searchTerm });
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;
    const url = `${state.API_BASE_URL}/api/custom_analysis/contas_a_receber?search_term=${encodeURIComponent(searchTerm)}&limit=${currentState.rowsPerPage}&offset=${offset}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de atrasos.');
            throw new Error(errorMessage);
        }
        const result = await response.json();
        renderCustomTable(result, 'Análise de Atrasos e Faturas Não Pagas', [
            { header: 'Cliente', render: r => `<span title="${r.Cliente}">${r.Cliente}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
            { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas }
        ]);
    } catch (error) {
        utils.showError(error.message);
    } finally {
        utils.showLoading(false);
    }
}

export async function fetchAndRenderFinancialHealthAnalysis(searchTerm = '', analysisType = 'atraso', page = 1, relevance = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'saude_financeira', currentSearchTerm: searchTerm, currentAnalysisType: analysisType }); 
    
    const currentState = state.getCustomAnalysisState(); 
    const contractStatus = dom.contractStatusFilter?.value || '';
    
    let accessStatus = '';
    if (dom.accessStatusContainer && dom.accessStatusContainer.querySelector('input[type="checkbox"]')) {
         const checked = dom.accessStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
         accessStatus = Array.from(checked).map(cb => cb.value).join(',');
    } else if (dom.accessStatusContainer && dom.accessStatusContainer.tagName === 'SELECT') {
         accessStatus = dom.accessStatusContainer.value;
    }

    const offset = (page - 1) * currentState.rowsPerPage;
    const endpoint = analysisType === 'bloqueio' ? 'financial_health_auto_block' : 'financial_health';

    const params = new URLSearchParams({ search_term: searchTerm, limit: currentState.rowsPerPage, offset: offset });
    
    if (contractStatus) params.append('status_contrato', contractStatus);
    if (accessStatus) params.append('status_acesso', accessStatus); 
    if (relevance) params.append('relevance', relevance);

    const url = `${state.API_BASE_URL}/api/custom_analysis/${endpoint}?${params.toString()}`;
    const title = analysisType === 'bloqueio' ? 'Análise de Saúde Financeira (Bloqueio Automático > 20 dias)' : 'Análise de Saúde Financeira (Atraso > 10 dias)';

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de saúde financeira.');
            throw new Error(errorMessage);
        }
        const result = await response.json();
        renderCustomTable(result, title, [
            { header: 'Cliente', render: r => `<span title="${r.Razao_Social}">${r.Razao_Social}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Status Contrato', key: 'Status_contrato' },
            { header: 'Status Acesso', key: 'Status_acesso' },
            { header: '1ª Inadimplência', render: r => r.Primeira_Inadimplencia_Vencimento ? `<span class="detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="financial" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${utils.formatDate(r.Primeira_Inadimplencia_Vencimento)}</span>` : 'N/A' },
            { header: 'Tem Reclamações?', render: r => r.Possui_Reclamacoes === 'Sim' ? `<span class="detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="complaints" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">Sim</span>` : 'Não' },
            { header: 'Última Conexão', render: r => r.Ultima_Conexao ? `<span class="detail-trigger cursor-pointer text-blue-600 hover:underline" data-type="logins" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${utils.formatDate(r.Ultima_Conexao)}</span>` : 'N/A' }
        ]);

        // --- ATUALIZAÇÃO: GARANTIR VISIBILIDADE DO BOTÃO VER TABELA ---
        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.remove('hidden');
            dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
        }

    } catch (error) {
        utils.showError(error.message);
    } finally {
        utils.showLoading(false);
    }
}

export async function fetchAndRenderCancellationAnalysis(searchTerm = '', page = 1, relevance = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'cancellations', currentSearchTerm: searchTerm });
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;

    const params = new URLSearchParams({
        search_term: searchTerm,
        limit: currentState.rowsPerPage,
        offset: offset
    });
    if (relevance) params.append('relevance', relevance);
    
    const url = `${state.API_BASE_URL}/api/custom_analysis/cancellations?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de cancelamentos.');
            throw new Error(errorMessage);
        }
        const result = await response.json();
        
        const columns = [
            { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Permanência (Meses)', key: 'permanencia_meses', cssClass: 'text-center' },
            { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
        ];
        renderCustomTable(result, 'Análise de Cancelamentos por Contato Técnico', columns);

        // --- ATUALIZAÇÃO: GARANTIR VISIBILIDADE DO BOTÃO VER TABELA ---
        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.remove('hidden');
            dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
        }
        
        // --- ATUALIZAÇÃO: GARANTIR QUE O FILTRO DE RELEVÂNCIA (PERMANÊNCIA) ESTÁ VISÍVEL ---
        if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
        if (dom.relevanceFilterSearch) dom.relevanceFilterSearch.value = relevance || '';

    } catch (error) {
        utils.showError(error.message);
    } finally {
        utils.showLoading(false);
    }
}

export async function fetchAndRenderNegativacaoAnalysis(searchTerm = '', page = 1, relevance = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentPage: page, currentAnalysis: 'negativacao', currentSearchTerm: searchTerm });
    const currentState = state.getCustomAnalysisState();
    const offset = (page - 1) * currentState.rowsPerPage;
    
    const params = new URLSearchParams({
        search_term: searchTerm,
        limit: currentState.rowsPerPage,
        offset: offset
    });
    if (relevance) params.append('relevance', relevance);
    
    const url = `${state.API_BASE_URL}/api/custom_analysis/negativacao?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de negativação.');
            throw new Error(errorMessage);
        }
        const result = await response.json();

        const columns = [
            { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>` },
            { header: 'ID Contrato', key: 'Contrato_ID' },
            { header: 'Permanência (Meses)', key: 'permanencia_meses', cssClass: 'text-center' },
            { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
        ];
        renderCustomTable(result, 'Análise de Negativação por Contato Técnico', columns);

        // --- ATUALIZAÇÃO: GARANTIR VISIBILIDADE DO BOTÃO VER TABELA ---
        if (dom.viewTableBtn) {
            dom.viewTableBtn.classList.remove('hidden');
            dom.viewTableBtn.textContent = 'Ver Tabela Completa (Paginação)';
        }

        // --- ATUALIZAÇÃO: GARANTIR QUE O FILTRO DE RELEVÂNCIA (PERMANÊNCIA) ESTÁ VISÍVEL ---
        if (dom.customSearchFilterDiv) dom.customSearchFilterDiv.classList.remove('hidden');
        if (dom.relevanceFilterSearch) dom.relevanceFilterSearch.value = relevance || '';

    } catch (error) {
        utils.showError(error.message);
    } finally {
        utils.showLoading(false);
    }
} 

/**
 * Busca e renderiza o Comparativo Diário.
 */
export async function fetchAndRenderDailyComparison() {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'comparativo_diario', currentPage: 1 });

    const url = `${state.API_BASE_URL}/api/comparison/daily`;

    try {
        const response = await fetch(url); 
        if (!response.ok) throw new Error("Falha ao buscar dados comparativos.");
        
        const result = await response.json();
        const data = result.liquido; 
        const info = result.info;

        if (!dom.dashboardContentDiv) return;

        const uploadHtml = `
            <div class="upload-pdf-container">
                <h3 class="text-lg font-semibold text-gray-700 mb-2">Importar Dados do PDF</h3>
                <p class="text-sm text-gray-500 mb-4">Selecione o arquivo PDF com os dados de recebimento para atualizar o mês atual.</p>
                <input type="file" id="pdfUploadInput" accept=".pdf" class="hidden">
                <button onclick="document.getElementById('pdfUploadInput').click()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
                    📁 Selecionar Arquivo PDF
                </button>
                <span id="uploadStatus" class="ml-3 text-sm font-medium"></span>
            </div>
        `;

        const legendHtml = `
            <div class="comparison-legend">
                <div class="legend-item"><div class="legend-box" style="background-color: #fef3c7;"></div> Fim de Semana</div>
                <div class="legend-item"><div class="legend-box" style="background-color: #d1fae5;"></div> Feriado</div>
                <div class="legend-item"><div class="legend-box" style="background-color: #dbeafe; border: 1px solid #3b82f6;"></div> Dia Atual</div>
                <div class="legend-item"><div class="legend-box" style="background-color: #1e3a8a;"></div> Total</div>
            </div>
        `;

        const createTableHtml = (title, typeKeyPrefix) => {
            let rowsHtml = '';
            let totalPrev = 0, totalCurr = 0, totalDiff = 0;

            data.forEach(day => {
                const prev = day[`${typeKeyPrefix}_prev`] || 0;
                const curr = day[`${typeKeyPrefix}_curr`] || 0;
                const diff = day[`${typeKeyPrefix}_diff`] || 0;

                totalPrev += prev;
                totalCurr += curr;
                totalDiff += diff;

                let rowClass = '';
                if (day.is_today) rowClass = 'row-today';
                else if (day.is_holiday) rowClass = 'row-holiday';
                else if (day.is_weekend) rowClass = 'row-weekend';

                const diffClass = diff < 0 ? 'text-neg' : 'text-pos';

                rowsHtml += `
                    <tr class="${rowClass}">
                        <td>${day.day}</td>
                        <td>${utils.formatCurrency(prev)}</td>
                        <td>${utils.formatCurrency(curr)}</td>
                        <td class="${diffClass}">${utils.formatCurrency(diff)}</td>
                    </tr>
                `;
            });

            const footerHtml = `
                <tr class="row-total">
                    <td>Total</td>
                    <td>${utils.formatCurrency(totalPrev)}</td>
                    <td>${utils.formatCurrency(totalCurr)}</td>
                    <td>${utils.formatCurrency(totalDiff)}</td>
                </tr>
            `;

            return `
                <div class="comparison-table-wrapper">
                    <div class="comparison-header">${title}</div>
                    <table class="comparison-table">
                        <thead>
                            <tr>
                                <th>Dia</th>
                                <th>Anterior (${info.prev_label})</th>
                                <th>Atual (${info.curr_label})</th>
                                <th>Diferença</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                        <tfoot>${footerHtml}</tfoot>
                    </table>
                </div>
            `;
        };

        const table1 = createTableHtml("Recebimento Líquido Diário Mês", "liq");
        const table2 = createTableHtml("Recebimento Baixa Diária Mês", "bai");

        dom.dashboardContentDiv.innerHTML = `
            ${uploadHtml}
            ${legendHtml}
            <div class="comparison-container">
                ${table1}
                ${table2}
            </div>
        `;

        const uploadInput = document.getElementById('pdfUploadInput');
        const statusSpan = document.getElementById('uploadStatus');
        
        if (uploadInput) {
            uploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                statusSpan.textContent = "Enviando...";
                statusSpan.className = "ml-3 text-sm font-medium text-blue-600";

                try {
                    const res = await fetch(`${state.API_BASE_URL}/api/comparison/upload_pdf`, {
                        method: 'POST',
                        body: formData
                    });
                    const json = await res.json();
                    
                    if (res.ok) {
                        statusSpan.textContent = "Sucesso! Atualizando...";
                        statusSpan.className = "ml-3 text-sm font-medium text-green-600";
                        setTimeout(() => fetchAndRenderDailyComparison(), 1000); 
                    } else {
                        throw new Error(json.error || "Erro no upload");
                    }
                } catch (err) {
                    statusSpan.textContent = "Erro: " + err.message;
                    statusSpan.className = "ml-3 text-sm font-medium text-red-600";
                }
            });
        }

    } catch (error) {
        utils.showError(error.message);
    } finally {
        utils.showLoading(false);
    }
}