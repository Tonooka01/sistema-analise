import * as dom from './dom.js';
import * as state from './state.js'; // Importa state para resetAllFilters

// --- Funções de Formatação ---

/**
 * Formata uma string de data (ex: 'YYYY-MM-DD HH:MM:SS') para o formato brasileiro (DD/MM/YYYY).
 * @param {string} dateString - A data a ser formatada.
 * @returns {string} A data formatada ou 'N/A' se a entrada for inválida.
 */
export function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
        // Tenta extrair a data, ignorando a hora se existir
        const datePart = dateString.split(' ')[0];
        const date = new Date(datePart);

        // Verifica se a data é válida
        if (isNaN(date.getTime())) {
             // Tenta formato DD/MM/YYYY se o formato ISO falhar
             const parts = datePart.split('/');
             if (parts.length === 3) {
                 const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                 const dateFromSlash = new Date(isoDate);
                 if (!isNaN(dateFromSlash.getTime())) {
                     // Adiciona 3 horas para compensar UTC presumido para a data local
                     dateFromSlash.setUTCHours(dateFromSlash.getUTCHours() + 3);
                     return dateFromSlash.toLocaleDateString('pt-BR');
                 }
             }
             return dateString; // Retorna a string original se inválida
         }

        // Se for válida, formata para pt-BR
        date.setUTCHours(date.getUTCHours() + 3);
        return date.toLocaleDateString('pt-BR');

    } catch (e) {
        console.error(`Erro ao formatar data "${dateString}":`, e);
        return dateString; // Retorna original em caso de erro
    }
}

/**
 * Formata um número para moeda BRL.
 * @param {number} value - O valor a ser formatado.
 * @returns {string} O valor formatado como moeda (R$ ...).
 */
export function formatCurrency(value) {
    if (value === undefined || value === null) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// --- Funções de Feedback Visual (Loading/Erro) ---

/**
 * Exibe ou oculta os indicadores de carregamento e erro no painel principal.
 */
export function showLoading(show) {
    if (dom.dashboardContentDiv) {
        dom.dashboardContentDiv.classList.toggle('hidden', show);
        if (dom.mainChartsArea) { // Esconde a área de gráficos também
            dom.mainChartsArea.classList.toggle('hidden', show);
        }
    }
    if (dom.chartLoadingDiv) {
        dom.chartLoadingDiv.classList.toggle('hidden', !show);
    }
    if (dom.chartErrorMsgDiv) {
        dom.chartErrorMsgDiv.classList.add('hidden'); // Sempre esconde erro ao (re)iniciar loading
    }
}

/**
 * Exibe uma mensagem de erro no painel principal.
 */
export function showError(message) {
    if (dom.chartLoadingDiv) dom.chartLoadingDiv.classList.add('hidden');
    if (dom.dashboardContentDiv) dom.dashboardContentDiv.classList.add('hidden');
    if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');

    if (dom.chartErrorTextSpan) dom.chartErrorTextSpan.textContent = message;
    if (dom.chartErrorMsgDiv) dom.chartErrorMsgDiv.classList.remove('hidden');

     console.error("Erro exibido no painel:", message);
}

/**
 * Tenta extrair uma mensagem de erro detalhada de uma resposta de fetch.
 */
export async function handleFetchError(response, defaultMessage) {
    let errorMessage = defaultMessage;
    try {
        const errorData = await response.json();
        if (errorData && (errorData.error || errorData.message)) {
            errorMessage = errorData.error || errorData.message;
        } else {
            errorMessage = `Erro HTTP: ${response.status} - ${response.statusText}`;
        }
    } catch (e) {
        errorMessage = `Erro HTTP: ${response.status} - ${response.statusText}`;
    }
    return errorMessage;
}


// --- Funções de Manipulação de Controles (Botões, Selects) ---

export function setActiveControl(element) {
    if (dom.collectionSelectorButtons) {
        dom.collectionSelectorButtons.forEach(btn => btn.classList.remove('active'));
    }
    if (dom.customAnalysisSelector) {
        dom.customAnalysisSelector.classList.remove('active');
    }

    if (element) {
        element.classList.add('active');
    }
}

export function getSelectedChartType(radioName, defaultType) {
    const radio = document.querySelector(`input[name="${radioName}"]:checked`);
    return radio ? radio.value : defaultType;
}

// --- Funções de Preenchimento de Filtros (<select>) ---

export function populateYearFilter(selectElement, years, selectedYear = '') {
    if (!selectElement) return;
    const currentVal = selectElement.value;
    selectElement.innerHTML = '<option value="">Todos os Anos</option>';
    if (years && Array.isArray(years) && years.length > 0) {
        const sortedYears = [...years].sort((a, b) => b - a);
        sortedYears.forEach(y => {
            if (y) {
                const option = document.createElement('option');
                option.value = y;
                option.textContent = y;
                selectElement.appendChild(option);
            }
        });
    }
    selectElement.value = selectedYear || currentVal || '';
}

export function populateCityFilter(selectElement, cities, selectedCity = '') {
    if (!selectElement) return;
    const currentVal = selectElement.value;
    const placeholderText = selectElement.options[0] ? selectElement.options[0].text : 'Selecione...';

    selectElement.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = placeholderText;
    selectElement.appendChild(defaultOption);

    if (cities && Array.isArray(cities) && cities.length > 0) {
        const sortedCities = [...cities].sort((a, b) => a.localeCompare(b));
        sortedCities.forEach(c => {
            if (c && typeof c === 'string' && c.trim() !== '') {
                const option = document.createElement('option');
                option.value = c;
                option.textContent = c;
                selectElement.appendChild(option);
            }
        });
    }
    selectElement.value = selectedCity || currentVal || '';
}

// --- Funções de Reset e Ocultação de Filtros ---

export function resetAllFilters() {
    // Reseta inputs do DOM
    if (dom.clientSearchInput) dom.clientSearchInput.value = '';
    if (dom.contractStatusFilter) dom.contractStatusFilter.value = '';
    if (dom.accessStatusFilter) dom.accessStatusFilter.value = '';
    if (dom.yearFilterSelect) dom.yearFilterSelect.value = '';
    if (dom.monthFilterSelect) dom.monthFilterSelect.value = '';
    if (dom.cityFilterSelect) dom.cityFilterSelect.value = '';
    if (dom.sellerYearFilter) dom.sellerYearFilter.value = '';
    if (dom.sellerMonthFilter) dom.sellerMonthFilter.value = '';
    if (dom.cityCancellationYearFilter) dom.cityCancellationYearFilter.value = '';
    if (dom.cityCancellationMonthFilter) dom.cityCancellationMonthFilter.value = '';
    if (dom.neighborhoodAnalysisCityFilter) dom.neighborhoodAnalysisCityFilter.value = '';
    if (dom.neighborhoodAnalysisYearFilter) dom.neighborhoodAnalysisYearFilter.value = '';
    if (dom.neighborhoodAnalysisMonthFilter) dom.neighborhoodAnalysisMonthFilter.value = '';
    if (dom.equipmentAnalysisYearFilter) dom.equipmentAnalysisYearFilter.value = '';
    if (dom.equipmentAnalysisMonthFilter) dom.equipmentAnalysisMonthFilter.value = '';
    if (dom.equipmentAnalysisCityFilter) dom.equipmentAnalysisCityFilter.value = '';
    if (dom.dailyEvolutionStartDate) dom.dailyEvolutionStartDate.value = '';
    if (dom.dailyEvolutionEndDate) dom.dailyEvolutionEndDate.value = '';
    if (dom.faturamentoStartDate) dom.faturamentoStartDate.value = '';
    if (dom.faturamentoEndDate) dom.faturamentoEndDate.value = '';
    if (dom.faturamentoCityFilter) dom.faturamentoCityFilter.value = '';
    if (dom.activationSellerCityFilter) dom.activationSellerCityFilter.value = '';
    if (dom.activationSellerYearFilter) dom.activationSellerYearFilter.value = '';
    if (dom.activationSellerMonthFilter) dom.activationSellerMonthFilter.value = '';
    if (dom.cohortCityFilter) dom.cohortCityFilter.value = '';
    if (dom.cohortYearFilter) dom.cohortYearFilter.value = '';
    if (dom.cohortMonthFilter) dom.cohortMonthFilter.value = '';
    if (dom.relevanceFilterSearch) dom.relevanceFilterSearch.value = '';
    if (dom.relevanceFilterCity) dom.relevanceFilterCity.value = '';
    if (dom.relevanceFilterNeighborhood) dom.relevanceFilterNeighborhood.value = '';
    if (dom.relevanceFilterEquipment) dom.relevanceFilterEquipment.value = '';
    if (dom.latePaymentYearFilter) dom.latePaymentYearFilter.value = '';
    if (dom.latePaymentMonthFilter) dom.latePaymentMonthFilter.value = '';

    // Reseta estados
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
    dom.customSearchFilterDiv?.classList.add('hidden');
    dom.financialHealthFiltersDiv?.classList.add('hidden');
    dom.sellerAnalysisFiltersDiv?.classList.add('hidden');
    dom.financialFiltersDiv?.classList.add('hidden'); 
    dom.cityCancellationFiltersDiv?.classList.add('hidden');
    dom.neighborhoodAnalysisFiltersDiv?.classList.add('hidden');
    dom.equipmentAnalysisFiltersDiv?.classList.add('hidden');
    dom.dailyEvolutionFiltersDiv?.classList.add('hidden');
    dom.behaviorAnalysisContainer?.classList.add('hidden'); 
    dom.faturamentoCidadeFiltersDiv?.classList.add('hidden'); 
    dom.activationSellerFiltersDiv?.classList.add('hidden');
    dom.cohortAnalysisFiltersDiv?.classList.add('hidden');
    dom.latePaymentFiltersDiv?.classList.add('hidden');
}

// --- Funções de Renderização Genéricas (Cards, Tabelas, Paginação) ---

export function renderSummaryCards(targetElement, cardsData) {
    if (!targetElement) return;
    if (!cardsData || !Array.isArray(cardsData) || cardsData.length === 0) {
        targetElement.innerHTML = ''; 
        return;
    }
    const cardsHtml = cardsData.map(card => {
        let displayValue = card.value;
        if (typeof card.value === 'number' && card.formatAsCurrency) {
            displayValue = new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(card.value);
        } else if (card.value === undefined || card.value === null) {
            displayValue = 'N/A';
        }

        return `
            <div class="summary-card ${card.colorClass || 'bg-gray-100'}">
                <h3 class="summary-card-title">${card.title || 'Título'}</h3>
                <p class="summary-card-value">${displayValue}</p> 
            </div>
        `;
    }).join('');

    const container = document.createElement('div');
    container.className = 'summary-cards-container';
    container.innerHTML = cardsHtml;

    targetElement.innerHTML = '';
    targetElement.appendChild(container);
}

/**
 * Renderiza uma tabela HTML genérica dentro de um elemento.
 * USA O TOOLTIP NATIVO DO NAVEGADOR (atributo 'title').
 */
export function renderGenericDetailTable(contentElement, data, columns, returnHtml = false) {
    if (!data || !Array.isArray(data)) {
        const emptyHtml = '<p class="text-center text-gray-500 p-4">Dados inválidos ou vazios.</p>';
        if (returnHtml) return emptyHtml;
        if (contentElement) contentElement.innerHTML = emptyHtml;
        return;
    }
     if (!columns || !Array.isArray(columns) || columns.length === 0) {
         const errorHtml = '<p class="text-center text-red-500 p-4">Erro: Configuração de colunas ausente.</p>';
         if (returnHtml) return errorHtml;
         if (contentElement) contentElement.innerHTML = errorHtml;
         return;
     }

    const tableHtml = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead>
                <tr>
                    ${columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${c.cssClass || ''}">${c.header || ''}</th>`).join('')}
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${data.length === 0 ? `<tr><td colspan="${columns.length}" class="text-center py-4 text-gray-500">Nenhum dado encontrado.</td></tr>` : data.map(row => `
                    <tr class="hover:bg-gray-50">
                        ${columns.map(c => {
                            let value = 'N/A';
                            let tooltipText = ''; // Texto para o tooltip nativo
                            try {
                                if (c.render && typeof c.render === 'function') {
                                    value = c.render(row) ?? 'N/A'; 
                                    
                                    // Se renderizou HTML, tenta extrair o texto puro ou usar a chave
                                    if (c.key && row.hasOwnProperty(c.key)) {
                                         tooltipText = String(row[c.key]);
                                    } else {
                                         const tempDiv = document.createElement('div');
                                         tempDiv.innerHTML = value;
                                         tooltipText = tempDiv.textContent || tempDiv.innerText || '';
                                    }

                                } else if (c.key && row.hasOwnProperty(c.key)) {
                                    value = row[c.key] ?? 'N/A';
                                    tooltipText = String(value); // Tooltip recebe o valor original
                                    
                                    if (c.isDate) {
                                        value = formatDate(value);
                                    } else if (c.isCurrency) {
                                        value = new Intl.NumberFormat('pt-BR', { 
                                            style: 'currency', 
                                            currency: 'BRL',
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2 
                                        }).format(Number(value) || 0);
                                    } else if ((c.key === 'permanencia_dias' || c.key === 'Average_Resolution_Days' || c.key === 'Average_Service_Days') && typeof value === 'number') {
                                        value = value.toFixed(1); 
                                    }
                                }
                            } catch (e) {
                                console.error(`Erro ao renderizar coluna ${c.header || c.key}:`, e, "Linha:", row);
                                value = 'Erro';
                            }
                            
                            const displayValue = (value === null || value === undefined || value === '') ? 'N/A' : String(value);
                            if (tooltipText === 'N/A' || tooltipText === '') tooltipText = null;

                            // --- USANDO APENAS O ATRIBUTO 'TITLE' (TOOLTIP NATIVO) ---
                            return `<td class="py-2 px-3 text-sm text-gray-800 ${c.cssClass || ''}" ${tooltipText ? `title="${tooltipText.replace(/"/g, '&quot;')}"` : ''}>${displayValue}</td>`;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    if (returnHtml) {
        return tableHtml;
    }

    if (contentElement) {
        contentElement.innerHTML = tableHtml;
    }
}


export function renderGenericPagination(paginationEl, pageInfoEl, prevBtnEl, nextBtnEl, state) {
    if (!paginationEl || !pageInfoEl || !prevBtnEl || !nextBtnEl || !state) {
        if(paginationEl) paginationEl.classList.add('hidden');
        return;
    }

    const totalPages = Math.ceil(state.totalRows / state.rowsPerPage);

    if (totalPages > 1 && state.totalRows > 0) {
        pageInfoEl.textContent = `Página ${state.currentPage} de ${totalPages}`;
        prevBtnEl.disabled = state.currentPage <= 1;
        nextBtnEl.disabled = state.currentPage >= totalPages;
        paginationEl.classList.remove('hidden'); 
    } else {
        paginationEl.classList.add('hidden');
        pageInfoEl.textContent = '';
        prevBtnEl.disabled = true;
        nextBtnEl.disabled = true;
    }
}

export function createGenericPaginationHtml(buttonClass, state) {
    if (!state || state.totalRows === undefined || state.currentPage === undefined || state.rowsPerPage === undefined) {
        console.error("createGenericPaginationHtml: Estado inválido fornecido.");
        return ''; 
    }

    const totalPages = Math.ceil(state.totalRows / state.rowsPerPage);

    if (totalPages <= 1) {
        return ''; 
    }

    return `
        <div class="pagination-controls flex justify-center items-center gap-4 mt-8">
            <button class="${buttonClass} bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed" data-page="${state.currentPage - 1}" ${state.currentPage <= 1 ? 'disabled' : ''}>
                Anterior
            </button>
            <span class="text-gray-700 font-medium">Página ${state.currentPage} de ${totalPages}</span>
            <button class="${buttonClass} bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed" data-page="${state.currentPage + 1}" ${state.currentPage >= totalPages ? 'disabled' : ''}>
                Próxima
            </button>
        </div>
    `;
}

// --- NOVA FUNÇÃO: EXPORTAR TABELA PARA CSV ---
export function exportTableToCSV(tableId, filename = 'exportacao.csv') {
    const table = document.getElementById(tableId);
    if (!table) {
        showError("Tabela não encontrada para exportação.");
        return;
    }

    const rows = table.querySelectorAll("tr");
    let csvContent = "";

    rows.forEach(row => {
        const cols = row.querySelectorAll("th, td");
        const rowData = [];
        
        cols.forEach(col => {
            // Limpa quebras de linha e aspas duplas do texto
            let data = col.innerText.replace(/(\r\n|\n|\r)/gm, " ").replace(/"/g, '""');
            // Envolve em aspas duplas para garantir formato CSV correto
            rowData.push(`"${data}"`);
        });

        csvContent += rowData.join(";") + "\r\n"; // Ponto e vírgula é melhor para Excel em PT-BR
    });

    // Cria o blob e o link de download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}