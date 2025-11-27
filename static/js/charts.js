import * as state from './state.js';
import * as utils from './utils.js';

// Registra o plugin de datalabels para exibir valores nos gráficos.
// Assume que 'Chart' e 'ChartDataLabels' estão globais (via CDN)
Chart.register(ChartDataLabels);

/**
 * Destrói todas as instâncias de gráficos Chart.js armazenadas em `mainCharts`.
 */
export function destroyAllMainCharts() {
    Object.values(state.getMainCharts()).forEach(chart => {
        try {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        } catch (e) {
            console.error("Erro ao destruir gráfico:", e);
        }
    });
    state.clearCharts(); // Usa o setter para limpar o estado
}

/**
 * Destrói uma instância específica de gráfico pelo seu ID.
 * @param {string} chartId - O ID do canvas do gráfico a ser destruído.
 */
export function destroySpecificChart(chartId) {
    const charts = state.getMainCharts();
    if (charts[chartId]) {
        try {
            if (typeof charts[chartId].destroy === 'function') {
                charts[chartId].destroy();
            }
        } catch (e) {
            console.error(`Erro ao destruir gráfico ${chartId}:`, e);
        }
        state.deleteChart(chartId); // Usa o setter para remover do estado
    }
}

/**
 * Renderiza um gráfico Chart.js em um canvas especificado.
 * @param {string} canvasId - O ID do elemento <canvas>.
 * @param {string} selectedType - O tipo de gráfico (ex: 'bar_vertical', 'doughnut', 'pie').
 * @param {string[]} labels - Os rótulos do eixo X ou das fatias.
 * @param {object[]} datasets - Os dados do gráfico.
 * @param {string} titleText - O título do gráfico.
 * @param {object} additionalOptions - Opções adicionais para o Chart.js.
 */
export function renderChart(canvasId, selectedType, labels, datasets, titleText, additionalOptions = {}) {
    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) {
        console.error(`Widget (canvas) para ${canvasId} não encontrado.`);
        return;
    }

    destroySpecificChart(canvasId); // Destrói gráfico anterior com mesmo ID

    // Encontra o elemento de título associado (se existir) e define o texto
    const titleElement = canvasElement.closest('.grid-stack-item-content')?.querySelector(`#${canvasId}Title`);
    if (titleElement) {
        titleElement.textContent = titleText;
    }

    const ctx = canvasElement.getContext('2d');
    let chartJsType;

    // --- PALETA DE CORES EXPANDIDA (50 cores para evitar repetição) ---
    const defaultColors = [
        '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4',
        '#84cc16', '#a855f7', '#fbbf24', '#f43f5e', '#22c55e', '#0ea5e9', '#d946ef', '#eab308', '#64748b', '#78716c',
        '#1d4ed8', '#b91c1c', '#047857', '#b45309', '#6d28d9', '#be185d', '#4338ca', '#0f766e', '#c2410c', '#0e7490',
        '#4d7c0f', '#7e22ce', '#a16207', '#9f1239', '#15803d', '#0369a1', '#1e40af', '#991b1b', '#065f46', '#92400e',
        '#334155', '#94a3b8', '#f87171', '#fb923c', '#facc15', '#a3e635', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8'
    ];

    const processedDatasets = datasets.map((ds, index) => {
        let bgColors;
        
        // CORREÇÃO: Se for Pizza ou Rosca, usamos o array de cores para colorir CADA FATIA DIFERENTE
        if (selectedType === 'pie' || selectedType === 'doughnut') {
            // Se tivermos mais dados que cores, repetimos a paleta para não faltar cor
            if (labels.length > defaultColors.length) {
                 const extendedColors = [];
                 while (extendedColors.length < labels.length) {
                     extendedColors.push(...defaultColors);
                 }
                 bgColors = extendedColors.map(c => c + 'E6');
            } else {
                 // Pega as cores necessárias
                 bgColors = defaultColors.slice(0, labels.length).map(c => c + 'E6');
            }
        } else {
            // Se for Barra ou Linha, usamos UMA cor única para a série inteira
            bgColors = defaultColors[index % defaultColors.length] + 'B3';
        }

        return {
            ...ds,
            backgroundColor: ds.backgroundColor || bgColors,
            borderColor: ds.borderColor || '#ffffff',
            borderWidth: ds.type === 'line' || selectedType === 'line' ? 2 : 1
        };
    });

    // Opções padrão do Chart.js
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: false }, // Título já está no widget
            legend: {
                display: true,
                position: 'right', // Legenda à direita
                labels: { 
                    boxWidth: 12, 
                    padding: 10, 
                    font: { size: 11 }
                    // REMOVIDO generateLabels customizado para que o Chart.js
                    // use o padrão correto para PIE (listar fatias) e BAR (listar datasets)
                }
            },
            datalabels: {
                display: (context) => {
                    // Oculta label se valor for 0
                    const value = context.dataset.data[context.dataIndex];
                    return value > 0;
                },
                color: '#fff',
                font: { weight: 'bold', size: 11 },
                formatter: (value, context) => {
                    // Formatador 'percent_only': Mostra apenas a porcentagem (ex: "40%")
                    if (additionalOptions.formatterType === 'percent_only') {
                        let sum = context.chart.data.datasets[0].data.reduce((a, b) => a + (b || 0), 0);
                        // Calcula porcentagem e formata sem casas decimais
                        let percentage = sum > 0 ? ((value / sum) * 100).toFixed(0) + "%" : "0%";
                        return percentage;
                    }
                    
                    // Formatação padrão numérica com porcentagem
                    if (additionalOptions.formatterType === 'number') {
                         let sum = context.chart.data.datasets[0].data.reduce((a, b) => a + (b || 0), 0);
                         let percentage = sum > 0 ? ((value / sum) * 100).toFixed(1) + "%" : "0%";
                         return `${new Intl.NumberFormat('pt-BR').format(value)}\n(${percentage})`;
                    }
                    // Formatação para dias
                    if (additionalOptions.formatterType === 'days') {
                        return `${value.toFixed(1)} dias`;
                    }
                    // Formatação padrão: Moeda (BRL) sem centavos
                    return new Intl.NumberFormat('pt-BR', {
                        style: 'currency', currency: 'BRL',
                        minimumFractionDigits: 0, maximumFractionDigits: 0,
                    }).format(value);
                }
            }
        },
        // Mescla opções adicionais passadas como argumento
        ...additionalOptions
    };

    // Remove a propriedade 'formatterType' se existir nas opções finais
    if (options.formatterType) {
        delete options.formatterType;
    }

    // Adapta o tipo de gráfico e opções específicas
    if (selectedType === 'doughnut' || selectedType === 'pie') {
        chartJsType = selectedType;
        options.indexAxis = undefined;
    } else if (selectedType.startsWith('bar')) {
        chartJsType = 'bar';
        options.indexAxis = (selectedType === 'bar_horizontal') ? 'y' : 'x';
        
        options.plugins.datalabels = {
            display: (context) => context.dataset.data[context.dataIndex] !== 0,
            anchor: 'end',
            align: selectedType === 'bar_horizontal' ? 'right' : 'end',
            offset: 4,
            color: '#4a5568',
            font: { weight: 'bold', size: 10 },
            formatter: (value) => new Intl.NumberFormat('pt-BR').format(value)
        };
        
        if (!options.scales) options.scales = {};
        if (options.indexAxis === 'x' && !options.scales.y) options.scales.y = { beginAtZero: true };
        if (options.indexAxis === 'y' && !options.scales.x) options.scales.x = { beginAtZero: true };

    } else if (selectedType === 'line') {
        chartJsType = 'line';
        options.indexAxis = undefined;
        if (!additionalOptions.plugins?.datalabels?.display) {
             options.plugins.datalabels.display = false;
        }
    } else {
        chartJsType = 'bar';
        options.indexAxis = 'x';
    }

    try {
        const chartInstance = new Chart(ctx, {
            type: chartJsType,
            data: { labels, datasets: processedDatasets },
            options
        });
        state.addChart(canvasId, chartInstance);
    } catch (error) {
        console.error(`Erro ao criar gráfico ${canvasId}:`, error);
        if (titleElement) titleElement.textContent = `Erro ao renderizar ${titleText}`;
    }
}

/**
 * Cria e insere botões de rádio para seleção de tipo de gráfico em um contêiner.
 */
export function populateChartTypeSelector(selectorId, options) {
    const container = document.getElementById(selectorId);
    if (!container) return;
    container.innerHTML = options.map(opt => `
        <label class="inline-flex items-center ml-2">
            <input type="radio" class="form-radio text-blue-600 h-3 w-3" name="${selectorId.replace('TypeSelector', 'Type')}" value="${opt.value}" ${opt.checked ? 'checked' : ''}>
            <span class="ml-1 text-gray-700 text-xs">${opt.label}</span>
        </label>
    `).join('');
}

/**
 * Adiciona um novo widget de gráfico à grade do GridStack e o renderiza.
 */
export function addAndRenderChartWidget(id, defaultType, labels, datasets, title, renderOptions = {}, typeOptions) {
     const grid = state.getGridStack();
     if (!grid) return;

     const chartConfigs = {
        mainChart1: { w: 6, h: 5, x: 0, y: 0, id: 'mainChart1' },
        mainChart2: { w: 6, h: 5, x: 6, y: 0, id: 'mainChart2' },
        mainChart3: { w: 6, h: 5, x: 0, y: 5, id: 'mainChart3' },
        mainChart4: { w: 6, h: 5, x: 6, y: 5, id: 'mainChart4' },
        mainChart5: { w: 4, h: 6, x: 0, y: 10, id: 'mainChart5' },
        mainChart6: { w: 4, h: 6, x: 4, y: 10, id: 'mainChart6' },
        mainChart7: { w: 4, h: 6, x: 8, y: 10, id: 'mainChart7' },
    };

    let savedLayout = [];
    try {
        const savedLayoutJson = localStorage.getItem(`layout_${state.getModalCurrentCollection()}`);
        if (savedLayoutJson) savedLayout = JSON.parse(savedLayoutJson);
    } catch (e) { }

    const savedWidgetConfig = savedLayout.find(w => w.id === id);
    const config = savedWidgetConfig || chartConfigs[id] || { w: 6, h: 5, x: 0, y: 0, id: id };

    const content = `
        <div class="grid-stack-item-content">
            <div class="chart-container-header">
                 <h3 id="${id}Title" class="chart-title"></h3>
                 <div class="chart-type-options" id="${id.replace('mainChart', 'chart')}TypeSelector"></div>
            </div>
            <div class="chart-canvas-container"><canvas id="${id}"></canvas></div>
        </div>`;

    grid.addWidget({ ...config, content: content });

    if (typeOptions && typeOptions.length > 0) {
        populateChartTypeSelector(`${id.replace('mainChart', 'chart')}TypeSelector`, typeOptions);
    }

    renderChart(id, utils.getSelectedChartType(`${id.replace('mainChart', 'chart')}Type`, defaultType), labels, datasets, title, renderOptions);
}