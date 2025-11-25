import * as state from './state.js';
import * as utils from './utils.js'; // Importa utils para usar getSelectedChartType

// Registra o plugin de datalabels para exibir valores nos gráficos.
// Assume que 'Chart' e 'ChartDataLabels' estão globais (via CDN)
// Se você estiver importando Chart.js via npm, descomente as linhas abaixo:
// import Chart from 'chart.js/auto';
// import ChartDataLabels from 'chartjs-plugin-datalabels';
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
 * @param {string} selectedType - O tipo de gráfico (ex: 'bar_vertical', 'doughnut').
 * @param {string[]} labels - Os rótulos do eixo X ou das fatias.
 * @param {object[]} datasets - Os dados do gráfico.
 * @param {string} titleText - O título do gráfico.
 * @param {object} additionalOptions - Opções adicionais para o Chart.js.
 */
export function renderChart(canvasId, selectedType, labels, datasets, titleText, additionalOptions = {}) {
    // ---- ADICIONADO: Verificação da existência do Canvas ----
    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) {
        console.error(`Widget (canvas) para ${canvasId} não encontrado.`);
        return; // Sai da função se o canvas não existe
    }
    // ---- FIM DA ADIÇÃO ----

    destroySpecificChart(canvasId); // Destrói gráfico anterior com mesmo ID

    // Encontra o elemento de título associado (se existir)
    const titleElement = canvasElement.closest('.grid-stack-item-content')?.querySelector(`#${canvasId}Title`);
    if (titleElement) {
        titleElement.textContent = titleText;
    }

    const ctx = canvasElement.getContext('2d');
    let chartJsType;

    // Cores padrão para os datasets
    const defaultColors = ['#4299e1', '#667eea', '#805ad5', '#d53f8c', '#dd6b20', '#ed8936', '#ecc94b', '#48bb78', '#38b2ac', '#4fd1c5', '#a0aec0', '#4a5568'];
    const processedDatasets = datasets.map((ds, index) => ({
        ...ds,
        backgroundColor: ds.backgroundColor || defaultColors[index % defaultColors.length] + 'B3', // Adiciona alpha para área
        borderColor: ds.borderColor || defaultColors[index % defaultColors.length],
        borderWidth: ds.type === 'line' || selectedType === 'line' ? 2 : 1 // Borda mais grossa para linhas
    }));

    // Opções padrão do Chart.js
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: false }, // Título já está no widget
            legend: {
                display: true,
                position: 'top',
                labels: { boxWidth: 12, padding: 15, font: { size: 11 } }
            },
            datalabels: { // Configuração padrão (geralmente para rosca/pizza)
                display: (context) => context.dataset.data[context.dataIndex] > 0,
                color: '#fff',
                font: { weight: 'bold', size: 11 },
                formatter: (value, context) => {
                    // Formatação condicional baseada em 'formatterType'
                    if (additionalOptions.formatterType === 'number') {
                         // Calcula percentagem para rosca/pizza
                         let sum = context.chart.data.datasets[0].data.reduce((a, b) => a + (b || 0), 0);
                         let percentage = sum > 0 ? ((value / sum) * 100).toFixed(1) + "%" : "0%";
                         return `${new Intl.NumberFormat('pt-BR').format(value)}\n(${percentage})`; // Mostra número e percentagem
                    }
                    if (additionalOptions.formatterType === 'days') {
                        return `${value.toFixed(1)} dias`; // Formata como dias
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

    // Remove a propriedade 'formatterType' se existir, pois não é uma opção nativa do Chart.js
    if (options.formatterType) {
        delete options.formatterType;
    }

    // Adapta o tipo de gráfico e opções específicas
    if (selectedType === 'doughnut' || selectedType === 'pie') {
        chartJsType = selectedType;
        options.indexAxis = undefined; // Rosca/Pizza não tem eixo
    } else if (selectedType.startsWith('bar')) {
        chartJsType = 'bar';
        options.indexAxis = (selectedType === 'bar_horizontal') ? 'y' : 'x';
        // Sobrescreve datalabels para barras (fora da barra)
        options.plugins.datalabels = {
            display: (context) => context.dataset.data[context.dataIndex] !== 0, // Mostra se não for zero
            anchor: 'end',
            align: selectedType === 'bar_horizontal' ? 'right' : 'end',
            offset: selectedType === 'bar_horizontal' ? 5 : -5,
            color: '#4a5568', // Cor escura para boa leitura
            font: { weight: 'bold', size: 10 },
            formatter: (value) => new Intl.NumberFormat('pt-BR').format(value) // Formato numérico simples
        };
        // Garante que escalas comecem em zero para barras
        if (!options.scales) options.scales = {};
        if (options.indexAxis === 'x' && !options.scales.y) options.scales.y = { beginAtZero: true };
        if (options.indexAxis === 'y' && !options.scales.x) options.scales.x = { beginAtZero: true };

    } else if (selectedType === 'line') {
        chartJsType = 'line';
        options.indexAxis = undefined;
        // Opcional: desabilitar datalabels para linhas por padrão, a menos que especificado
        if (!additionalOptions.plugins?.datalabels?.display) {
             options.plugins.datalabels.display = false;
        }
    } else {
        console.warn(`Tipo de gráfico desconhecido: ${selectedType}. Usando 'bar'.`);
        chartJsType = 'bar'; // Fallback para barra vertical
        options.indexAxis = 'x';
    }

    // Cria a instância do gráfico
    try {
        const chartInstance = new Chart(ctx, {
            type: chartJsType,
            data: { labels, datasets: processedDatasets },
            options
        });
        // Armazena a instância no estado global
        state.addChart(canvasId, chartInstance);
    } catch (error) {
        console.error(`Erro ao criar gráfico ${canvasId}:`, error);
        // Opcional: Mostrar mensagem de erro no lugar do gráfico
        if (titleElement) titleElement.textContent = `Erro ao renderizar ${titleText}`;
    }
}


/**
 * Cria e insere botões de rádio para seleção de tipo de gráfico em um contêiner.
 * @param {string} selectorId - O ID do contêiner onde os botões serão inseridos.
 * @param {object[]} options - Array de objetos com as opções {value, label, checked}.
 */
export function populateChartTypeSelector(selectorId, options) {
    const container = document.getElementById(selectorId);
    if (!container) {
        console.warn(`Container para seletor de tipo de gráfico não encontrado: ${selectorId}`);
        return;
    }
    // Gera o HTML para os botões de rádio
    container.innerHTML = options.map(opt => `
        <label class="inline-flex items-center ml-2">
            <input type="radio" class="form-radio text-blue-600 h-3 w-3" name="${selectorId.replace('TypeSelector', 'Type')}" value="${opt.value}" ${opt.checked ? 'checked' : ''}>
            <span class="ml-1 text-gray-700 text-xs">${opt.label}</span>
        </label>
    `).join('');
}


/**
 * Adiciona um novo widget de gráfico à grade do GridStack e o renderiza.
 * Usado pela função renderChartsForCurrentCollection.
 * @param {string} id - O ID base para o widget e canvas (ex: 'mainChart1').
 * @param {string} defaultType - O tipo de gráfico padrão ('doughnut', 'bar_vertical', etc.).
 * @param {string[]} labels - Rótulos para o gráfico.
 * @param {object[]} datasets - Dados para o gráfico.
 * @param {string} title - O título do widget.
 * @param {object} renderOptions - Opções de renderização adicionais para o Chart.js.
 * @param {object[]} typeOptions - Opções para o seletor de tipo de gráfico [{value, label, checked}].
 */
export function addAndRenderChartWidget(id, defaultType, labels, datasets, title, renderOptions = {}, typeOptions) {
     const grid = state.getGridStack();
     if (!grid) {
         console.error("addAndRenderChartWidget: Instância do GridStack não encontrada no estado.");
         return;
     }

     // Configurações padrão de layout dos widgets (podem ser sobrescritas pelo localStorage)
     const chartConfigs = {
        mainChart1: { w: 6, h: 5, x: 0, y: 0, id: 'mainChart1' }, // Adiciona ID aqui
        mainChart2: { w: 6, h: 5, x: 6, y: 0, id: 'mainChart2' },
        mainChart3: { w: 6, h: 5, x: 0, y: 5, id: 'mainChart3' },
        mainChart4: { w: 6, h: 5, x: 6, y: 5, id: 'mainChart4' },
        mainChart5: { w: 4, h: 6, x: 0, y: 10, id: 'mainChart5' },
        mainChart6: { w: 4, h: 6, x: 4, y: 10, id: 'mainChart6' },
        mainChart7: { w: 4, h: 6, x: 8, y: 10, id: 'mainChart7' },
        // Adicione mais IDs se precisar de mais gráficos padrão
    };

    // Tenta carregar o layout salvo do localStorage
    let savedLayout = [];
    try {
        const savedLayoutJson = localStorage.getItem(`layout_${state.getModalCurrentCollection()}`);
        if (savedLayoutJson) {
            savedLayout = JSON.parse(savedLayoutJson);
        }
    } catch (e) {
        console.error("Erro ao carregar layout do localStorage:", e);
    }

    // Encontra a configuração salva para este widget específico pelo ID
    const savedWidgetConfig = savedLayout.find(w => w.id === id);
    // Usa a configuração salva OU a configuração padrão do chartConfigs OU um fallback genérico
    const config = savedWidgetConfig || chartConfigs[id] || { w: 6, h: 5, x: 0, y: 0, id: id }; // Fallback com ID

    // Gera o HTML interno do widget
    const content = `
        <div class="grid-stack-item-content">
            <div class="chart-container-header">
                 <h3 id="${id}Title" class="chart-title"></h3>
                 <!-- Container para os botões de tipo de gráfico -->
                 <div class="chart-type-options" id="${id.replace('mainChart', 'chart')}TypeSelector"></div>
            </div>
            <!-- Container que mantém a proporção e permite overflow -->
            <div class="chart-canvas-container"><canvas id="${id}"></canvas></div>
        </div>`;

    // Adiciona o widget ao GridStack
    grid.addWidget({ ...config, content: content }); // Passa a configuração completa

    // Popula o seletor de tipo de gráfico (se houver opções)
    if (typeOptions && typeOptions.length > 0) {
        populateChartTypeSelector(`${id.replace('mainChart', 'chart')}TypeSelector`, typeOptions);
    } else {
        // Opcional: Oculta ou remove o container do seletor se não houver opções
        const selectorContainer = document.getElementById(`${id.replace('mainChart', 'chart')}TypeSelector`);
        if (selectorContainer) selectorContainer.innerHTML = ''; // Limpa se não houver opções
    }

    // Renderiza o gráfico dentro do widget recém-adicionado
    // Usa utils.getSelectedChartType para obter o tipo selecionado
    renderChart(id, utils.getSelectedChartType(`${id.replace('mainChart', 'chart')}Type`, defaultType), labels, datasets, title, renderOptions);
}

