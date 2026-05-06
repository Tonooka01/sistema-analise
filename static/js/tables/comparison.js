/**
 * tables/comparison.js
 * fetchAndRenderDailyComparison
 */

import * as state from '../state.js';
import * as dom from '../dom.js';
import * as utils from '../utils.js';

export async function fetchAndRenderDailyComparison() {
    utils.showLoading(true);
    state.setCustomAnalysisState({ currentAnalysis: 'comparativo_diario', currentPage: 1 });

    const url = `${state.API_BASE_URL}/api/comparison/daily`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Falha ao buscar dados comparativos.");

        const result = await response.json();

        if (state.getCustomAnalysisState().currentAnalysis !== 'comparativo_diario') return;

        const data = result.liquido;
        const info = result.info;

        if (!dom.dashboardContentDiv) return;

        dom.dashboardContentDiv.innerHTML = '';

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

        dom.dashboardContentDiv.innerHTML = `${uploadHtml}${legendHtml}<div class="comparison-container">${table1}${table2}</div>`;

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
                    const res = await fetch(`${state.API_BASE_URL}/api/comparison/upload_pdf`, { method: 'POST', body: formData });
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
        if (state.getCustomAnalysisState().currentAnalysis === 'comparativo_diario') utils.showError(error.message);
    } finally {
        if (state.getCustomAnalysisState().currentAnalysis === 'comparativo_diario') utils.showLoading(false);
    }
}
