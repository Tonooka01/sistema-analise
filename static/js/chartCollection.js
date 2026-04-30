import * as state from './state.js';
import { addAndRenderChartWidget } from './charts.js'; // Importa a função específica do charts.js
import { API_BASE_URL } from './state.js'; // Importa a constante API_BASE_URL

/**
 * Função central que decide quais gráficos renderizar com base na coleção selecionada.
 */
export function renderChartsForCurrentCollection() {
    // A destruição e limpeza do grid agora são chamadas antes desta função,
    // por exemplo, em analysis.js ou events.js

    const data = state.getGlobalCurrentAnalysisData();
    if (!data) {
        console.warn("Nenhum dado de análise global encontrado para renderizar gráficos.");
        return;
    }

    // Obtém o estado atual necessário
    const currentCollection = state.getModalCurrentCollection();
    const currentYear = state.getCurrentSelectedYear();
    const currentMonth = state.getCurrentSelectedMonth();
    const currentCity = state.getCurrentSelectedCity();
    const grid = state.getGridStack(); // Pega a instância do GridStack

    // Verifica se o GridStack foi inicializado
    if (!grid) {
        console.error("GridStack não inicializado. Não é possível adicionar widgets.");
        return;
    }

    const filterText = `(${currentYear || 'Todos'}${currentMonth ? '/' + currentMonth : ''})`;
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    // --- Lógica de Gráficos por Coleção ---

    if (currentCollection === 'Clientes') {
        if (data.by_city && data.by_city.length > 0) {
            addAndRenderChartWidget(
                'mainChart1',
                'doughnut',
                data.by_city.map(i => i.Cidade || 'N/A'),
                [{ data: data.by_city.map(i => i.Count) }],
                'Top 20 Cidades por Cliente',
                { formatterType: 'number' },
                [
                    {value: 'doughnut', label: 'Rosca', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'by_city' ausentes ou vazios para a coleção Clientes.");
        }

        if (data.by_neighborhood && data.by_neighborhood.length > 0) {
            addAndRenderChartWidget(
                'mainChart2',
                'bar_horizontal',
                data.by_neighborhood.map(i => i.Bairro || 'N/A'),
                [{ data: data.by_neighborhood.map(i => i.Count) }],
                'Top 20 Bairros por Cliente',
                { formatterType: 'number' },
                [
                    {value: 'bar_horizontal', label: 'Barra H', checked: true},
                    {value: 'doughnut', label: 'Rosca'},
                    {value: 'bar_vertical', label: 'Barra V'}
                ]
            );
        } else {
             console.warn("Dados 'by_neighborhood' ausentes ou vazios para a coleção Clientes.");
        }
    } // Fim do if (currentCollection === 'Clientes')

    else if (currentCollection === 'Contratos') {
        if (data.by_status && data.by_status.length > 0) {
            addAndRenderChartWidget(
                'mainChart1',
                'doughnut',
                data.by_status.map(i => i.Status_contrato || 'N/A'),
                [{ data: data.by_status.map(i => i.Count) }],
                `Contratos por Status ${filterText}`,
                { formatterType: 'number' },
                [
                    {value: 'doughnut', label: 'Rosca', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'by_status' ausentes ou vazios para a coleção Contratos.");
        }

        if (data.by_access_status && data.by_access_status.length > 0) {
            addAndRenderChartWidget(
                'mainChart2',
                'doughnut',
                data.by_access_status.map(i => i.Status_acesso || 'N/A'),
                [{ data: data.by_access_status.map(i => i.Count) }],
                `Contratos por Status de Acesso ${filterText}`,
                { formatterType: 'number' },
                [
                    {value: 'doughnut', label: 'Rosca', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'by_access_status' ausentes ou vazios para a coleção Contratos.");
        }

        // Gráficos específicos da cidade se uma cidade for selecionada
        if (currentCity && data.by_status_by_city && data.by_access_status_by_city) {
            const cityStatusData = data.by_status_by_city.filter(item => item.Cidade === currentCity);
            const cityAccessStatusData = data.by_access_status_by_city.filter(item => item.Cidade === currentCity);

            if (cityStatusData.length > 0) {
                addAndRenderChartWidget(
                    'mainChart3',
                    'doughnut',
                    cityStatusData.map(d => d.Status_contrato),
                    [{ data: cityStatusData.map(d => d.Count) }],
                    `Status Contrato em ${currentCity} ${filterText}`,
                    { formatterType: 'number' },
                    [
                        {value: 'doughnut', label: 'Rosca', checked: true},
                        {value: 'bar_vertical', label: 'Barra V'},
                        {value: 'bar_horizontal', label: 'Barra H'}
                    ]
                );
            } else {
                 console.warn(`Dados 'by_status_by_city' ausentes ou vazios para a cidade ${currentCity}.`);
            }

            if (cityAccessStatusData.length > 0) {
                addAndRenderChartWidget(
                    'mainChart4',
                    'doughnut',
                    cityAccessStatusData.map(d => d.Status_acesso),
                    [{ data: cityAccessStatusData.map(d => d.Count) }],
                    `Status Acesso em ${currentCity} ${filterText}`,
                    { formatterType: 'number' },
                    [
                        {value: 'doughnut', label: 'Rosca', checked: true},
                        {value: 'bar_vertical', label: 'Barra V'},
                        {value: 'bar_horizontal', label: 'Barra H'}
                    ]
                );
            } else {
                 console.warn(`Dados 'by_access_status_by_city' ausentes ou vazios para a cidade ${currentCity}.`);
            }
        }
    } // Fim do else if (currentCollection === 'Contratos')

    else if (currentCollection === 'Contas a Receber') {
        if (data.status_summary && data.status_summary.length > 0) {
            addAndRenderChartWidget(
                'mainChart1',
                'doughnut',
                data.status_summary.map(i => i.Status),
                [{ data: data.status_summary.map(i => i.Count) }],
                `Contas por Status ${filterText}`,
                { formatterType: 'number' },
                [
                    {value: 'doughnut', label: 'Rosca', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );

            addAndRenderChartWidget(
                'mainChart2',
                'bar_vertical',
                data.status_summary.map(i => i.Status),
                [{ data: data.status_summary.map(i => i.Total_Value) }],
                `Valor Total por Status ${filterText}`,
                {}, // Opções padrão de formatação de moeda
                [
                    {value: 'bar_vertical', label: 'Barra V', checked: true},
                    {value: 'doughnut', label: 'Rosca'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'status_summary' ausentes ou vazios para Contas a Receber.");
        }

        if (data.yoy_summary && data.yoy_summary.length > 0) {
            addAndRenderChartWidget(
                'mainChart3',
                'line',
                data.yoy_summary.map(i => i.Year),
                [{ data: data.yoy_summary.map(i => i.Total_Count) }],
                'Evolução Anual de Contas',
                { formatterType: 'number' }, // Formata como número
                [
                    {value: 'line', label: 'Linha', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'yoy_summary' ausentes ou vazios para Contas a Receber.");
        }

        if (data.mom_summary && data.mom_summary.length > 0) {
            // Ordena por mês antes de renderizar
            const momDataSorted = [...data.mom_summary].sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
            addAndRenderChartWidget(
                'mainChart4',
                'line',
                 momDataSorted.map(i => monthNames[parseInt(i.Month) - 1]), // Usa nomes dos meses
                [{ data: momDataSorted.map(i => i.Total_Count) }],
                `Evolução Mensal ${filterText}`,
                { formatterType: 'number' }, // Formata como número
                [
                    {value: 'line', label: 'Linha', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'mom_summary' ausentes ou vazios para Contas a Receber.");
        }

        // --- Gráficos Empilhados (Últimos 3 Meses) ---
        const statusColorsStacked = {'Recebido': '#48bb78', 'Aberto': '#f59e0b', 'Cancelado': '#6b7280', 'A receber': '#f59e0b'}; // 'A receber' mapeado para Aberto

        const datalabelsStackedOptions = {
            display: function(context) {
                // Mostra o total apenas na última barra visível
                const datasets = context.chart.data.datasets;
                let lastVisibleDatasetIndex = -1;
                for (let i = datasets.length - 1; i >= 0; i--) {
                    if (context.chart.isDatasetVisible(i)) {
                        lastVisibleDatasetIndex = i;
                        break;
                    }
                }
                // Mostra apenas se o valor for maior que zero E for a última barra
                return context.datasetIndex === lastVisibleDatasetIndex && context.dataset.data[context.dataIndex] > 0;
            },
            formatter: function(value, context) {
                // Calcula o total da pilha
                let total = 0;
                context.chart.data.datasets.forEach((ds, index) => {
                    if (context.chart.isDatasetVisible(index)) {
                        total += ds.data[context.dataIndex] || 0;
                    }
                });
                // Formata como moeda BRL sem casas decimais
                return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(total);
            },
            color: '#374151', // Cor do texto do total
            anchor: 'end',
            align: 'end',
            offset: -5,
            font: {
                weight: 'bold',
                size: 10 // Tamanho menor para caber melhor
            }
        };

        // Gráfico 1: Todos os clientes (stacked)
        if (data.last_3_months_stacked && data.last_3_months_stacked.length > 0) {
            const stackedData = data.last_3_months_stacked;
            const labelsStacked = [...new Set(stackedData.map(item => item.Month))].sort();
            const statusesStacked = [...new Set(stackedData.map(item => item.Status))];
            const datasetsStacked = statusesStacked.map(status => ({
                label: status,
                data: labelsStacked.map(label => stackedData.find(d => d.Month === label && d.Status === status)?.Total_Value || 0),
                backgroundColor: statusColorsStacked[status] || `#${Math.floor(Math.random()*16777215).toString(16)}`
            }));
            addAndRenderChartWidget(
                'mainChart5',
                'bar_vertical',
                labelsStacked,
                datasetsStacked,
                'Contas a Receber (Últimos 3 Meses - Todos)',
                {
                    scales: { x: { stacked: true }, y: { stacked: true } },
                    plugins: { datalabels: datalabelsStackedOptions }
                },
                [
                    {value: 'bar_vertical', label: 'Barra V', checked: true},
                    {value: 'line', label: 'Linha'}, // Linha pode não fazer sentido empilhado
                    {value: 'bar_horizontal', label: 'Barra H'} // Horizontal empilhado
                ]
            );
        } else {
             console.warn("Dados 'last_3_months_stacked' ausentes ou vazios para Contas a Receber.");
        }

        // Gráfico 2: Apenas clientes ativos (stacked)
        if (data.last_3_months_active_clients && data.last_3_months_active_clients.length > 0) {
            const activeData = data.last_3_months_active_clients;
            // Usa as mesmas cores, mas filtra os status se necessário (ex: sem 'Cancelado')
            const labelsActive = [...new Set(activeData.map(item => item.Month))].sort();
            const statusesActive = [...new Set(activeData.map(item => item.Status))];
            const datasetsActive = statusesActive.map(status => ({
                label: status,
                data: labelsActive.map(label => activeData.find(d => d.Month === label && d.Status === status)?.Total_Value || 0),
                backgroundColor: statusColorsStacked[status] || `#${Math.floor(Math.random()*16777215).toString(16)}`
            }));
            addAndRenderChartWidget(
                'mainChart6',
                'bar_vertical',
                labelsActive,
                datasetsActive,
                'Contas a Receber (Últimos 3 Meses - Ativos)',
                 {
                    scales: { x: { stacked: true }, y: { stacked: true } },
                    plugins: { datalabels: datalabelsStackedOptions }
                },
                [
                    {value: 'bar_vertical', label: 'Barra V', checked: true},
                    {value: 'line', label: 'Linha'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'last_3_months_active_clients' ausentes ou vazios para Contas a Receber.");
        }

         // GRÁFICO RESTAURADO: Faturamento por Dia de Vencimento Fixo
         // Fetching os dados específicos para este gráfico dentro da lógica de 'Contas a Receber'
         fetch(`${API_BASE_URL}/api/finance_summary/by_due_date`)
            .then(res => {
                if (!res.ok) throw new Error('Falha ao buscar dados por dia de vencimento fixo.');
                return res.json();
            })
            .then(dueDateData => {
                if (dueDateData && dueDateData.length > 0) {
                    const labelsDue = [...new Set(dueDateData.map(item => item.Due_Day))].sort((a, b) => parseInt(a) - parseInt(b)).map(String); // Labels como string
                    const monthsDue = [...new Set(dueDateData.map(item => item.Month))].sort();
                    // Define mais cores se houver mais de 3 meses
                    const monthColors = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899'];
                    const datasetsDue = monthsDue.map((month, index) => ({
                        label: month,
                        data: labelsDue.map(day => dueDateData.find(d => d.Month === month && String(d.Due_Day) === day)?.Total_Value || 0),
                        backgroundColor: monthColors[index % monthColors.length]
                    }));
                    addAndRenderChartWidget(
                        'mainChart7',
                        'bar_vertical',
                        labelsDue,
                        datasetsDue,
                        'Comparativo de Faturamento por Dia de Vencimento (Fixo)',
                        { scales: { y: { beginAtZero: true } } }, // Opções padrão de formatação de moeda
                        [
                            {value: 'bar_vertical', label: 'Barra V', checked: true},
                            // {value: 'doughnut', label: 'Rosca'}, // Rosca não faz muito sentido aqui
                            {value: 'bar_horizontal', label: 'Barra H'}
                        ]
                    );
                } else {
                     console.warn("Dados 'by_due_date' (fixo) ausentes ou vazios.");
                }
            })
            .catch(error => console.error("Erro ao buscar/renderizar gráfico por dia de vencimento fixo:", error));

    } // Fim do else if (currentCollection === 'Contas a Receber')

    else if (currentCollection === 'Atendimentos') {
        if (data.status_summary && data.status_summary.length > 0) {
            addAndRenderChartWidget(
                'mainChart1',
                'doughnut',
                data.status_summary.map(i => i.Status),
                [{ data: data.status_summary.map(i => i.Count) }],
                'Atendimentos por Status',
                { formatterType: 'number' },
                [
                    {value: 'doughnut', label: 'Rosca', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'status_summary' ausentes ou vazios para Atendimentos.");
        }

        if (data.subject_ranking && data.subject_ranking.length > 0) {
            addAndRenderChartWidget(
                'mainChart2',
                'bar_horizontal',
                data.subject_ranking.map(i => i.Assunto),
                [{ data: data.subject_ranking.map(i => i.Count) }],
                'Top 10 Assuntos Mais Comuns',
                { formatterType: 'number' },
                [
                    {value: 'bar_horizontal', label: 'Barra H', checked: true},
                    {value: 'doughnut', label: 'Rosca'},
                    {value: 'bar_vertical', label: 'Barra V'}
                ]
            );
        } else {
             console.warn("Dados 'subject_ranking' ausentes ou vazios para Atendimentos.");
        }

        if (data.yoy_summary && data.yoy_summary.length > 0) {
            addAndRenderChartWidget(
                'mainChart3',
                'line',
                data.yoy_summary.map(i => i.Year),
                [{ data: data.yoy_summary.map(i => i.Total_Count) }],
                'Evolução Anual de Atendimentos',
                { formatterType: 'number' },
                [
                    {value: 'line', label: 'Linha', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'yoy_summary' ausentes ou vazios para Atendimentos.");
        }

        if (data.mom_summary && data.mom_summary.length > 0) {
            // Ordena por mês
            const momDataSorted = [...data.mom_summary].sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
            addAndRenderChartWidget(
                'mainChart4',
                'line',
                 momDataSorted.map(i => monthNames[parseInt(i.Month) - 1]), // Nomes dos meses
                [{ data: momDataSorted.map(i => i.Total_Count) }],
                `Evolução Mensal ${filterText}`,
                { formatterType: 'number' },
                [
                    {value: 'line', label: 'Linha', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'mom_summary' ausentes ou vazios para Atendimentos.");
        }

        if (data.avg_resolution_time_by_subject && data.avg_resolution_time_by_subject.length > 0) {
            addAndRenderChartWidget(
                'mainChart5',
                'bar_vertical',
                data.avg_resolution_time_by_subject.map(i => i.Assunto),
                [{ data: data.avg_resolution_time_by_subject.map(i => i.Average_Resolution_Days) }],
                'Tempo Médio de Resolução por Assunto (dias)',
                { formatterType: 'days' }, // Formata como dias
                [
                    {value: 'bar_vertical', label: 'Barra V', checked: true},
                    {value: 'line', label: 'Linha'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'avg_resolution_time_by_subject' ausentes ou vazios para Atendimentos.");
        }
    } // Fim do else if (currentCollection === 'Atendimentos')

    else if (currentCollection === 'OS') {
        const { status_by_subject, mom_summary, avg_service_time_by_city } = data;

        if (status_by_subject && status_by_subject.length > 0) {
            const subjects = [...new Set(status_by_subject.map(item => item.Assunto))];
            const statuses = [...new Set(status_by_subject.map(item => item.Status))];
            // Define cores consistentes para os status
            const statusColorsOS = {'Pendente': '#f59e0b', 'Em Andamento': '#3b82f6', 'Solucionado': '#22c55e', 'Cancelado': '#6b7280'};
            const statusDatasets = statuses.map(status => ({
                label: status,
                data: subjects.map(subject => status_by_subject.find(s => s.Assunto === subject && s.Status === status)?.Count || 0),
                backgroundColor: statusColorsOS[status] || `#${Math.floor(Math.random()*16777215).toString(16)}`
            }));
            addAndRenderChartWidget(
                'mainChart6', // Usando ID diferente
                'bar_vertical',
                subjects,
                statusDatasets,
                'Status de OS por Assunto',
                { scales: { x: { stacked: true }, y: { stacked: true } }, formatterType: 'number' },
                [
                    {value: 'bar_vertical', label: 'Barra V', checked: true},
                    // {value: 'doughnut', label: 'Rosca'}, // Rosca não faz sentido empilhado
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'status_by_subject' ausentes ou vazios para OS.");
        }

        if (mom_summary && mom_summary.length > 0) {
            const momDataSorted = [...mom_summary].sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
            addAndRenderChartWidget(
                'mainChart4', // Reutilizando ID se apropriado ou use um novo
                'line',
                momDataSorted.map(i => monthNames[parseInt(i.Month) - 1]),
                [{ data: momDataSorted.map(i => i.Total_Count) }],
                `Evolução Mensal de OS ${filterText}`,
                { formatterType: 'number' },
                [
                    {value: 'line', label: 'Linha', checked: true},
                    {value: 'bar_vertical', label: 'Barra V'},
                    {value: 'bar_horizontal', label: 'Barra H'}
                ]
            );
        } else {
             console.warn("Dados 'mom_summary' ausentes ou vazios para OS.");
        }

        if (avg_service_time_by_city && avg_service_time_by_city.length > 0) {
            addAndRenderChartWidget(
                'mainChart7', // Usando ID diferente
                'bar_horizontal',
                avg_service_time_by_city.map(i => i.Cidade),
                [{ data: avg_service_time_by_city.map(i => i.Average_Service_Days) }],
                'Tempo Médio de Serviço por Cidade (dias)',
                { formatterType: 'days' },
                [
                    {value: 'bar_horizontal', label: 'Barra H', checked: true},
                    {value: 'line', label: 'Linha'},
                    {value: 'bar_vertical', label: 'Barra V'}
                ]
            );
        } else {
             console.warn("Dados 'avg_service_time_by_city' ausentes ou vazios para OS.");
        }
    } // Fim do else if (currentCollection === 'OS')

    else if (currentCollection === 'Logins') {
        if (data.by_transmitter && data.by_transmitter.length > 0) {
            addAndRenderChartWidget(
                'mainChart1',
                'bar_horizontal',
                data.by_transmitter.map(i => i.Transmissor),
                [{ data: data.by_transmitter.map(i => i.Count) }],
                'Logins Únicos por Transmissor',
                { formatterType: 'number' },
                [
                    {value: 'bar_horizontal', label: 'Barra H', checked: true},
                    {value: 'doughnut', label: 'Rosca'},
                    {value: 'bar_vertical', label: 'Barra V'}
                ]
            );
        } else {
            console.warn("Dados 'by_transmitter' ausentes ou vazios para Logins.");
        }

        if (data.by_plan && data.by_plan.length > 0) {
            addAndRenderChartWidget(
                'mainChart2',
                'bar_horizontal',
                data.by_plan.map(i => i.Contrato), // Assumindo que Contrato é o nome do plano
                [{ data: data.by_plan.map(i => i.Count) }],
                'Top 20 Planos por Nº de Logins',
                { formatterType: 'number' },
                [
                    {value: 'bar_horizontal', label: 'Barra H', checked: true},
                    {value: 'doughnut', label: 'Rosca'},
                    {value: 'bar_vertical', label: 'Barra V'}
                ]
            );
        } else {
            console.warn("Dados 'by_plan' ausentes ou vazios para Logins.");
        }
    } // Fim do else if (currentCollection === 'Logins')

    // Adicione mais blocos 'else if' para outras coleções se necessário

} // Fim da função renderChartsForCurrentCollection

