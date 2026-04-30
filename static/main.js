 // Função auto-executável (IIFE) para encapsular o código e evitar poluição do escopo global.
        (function() { 
            // --- Variáveis Globais e de Estado ---
            // URL base da API. Vazio porque o frontend e o backend estão no mesmo servidor.
            const API_BASE_URL = '';
            // Objeto para armazenar as instâncias dos gráficos Chart.js para que possam ser destruídas e recriadas.
            let mainCharts = {}; 
            // Variável para rastrear qual botão de coleção está ativo no momento.
            let activeButton = null; 
            // Armazena os dados da análise principal atualmente carregada para evitar novas requisições ao mudar tipo de gráfico.
            let globalCurrentAnalysisData = null; 
            // Instância do GridStack para gerenciar o layout dos widgets.
            let gridStack = null; 

            // Registra o plugin de datalabels para exibir valores nos gráficos.
            Chart.register(ChartDataLabels);

            // --- Variáveis de Estado para Paginação dos Modais ---
            let modalCurrentPage = 1;
            const modalRowsPerPage = 25; 
            let modalCurrentCollection = ''; 
            let modalTotalRows = 0; 

            let currentSelectedYear = ''; 
            let currentSelectedMonth = ''; 
            let currentSelectedCity = ''; 
            
            // Estado para as análises personalizadas que usam tabela e paginação.
            let customAnalysisState = {
                currentPage: 1,
                rowsPerPage: 50,
                totalRows: 0,
                currentAnalysis: '',
                currentSearchTerm: '',
                currentAnalysisType: '' 
            };

            let invoiceDetailCurrentPage = 1;
            const invoiceDetailRowsPerPage = 15;
            let invoiceDetailTotalRows = 0;
            let currentInvoiceDetailContractId = '';
            let currentInvoiceDetailType = '';

            // Estado para o modal unificado de detalhes com abas.
            let detailsState = {
                financeiro: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
                os: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
                atendimentos: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
                logins: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
                comodato: { currentPage: 1, totalRows: 0, rowsPerPage: 15 },
                currentContractId: null,
                currentClientName: null
            };
            
            let sellerDetailState = {
                currentPage: 1,
                rowsPerPage: 25,
                totalRows: 0,
                currentSellerId: null,
                currentSellerName: null,
                currentType: null, // 'cancelado' or 'negativado'
                currentYear: '',
                currentMonth: ''
            };

            let cityDetailState = {
                currentPage: 1,
                rowsPerPage: 25,
                totalRows: 0,
                currentCity: null,
                currentType: null, // 'cancelado' or 'negativado'
                currentYear: '',
                currentMonth: ''
            };

            let neighborhoodDetailState = {
                currentPage: 1,
                rowsPerPage: 25,
                totalRows: 0,
                currentCity: null,
                currentNeighborhood: null,
                currentType: null, // 'cancelado' or 'negativado'
                currentYear: '',
                currentMonth: ''
            };

            let equipmentDetailState = {
                currentPage: 1,
                rowsPerPage: 25,
                totalRows: 0,
                currentEquipment: null,
                currentYear: '',
                currentMonth: ''
            };

            // --- Referências aos Elementos do DOM ---
            // Esta seção armazena referências a elementos HTML para acesso rápido e eficiente no JavaScript.
            const dashboardContentWrapper = document.getElementById('dashboard-content-wrapper');
            const dashboardContentDiv = document.getElementById('dashboard-content');
            const customAnalysisSelector = document.getElementById('customAnalysisSelector');
            const customSearchFilterDiv = document.getElementById('custom-search-filter');
            const clientSearchInput = document.getElementById('clientSearchInput');
            const applyClientSearchBtn = document.getElementById('applyClientSearch');
            const financialHealthFiltersDiv = document.getElementById('financial-health-filters');
            const contractStatusFilter = document.getElementById('contractStatusFilter');
            const accessStatusFilter = document.getElementById('accessStatusFilter');
            const saveLayoutBtn = document.getElementById('saveLayoutBtn');
            const sellerAnalysisFiltersDiv = document.getElementById('seller-analysis-filters');
            const sellerYearFilter = document.getElementById('sellerYearFilter');
            const sellerMonthFilter = document.getElementById('sellerMonthFilter');
            const cityCancellationFiltersDiv = document.getElementById('city-cancellation-filters');
            const cityCancellationYearFilter = document.getElementById('cityCancellationYearFilter');
            const cityCancellationMonthFilter = document.getElementById('cityCancellationMonthFilter');
            const neighborhoodAnalysisFiltersDiv = document.getElementById('neighborhood-analysis-filters');
            const neighborhoodAnalysisCityFilter = document.getElementById('neighborhoodAnalysisCityFilter');
            const neighborhoodAnalysisYearFilter = document.getElementById('neighborhoodAnalysisYearFilter');
            const neighborhoodAnalysisMonthFilter = document.getElementById('neighborhoodAnalysisMonthFilter');
            const equipmentAnalysisFiltersDiv = document.getElementById('equipment-analysis-filters');
            const equipmentAnalysisYearFilter = document.getElementById('equipmentAnalysisYearFilter');
            const equipmentAnalysisMonthFilter = document.getElementById('equipmentAnalysisMonthFilter');
            
            // Elementos do Modal Principal de Tabela
            const tableModal = document.getElementById('tableModal');
            const modalTitle = document.getElementById('modalTitle');
            const modalTableHead = document.querySelector('#modalTable thead tr');
            const modalTableBody = document.querySelector('#modalTable tbody');
            const modalLoadingDiv = document.getElementById('modal-table-loading');
            const modalErrorMessageDiv = document.getElementById('modal-table-error-message');
            const modalErrorTextSpan = document.getElementById('modal-table-error-text');
            const modalPaginationControls = document.getElementById('modal-pagination-controls');
            const modalPrevPageBtn = document.getElementById('modalPrevPageBtn');
            const modalNextPageBtn = document.getElementById('modalNextPageBtn');
            const modalPageInfoSpan = document.getElementById('modalPageInfo');
            const modalCloseButton = document.getElementById('modalCloseButton');

            // Elementos do Modal de Detalhes da Fatura (Atrasos)
            const invoiceDetailModal = document.getElementById('invoiceDetailModal');
            const invoiceDetailModalTitle = document.getElementById('invoiceDetailModalTitle');
            const invoiceDetailCloseButton = document.getElementById('invoiceDetailCloseButton');
            const invoiceDetailContent = document.getElementById('invoice-detail-content');
            const invoiceDetailLoading = document.getElementById('invoice-detail-loading');
            const invoiceDetailErrorDiv = document.getElementById('invoice-detail-error');
            const invoiceDetailErrorText = document.getElementById('invoice-detail-error-text');
            const invoiceDetailPaginationControls = document.getElementById('invoice-detail-pagination-controls');
            const invoiceDetailPrevPageBtn = document.getElementById('invoiceDetailPrevPageBtn');
            const invoiceDetailNextPageBtn = document.getElementById('invoiceDetailNextPageBtn');
            const invoiceDetailPageInfo = document.getElementById('invoiceDetailPageInfo');

            // Elementos do Modal Unificado de Detalhes com Abas
            const detailsModal = document.getElementById('detailsModal');
            const detailsModalTitle = document.getElementById('detailsModalTitle');
            const detailsModalCloseButton = document.getElementById('detailsModalCloseButton');
            const detailsModalTabs = document.getElementById('detailsModalTabs');

            // Elementos do Modal de Detalhes de Cancelamento/Negativação
            const cancellationDetailModal = document.getElementById('cancellationDetailModal');
            const cancellationDetailModalTitle = document.getElementById('cancellationDetailModalTitle');
            const cancellationDetailCloseButton = document.getElementById('cancellationDetailCloseButton');
            const cancellationDetailContent = document.getElementById('cancellation-detail-content');
            const cancellationDetailLoading = document.getElementById('cancellation-detail-loading');
            const cancellationDetailErrorDiv = document.getElementById('cancellation-detail-error');
            const cancellationDetailErrorText = document.getElementById('cancellation-detail-error-text');

            // Elementos do Modal de Detalhes do Vendedor
            const sellerDetailModal = document.getElementById('sellerDetailModal');
            const sellerDetailModalTitle = document.getElementById('sellerDetailModalTitle');
            const sellerDetailCloseButton = document.getElementById('sellerDetailCloseButton');
            const sellerDetailContent = document.getElementById('seller-detail-content');
            const sellerDetailLoading = document.getElementById('seller-detail-loading');
            const sellerDetailErrorDiv = document.getElementById('seller-detail-error');
            const sellerDetailErrorText = document.getElementById('seller-detail-error-text');
            const sellerDetailPaginationControls = document.getElementById('seller-detail-pagination-controls');
            const sellerDetailPrevPageBtn = document.getElementById('sellerDetailPrevPageBtn');
            const sellerDetailNextPageBtn = document.getElementById('sellerDetailNextPageBtn');
            const sellerDetailPageInfo = document.getElementById('sellerDetailPageInfo');

             // Elementos do Modal de Detalhes da Cidade
            const cityDetailModal = document.getElementById('cityDetailModal');
            const cityDetailModalTitle = document.getElementById('cityDetailModalTitle');
            const cityDetailCloseButton = document.getElementById('cityDetailCloseButton');
            const cityDetailContent = document.getElementById('city-detail-content');
            const cityDetailLoading = document.getElementById('city-detail-loading');
            const cityDetailErrorDiv = document.getElementById('city-detail-error');
            const cityDetailErrorText = document.getElementById('city-detail-error-text');
            const cityDetailPaginationControls = document.getElementById('city-detail-pagination-controls');
            const cityDetailPrevPageBtn = document.getElementById('cityDetailPrevPageBtn');
            const cityDetailNextPageBtn = document.getElementById('cityDetailNextPageBtn');
            const cityDetailPageInfo = document.getElementById('cityDetailPageInfo');

            // Elementos do Modal de Detalhes do Bairro
            const neighborhoodDetailModal = document.getElementById('neighborhoodDetailModal');
            const neighborhoodDetailModalTitle = document.getElementById('neighborhoodDetailModalTitle');
            const neighborhoodDetailCloseButton = document.getElementById('neighborhoodDetailCloseButton');
            const neighborhoodDetailContent = document.getElementById('neighborhood-detail-content');
            const neighborhoodDetailLoading = document.getElementById('neighborhood-detail-loading');
            const neighborhoodDetailErrorDiv = document.getElementById('neighborhood-detail-error');
            const neighborhoodDetailErrorText = document.getElementById('neighborhood-detail-error-text');
            const neighborhoodDetailPaginationControls = document.getElementById('neighborhood-detail-pagination-controls');
            const neighborhoodDetailPrevPageBtn = document.getElementById('neighborhoodDetailPrevPageBtn');
            const neighborhoodDetailNextPageBtn = document.getElementById('neighborhoodDetailNextPageBtn');
            const neighborhoodDetailPageInfo = document.getElementById('neighborhoodDetailPageInfo');

            // Elementos do Modal de Detalhes do Equipamento
            const equipmentDetailModal = document.getElementById('equipmentDetailModal');
            const equipmentDetailModalTitle = document.getElementById('equipmentDetailModalTitle');
            const equipmentDetailCloseButton = document.getElementById('equipmentDetailCloseButton');
            const equipmentDetailContent = document.getElementById('equipment-detail-content');
            const equipmentDetailLoading = document.getElementById('equipment-detail-loading');
            const equipmentDetailErrorDiv = document.getElementById('equipment-detail-error');
            const equipmentDetailErrorText = document.getElementById('equipment-detail-error-text');
            const equipmentDetailPaginationControls = document.getElementById('equipment-detail-pagination-controls');
            const equipmentDetailPrevPageBtn = document.getElementById('equipmentDetailPrevPageBtn');
            const equipmentDetailNextPageBtn = document.getElementById('equipmentDetailNextPageBtn');
            const equipmentDetailPageInfo = document.getElementById('equipmentDetailPageInfo');


            const mainChartsArea = document.getElementById('main-charts-area');
            const viewTableBtn = document.getElementById('viewTableBtn');
            const financialFiltersDiv = document.getElementById('financial-filters');
            const yearFilterSelect = document.getElementById('yearFilter');
            const monthFilterSelect = document.getElementById('monthFilter');
            const cityFilterSelect = document.getElementById('cityFilter');
            const cityFilterContainer = document.getElementById('city-filter-container');
            
            // --- Funções Utilitárias ---

            /**
             * Formata uma string de data (ex: 'YYYY-MM-DD HH:MM:SS') para o formato brasileiro (DD/MM/YYYY).
             * @param {string} dateString - A data a ser formatada.
             * @returns {string} A data formatada ou 'N/A' se a entrada for inválida.
             */
            function formatDate(dateString) {
                if (!dateString || dateString === 'N/A') return 'N/A';
                try {
                    const date = new Date(dateString.split(' ')[0]);
                    if (isNaN(date.getTime())) return dateString;
                    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
                    return utcDate.toLocaleDateString('pt-BR');
                } catch (e) { return dateString; }
            }
            
            /**
             * Exibe ou oculta os indicadores de carregamento e erro.
             * @param {boolean} show - True para mostrar o spinner de carregamento, false para ocultá-lo.
             */
            function showLoading(show) {
                document.getElementById('dashboard-content').classList.toggle('hidden', show);
                document.getElementById('chart-loading').classList.toggle('hidden', !show);
                document.getElementById('chart-error-message').classList.add('hidden');
            }

            /**
             * Exibe uma mensagem de erro no painel principal.
             * @param {string} message - A mensagem de erro a ser exibida.
             */
            function showError(message) {
                document.getElementById('chart-loading').classList.add('hidden');
                document.getElementById('dashboard-content').classList.add('hidden');
                document.getElementById('chart-error-text').textContent = message;
                document.getElementById('chart-error-message').classList.remove('hidden');
            }
            
             /**
             * ATUALIZADO: Tenta extrair uma mensagem de erro detalhada de uma resposta de fetch.
             * @param {Response} response - O objeto de resposta do fetch.
             * @param {string} defaultMessage - Uma mensagem padrão para usar como fallback.
             * @returns {Promise<string>} A mensagem de erro detalhada ou a padrão.
             */
            async function handleFetchError(response, defaultMessage) {
                let errorMessage = defaultMessage;
                try {
                    const err = await response.json();
                    if (err && err.error) {
                        errorMessage = err.error;
                    } else {
                        errorMessage = `Erro HTTP: ${response.status} - ${response.statusText}`;
                    }
                } catch (e) {
                    errorMessage = `Erro HTTP: ${response.status} - ${response.statusText}`;
                }
                return errorMessage;
            }

            /**
             * Define o estilo 'ativo' para o botão ou seletor clicado, removendo-o dos outros.
             * @param {HTMLElement} element - O elemento de controle (botão ou select) a ser ativado.
             */
            function setActiveControl(element) {
                document.querySelectorAll('.collection-selector button').forEach(btn => btn.classList.remove('active'));
                customAnalysisSelector.classList.remove('active');
                if (element) {
                    element.classList.add('active');
                }
            }

            /**
             * Destrói todas as instâncias de gráficos Chart.js armazenadas em `mainCharts`.
             */
            function destroyAllMainCharts() {
                Object.values(mainCharts).forEach(chart => chart.destroy());
                mainCharts = {};
            }
            
            /**
             * Destrói uma instância específica de gráfico pelo seu ID.
             * @param {string} chartId - O ID do canvas do gráfico a ser destruído.
             */
            function destroySpecificChart(chartId) {
                if (mainCharts[chartId]) {
                    mainCharts[chartId].destroy();
                    delete mainCharts[chartId];
                }
            }

            /**
             * Obtém o tipo de gráfico selecionado de um grupo de botões de rádio.
             * @param {string} radioName - O nome do grupo de rádio.
             * @param {string} defaultType - O tipo de gráfico padrão a ser retornado se nenhum for selecionado.
             * @returns {string} O valor do tipo de gráfico selecionado.
             */
            function getSelectedChartType(radioName, defaultType) {
                const radio = document.querySelector(`input[name="${radioName}"]:checked`);
                return radio ? radio.value : defaultType;
            }

            /**
             * Preenche um elemento <select> com uma lista de anos.
             * @param {HTMLSelectElement} selectElement - O elemento select a ser preenchido.
             * @param {string[]} years - Um array de anos.
             * @param {string} selectedYear - O ano que deve ser pré-selecionado.
             */
            function populateYearFilter(selectElement, years, selectedYear) {
                const currentVal = selectElement.value;
                selectElement.innerHTML = '<option value="">Todos os Anos</option>';
                if (years && years.length > 0) {
                    years.forEach(y => {
                        const option = document.createElement('option');
                        option.value = y;
                        option.textContent = y;
                        selectElement.appendChild(option);
                    });
                }
                selectElement.value = selectedYear || currentVal;
            }

             /**
             * Preenche um elemento <select> com uma lista de cidades.
             * @param {HTMLSelectElement} selectElement - O elemento select a ser preenchido.
             * @param {string[]} cities - Um array de cidades.
             * @param {string} selectedCity - A cidade que deve ser pré-selecionada.
             */
            function populateCityFilter(selectElement, cities, selectedCity) {
                const currentVal = selectElement.value;
                selectElement.innerHTML = `<option value="">${selectElement.firstElementChild.textContent}</option>`;
                cities.forEach(c => {
                    const option = document.createElement('option');
                    option.value = c;
                    option.textContent = c;
                    selectElement.appendChild(option);
                });
                selectElement.value = selectedCity || currentVal;
            }
            
            /**
             * Reseta todos os campos de filtro para seus valores padrão.
             */
            function resetAllFilters() {
                clientSearchInput.value = '';
                contractStatusFilter.value = '';
                accessStatusFilter.value = '';
                yearFilterSelect.value = '';
                monthFilterSelect.value = '';
                cityFilterSelect.value = '';
                sellerYearFilter.value = '';
                sellerMonthFilter.value = '';
                cityCancellationYearFilter.value = '';
                cityCancellationMonthFilter.value = '';
                neighborhoodAnalysisCityFilter.value = '';
                neighborhoodAnalysisYearFilter.value = '';
                neighborhoodAnalysisMonthFilter.value = '';
                equipmentAnalysisYearFilter.value = '';
                equipmentAnalysisMonthFilter.value = '';
            }
            
            /**
             * Oculta todos os contêineres de filtros personalizados.
             */
            function hideAllCustomFilters() {
                customSearchFilterDiv.classList.add('hidden');
                financialHealthFiltersDiv.classList.add('hidden');
                sellerAnalysisFiltersDiv.classList.add('hidden');
                financialFiltersDiv.classList.add('hidden');
                cityCancellationFiltersDiv.classList.add('hidden');
                neighborhoodAnalysisFiltersDiv.classList.add('hidden');
                equipmentAnalysisFiltersDiv.classList.add('hidden');
            }


             // --- Lógica do GridStack ---

            /**
             * Inicializa a grade do GridStack e adiciona um listener para redimensionar os gráficos
             * quando um widget muda de tamanho ou posição.
             */
            function initializeGridStack() {
                gridStack = GridStack.init({
                    cellHeight: 70,
                    minRow: 1,
                    margin: 10,
                    float: true,
                });
                gridStack.on('change', (event, items) => {
                    setTimeout(() => {
                        items.forEach(item => {
                            const chartId = item.el.querySelector('canvas')?.id;
                            if (chartId && mainCharts[chartId]) {
                                mainCharts[chartId].resize();
                            }
                        });
                    }, 250);
                });
            }

            /**
             * Salva o layout atual da grade no localStorage para persistência.
             */
            function saveLayout() {
                const layout = gridStack.save();
                localStorage.setItem(`layout_${modalCurrentCollection}`, JSON.stringify(layout));
                
                const originalText = saveLayoutBtn.textContent;
                saveLayoutBtn.textContent = 'Salvo!';
                saveLayoutBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                saveLayoutBtn.classList.add('bg-blue-500');
                setTimeout(() => {
                    saveLayoutBtn.textContent = originalText;
                    saveLayoutBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                    saveLayoutBtn.classList.remove('bg-blue-500');
                }, 1500);
            }
            
            /**
             * Cria e insere botões de rádio para seleção de tipo de gráfico em um contêiner.
             * @param {string} selectorId - O ID do contêiner onde os botões serão inseridos.
             * @param {object[]} options - Array de objetos com as opções {value, label, checked}.
             */
            function populateChartTypeSelector(selectorId, options) {
                const container = document.getElementById(selectorId);
                if (!container) return;
                container.innerHTML = options.map(opt => `
                    <label class="inline-flex items-center">
                        <input type="radio" class="form-radio text-blue-600" name="${selectorId.replace('TypeSelector', 'Type')}" value="${opt.value}" ${opt.checked ? 'checked' : ''}>
                        <span class="ml-1 text-gray-700 text-sm">${opt.label}</span>
                    </label>
                `).join('');
            }

            // --- Lógica de Gráficos ---

            /**
             * Renderiza um gráfico Chart.js em um canvas especificado.
             * @param {string} canvasId - O ID do elemento <canvas>.
             * @param {string} selectedType - O tipo de gráfico (ex: 'bar_vertical', 'doughnut').
             * @param {string[]} labels - Os rótulos do eixo X ou das fatias.
             * @param {object[]} datasets - Os dados do gráfico.
             * @param {string} titleText - O título do gráfico.
             * @param {object} additionalOptions - Opções adicionais para o Chart.js.
             */
            function renderChart(canvasId, selectedType, labels, datasets, titleText, additionalOptions = {}) {
                destroySpecificChart(canvasId); 
                
                const widget = document.getElementById(canvasId);
                if (!widget) {
                    console.error(`Widget para ${canvasId} não encontrado.`);
                    return;
                }
                const titleElement = widget.closest('.grid-stack-item-content').querySelector(`#${canvasId}Title`);
                if (titleElement) titleElement.textContent = titleText;
                
                const ctx = widget.getContext('2d');
                let chartJsType;
                
                const defaultColors = ['#4299e1', '#667eea', '#805ad5', '#d53f8c', '#dd6b20', '#ed8936', '#ecc94b', '#48bb78', '#38b2ac', '#4fd1c5', '#a0aec0', '#4a5568'];
                const processedDatasets = datasets.map((ds, index) => ({ 
                    ...ds, 
                    backgroundColor: ds.backgroundColor || defaultColors
                }));

                const options = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        title: { display: false },
                        legend: {
                            display: true,
                            position: 'top',
                        },
                        datalabels: {
                            display: (context) => context.dataset.data[context.dataIndex] > 0,
                            color: '#fff',
                            font: {
                                weight: 'bold',
                                size: 11
                            },
                            formatter: (value, context) => {
                                if (additionalOptions.formatterType === 'number') {
                                     let sum = 0;
                                    let dataArr = context.chart.data.datasets[0].data;
                                    dataArr.map(data => {
                                        sum += data;
                                    });
                                    let percentage = (value*100 / sum).toFixed(1)+"%";
                                    return `${value}\n(${percentage})`;
                                }
                                
                                if (additionalOptions.formatterType === 'days') {
                                    return `${value.toFixed(1)} dias`;
                                }

                                return new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                }).format(value);
                            }
                        }
                    },
                    ...additionalOptions
                };
                
                if (options.formatterType) {
                    delete options.formatterType;
                }

                if (selectedType === 'doughnut') {
                    chartJsType = 'doughnut';
                    options.indexAxis = undefined;
                } else if (selectedType.startsWith('bar')) {
                    chartJsType = 'bar';
                    options.indexAxis = (selectedType === 'bar_horizontal') ? 'y' : 'x';
                     // Sobrescreve o datalabels para barras
                    options.plugins.datalabels = {
                        display: (context) => context.dataset.data[context.dataIndex] > 0,
                        anchor: 'end',
                        align: 'end',
                        offset: selectedType === 'bar_horizontal' ? 4 : -5,
                        color: '#4a5568',
                        font: { weight: 'bold', size: 10, },
                        formatter: (value) => new Intl.NumberFormat('pt-BR').format(value)
                    };
                } else if (selectedType === 'line') {
                    chartJsType = 'line';
                    options.indexAxis = undefined;
                }

                mainCharts[canvasId] = new Chart(ctx, {
                    type: chartJsType,
                    data: { labels, datasets: processedDatasets },
                    options
                });
            }
            
             /**
             * Adiciona um novo widget de gráfico à grade do GridStack e o renderiza.
             * @param {string} id - O ID base para o widget e canvas.
             * @param {string} defaultType - O tipo de gráfico padrão.
             * @param {string[]} labels - Rótulos para o gráfico.
             * @param {object[]} datasets - Dados para o gráfico.
             * @param {string} title - O título do widget.
             * @param {object} renderOptions - Opções de renderização para o Chart.js.
             * @param {object[]} typeOptions - Opções para o seletor de tipo de gráfico.
             */
            function addAndRenderChartWidget(id, defaultType, labels, datasets, title, renderOptions = {}, typeOptions) {
                 const chartConfigs = {
                    mainChart1: { w: 6, h: 5, x: 0, y: 0, id: 'mainChart1' },
                    mainChart2: { w: 6, h: 5, x: 6, y: 0, id: 'mainChart2' },
                    mainChart3: { w: 6, h: 5, x: 0, y: 5, id: 'mainChart3' },
                    mainChart4: { w: 6, h: 5, x: 6, y: 5, id: 'mainChart4' },
                    mainChart5: { w: 4, h: 6, x: 0, y: 10, id: 'mainChart5' },
                    mainChart6: { w: 4, h: 6, x: 4, y: 10, id: 'mainChart6' },
                    mainChart7: { w: 4, h: 6, x: 8, y: 10, id: 'mainChart7' },
                };
                const savedLayout = JSON.parse(localStorage.getItem(`layout_${modalCurrentCollection}`)) || [];
                
                const savedWidget = savedLayout.find(w => w.id === id);
                const config = savedWidget || chartConfigs[id];
                
                const content = `
                    <div class="grid-stack-item-content">
                        <div class="chart-container-header">
                             <h3 id="${id}Title" class="chart-title"></h3>
                             <div class="chart-type-options" id="${id.replace('mainChart', 'chart')}TypeSelector"></div>
                        </div>
                        <div class="chart-canvas-container"><canvas id="${id}"></canvas></div>
                    </div>`;
                
                gridStack.addWidget({ ...config, content: content });
                
                populateChartTypeSelector(`${id.replace('mainChart', 'chart')}TypeSelector`, typeOptions);
                renderChart(id, getSelectedChartType(`${id.replace('mainChart', 'chart')}Type`, defaultType), labels, datasets, title, renderOptions);
            }

            /**
             * Função central que decide quais gráficos renderizar com base na coleção selecionada.
             */
            function renderChartsForCurrentCollection() {
                destroyAllMainCharts();
                gridStack.removeAll();

                const data = globalCurrentAnalysisData;
                if (!data) return;

                const filterText = `(${currentSelectedYear || 'Todos'}${currentSelectedMonth ? '/' + currentSelectedMonth : ''})`;
                const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

                if (modalCurrentCollection === 'Clientes') {
                    addAndRenderChartWidget('mainChart1', 'doughnut', data.by_city.map(i => i.Cidade || 'N/A'), [{ data: data.by_city.map(i => i.Count) }], 'Top 20 Cidades por Cliente', { formatterType: 'number' }, 
                        [{value: 'doughnut', label: 'Rosca', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    addAndRenderChartWidget('mainChart2', 'bar_horizontal', data.by_neighborhood.map(i => i.Bairro || 'N/A'), [{ data: data.by_neighborhood.map(i => i.Count) }], 'Top 20 Bairros por Cliente', { formatterType: 'number' },
                        [{value: 'bar_horizontal', label: 'Barra H', checked: true}, {value: 'doughnut', label: 'Rosca'}, {value: 'bar_vertical', label: 'Barra V'}]);
                } else if (modalCurrentCollection === 'Contratos') {
                     addAndRenderChartWidget('mainChart1', 'doughnut', data.by_status.map(i => i.Status_contrato || 'N/A'), [{ data: data.by_status.map(i => i.Count) }], 'Contratos por Status', { formatterType: 'number' }, 
                        [{value: 'doughnut', label: 'Rosca', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    addAndRenderChartWidget('mainChart2', 'doughnut', data.by_access_status.map(i => i.Status_acesso || 'N/A'), [{ data: data.by_access_status.map(i => i.Count) }], 'Contratos por Status de Acesso', { formatterType: 'number' },
                        [{value: 'doughnut', label: 'Rosca', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                } else if (modalCurrentCollection === 'Contas a Receber') {
                    addAndRenderChartWidget('mainChart1', 'doughnut', data.status_summary.map(i => i.Status), [{ data: data.status_summary.map(i => i.Count) }], `Contas por Status ${filterText}`, { formatterType: 'number' },
                        [{value: 'doughnut', label: 'Rosca', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    addAndRenderChartWidget('mainChart2', 'bar_vertical', data.status_summary.map(i => i.Status), [{ data: data.status_summary.map(i => i.Total_Value) }], `Valor Total por Status ${filterText}`, {},
                        [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'doughnut', label: 'Rosca'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    addAndRenderChartWidget('mainChart3', 'line', data.yoy_summary.map(i => i.Year), [{ data: data.yoy_summary.map(i => i.Total_Count) }], 'Evolução Anual de Contas', { formatterType: 'number' },
                        [{value: 'line', label: 'Linha', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    data.mom_summary.sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
                    addAndRenderChartWidget('mainChart4', 'line', data.mom_summary.map(i => monthNames[parseInt(i.Month) - 1]), [{ data: data.mom_summary.map(i => i.Total_Count) }], `Evolução Mensal ${filterText}`, { formatterType: 'number' },
                        [{value: 'line', label: 'Linha', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);

                    // Gráfico 1: Todos os clientes
                    if (data.last_3_months_stacked && data.last_3_months_stacked.length > 0) {
                        const stackedData = data.last_3_months_stacked;
                        const statusColors = {'Recebido': '#48bb78', 'Aberto': '#f59e0b', 'Cancelado': '#6b7280'};
                        const labels = [...new Set(stackedData.map(item => item.Month))].sort();
                        const statuses = [...new Set(stackedData.map(item => item.Status))];
                        const datasets = statuses.map(status => ({
                            label: status,
                            data: labels.map(label => stackedData.find(d => d.Month === label && d.Status === status)?.Total_Value || 0),
                            backgroundColor: statusColors[status] || `#${Math.floor(Math.random()*16777215).toString(16)}`
                        }));
                        addAndRenderChartWidget('mainChart5', 'bar_vertical', labels, datasets, 'Contas a Receber (Últimos 3 Meses - Todos)', { 
                            scales: { x: { stacked: true }, y: { stacked: true } },
                            plugins: {
                                datalabels: {
                                    display: function(context) {
                                        const datasets = context.chart.data.datasets;
                                        let lastVisibleDatasetIndex = -1;
                                        for (let i = datasets.length - 1; i >= 0; i--) {
                                            if (context.chart.isDatasetVisible(i)) {
                                                lastVisibleDatasetIndex = i;
                                                break;
                                            }
                                        }
                                        return context.datasetIndex === lastVisibleDatasetIndex;
                                    },
                                    formatter: function(value, context) {
                                        let total = 0;
                                        context.chart.data.datasets.forEach((ds, index) => {
                                            if (context.chart.isDatasetVisible(index)) {
                                                total += ds.data[context.dataIndex] || 0;
                                            }
                                        });
                                        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
                                    },
                                    color: '#374151',
                                    anchor: 'end',
                                    align: 'end',
                                    offset: -5,
                                    font: {
                                        weight: 'bold'
                                    }
                                }
                            } 
                        },
                            [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'line', label: 'Linha'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    }

                    // Gráfico 2: Apenas clientes ativos
                    if (data.last_3_months_active_clients && data.last_3_months_active_clients.length > 0) {
                        const activeData = data.last_3_months_active_clients;
                        const statusColors = {'Recebido': '#48bb78', 'Aberto': '#f59e0b'};
                        const labels = [...new Set(activeData.map(item => item.Month))].sort();
                        const statuses = [...new Set(activeData.map(item => item.Status))];
                         const datasets = statuses.map(status => ({
                            label: status,
                            data: labels.map(label => activeData.find(d => d.Month === label && d.Status === status)?.Total_Value || 0),
                            backgroundColor: statusColors[status] || `#${Math.floor(Math.random()*16777215).toString(16)}`
                        }));
                        addAndRenderChartWidget('mainChart6', 'bar_vertical', labels, datasets, 'Contas a Receber (Últimos 3 Meses - Ativos)', { 
                            scales: { x: { stacked: true }, y: { stacked: true } },
                            plugins: {
                                datalabels: {
                                    display: function(context) {
                                        const datasets = context.chart.data.datasets;
                                        let lastVisibleDatasetIndex = -1;
                                        for (let i = datasets.length - 1; i >= 0; i--) {
                                            if (context.chart.isDatasetVisible(i)) {
                                                lastVisibleDatasetIndex = i;
                                                break;
                                            }
                                        }
                                        return context.datasetIndex === lastVisibleDatasetIndex;
                                    },
                                    formatter: function(value, context) {
                                        let total = 0;
                                        context.chart.data.datasets.forEach((ds, index) => {
                                            if (context.chart.isDatasetVisible(index)) {
                                                total += ds.data[context.dataIndex] || 0;
                                            }
                                        });
                                        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
                                    },
                                    color: '#374151',
                                    anchor: 'end',
                                    align: 'end',
                                    offset: -5,
                                    font: {
                                        weight: 'bold'
                                    }
                                }
                            } 
                        },
                            [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'line', label: 'Linha'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    }
                     // GRÁFICO RESTAURADO: Faturamento por Dia de Vencimento
                     fetch(`${API_BASE_URL}/api/finance_summary/by_due_date`).then(res => res.json()).then(dueDateData => {
                        if (dueDateData && dueDateData.length > 0) {
                            const labels = [...new Set(dueDateData.map(item => item.Due_Day))].sort((a,b) => parseInt(a) - parseInt(b));
                            const months = [...new Set(dueDateData.map(item => item.Month))].sort();
                            const monthColors = ['#3b82f6', '#10b981', '#f97316'];
                            const datasets = months.map((month, index) => ({
                                label: month,
                                data: labels.map(day => dueDateData.find(d => d.Month === month && d.Due_Day === day)?.Total_Value || 0),
                                backgroundColor: monthColors[index % monthColors.length]
                            }));
                            addAndRenderChartWidget('mainChart7', 'bar_vertical', labels, datasets, 'Comparativo de Faturamento por Dia de Vencimento', { scales: { y: { beginAtZero: true } } },
                                [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'doughnut', label: 'Rosca'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                        }
                    });
                } else if (modalCurrentCollection === 'Atendimentos') {
                    addAndRenderChartWidget('mainChart1', 'doughnut', data.status_summary.map(i => i.Status), [{ data: data.status_summary.map(i => i.Count) }], 'Atendimentos por Status', { formatterType: 'number' }, 
                        [{value: 'doughnut', label: 'Rosca', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    addAndRenderChartWidget('mainChart2', 'bar_horizontal', data.subject_ranking.map(i => i.Assunto), [{ data: data.subject_ranking.map(i => i.Count) }], 'Top 10 Assuntos Mais Comuns', { formatterType: 'number' },
                        [{value: 'bar_horizontal', label: 'Barra H', checked: true}, {value: 'doughnut', label: 'Rosca'}, {value: 'bar_vertical', label: 'Barra V'}]);
                    addAndRenderChartWidget('mainChart3', 'line', data.yoy_summary.map(i => i.Year), [{ data: data.yoy_summary.map(i => i.Total_Count) }], 'Evolução Anual de Atendimentos', { formatterType: 'number' },
                        [{value: 'line', label: 'Linha', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    data.mom_summary.sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
                    addAndRenderChartWidget('mainChart4', 'line', data.mom_summary.map(i => monthNames[parseInt(i.Month) - 1]), [{ data: data.mom_summary.map(i => i.Total_Count) }], `Evolução Mensal ${filterText}`, { formatterType: 'number' },
                        [{value: 'line', label: 'Linha', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    addAndRenderChartWidget('mainChart5', 'bar_vertical', data.avg_resolution_time_by_subject.map(i => i.Assunto), [{ data: data.avg_resolution_time_by_subject.map(i => i.Average_Resolution_Days) }], 'Tempo Médio de Resolução por Assunto (dias)', { formatterType: 'days' },
                        [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'line', label: 'Linha'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                } else if (modalCurrentCollection === 'OS') {
                    const { status_by_subject, mom_summary, avg_service_time_by_city } = data;
                    const subjects = [...new Set(status_by_subject.map(item => item.Assunto))];
                    const statuses = [...new Set(status_by_subject.map(item => item.Status))];
                    const statusDatasets = statuses.map(status => ({ label: status, data: subjects.map(subject => status_by_subject.find(s => s.Assunto === subject && s.Status === status)?.Count || 0) }));
                    addAndRenderChartWidget('mainChart6', 'bar_vertical', subjects, statusDatasets, 'Status de OS por Assunto', { scales: { x: { stacked: true }, y: { stacked: true } }, formatterType: 'number' }, 
                        [{value: 'bar_vertical', label: 'Barra V', checked: true}, {value: 'doughnut', label: 'Rosca'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    mom_summary.sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
                    addAndRenderChartWidget('mainChart4', 'line', mom_summary.map(i => monthNames[parseInt(i.Month) - 1]), [{ data: mom_summary.map(i => i.Total_Count) }], `Evolução Mensal de OS ${filterText}`, { formatterType: 'number' },
                        [{value: 'line', label: 'Linha', checked: true}, {value: 'bar_vertical', label: 'Barra V'}, {value: 'bar_horizontal', label: 'Barra H'}]);
                    addAndRenderChartWidget('mainChart7', 'bar_horizontal', avg_service_time_by_city.map(i => i.Cidade), [{ data: avg_service_time_by_city.map(i => i.Average_Service_Days) }], 'Tempo Médio de Serviço por Cidade (dias)', { formatterType: 'days' },
                        [{value: 'bar_horizontal', label: 'Barra H', checked: true}, {value: 'line', label: 'Linha'}, {value: 'bar_vertical', label: 'Barra V'}]);
                } else if (modalCurrentCollection === 'Logins') {
                    addAndRenderChartWidget('mainChart1', 'bar_horizontal', data.by_transmitter.map(i => i.Transmissor), [{ data: data.by_transmitter.map(i => i.Count) }], 'Logins Únicos por Transmissor', { formatterType: 'number' },
                        [{value: 'bar_horizontal', label: 'Barra H', checked: true}, {value: 'doughnut', label: 'Rosca'}, {value: 'bar_vertical', label: 'Barra V'}]);
                    addAndRenderChartWidget('mainChart2', 'bar_horizontal', data.by_plan.map(i => i.Contrato), [{ data: data.by_plan.map(i => i.Count) }], 'Top 20 Planos por Nº de Logins', { formatterType: 'number' },
                        [{value: 'bar_horizontal', label: 'Barra H', checked: true}, {value: 'doughnut', label: 'Rosca'}, {value: 'bar_vertical', label: 'Barra V'}]);
                }
            }


            // --- Lógica Principal ---
            
            /**
             * Busca e renderiza as análises gráficas para uma coleção de dados padrão (botões azuis).
             * @param {string} collectionName - O nome da coleção (ex: 'Clientes').
             * @param {string} year - O ano para filtrar os dados (opcional).
             * @param {string} month - O mês para filtrar os dados (opcional).
             * @param {string} city - A cidade para filtrar os dados (opcional, usado em 'OS').
             */
            async function fetchAndRenderMainAnalysis(collectionName, year = '', month = '', city = '') {
                showLoading(true);
                dashboardContentDiv.innerHTML = '';
                dashboardContentDiv.appendChild(mainChartsArea);
                
                modalCurrentCollection = collectionName;
                currentSelectedYear = year;
                currentSelectedMonth = month;
                currentSelectedCity = city;

                const apiCollectionName = collectionName.replace(/ /g, '_');
                
                const endpointMap = {
                    'Clientes': 'summary',
                    'Contratos': 'summary',
                    'Contas a Receber': 'finance_summary',
                    'Atendimentos': 'atendimento_summary',
                    'OS': 'os_summary',
                    'Logins': 'summary',
                    'Cidade': 'summary',
                    'Vendedor': 'summary',
                };

                const endpoint = endpointMap[collectionName];

                if (!endpoint) {
                    mainChartsArea.classList.add('hidden');
                    dashboardContentDiv.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhuma análise gráfica configurada para a coleção "${collectionName}".</p>`;
                    viewTableBtn.classList.remove('hidden');
                    financialFiltersDiv.classList.add('hidden');
                    showLoading(false);
                    return;
                }
                
                let url = `${API_BASE_URL}/api/${endpoint}/${apiCollectionName}`;
                const params = new URLSearchParams();
                if (year) params.append('year', year);
                if (month) params.append('month', month);
                if (city && collectionName === 'OS') params.append('city', city);
                if (params.toString()) url += `?${params.toString()}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, `Falha ao carregar análise para "${collectionName}"`);
                        throw new Error(errorMessage);
                    }
                    globalCurrentAnalysisData = await response.json();
                    
                    const hasDateData = globalCurrentAnalysisData.years && globalCurrentAnalysisData.years.length > 0;
                    const collectionsWithDateFilter = ['Contas a Receber', 'Atendimentos', 'OS', 'Clientes', 'Contratos', 'Logins'];

                    if (collectionsWithDateFilter.includes(collectionName) && hasDateData) {
                        financialFiltersDiv.classList.remove('hidden');
                        populateYearFilter(yearFilterSelect, globalCurrentAnalysisData.years, currentSelectedYear);
                    } else {
                        financialFiltersDiv.classList.add('hidden');
                    }
                    
                    cityFilterContainer.classList.toggle('hidden', collectionName !== 'OS');
                    if (collectionName === 'OS' && globalCurrentAnalysisData.cities) {
                        populateCityFilter(cityFilterSelect, globalCurrentAnalysisData.cities, currentSelectedCity);
                    }

                    renderChartsForCurrentCollection();
                    mainChartsArea.classList.remove('hidden');
                    viewTableBtn.classList.remove('hidden');
                } catch (error) {
                    showError(error.message);
                } finally {
                    showLoading(false);
                }
            }


            // --- Lógica para Análises Personalizadas ---
             /**
             * Busca os status de contrato e acesso para preencher os filtros da análise de Saúde Financeira.
             */
            async function populateContractStatusFilters() {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/filters/contract_statuses`);
                    if (!response.ok) throw new Error('Falha ao buscar status de contrato.');
                    const data = await response.json();

                    contractStatusFilter.innerHTML = '<option value="">Todos</option>';
                    data.status_contrato.forEach(status => {
                        const option = document.createElement('option');
                        option.value = status;
                        option.textContent = status;
                        contractStatusFilter.appendChild(option);
                    });

                    accessStatusFilter.innerHTML = '<option value="">Todos</option>';
                    data.status_acesso.forEach(status => {
                        const option = document.createElement('option');
                        option.value = status;
                        option.textContent = status;
                        accessStatusFilter.appendChild(option);
                    });
                } catch (error) {
                    console.error(error);
                }
            }
            
            /**
             * Renderiza uma tabela de dados personalizada no painel principal.
             * @param {object} result - O objeto retornado pela API, contendo 'data' e 'total_rows'.
             * @param {string} title - O título da tabela.
             * @param {object[]} columns - A configuração das colunas {header, render}.
             */
            function renderCustomTable(result, title, columns) {
                const { data, total_rows } = result;
                customAnalysisState.totalRows = total_rows;

                if (!data || data.length === 0) {
                    dashboardContentDiv.innerHTML = '<p class="text-center text-gray-500 mt-4">Nenhum resultado encontrado.</p>';
                    return;
                }
                const tableHtml = `
                    <div class="table-wrapper">
                        <h2 class="text-2xl font-semibold mb-4">${title}</h2>
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead>
                                <tr>${columns.map(c => `<th class="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">${c.header}</th>`).join('')}</tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${data.map(row => `
                                    <tr class="border-b border-gray-200 hover:bg-gray-50">
                                        ${columns.map(c => `<td class="py-3 px-4 text-sm text-gray-800">${c.render(row)}</td>`).join('')}
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`;
                
                const paginationHtml = `
                    <div id="custom-analysis-pagination-controls" class="pagination-controls flex justify-center items-center gap-4 mt-8">
                        <button id="customPrevPageBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed">Página Anterior</button>
                        <span id="customPageInfo" class="text-gray-700 font-medium"></span>
                        <button id="customNextPageBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Próxima Página</button>
                    </div>
                `;

                dashboardContentDiv.innerHTML = tableHtml + paginationHtml;
                renderCustomAnalysisPagination();
            }
            
             /**
             * Atualiza os controles de paginação para a tabela de análise personalizada.
             */
            function renderCustomAnalysisPagination() {
                const { currentPage, rowsPerPage, totalRows } = customAnalysisState;
                const totalPages = Math.ceil(totalRows / rowsPerPage);
                
                const pageInfo = document.getElementById('customPageInfo');
                const prevBtn = document.getElementById('customPrevPageBtn');
                const nextBtn = document.getElementById('customNextPageBtn');

                if (pageInfo && prevBtn && nextBtn) {
                    if (totalRows > 0 && totalPages > 1) {
                        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
                        prevBtn.disabled = currentPage === 1;
                        nextBtn.disabled = currentPage >= totalPages;
                        document.getElementById('custom-analysis-pagination-controls').classList.remove('hidden');

                    } else {
                        document.getElementById('custom-analysis-pagination-controls').classList.add('hidden');
                    }
                }
            }

            // --- FUNÇÕES DE FETCH PARA ANÁLISES PERSONALIZADAS ---

            /**
             * Busca e renderiza a análise de "Atrasos e Faturas Não Pagas".
             * @param {string} searchTerm - Termo de busca para o nome do cliente.
             * @param {number} page - O número da página a ser buscada.
             */
            async function fetchAndRenderLatePaymentsAnalysis(searchTerm = '', page = 1) {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentPage: page, currentAnalysis: 'atrasos_e_nao_pagos', currentSearchTerm: searchTerm };
                const offset = (page - 1) * customAnalysisState.rowsPerPage;
                const url = `${API_BASE_URL}/api/custom_analysis/contas_a_receber?search_term=${encodeURIComponent(searchTerm)}&limit=${customAnalysisState.rowsPerPage}&offset=${offset}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) { 
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    renderCustomTable(result, 'Análise de Atrasos e Faturas Não Pagas', [
                        { header: 'Cliente', render: r => `<span title="${r.Cliente}">${r.Cliente}</span>` },
                        { header: 'ID Contrato', render: r => r.Contrato_ID },
                        { header: 'Atrasos Pagos', render: r => r.Atrasos_Pagos > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="atrasos_pagos" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Atrasos_Pagos}</span>` : r.Atrasos_Pagos },
                        { header: 'Faturas Vencidas (Não Pagas)', render: r => r.Faturas_Nao_Pagas > 0 ? `<span class="invoice-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="faturas_nao_pagas" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}">${r.Faturas_Nao_Pagas}</span>` : r.Faturas_Nao_Pagas }
                    ]);
                } catch (error) { showError(error.message); } finally { showLoading(false); }
            }
            
             /**
             * Busca e renderiza a análise de "Saúde Financeira".
             * @param {string} searchTerm - Termo de busca para o nome do cliente.
             * @param {string} analysisType - 'atraso' ou 'bloqueio'.
             * @param {number} page - O número da página a ser buscada.
             */
            async function fetchAndRenderFinancialHealthAnalysis(searchTerm = '', analysisType = 'atraso', page = 1) {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentPage: page, currentAnalysis: 'saude_financeira', currentSearchTerm: searchTerm, currentAnalysisType: analysisType };
                const contractStatus = contractStatusFilter.value; const accessStatus = accessStatusFilter.value;
                const offset = (page - 1) * customAnalysisState.rowsPerPage;
                const endpoint = analysisType === 'bloqueio' ? 'financial_health_auto_block' : 'financial_health';
                const params = new URLSearchParams({ search_term: searchTerm, limit: customAnalysisState.rowsPerPage, offset: offset });
                if (contractStatus) params.append('status_contrato', contractStatus); if (accessStatus) params.append('status_acesso', accessStatus);
                const url = `${API_BASE_URL}/api/custom_analysis/${endpoint}?${params.toString()}`;
                const title = analysisType === 'bloqueio' ? 'Análise de Saúde Financeira (Bloqueio Automático > 20 dias)' : 'Análise de Saúde Financeira (Atraso > 10 dias)';
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                         const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                         throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    renderCustomTable(result, title, [
                        { header: 'Cliente', render: r => `<span title="${r.Razao_Social}">${r.Razao_Social}</span>` },
                        { header: 'ID Contrato', render: r => r.Contrato_ID },
                        { header: 'Status Contrato', render: r => r.Status_contrato || 'N/A' },
                        { header: 'Status Acesso', render: r => r.Status_acesso || 'N/A' },
                        { header: '1ª Inadimplência', render: r => r.Primeira_Inadimplencia_Vencimento ? `<span class="detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-type="financial" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${formatDate(r.Primeira_Inadimplencia_Vencimento)}</span>` : 'N/A' },
                        { header: 'Tem Reclamações?', render: r => r.Possui_Reclamacoes === 'Sim' ? `<span class="detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-type="complaints" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">Sim</span>` : 'Não' },
                        { header: 'Última Conexão', render: r => r.Ultima_Conexao ? `<span class="detail-trigger cursor-pointer text-blue-600 hover:underline" data-type="logins" data-contract-id="${r.Contrato_ID}" data-client-name="${r.Razao_Social.replace(/"/g, '&quot;')}">${formatDate(r.Ultima_Conexao)}</span>` : 'N/A' }
                    ]);
                } catch (error) { showError(error.message); } finally { showLoading(false); }
            }

             /**
             * Busca e renderiza a análise de "Cancelamento".
             * @param {string} searchTerm - Termo de busca para o nome do cliente.
             * @param {number} page - O número da página a ser buscada.
             */
            async function fetchAndRenderCancellationAnalysis(searchTerm = '', page = 1) {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentPage: page, currentAnalysis: 'cancellations', currentSearchTerm: searchTerm };
                const offset = (page - 1) * customAnalysisState.rowsPerPage;
                const url = `${API_BASE_URL}/api/custom_analysis/cancellations?search_term=${encodeURIComponent(searchTerm)}&limit=${customAnalysisState.rowsPerPage}&offset=${offset}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    renderCustomTable(result, 'Análise de Cancelamentos por Contato Técnico', [
                        { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>`},
                        { header: 'ID Contrato', render: r => r.Contrato_ID },
                        { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
                    ]);
                } catch (error) { showError(error.message); } finally { showLoading(false); }
            }

             /**
             * Busca e renderiza a análise de "Negativação".
             * @param {string} searchTerm - Termo de busca para o nome do cliente.
             * @param {number} page - O número da página a ser buscada.
             */
            async function fetchAndRenderNegativacaoAnalysis(searchTerm = '', page = 1) {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentPage: page, currentAnalysis: 'negativacao', currentSearchTerm: searchTerm };
                const offset = (page - 1) * customAnalysisState.rowsPerPage;
                const url = `${API_BASE_URL}/api/custom_analysis/negativacao?search_term=${encodeURIComponent(searchTerm)}&limit=${customAnalysisState.rowsPerPage}&offset=${offset}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    renderCustomTable(result, 'Análise de Negativação por Contato Técnico', [
                         { header: 'Cliente', render: r => `<span class="cancellation-detail-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}" title="${r.Cliente}">${r.Cliente}</span>`},
                        { header: 'ID Contrato', render: r => r.Contrato_ID },
                        { header: 'Teve Contato Relevante?', render: r => r.Teve_Contato_Relevante === 'Não' ? `<span class="bg-yellow-200 text-yellow-800 font-bold py-1 px-2 rounded-md text-xs">${r.Teve_Contato_Relevante}</span>` : `<span class="cancellation-detail-trigger cursor-pointer text-green-700 font-bold hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Teve_Contato_Relevante}</span>` }
                    ]);
                } catch (error) { showError(error.message); } finally { showLoading(false); }
            }

            /**
             * MODIFICADO: Busca e renderiza a nova análise de "Vendedores" com cards e tabela aprimorada.
             * @param {string} year - O ano para filtrar.
             * @param {string} month - O mês para filtrar.
             */
            async function fetchAndRenderSellerAnalysis(year = '', month = '') {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentAnalysis: 'vendedores' };
                const url = `${API_BASE_URL}/api/custom_analysis/sellers?year=${year}&month=${month}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    
                    // Popula o filtro de ano
                    populateYearFilter(sellerYearFilter, result.years, year);

                    // Limpa o conteúdo do dashboard
                    dashboardContentDiv.innerHTML = '';

                    // 1. Cria e insere o HTML dos cards de resumo
                    const summaryCardsHtml = `
                        <div id="summary-cards" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                            <div class="bg-white p-6 rounded-lg shadow-md">
                                <h3 class="text-base font-semibold text-gray-500 mb-1">Total de Clientes Cancelados</h3>
                                <p class="text-4xl font-bold text-red-500">${result.total_cancelados}</p>
                            </div>
                            <div class="bg-white p-6 rounded-lg shadow-md">
                                <h3 class="text-base font-semibold text-gray-500 mb-1">Total de Clientes Negativados</h3>
                                <p class="text-4xl font-bold text-orange-500">${result.total_negativados}</p>
                            </div>
                            <div class="bg-gradient-to-r from-gray-700 to-gray-800 text-white p-6 rounded-lg shadow-lg">
                                <h3 class="text-base font-semibold text-gray-300 mb-1">Soma Total</h3>
                                <p class="text-4xl font-bold">${result.grand_total}</p>
                            </div>
                        </div>
                    `;

                    // 2. Cria e insere o HTML da tabela
                    const tableData = result.data;
                    if (!tableData || tableData.length === 0) {
                        dashboardContentDiv.innerHTML = summaryCardsHtml + '<p class="text-center text-gray-500 mt-4">Nenhum resultado encontrado para os filtros selecionados.</p>';
                        return;
                    }

                    const tableRowsHtml = tableData.map(row => {
                        const sellerName = row.Vendedor_Nome || 'Não Identificado';
                        const canceledCount = row.Cancelados_Count;
                        const negativatedCount = row.Negativados_Count;
                        const totalIndividual = row.Total;

                        return `
                            <tr class="hover:bg-gray-50">
                                <td class="p-4 whitespace-nowrap">
                                    <div class="font-medium text-gray-900">${sellerName}</div>
                                </td>
                                <td class="p-4 whitespace-nowrap text-center">
                                    ${canceledCount > 0 ? `<span class="seller-detail-trigger cursor-pointer text-red-600 font-bold hover:underline" data-seller-id="${row.Vendedor_ID}" data-seller-name="${sellerName.replace(/"/g, '&quot;')}" data-type="cancelado">${canceledCount}</span>` : '0'}
                                </td>
                                <td class="p-4 whitespace-nowrap text-center">
                                    ${negativatedCount > 0 ? `<span class="seller-detail-trigger cursor-pointer text-orange-600 font-bold hover:underline" data-seller-id="${row.Vendedor_ID}" data-seller-name="${sellerName.replace(/"/g, '&quot;')}" data-type="negativado">${negativatedCount}</span>` : '0'}
                                </td>
                                <td class="p-4 whitespace-nowrap text-center font-bold text-gray-800 bg-gray-50">${totalIndividual}</td>
                            </tr>
                        `;
                    }).join('');

                    const tableHtml = `
                        <div class="bg-white rounded-lg shadow-md overflow-hidden mt-8">
                             <div class="p-6">
                                <h2 class="text-xl font-semibold text-gray-800">Desempenho por Vendedor</h2>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="w-full text-left">
                                    <thead class="bg-gray-50">
                                        <tr class="border-b border-gray-200">
                                            <th class="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">Vendedor</th>
                                            <th class="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider text-center">Cancelados</th>
                                            <th class="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider text-center">Negativados</th>
                                            <th class="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider text-center bg-gray-100">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-200">
                                        ${tableRowsHtml}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                    
                    dashboardContentDiv.innerHTML = summaryCardsHtml + tableHtml;

                } catch (error) {
                    showError(error.message);
                } finally {
                    showLoading(false);
                }
            }


            /**
             * Busca e renderiza a análise de "Cancelamento/Negativação por Cidade".
             * @param {string} year - O ano para filtrar.
             * @param {string} month - O mês para filtrar.
             */
            async function fetchAndRenderCancellationsByCity(year = '', month = '') {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentAnalysis: 'cancellations_by_city' };
                
                const params = new URLSearchParams();
                if (year) params.append('year', year);
                if (month) params.append('month', month);
                const url = `${API_BASE_URL}/api/custom_analysis/cancellations_by_city?${params.toString()}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    
                    populateYearFilter(cityCancellationYearFilter, result.years, year);

                    dashboardContentDiv.innerHTML = '';
                    mainChartsArea.innerHTML = '';
                    dashboardContentDiv.appendChild(mainChartsArea);
                    mainChartsArea.classList.remove('hidden');
                    gridStack.removeAll();
                    destroyAllMainCharts();

                    if(!result.data || result.data.length === 0) {
                        dashboardContentDiv.innerHTML = '<p class="text-center text-gray-500 mt-4">Nenhum dado de cancelamento ou negativação por cidade encontrado para os filtros selecionados.</p>';
                        return;
                    }

                    const labels = result.data.map(d => d.Cidade);
                    const datasets = [
                        { label: 'Cancelados', data: result.data.map(d => d.Cancelados), backgroundColor: '#ef4444' },
                        { label: 'Negativados', data: result.data.map(d => d.Negativados), backgroundColor: '#f97316' }
                    ];
                    
                    const filterText = `(${year || 'Todos'}${month ? '/' + month : ''})`;
                    const title = `Cancelamentos e Negativações por Cidade ${filterText}`;

                    const content = `
                        <div class="grid-stack-item-content">
                            <div class="chart-container-header">
                                <h3 id="cityAnalysisChartTitle" class="chart-title"></h3>
                            </div>
                            <div class="chart-canvas-container"><canvas id="cityAnalysisChart"></canvas></div>
                        </div>`;
                    
                    gridStack.addWidget({ w: 12, h: 8, content: content });
                    
                    renderChart('cityAnalysisChart', 'bar_vertical', labels, datasets, title, {
                        formatterType: 'number',
                        onClick: (event, elements) => {
                            if (elements.length > 0) {
                                const chart = mainCharts['cityAnalysisChart'];
                                const element = elements[0];
                                const city = chart.data.labels[element.index];
                                const type = chart.data.datasets[element.datasetIndex].label === 'Cancelados' ? 'cancelado' : 'negativado';
                                const year = cityCancellationYearFilter.value;
                                const month = cityCancellationMonthFilter.value;
                                openCityDetailModal(city, type, year, month);
                            }
                        }
                    });

                } catch (error) {
                    showError(error.message);
                } finally {
                    showLoading(false);
                }
            }
            /**
             * Busca e renderiza a análise de "Cancelamento/Negativação por Bairro".
             * @param {string} city - A cidade para filtrar.
             * @param {string} year - O ano para filtrar.
             * @param {string} month - O mês para filtrar.
             */
            async function fetchAndRenderCancellationsByNeighborhood(city = '', year = '', month = '') {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentAnalysis: 'cancellations_by_neighborhood' };
                
                const params = new URLSearchParams({ city: city });
                if (year) params.append('year', year);
                if (month) params.append('month', month);
                const url = `${API_BASE_URL}/api/custom_analysis/cancellations_by_neighborhood?${params.toString()}`;
                
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();

                    populateCityFilter(neighborhoodAnalysisCityFilter, result.cities, city);
                    populateYearFilter(neighborhoodAnalysisYearFilter, result.years, year);

                    dashboardContentDiv.innerHTML = '';
                    mainChartsArea.innerHTML = '';
                    dashboardContentDiv.appendChild(mainChartsArea);
                    mainChartsArea.classList.remove('hidden');
                    gridStack.removeAll();
                    destroyAllMainCharts();

                    if (!city) {
                        dashboardContentDiv.innerHTML = '<p class="text-center text-gray-500 mt-4">Por favor, selecione uma cidade no filtro acima para ver a análise por bairro.</p>';
                        return;
                    }

                    if (!result.data || result.data.length === 0) {
                        dashboardContentDiv.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum dado encontrado para a cidade de ${city} com os filtros selecionados.</p>`;
                        return;
                    }

                    const labels = result.data.map(d => d.Bairro || 'N/A');
                    const datasets = [
                        { label: 'Cancelados', data: result.data.map(d => d.Cancelados), backgroundColor: '#ef4444' },
                        { label: 'Negativados', data: result.data.map(d => d.Negativados), backgroundColor: '#f97316' }
                    ];
                    
                    const filterText = `(${year || 'Todos'}${month ? '/' + month : ''})`;
                    const title = `Cancelamentos/Negativações por Bairro em ${city} ${filterText}`;
                    const content = `
                        <div class="grid-stack-item-content">
                            <div class="chart-container-header">
                                <h3 id="neighborhoodChartTitle" class="chart-title"></h3>
                            </div>
                            <div class="chart-canvas-container"><canvas id="neighborhoodChart"></canvas></div>
                        </div>`;
                    
                    gridStack.addWidget({ w: 12, h: 8, content: content });
                    
                    renderChart('neighborhoodChart', 'bar_horizontal', labels, datasets, title, { 
                        formatterType: 'number',
                        onClick: (event, elements) => {
                            if (elements.length > 0) {
                                const chart = mainCharts['neighborhoodChart'];
                                const element = elements[0];
                                const neighborhood = chart.data.labels[element.index];
                                const type = chart.data.datasets[element.datasetIndex].label === 'Cancelados' ? 'cancelado' : 'negativado';
                                const year = neighborhoodAnalysisYearFilter.value;
                                const month = neighborhoodAnalysisMonthFilter.value;
                                openNeighborhoodDetailModal(city, neighborhood, type, year, month);
                            }
                        }
                    });

                } catch (error) {
                    showError(error.message);
                } finally {
                    showLoading(false);
                }
            }
            
            /**
             * Busca e renderiza a análise de "Cancelamento por Equipamento".
             * @param {string} year - O ano para filtrar.
             * @param {string} month - O mês para filtrar.
             */
            async function fetchAndRenderCancellationsByEquipment(year = '', month = '') {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentAnalysis: 'cancellations_by_equipment' };
                
                const params = new URLSearchParams();
                if (year) params.append('year', year);
                if (month) params.append('month', month);
                const url = `${API_BASE_URL}/api/custom_analysis/cancellations_by_equipment?${params.toString()}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();

                    populateYearFilter(equipmentAnalysisYearFilter, result.years, year);

                    dashboardContentDiv.innerHTML = '';
                    mainChartsArea.innerHTML = '';
                    dashboardContentDiv.appendChild(mainChartsArea);
                    mainChartsArea.classList.remove('hidden');
                    gridStack.removeAll();
                    destroyAllMainCharts();

                    if (!result.data || result.data.length === 0) {
                        dashboardContentDiv.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum cancelamento associado a equipamentos encontrado para os filtros selecionados.</p>`;
                        return;
                    }

                    const labels = result.data.map(d => d.Descricao_produto || 'Não Identificado');
                    const datasets = [
                        { label: 'Cancelamentos', data: result.data.map(d => d.Count), backgroundColor: '#d946ef' }
                    ];
                    
                    const filterText = `(${year || 'Todos'}${month ? '/' + month : ''})`;
                    const title = `Top Cancelamentos por Modelo de Equipamento ${filterText}`;
                    const content = `
                        <div class="grid-stack-item-content">
                            <div class="chart-container-header">
                                <h3 id="equipmentChartTitle" class="chart-title"></h3>
                            </div>
                            <div class="chart-canvas-container"><canvas id="equipmentChart"></canvas></div>
                        </div>`;
                    
                    gridStack.addWidget({ w: 12, h: 10, content: content });
                    
                    renderChart('equipmentChart', 'bar_horizontal', labels, datasets, title, { 
                        formatterType: 'number',
                        onClick: (event, elements) => {
                            if (elements.length > 0) {
                                const chart = mainCharts['equipmentChart'];
                                const element = elements[0];
                                const equipmentName = chart.data.labels[element.index];
                                openEquipmentDetailModal(equipmentName, year, month);
                            }
                        }
                    });

                } catch (error) {
                    showError(error.message);
                } finally {
                    showLoading(false);
                }
            }

            /**
             * ATUALIZADO: Busca e renderiza a análise de "Equipamentos por OLT", criando um gráfico de rosca para cada OLT.
             */
            async function fetchAndRenderEquipmentByOlt() {
                showLoading(true);
                customAnalysisState = { ...customAnalysisState, currentAnalysis: 'equipment_by_olt' };
                const url = `${API_BASE_URL}/api/custom_analysis/equipment_by_olt`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar a análise.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();

                    dashboardContentDiv.innerHTML = '';
                    mainChartsArea.innerHTML = '';
                    dashboardContentDiv.appendChild(mainChartsArea);
                    mainChartsArea.classList.remove('hidden');
                    gridStack.removeAll();
                    destroyAllMainCharts();

                    if (!result.data || result.data.length === 0) {
                        dashboardContentDiv.innerHTML = `<p class="text-center text-gray-500 mt-4">Nenhum dado de equipamento por OLT encontrado.</p>`;
                        return;
                    }
                    
                    // 1. Agrupar os dados por OLT
                    const dataByOlt = result.data.reduce((acc, item) => {
                        const olt = item.OLT || 'Não Identificada';
                        if (!acc[olt]) {
                            acc[olt] = [];
                        }
                        acc[olt].push(item);
                        return acc;
                    }, {});

                    // 2. Iterar sobre cada OLT e criar um widget de gráfico para ela
                    let x = 0, y = 0, col = 0;
                    const colsPerRow = 3; // Define quantos gráficos por linha

                    for (const oltName in dataByOlt) {
                        const oltData = dataByOlt[oltName];
                        const labels = oltData.map(d => d.Descricao_produto);
                        const data = oltData.map(d => d.Count);
                        
                        const chartId = `olt-chart-${oltName.replace(/[^a-zA-Z0-9]/g, '')}`; // Cria um ID seguro para o canvas
                        const title = `Equipamentos em ${oltName}`;
                        
                        const content = `
                            <div class="grid-stack-item-content">
                                <div class="chart-container-header">
                                    <h3 id="${chartId}Title" class="chart-title"></h3>
                                </div>
                                <div class="chart-canvas-container"><canvas id="${chartId}"></canvas></div>
                            </div>`;

                        // Adiciona o widget ao GridStack
                        gridStack.addWidget({ x: x, y: y, w: 4, h: 5, content: content });
                        
                        // Renderiza o gráfico de rosca
                        renderChart(chartId, 'doughnut', labels, [{ data: data }], title, { 
                            formatterType: 'number',
                            plugins: {
                                legend: {
                                    display: true, // Habilita a legenda
                                    position: 'bottom', // Posição da legenda
                                    labels: {
                                        boxWidth: 12,
                                        font: { size: 10 }
                                    }
                                }
                            }
                        });

                        // Atualiza as coordenadas para o próximo widget
                        x += 4;
                        col++;
                        if (col >= colsPerRow) {
                            x = 0;
                            y += 5;
                            col = 0;
                        }
                    }

                } catch (error) {
                    showError(error.message);
                } finally {
                    showLoading(false);
                }
            }
            
            // --- Lógica dos Modais ---

            /**
             * Abre o modal da tabela principal para a coleção especificada.
             * @param {string} collectionName - O nome da coleção a ser exibida.
             */
            function openModal(collectionName) {
                modalCurrentCollection = collectionName;
                modalCurrentPage = 1;
                modalTitle.textContent = `Dados da Tabela: ${collectionName}`;
                tableModal.classList.add('show');
                fetchAndDisplayTableInModal(collectionName, 1);
            }

            function closeModal() {
                tableModal.classList.remove('show');
            }

            /**
             * Busca e exibe os dados paginados no modal da tabela principal.
             * @param {string} collectionName - O nome da coleção.
             * @param {number} page - O número da página a ser buscada.
             */
            async function fetchAndDisplayTableInModal(collectionName, page = 1) {
                modalLoadingDiv.classList.remove('hidden');
                modalErrorMessageDiv.classList.add('hidden');
                modalTableHead.innerHTML = '';
                modalTableBody.innerHTML = '';
                modalPaginationControls.classList.add('hidden');
                const apiCollectionName = collectionName.replace(/ /g, '_');
                const offset = (page - 1) * modalRowsPerPage;

                try {
                    const response = await fetch(`${API_BASE_URL}/api/data/${apiCollectionName}?limit=${modalRowsPerPage}&offset=${offset}`);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar os dados da tabela.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    modalTotalRows = result.total_rows;
                    modalCurrentPage = page;
                    if (result.data.length === 0) {
                        modalTableBody.innerHTML = '<tr><td colspan="54" class="text-center py-4">Nenhum dado encontrado.</td></tr>';
                        return;
                    }
                    renderDataTableInModal(result.data);
                    renderModalPaginationControls();
                } catch (error) {
                    console.error('Erro no modal:', error);
                    modalErrorTextSpan.textContent = `Erro: ${error.message}.`;
                    modalErrorMessageDiv.classList.remove('hidden');
                } finally {
                    modalLoadingDiv.classList.add('hidden');
                }
            }

            /**
             * Renderiza os dados da tabela no corpo do modal principal.
             * @param {object[]} data - Array de objetos com os dados da tabela.
             */
            function renderDataTableInModal(data) {
                const headers = Object.keys(data[0]);
                modalTableHead.innerHTML = headers.map(h => `<th class="py-3 px-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">${h}</th>`).join('');
                modalTableBody.innerHTML = data.map(item => `
                    <tr class="border-b border-gray-200 hover:bg-gray-50">
                        ${headers.map(h => `<td class="py-3 px-4 text-sm text-gray-800" title="${item[h]}">${item[h] !== null ? item[h] : ''}</td>`).join('')}
                    </tr>`).join('');
            }

            /**
             * Renderiza os controles de paginação para o modal da tabela principal.
             */
            function renderModalPaginationControls() {
                const totalPages = Math.ceil(modalTotalRows / modalRowsPerPage);
                if (totalPages <= 1) return;
                modalPageInfoSpan.textContent = `Página ${modalCurrentPage} de ${totalPages}`;
                modalPrevPageBtn.disabled = modalCurrentPage === 1;
                modalNextPageBtn.disabled = modalCurrentPage >= totalPages;
                modalPaginationControls.classList.remove('hidden');
            }

            /**
             * Abre o modal para exibir detalhes de faturas.
             * @param {string} contractId - ID do contrato.
             * @param {string} clientName - Nome do cliente.
             * @param {string} type - Tipo de detalhe ('atrasos_pagos' ou 'faturas_nao_pagas').
             */
            function openInvoiceDetailModal(contractId, clientName, type) {
                currentInvoiceDetailContractId = contractId;
                currentInvoiceDetailType = type;
                invoiceDetailCurrentPage = 1;
                const typeText = type === 'atrasos_pagos' ? 'Atrasos Pagos' : 'Faturas Vencidas e Não Pagas';
                invoiceDetailModalTitle.textContent = `Detalhes: ${typeText} para ${clientName} (Contrato: ${contractId})`;
                invoiceDetailModal.classList.add('show');
                fetchAndDisplayInvoiceDetails(1);
            }

            function closeInvoiceDetailModal() { invoiceDetailModal.classList.remove('show'); }

            async function fetchAndDisplayInvoiceDetails(page) {
                invoiceDetailCurrentPage = page;
                const offset = (page - 1) * invoiceDetailRowsPerPage;
                invoiceDetailLoading.classList.remove('hidden');
                invoiceDetailErrorDiv.classList.add('hidden');
                invoiceDetailContent.innerHTML = '';
                invoiceDetailPaginationControls.classList.add('hidden');
                const url = `${API_BASE_URL}/api/custom_analysis/invoice_details?contract_id=${currentInvoiceDetailContractId}&type=${currentInvoiceDetailType}&limit=${invoiceDetailRowsPerPage}&offset=${offset}`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar os detalhes.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    invoiceDetailTotalRows = result.total_rows;
                    renderInvoiceDetailTable(result.data);
                    renderInvoiceDetailPagination();
                } catch (error) {
                    invoiceDetailErrorText.textContent = `Erro: ${error.message}.`;
                    invoiceDetailErrorDiv.classList.remove('hidden');
                } finally {
                    invoiceDetailLoading.classList.add('hidden');
                }
            }

            function renderInvoiceDetailTable(data) {
                if (!data || data.length === 0) {
                    invoiceDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum detalhe encontrado.</p>';
                    return;
                }
                const columns = [ { header: 'ID', key: 'ID' }, { header: 'Emissão', key: 'Emissao', isDate: true }, { header: 'Vencimento', key: 'Vencimento', isDate: true }, { header: 'Pagamento', key: 'Data_pagamento', isDate: true }, { header: 'Valor', key: 'Valor' }, { header: 'Status', key: 'Status' }];
                const tableHtml = `
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead><tr>${columns.map(c => `<th class="py-3 px-4 text-left text-sm font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${data.map(row => `<tr>${columns.map(c => `<td class="py-3 px-4 text-sm text-gray-800" title="${row[c.key]}">${c.isDate ? formatDate(row[c.key]) : (row[c.key] || 'N/A')}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>`;
                invoiceDetailContent.innerHTML = tableHtml;
            }

            function renderInvoiceDetailPagination() {
                const totalPages = Math.ceil(invoiceDetailTotalRows / invoiceDetailRowsPerPage);
                if (totalPages <= 1) { invoiceDetailPaginationControls.classList.add('hidden'); return; }
                invoiceDetailPageInfo.textContent = `Página ${invoiceDetailCurrentPage} de ${totalPages}`;
                invoiceDetailPrevPageBtn.disabled = invoiceDetailCurrentPage === 1;
                invoiceDetailNextPageBtn.disabled = invoiceDetailCurrentPage >= totalPages;
                invoiceDetailPaginationControls.classList.remove('hidden');
            }

            /**
             * Abre o modal unificado de detalhes do cliente.
             * @param {string} type - A aba que deve ser aberta inicialmente (ex: 'financial', 'complaints').
             * @param {string} contractId - ID do contrato.
             * @param {string} clientName - Nome do cliente.
             */
            function openDetailsModal(type, contractId, clientName) {
                Object.keys(detailsState).forEach(key => {
                    if (typeof detailsState[key] === 'object' && detailsState[key] !== null) {
                        detailsState[key].currentPage = 1;
                        detailsState[key].totalRows = 0;
                    }
                });
                detailsState.currentContractId = contractId;
                detailsState.currentClientName = clientName;
                document.querySelectorAll('.tab-pane').forEach(p => p.innerHTML = '');
                detailsModal.classList.add('show');
                detailsModalTitle.textContent = `Detalhes para: ${clientName} (Contrato: ${contractId})`;
                let targetTab = type === 'complaints' ? 'os' : type;
                setActiveTab(targetTab);
            }

            function closeDetailsModal() { detailsModal.classList.remove('show'); }
            
            async function setActiveTab(tabName) {
                document.querySelectorAll('#detailsModalTabs .tab-link').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('#detailsModalTabContent .tab-pane').forEach(p => p.classList.remove('active', 'show'));
                const tabLink = document.querySelector(`.tab-link[data-tab="${tabName}"]`);
                const tabPane = document.getElementById(`tab-content-${tabName}`);
                tabLink.classList.add('active');
                tabPane.classList.add('active', 'show');
                if (tabPane.innerHTML.trim() === '') fetchAndRenderTabData(tabName, 1);
            }

            async function fetchAndRenderTabData(tabName, page) {
                const state = detailsState[tabName];
                state.currentPage = page;
                const offset = (page - 1) * state.rowsPerPage;
                const contentDiv = document.getElementById(`tab-content-${tabName}`);
                contentDiv.innerHTML = '<div class="loading-spinner"></div>';
                let url = '', columns = [];
                switch(tabName) {
                    case 'financeiro':
                        url = `${API_BASE_URL}/api/details/financial/${detailsState.currentContractId}?limit=${state.rowsPerPage}&offset=${offset}`;
                        columns = [ { header: 'ID', key: 'ID' }, { header: 'Parcela', key: 'Parcela_R' }, { header: 'Emissão', key: 'Emissao', isDate: true }, { header: 'Vencimento', key: 'Vencimento', isDate: true }, { header: 'Pagamento', key: 'Data_pagamento', isDate: true }, { header: 'Valor', key: 'Valor', isCurrency: true }, { header: 'Status', key: 'Status' } ];
                        break;
                    case 'os':
                        url = `${API_BASE_URL}/api/details/complaints/${encodeURIComponent(detailsState.currentClientName)}?type=os&limit=${state.rowsPerPage}&offset=${offset}`;
                        columns = [ { header: 'ID', key: 'ID' }, { header: 'Abertura', key: 'Abertura', isDate: true }, { header: 'Assunto', key: 'Assunto' }, { header: 'Status', key: 'Status' }];
                        break;
                    case 'atendimentos':
                        url = `${API_BASE_URL}/api/details/complaints/${encodeURIComponent(detailsState.currentClientName)}?type=atendimentos&limit=${state.rowsPerPage}&offset=${offset}`;
                         columns = [ { header: 'ID', key: 'ID' }, { header: 'Criado em', key: 'Criado_em', isDate: true }, { header: 'Assunto', key: 'Assunto' }, { header: 'Status', key: 'Novo_status' } ];
                        break;
                    case 'logins':
                        url = `${API_BASE_URL}/api/details/logins/${detailsState.currentContractId}?limit=${state.rowsPerPage}&offset=${offset}`;
                        columns = [ { header: 'Login', key: 'Login' }, { header: 'Última Conexão', key: 'ltima_conex_o_inicial', isDate: true }, { header: 'Sinal RX', key: 'Sinal_RX' }, { header: 'Aparelho (ONU)', key: 'ONU_tipo' }, { header: 'IP', key: 'IPV4' }, { header: 'Transmissor', key: 'Transmissor' } ];
                        break;
                    case 'comodato':
                        url = `${API_BASE_URL}/api/details/comodato/${detailsState.currentContractId}`;
                        columns = [ { header: 'Equipamento', key: 'Descricao_produto' }, { header: 'Status', key: 'Status_comodato' } ];
                        break;
                }
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                         const errorMessage = await handleFetchError(response, 'Não foi possível carregar os dados.');
                         throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    state.totalRows = result.total_rows || result.data.length;
                    renderDetailTable(contentDiv, result.data, columns, tabName);
                } catch (error) {
                    contentDiv.innerHTML = `<p class="text-red-500 text-center p-4">Erro ao carregar dados: ${error.message}</p>`;
                }
            }

            function renderDetailTable(container, data, columns, tabName) {
                if (!data || data.length === 0) {
                    container.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum dado encontrado.</p>';
                    return;
                }
                const tableId = `table-${tabName}`, paginationId = `pagination-${tabName}`;
                const tableHtml = `
                    <div class="table-wrapper">
                        <table id="${tableId}" class="min-w-full divide-y divide-gray-200">
                            <thead><tr>${columns.map(c => `<th class="py-3 px-4 text-left text-sm font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${data.map(row => `<tr>${columns.map(c => {
                                    let value = row[c.key] || 'N/A';
                                    if (c.isDate) value = formatDate(value);
                                    if (c.isCurrency) value = `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
                                    return `<td class="py-3 px-4 text-sm text-gray-800" title="${row[c.key]}">${value}</td>`
                                }).join('')}</tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div id="${paginationId}" class="pagination-controls flex justify-center items-center gap-4 mt-4"></div>`;
                container.innerHTML = tableHtml;
                renderDetailPagination(tabName);
            }

            function renderDetailPagination(tabName) {
                const state = detailsState[tabName];
                const container = document.getElementById(`pagination-${tabName}`);
                if (!container) return;
                const totalPages = Math.ceil(state.totalRows / state.rowsPerPage);
                if (totalPages <= 1) { container.innerHTML = ''; return; }
                container.innerHTML = `
                    <button data-tab="${tabName}" data-page="${state.currentPage - 1}" class="prev-page-btn bg-gray-200 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-300 disabled:opacity-50" ${state.currentPage === 1 ? 'disabled' : ''}>Anterior</button>
                    <span class="text-gray-700 font-medium">Página ${state.currentPage} de ${totalPages}</span>
                    <button data-tab="${tabName}" data-page="${state.currentPage + 1}" class="next-page-btn bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-50" ${state.currentPage === totalPages ? 'disabled' : ''}>Próxima</button>`;
            }

            function openCancellationDetailModal(clientName, contractId, isSubModal = false) {
                cancellationDetailModalTitle.textContent = `Histórico para ${clientName}`;
                cancellationDetailModal.style.zIndex = isSubModal ? '1010' : '1000';
                cancellationDetailModal.classList.add('show');
                fetchAndDisplayCancellationDetails(clientName, contractId);
            }

            function closeCancellationDetailModal() {
                cancellationDetailModal.classList.remove('show');
            }

            async function fetchAndDisplayCancellationDetails(clientName, contractId) {
                cancellationDetailLoading.classList.remove('hidden');
                cancellationDetailErrorDiv.classList.add('hidden');
                cancellationDetailContent.innerHTML = '';
                const url = `${API_BASE_URL}/api/details/cancellation_context/${contractId}/${encodeURIComponent(clientName)}?all=true`;
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar os detalhes.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    renderCancellationDetailTables(result);
                } catch (error) {
                    cancellationDetailErrorText.textContent = `Erro: ${error.message}.`;
                    cancellationDetailErrorDiv.classList.remove('hidden');
                } finally {
                    cancellationDetailLoading.classList.add('hidden');
                }
            }
            
            function renderCancellationDetailTables(data) {
                let html = '';
                html += '<h3 class="text-xl font-semibold text-gray-700 mb-2">Equipamento em Comodato</h3>';
                if (data.equipamentos && data.equipamentos.length > 0) {
                    html += `<div class="table-wrapper mb-6"><table class="min-w-full divide-y divide-gray-200"><thead><tr><th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">Equipamento</th><th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">Status</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">${data.equipamentos.map(row => `<tr><td class="py-2 px-3 text-sm text-gray-800" title="${row.Descricao_produto}">${row.Descricao_produto || 'N/A'}</td><td class="py-2 px-3 text-sm text-gray-800">${row.Status_comodato || 'N/A'}</td></tr>`).join('')}</tbody></table></div>`;
                } else { html += '<p class="text-center text-gray-500 p-4 mb-4">Nenhum equipamento em comodato encontrado.</p>'; }
                html += '<h3 class="text-xl font-semibold text-gray-700 mb-2">Ordens de Serviço</h3>';
                if (data.os && data.os.length > 0) {
                    const os_columns = [ { header: 'Abertura', key: 'Abertura', isDate: true }, { header: 'Fechamento', key: 'Fechamento', isDate: true }, { header: 'SLA', key: 'SLA' }, { header: 'Assunto', key: 'Assunto' }, { header: 'Mensagem', key: 'Mensagem' } ];
                    html += `<div class="table-wrapper mb-6"><table class="min-w-full divide-y divide-gray-200"><thead><tr>${os_columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead><tbody class="bg-white divide-y divide-gray-200">${data.os.map(row => `<tr>${os_columns.map(c => `<td class="py-2 px-3 text-sm text-gray-800" title="${row[c.key]}">${c.isDate ? formatDate(row[c.key]) : (row[c.key] || 'N/A')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
                } else { html += '<p class="text-center text-gray-500 p-4">Nenhuma Ordem de Serviço encontrada.</p>'; }
                html += '<h3 class="text-xl font-semibold text-gray-700 mb-2 mt-6">Atendimentos</h3>';
                if (data.atendimentos && data.atendimentos.length > 0) {
                    const atendimentos_columns = [ { header: 'Criado em', key: 'Criado_em', isDate: true }, { header: 'Última Alteração', key: 'ltima_altera_o', isDate: true }, { header: 'Assunto', key: 'Assunto' }, { header: 'Status', key: 'Novo_status' } ];
                    html += `<div class="table-wrapper"><table class="min-w-full divide-y divide-gray-200"><thead><tr>${atendimentos_columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead><tbody class="bg-white divide-y divide-gray-200">${data.atendimentos.map(row => `<tr>${atendimentos_columns.map(c => `<td class="py-2 px-3 text-sm text-gray-800" title="${row[c.key]}">${c.isDate ? formatDate(row[c.key]) : (row[c.key] || 'N/A')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
                } else { html += '<p class="text-center text-gray-500 p-4">Nenhum Atendimento encontrado.</p>'; }
                cancellationDetailContent.innerHTML = html;
            }
            
            // --- Funções do Modal de Vendedores ---

            function openSellerDetailModal(sellerId, sellerName, type, year, month) {
                sellerDetailState = { ...sellerDetailState, currentPage: 1, currentSellerId: sellerId, currentSellerName: sellerName, currentType: type, currentYear: year, currentMonth: month };
                const typeText = type === 'cancelado' ? 'Cancelados' : 'Negativados';
                sellerDetailModalTitle.textContent = `Clientes ${typeText} de ${sellerName || 'Vendedor Não Identificado'}`;
                sellerDetailModal.classList.add('show');
                fetchAndDisplaySellerDetails(1);
            }

            async function fetchAndDisplaySellerDetails(page) {
                sellerDetailState.currentPage = page;
                const { currentSellerId, currentType, currentYear, currentMonth, rowsPerPage } = sellerDetailState;
                const offset = (page - 1) * rowsPerPage;

                sellerDetailLoading.classList.remove('hidden');
                sellerDetailErrorDiv.classList.add('hidden');
                sellerDetailContent.innerHTML = '';
                sellerDetailPaginationControls.classList.add('hidden');

                const params = new URLSearchParams({ seller_id: currentSellerId, type: currentType, year: currentYear, month: currentMonth, limit: rowsPerPage, offset: offset });
                const url = `${API_BASE_URL}/api/details/seller_clients?${params.toString()}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar os detalhes.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    sellerDetailState.totalRows = result.total_rows;
                    renderSellerDetailTable(result.data);
                    renderSellerDetailPagination();
                } catch (error) {
                    sellerDetailErrorText.textContent = `Erro: ${error.message}.`;
                    sellerDetailErrorDiv.classList.remove('hidden');
                } finally {
                    sellerDetailLoading.classList.add('hidden');
                }
            }

            function renderSellerDetailTable(data) {
                if (!data || data.length === 0) {
                    sellerDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p>';
                    return;
                }
                const columns = [
                    { header: 'Cliente', render: r => `<span class="client-history-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
                    { header: 'Contrato ID', key: 'Contrato_ID' }, { header: 'Data Ativação', key: 'data_ativa_o', isDate: true },
                    { header: 'Data Final', key: 'end_date', isDate: true },
                    { header: 'Permanência (Dias)', key: 'permanencia_dias' }, { header: 'Permanência (Meses)', key: 'permanencia_meses' }
                ];
                const tableHtml = `
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead><tr>${columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${data.map(row => `<tr>${columns.map(c => {
                                let value;
                                if (c.render) {
                                    value = c.render(row);
                                } else {
                                    value = row[c.key] ?? 'N/A';
                                }

                                if (c.isDate) value = formatDate(row[c.key]);
                                if (c.key === 'permanencia_dias' && typeof value === 'number') value = Math.round(value);
                                
                                return `<td class="py-2 px-3 text-sm text-gray-800" title="${row[c.key] || ''}">${value}</td>`
                            }).join('')}</tr>`).join('')}
                        </tbody>
                    </table>`;
                sellerDetailContent.innerHTML = tableHtml;
            }
            
            function renderSellerDetailPagination() {
                const { currentPage, rowsPerPage, totalRows } = sellerDetailState;
                const totalPages = Math.ceil(totalRows / rowsPerPage);
                if (totalPages <= 1) { sellerDetailPaginationControls.classList.add('hidden'); return; }
                sellerDetailPageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
                sellerDetailPrevPageBtn.disabled = currentPage === 1;
                sellerDetailNextPageBtn.disabled = currentPage >= totalPages;
                sellerDetailPaginationControls.classList.remove('hidden');
            }
            
            // --- Funções do Modal de Cidade ---
            function openCityDetailModal(city, type, year, month) {
                cityDetailState = { ...cityDetailState, currentPage: 1, currentCity: city, currentType: type, currentYear: year, currentMonth: month };
                const typeText = type === 'cancelado' ? 'Cancelados' : 'Negativados';
                cityDetailModalTitle.textContent = `Clientes ${typeText} de ${city}`;
                cityDetailModal.classList.add('show');
                fetchAndDisplayCityDetails(1);
            }

            async function fetchAndDisplayCityDetails(page) {
                cityDetailState.currentPage = page;
                const { currentCity, currentType, rowsPerPage, currentYear, currentMonth } = cityDetailState;
                const offset = (page - 1) * rowsPerPage;

                cityDetailLoading.classList.remove('hidden');
                cityDetailErrorDiv.classList.add('hidden');
                cityDetailContent.innerHTML = '';
                cityDetailPaginationControls.classList.add('hidden');

                const params = new URLSearchParams({ city: currentCity, type: currentType, limit: rowsPerPage, offset: offset });
                if (currentYear) params.append('year', currentYear);
                if (currentMonth) params.append('month', currentMonth);
                const url = `${API_BASE_URL}/api/details/city_clients?${params.toString()}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar os detalhes.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    cityDetailState.totalRows = result.total_rows;
                    renderCityDetailTable(result.data);
                    renderCityDetailPagination();
                } catch (error) {
                    cityDetailErrorText.textContent = `Erro: ${error.message}.`;
                    cityDetailErrorDiv.classList.remove('hidden');
                } finally {
                    cityDetailLoading.classList.add('hidden');
                }
            }
            
            function renderCityDetailTable(data) {
                 if (!data || data.length === 0) {
                    cityDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p>';
                    return;
                }
                const columns = [
                    { header: 'Cliente', render: r => `<span class="client-history-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
                    { header: 'Contrato ID', key: 'Contrato_ID' }, { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
                    { header: 'Data Final', key: 'end_date', isDate: true },
                    { header: 'Permanência (Dias)', key: 'permanencia_dias' }, { header: 'Permanência (Meses)', key: 'permanencia_meses' }
                ];
                 const tableHtml = `
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead><tr>${columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${data.map(row => `<tr>${columns.map(c => {
                                let value;
                                if (c.render) {
                                    value = c.render(row);
                                } else {
                                    value = row[c.key] ?? 'N/A';
                                }
                                if (c.isDate) value = formatDate(row[c.key]);
                                if (c.key === 'permanencia_dias' && typeof value === 'number') value = Math.round(value);
                                return `<td class="py-2 px-3 text-sm text-gray-800" title="${row[c.key] || ''}">${value}</td>`;
                            }).join('')}</tr>`).join('')}
                        </tbody>
                    </table>`;
                cityDetailContent.innerHTML = tableHtml;
            }

            function renderCityDetailPagination() {
                const { currentPage, rowsPerPage, totalRows } = cityDetailState;
                const totalPages = Math.ceil(totalRows / rowsPerPage);
                if (totalPages <= 1) { cityDetailPaginationControls.classList.add('hidden'); return; }
                cityDetailPageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
                cityDetailPrevPageBtn.disabled = currentPage === 1;
                cityDetailNextPageBtn.disabled = currentPage >= totalPages;
                cityDetailPaginationControls.classList.remove('hidden');
            }

            // --- Funções do Modal de Bairro ---
            function openNeighborhoodDetailModal(city, neighborhood, type, year, month) {
                neighborhoodDetailState = { ...neighborhoodDetailState, currentPage: 1, currentCity: city, currentNeighborhood: neighborhood, currentType: type, currentYear: year, currentMonth: month };
                const typeText = type === 'cancelado' ? 'Cancelados' : 'Negativados';
                neighborhoodDetailModalTitle.textContent = `Clientes ${typeText} de ${neighborhood} (${city})`;
                neighborhoodDetailModal.classList.add('show');
                fetchAndDisplayNeighborhoodDetails(1);
            }

            async function fetchAndDisplayNeighborhoodDetails(page) {
                neighborhoodDetailState.currentPage = page;
                const { currentCity, currentNeighborhood, currentType, rowsPerPage, currentYear, currentMonth } = neighborhoodDetailState;
                const offset = (page - 1) * rowsPerPage;

                neighborhoodDetailLoading.classList.remove('hidden');
                neighborhoodDetailErrorDiv.classList.add('hidden');
                neighborhoodDetailContent.innerHTML = '';
                neighborhoodDetailPaginationControls.classList.add('hidden');

                const params = new URLSearchParams({ city: currentCity, neighborhood: currentNeighborhood, type: currentType, limit: rowsPerPage, offset: offset });
                if (currentYear) params.append('year', currentYear);
                if (currentMonth) params.append('month', currentMonth);
                const url = `${API_BASE_URL}/api/details/neighborhood_clients?${params.toString()}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar os detalhes.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    neighborhoodDetailState.totalRows = result.total_rows;
                    renderNeighborhoodDetailTable(result.data);
                    renderNeighborhoodDetailPagination();
                } catch (error) {
                    neighborhoodDetailErrorText.textContent = `Erro: ${error.message}.`;
                    neighborhoodDetailErrorDiv.classList.remove('hidden');
                } finally {
                    neighborhoodDetailLoading.classList.add('hidden');
                }
            }

            /**
            * ATUALIZADO: Corrige a exibição das colunas para ser consistente com outros modais.
            */
            function renderNeighborhoodDetailTable(data) {
                if (!data || data.length === 0) {
                    neighborhoodDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p>';
                    return;
                }
                const columns = [
                    { header: 'Cliente', render: r => `<span class="client-history-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
                    { header: 'Contrato ID', key: 'Contrato_ID' },
                    { header: 'Data Ativação', key: 'Data_ativa_o', isDate: true },
                    { header: 'Data Final', key: 'end_date', isDate: true },
                    { header: 'Permanência (Dias)', key: 'permanencia_dias' },
                    { header: 'Permanência (Meses)', key: 'permanencia_meses' }
                ];
                const tableHtml = `
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead><tr>${columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${data.map(row => `<tr>${columns.map(c => {
                                let value;
                                if (c.render) { 
                                    value = c.render(row); 
                                } else { 
                                    value = row[c.key] ?? 'N/A'; 
                                }
                                if (c.isDate) value = formatDate(row[c.key]);
                                if (c.key === 'permanencia_dias' && typeof row[c.key] === 'number') value = Math.round(row[c.key]);
                                return `<td class="py-2 px-3 text-sm text-gray-800" title="${row[c.key] || ''}">${value}</td>`;
                            }).join('')}</tr>`).join('')}
                        </tbody>
                    </table>`;
                neighborhoodDetailContent.innerHTML = tableHtml;
            }

            function renderNeighborhoodDetailPagination() {
                const { currentPage, rowsPerPage, totalRows } = neighborhoodDetailState;
                const totalPages = Math.ceil(totalRows / rowsPerPage);
                if (totalPages <= 1) { neighborhoodDetailPaginationControls.classList.add('hidden'); return; }
                neighborhoodDetailPageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
                neighborhoodDetailPrevPageBtn.disabled = currentPage === 1;
                neighborhoodDetailNextPageBtn.disabled = currentPage >= totalPages;
                neighborhoodDetailPaginationControls.classList.remove('hidden');
            }

            // --- Funções do Modal de Equipamento ---
            function openEquipmentDetailModal(equipmentName, year, month) {
                equipmentDetailState = { ...equipmentDetailState, currentPage: 1, currentEquipment: equipmentName, currentYear: year, currentMonth: month };
                equipmentDetailModalTitle.textContent = `Clientes com ${equipmentName}`;
                equipmentDetailModal.classList.add('show');
                fetchAndDisplayEquipmentDetails(1);
            }

            async function fetchAndDisplayEquipmentDetails(page) {
                equipmentDetailState.currentPage = page;
                const { currentEquipment, currentYear, currentMonth, rowsPerPage } = equipmentDetailState;
                const offset = (page - 1) * rowsPerPage;

                equipmentDetailLoading.classList.remove('hidden');
                equipmentDetailErrorDiv.classList.add('hidden');
                equipmentDetailContent.innerHTML = '';
                equipmentDetailPaginationControls.classList.add('hidden');

                const params = new URLSearchParams({ equipment_name: currentEquipment, year: currentYear, month: currentMonth, limit: rowsPerPage, offset: offset });
                const url = `${API_BASE_URL}/api/details/equipment_clients?${params.toString()}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        const errorMessage = await handleFetchError(response, 'Não foi possível carregar os detalhes.');
                        throw new Error(errorMessage);
                    }
                    const result = await response.json();
                    equipmentDetailState.totalRows = result.total_rows;
                    renderEquipmentDetailTable(result.data);
                    renderEquipmentDetailPagination();
                } catch (error) {
                    equipmentDetailErrorText.textContent = `Erro: ${error.message}.`;
                    equipmentDetailErrorDiv.classList.remove('hidden');
                } finally {
                    equipmentDetailLoading.classList.add('hidden');
                }
            }

            function renderEquipmentDetailTable(data) {
                if (!data || data.length === 0) {
                    equipmentDetailContent.innerHTML = '<p class="text-center text-gray-500 p-4">Nenhum cliente encontrado.</p>';
                    return;
                }
                 const columns = [
                    { header: 'Cliente', render: r => `<span class="client-history-trigger cursor-pointer text-blue-600 hover:underline" data-client-name="${r.Cliente.replace(/"/g, '&quot;')}" data-contract-id="${r.Contrato_ID}">${r.Cliente}</span>` },
                    { header: 'Contrato ID', key: 'Contrato_ID' },
                    { header: 'Data Cancelamento', key: 'Data_cancelamento', isDate: true },
                    { header: 'Cidade', key: 'Cidade' }
                ];
                const tableHtml = `
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead><tr>${columns.map(c => `<th class="py-2 px-3 text-left text-xs font-semibold text-gray-600">${c.header}</th>`).join('')}</tr></thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${data.map(row => `<tr>${columns.map(c => {
                                let value = c.render ? c.render(row) : (row[c.key] ?? 'N/A');
                                if (c.isDate) value = formatDate(row[c.key]);
                                return `<td class="py-2 px-3 text-sm text-gray-800" title="${row[c.key] || ''}">${value}</td>`;
                            }).join('')}</tr>`).join('')}
                        </tbody>
                    </table>`;
                equipmentDetailContent.innerHTML = tableHtml;
            }

             function renderEquipmentDetailPagination() {
                const { currentPage, rowsPerPage, totalRows } = equipmentDetailState;
                const totalPages = Math.ceil(totalRows / rowsPerPage);
                if (totalPages <= 1) { equipmentDetailPaginationControls.classList.add('hidden'); return; }
                equipmentDetailPageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
                equipmentDetailPrevPageBtn.disabled = currentPage === 1;
                equipmentDetailNextPageBtn.disabled = currentPage >= totalPages;
                equipmentDetailPaginationControls.classList.remove('hidden');
            }


            // --- EVENT LISTENERS ---
            /**
             * ATUALIZADO: Agora carrega o dashboard padrão de 'Clientes' ao iniciar.
             */
            document.addEventListener('DOMContentLoaded', () => {
                initializeGridStack();
                const defaultButton = document.getElementById('btnClientes');
                if (defaultButton) {
                    setActiveControl(defaultButton);
                    fetchAndRenderMainAnalysis('Clientes');
                }
            });

            saveLayoutBtn.addEventListener('click', saveLayout);

            document.querySelector('.collection-selector').addEventListener('click', e => {
                if (e.target.tagName === 'BUTTON' && e.target.id !== 'saveLayoutBtn') {
                     resetAllFilters();
                     setActiveControl(e.target);
                     customAnalysisSelector.value = "";
                     hideAllCustomFilters();
                     fetchAndRenderMainAnalysis(e.target.textContent);
                }
            });

            customAnalysisSelector.addEventListener('change', () => {
                const selectedValue = customAnalysisSelector.value;
                if (!selectedValue) return;
                
                gridStack.removeAll(); 
                destroyAllMainCharts();
                resetAllFilters();
                setActiveControl(customAnalysisSelector);
                mainChartsArea.classList.add('hidden');
                viewTableBtn.classList.add('hidden');
                
                handleCustomAnalysisFilterChange();
            });
            
            function handleCustomAnalysisFilterChange() {
                const selectedAnalysis = customAnalysisSelector.value;
                if (!selectedAnalysis) return;
                
                const searchTerm = clientSearchInput.value;
                
                hideAllCustomFilters();

                switch (selectedAnalysis) {
                    case 'atrasos_e_nao_pagos':
                        customSearchFilterDiv.classList.remove('hidden');
                        fetchAndRenderLatePaymentsAnalysis(searchTerm, 1);
                        break;
                    case 'saude_financeira_contrato_atraso':
                    case 'saude_financeira_contrato_bloqueio':
                        customSearchFilterDiv.classList.remove('hidden');
                        financialHealthFiltersDiv.classList.remove('hidden');
                        populateContractStatusFilters();
                        const analysisType = selectedAnalysis.endsWith('_bloqueio') ? 'bloqueio' : 'atraso';
                        fetchAndRenderFinancialHealthAnalysis(searchTerm, analysisType, 1);
                        break;
                    case 'cancellations':
                        customSearchFilterDiv.classList.remove('hidden');
                        fetchAndRenderCancellationAnalysis(searchTerm, 1);
                        break;
                    case 'negativacao':
                        customSearchFilterDiv.classList.remove('hidden');
                        fetchAndRenderNegativacaoAnalysis(searchTerm, 1);
                        break;
                    case 'vendedores':
                        sellerAnalysisFiltersDiv.classList.remove('hidden');
                        const sellerYear = sellerYearFilter.value;
                        const sellerMonth = sellerMonthFilter.value;
                        fetchAndRenderSellerAnalysis(sellerYear, sellerMonth);
                        break;
                    case 'cancellations_by_city':
                        cityCancellationFiltersDiv.classList.remove('hidden');
                        const cityYear = cityCancellationYearFilter.value;
                        const cityMonth = cityCancellationMonthFilter.value;
                        fetchAndRenderCancellationsByCity(cityYear, cityMonth);
                        break;
                    case 'cancellations_by_neighborhood':
                        neighborhoodAnalysisFiltersDiv.classList.remove('hidden');
                        const selectedCity = neighborhoodAnalysisCityFilter.value;
                        const neighborhoodYear = neighborhoodAnalysisYearFilter.value;
                        const neighborhoodMonth = neighborhoodAnalysisMonthFilter.value;
                        fetchAndRenderCancellationsByNeighborhood(selectedCity, neighborhoodYear, neighborhoodMonth);
                        break;
                    case 'cancellations_by_equipment':
                        equipmentAnalysisFiltersDiv.classList.remove('hidden');
                        const equipmentYear = equipmentAnalysisYearFilter.value;
                        const equipmentMonth = equipmentAnalysisMonthFilter.value;
                        fetchAndRenderCancellationsByEquipment(equipmentYear, equipmentMonth);
                        break;
                    case 'equipment_by_olt':
                        fetchAndRenderEquipmentByOlt();
                        break;
                }
            }
            
            applyClientSearchBtn.addEventListener('click', handleCustomAnalysisFilterChange);
            clientSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleCustomAnalysisFilterChange(); });
            contractStatusFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            accessStatusFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            sellerYearFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            sellerMonthFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            cityCancellationYearFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            cityCancellationMonthFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            neighborhoodAnalysisCityFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            neighborhoodAnalysisYearFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            neighborhoodAnalysisMonthFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            equipmentAnalysisYearFilter.addEventListener('change', handleCustomAnalysisFilterChange);
            equipmentAnalysisMonthFilter.addEventListener('change', handleCustomAnalysisFilterChange);


            const handleFilterChange = () => {
                fetchAndRenderMainAnalysis(modalCurrentCollection, yearFilterSelect.value, monthFilterSelect.value, cityFilterSelect.value);
            };

            yearFilterSelect.addEventListener('change', handleFilterChange);
            monthFilterSelect.addEventListener('change', handleFilterChange);
            cityFilterSelect.addEventListener('change', handleFilterChange);
            
            viewTableBtn.addEventListener('click', () => openModal(modalCurrentCollection));
            modalCloseButton.addEventListener('click', closeModal);
            modalPrevPageBtn.addEventListener('click', () => { if (modalCurrentPage > 1) fetchAndDisplayTableInModal(modalCurrentCollection, modalCurrentPage - 1) });
            modalNextPageBtn.addEventListener('click', () => { if (modalCurrentPage < Math.ceil(modalTotalRows / modalRowsPerPage)) fetchAndDisplayTableInModal(modalCurrentCollection, modalCurrentPage + 1) });
            
            function goToCustomAnalysisPage(page) {
                const { currentAnalysis, currentSearchTerm, currentAnalysisType } = customAnalysisState;
                if (currentAnalysis === 'atrasos_e_nao_pagos') fetchAndRenderLatePaymentsAnalysis(currentSearchTerm, page);
                else if (currentAnalysis === 'saude_financeira') fetchAndRenderFinancialHealthAnalysis(currentSearchTerm, currentAnalysisType, page);
                else if (currentAnalysis === 'cancellations') fetchAndRenderCancellationAnalysis(currentSearchTerm, page);
                else if (currentAnalysis === 'negativacao') fetchAndRenderNegativacaoAnalysis(currentSearchTerm, page);
            }

            document.body.addEventListener('click', e => {
                const detailTrigger = e.target.closest('.detail-trigger');
                if (detailTrigger) {
                    const { type, contractId, clientName } = detailTrigger.dataset;
                    openDetailsModal(type, contractId, clientName);
                    return;
                }
                const invoiceTrigger = e.target.closest('.invoice-detail-trigger');
                if (invoiceTrigger) {
                    const { type, contractId, clientName } = invoiceTrigger.dataset;
                    openInvoiceDetailModal(contractId, clientName, type);
                    return;
                }
                const cancellationTrigger = e.target.closest('.cancellation-detail-trigger');
                if (cancellationTrigger) {
                    const { clientName, contractId } = cancellationTrigger.dataset;
                    openCancellationDetailModal(clientName, contractId);
                    return;
                }
                const prevBtn = e.target.closest('#customPrevPageBtn');
                if (prevBtn) {
                    goToCustomAnalysisPage(customAnalysisState.currentPage - 1);
                    return;
                }
                const nextBtn = e.target.closest('#customNextPageBtn');
                if (nextBtn) {
                    goToCustomAnalysisPage(customAnalysisState.currentPage + 1);
                    return;
                }
                const sellerTrigger = e.target.closest('.seller-detail-trigger');
                if (sellerTrigger) {
                    const { sellerId, sellerName, type } = sellerTrigger.dataset;
                    const year = sellerYearFilter.value;
                    const month = sellerMonthFilter.value;
                    openSellerDetailModal(sellerId, sellerName, type, year, month);
                    return;
                }
                const clientHistoryTrigger = e.target.closest('.client-history-trigger');
                if(clientHistoryTrigger) {
                    const { clientName, contractId } = clientHistoryTrigger.dataset;
                    openCancellationDetailModal(clientName, contractId, true);
                    return;
                }
                 const detailTabButton = e.target.closest('.prev-page-btn, .next-page-btn');
                 if (detailTabButton && detailsModal.classList.contains('show')) {
                     fetchAndRenderTabData(detailTabButton.dataset.tab, parseInt(detailTabButton.dataset.page));
                     return;
                 }
            });

            detailsModalCloseButton.addEventListener('click', closeDetailsModal);
            detailsModalTabs.addEventListener('click', e => {
                e.preventDefault();
                const tabLink = e.target.closest('.tab-link');
                if (tabLink) setActiveTab(tabLink.dataset.tab);
            });
            
            invoiceDetailCloseButton.addEventListener('click', closeInvoiceDetailModal);
            invoiceDetailPrevPageBtn.addEventListener('click', () => { if (invoiceDetailCurrentPage > 1) fetchAndDisplayInvoiceDetails(invoiceDetailCurrentPage - 1); });
            invoiceDetailNextPageBtn.addEventListener('click', () => { if (invoiceDetailCurrentPage < Math.ceil(invoiceDetailTotalRows / invoiceDetailRowsPerPage)) fetchAndDisplayInvoiceDetails(invoiceDetailCurrentPage + 1); });
            
            cancellationDetailCloseButton.addEventListener('click', closeCancellationDetailModal);
            
            sellerDetailCloseButton.addEventListener('click', () => sellerDetailModal.classList.remove('show'));
            sellerDetailPrevPageBtn.addEventListener('click', () => { if (sellerDetailState.currentPage > 1) fetchAndDisplaySellerDetails(sellerDetailState.currentPage - 1); });
            sellerDetailNextPageBtn.addEventListener('click', () => { if (sellerDetailState.currentPage < Math.ceil(sellerDetailState.totalRows / sellerDetailState.rowsPerPage)) fetchAndDisplaySellerDetails(sellerDetailState.currentPage + 1); });
            
            cityDetailCloseButton.addEventListener('click', () => cityDetailModal.classList.remove('show'));
            cityDetailPrevPageBtn.addEventListener('click', () => { if (cityDetailState.currentPage > 1) fetchAndDisplayCityDetails(cityDetailState.currentPage - 1); });
            cityDetailNextPageBtn.addEventListener('click', () => { if (cityDetailState.currentPage < Math.ceil(cityDetailState.totalRows / cityDetailState.rowsPerPage)) fetchAndDisplayCityDetails(cityDetailState.currentPage + 1); });

            neighborhoodDetailCloseButton.addEventListener('click', () => neighborhoodDetailModal.classList.remove('show'));
            neighborhoodDetailPrevPageBtn.addEventListener('click', () => { if (neighborhoodDetailState.currentPage > 1) fetchAndDisplayNeighborhoodDetails(neighborhoodDetailState.currentPage - 1); });
            neighborhoodDetailNextPageBtn.addEventListener('click', () => { if (neighborhoodDetailState.currentPage < Math.ceil(neighborhoodDetailState.totalRows / neighborhoodDetailState.rowsPerPage)) fetchAndDisplayNeighborhoodDetails(neighborhoodDetailState.currentPage + 1); });

            equipmentDetailCloseButton.addEventListener('click', () => equipmentDetailModal.classList.remove('show'));
            equipmentDetailPrevPageBtn.addEventListener('click', () => { if (equipmentDetailState.currentPage > 1) fetchAndDisplayEquipmentDetails(equipmentDetailState.currentPage - 1); });
            equipmentDetailNextPageBtn.addEventListener('click', () => { if (equipmentDetailState.currentPage < Math.ceil(equipmentDetailState.totalRows / equipmentDetailState.rowsPerPage)) fetchAndDisplayEquipmentDetails(equipmentDetailState.currentPage + 1); });

            dashboardContentWrapper.addEventListener('change', e => {
                if (e.target.type === 'radio' && e.target.name.startsWith('chart')) {
                    renderChartsForCurrentCollection();
                }
            });

        })(); 