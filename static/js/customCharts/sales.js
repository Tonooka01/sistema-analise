import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';

/**
 * Busca e renderiza a análise de "Vendedores" (Churn) com cards e tabela.
 */
export async function fetchAndRenderSellerAnalysis(startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'vendedores', currentPage: 1 });
    
    const url = `${state.API_BASE_URL}/api/custom_analysis/sellers?start_date=${startDate}&end_date=${endDate}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(await utils.handleFetchError(response, 'Erro ao carregar vendedores.'));
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'vendedores') return;

        if (dom.sellerStartDate) dom.sellerStartDate.value = startDate;
        if (dom.sellerEndDate) dom.sellerEndDate.value = endDate;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = ''; // Limpa o dashboard
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden'); // Esconde área de gráficos

        utils.renderSummaryCards(dom.dashboardContentDiv, [
            { title: 'Total de Clientes Cancelados', value: result.total_cancelados || 0, colorClass: 'bg-red-50' },
            { title: 'Total de Clientes Negativados', value: result.total_negativados || 0, colorClass: 'bg-orange-50' },
            { title: 'Soma Total (Churn)', value: result.grand_total || 0, colorClass: 'bg-gray-100' }
        ]);

        const tableData = result.data;
        if (!tableData || tableData.length === 0) {
            const msg = document.createElement('p');
            msg.className = "text-center text-gray-500 mt-4";
            msg.textContent = "Nenhum resultado encontrado.";
            dom.dashboardContentDiv.appendChild(msg);
            return;
        }

        const columns = [
            { header: 'Vendedor', render: r => `<div class="font-medium text-gray-900">${r.Vendedor_Nome || 'Não Identificado'}</div>` },
            { header: 'Cancelados', render: r => r.Cancelados_Count > 0 ? `<span class="seller-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="cancelado">${r.Cancelados_Count}</span>` : '0', cssClass: 'text-center' },
            { header: '% Canc.', render: r => r.Total > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Cancelados_Count / r.Total) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Negativados', render: r => r.Negativados_Count > 0 ? `<span class="seller-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="negativado">${r.Negativados_Count}</span>` : '0', cssClass: 'text-center' },
            { header: '% Neg.', render: r => r.Total > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Negativados_Count / r.Total) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Total Churn', key: 'Total', cssClass: 'text-center font-bold text-gray-800 bg-gray-100' }
        ];

        const tableHtml = utils.renderGenericDetailTable(null, tableData, columns, true);
        
        // --- USO SEGURO DO DOM (APPEND AO INVÉS DE +=) ---
        const tableContainer = document.createElement('div');
        tableContainer.className = "bg-white rounded-lg shadow-md overflow-hidden mt-8";
        tableContainer.innerHTML = `
             <div class="p-6">
                <h2 class="text-xl font-semibold text-gray-800">Desempenho por Vendedor (Churn)</h2>
                <p class="text-sm text-gray-500">As porcentagens representam a participação de cada tipo no total de perdas do vendedor.</p>
            </div>
            <div class="overflow-x-auto">
               ${tableHtml}
            </div>
        `;
        dom.dashboardContentDiv.appendChild(tableContainer);

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'vendedores') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'vendedores') utils.showLoading(false);
    }
}

/**
 * Busca e renderiza a análise de "Ativação por Vendedor" com cards e tabela.
 */
export async function fetchAndRenderActivationsBySeller(city = '', startDate = '', endDate = '') {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'activations_by_seller', currentPage: 1 }); 
    
    const params = new URLSearchParams();
    if (city) params.append('city', city);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const url = `${state.API_BASE_URL}/api/custom_analysis/activations_by_seller?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorMessage = await utils.handleFetchError(response, 'Não foi possível carregar a análise de ativação por vendedor.');
            throw new Error(errorMessage);
        }
        const result = await response.json();

        // --- PROTEÇÃO DE CORRIDA ---
        if (state.getCustomAnalysisState().currentAnalysis !== 'activations_by_seller') return;

        if(dom.activationSellerCityFilter && result.cities) utils.populateCityFilter(dom.activationSellerCityFilter, result.cities, city);
        if(dom.activationSellerStartDate) dom.activationSellerStartDate.value = startDate;
        if(dom.activationSellerEndDate) dom.activationSellerEndDate.value = endDate;

        if (!dom.dashboardContentDiv) return;
        dom.dashboardContentDiv.innerHTML = '';
        
        // Esconde a área de gráficos pois vamos desenhar tabela no dashboard
        if (dom.mainChartsArea) dom.mainChartsArea.classList.add('hidden');

        utils.renderSummaryCards(dom.dashboardContentDiv, [
            { title: 'Total Ativações', value: result.totals?.total_ativacoes || 0, colorClass: 'bg-blue-50' },
            { title: 'Permanecem Ativos', value: result.totals?.total_permanecem_ativos || 0, colorClass: 'bg-green-50' },
            { title: 'Cancelados', value: result.totals?.total_cancelados || 0, colorClass: 'bg-orange-50' },
            { title: 'Negativados', value: result.totals?.total_negativados || 0, colorClass: 'bg-red-50' },
            { title: 'Churn Total', value: result.totals?.total_churn || 0, colorClass: 'bg-gray-100' }
        ]);

        if (!result.data || result.data.length === 0) {
            const msg = document.createElement('p');
            msg.className = "text-center text-gray-500 mt-4";
            msg.textContent = "Nenhum vendedor com ativações encontrado para os filtros selecionados.";
            dom.dashboardContentDiv.appendChild(msg);
            return;
        }

        const columns = [
            { header: 'Vendedor', render: r => `<div class="font-medium text-gray-900">${r.Vendedor_Nome || 'Não Identificado'}</div>` },
            { header: 'Total Ativações', render: r => r.Total_Ativacoes > 0 ? `<span class="seller-activation-trigger cursor-pointer text-blue-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="ativado">${r.Total_Ativacoes}</span>` : '0', cssClass: 'text-center font-bold bg-blue-50' },
            { header: 'Permanecem Ativos', render: r => r.Permanecem_Ativos > 0 ? `<span class="seller-activation-trigger cursor-pointer text-green-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="ativo_permanece">${r.Permanecem_Ativos}</span>` : '0', cssClass: 'text-center' },
            { header: '% Ativos', render: r => r.Total_Ativacoes > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Permanecem_Ativos / r.Total_Ativacoes) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Cancelados', render: r => r.Cancelados > 0 ? `<span class="seller-activation-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="cancelado">${r.Cancelados}</span>` : '0', cssClass: 'text-center' },
            { header: '% Canc.', render: r => r.Total_Ativacoes > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Cancelados / r.Total_Ativacoes) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Negativados', render: r => r.Negativados > 0 ? `<span class="seller-activation-trigger cursor-pointer text-red-600 font-bold hover:underline" data-seller-id="${r.Vendedor_ID}" data-seller-name="${(r.Vendedor_Nome || 'Não Identificado').replace(/"/g, '&quot;')}" data-type="negativado">${r.Negativados}</span>` : '0', cssClass: 'text-center' },
            { header: '% Neg.', render: r => r.Total_Ativacoes > 0 ? `<span class="text-sm text-gray-500 font-medium">${((r.Negativados / r.Total_Ativacoes) * 100).toFixed(1)}%</span>` : '-', cssClass: 'text-center bg-gray-50' },
            { header: 'Churn Total', key: 'Total_Churn', cssClass: 'text-center font-bold text-gray-800 bg-gray-100' }
        ];

        const tableHtml = utils.renderGenericDetailTable(null, result.data, columns, true);

        // --- USO SEGURO DO DOM (APPEND) ---
        const tableDiv = document.createElement('div');
        tableDiv.className = "bg-white rounded-lg shadow-md overflow-hidden mt-8";
        tableDiv.innerHTML = `
             <div class="p-6">
                <h2 class="text-xl font-semibold text-gray-800">Desempenho de Ativação por Vendedor</h2>
            </div>
            <div class="overflow-x-auto">
               ${tableHtml}
            </div>
        `;
        dom.dashboardContentDiv.appendChild(tableDiv);

    } catch (error) {
        if (state.getCustomAnalysisState().currentAnalysis === 'activations_by_seller') {
            utils.showError(error.message);
        }
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'activations_by_seller') {
            utils.showLoading(false);
        }
    }
}