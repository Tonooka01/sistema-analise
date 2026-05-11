/**
 * collections/contasReceber.js
 * Gráficos da coleção Contas a Receber.
 */
import { addAndRenderChartWidget } from '../charts.js';
import { API_BASE_URL } from '../state.js';

const _datalabelsStacked = {
    display: (context) => {
        const datasets = context.chart.data.datasets;
        let lastVisible = -1;
        for (let i = datasets.length - 1; i >= 0; i--) {
            if (context.chart.isDatasetVisible(i)) { lastVisible = i; break; }
        }
        return context.datasetIndex === lastVisible && context.dataset.data[context.dataIndex] > 0;
    },
    formatter: (value, context) => {
        let total = 0;
        context.chart.data.datasets.forEach((ds, idx) => {
            if (context.chart.isDatasetVisible(idx)) total += ds.data[context.dataIndex] || 0;
        });
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(total);
    },
    color: '#374151', anchor: 'end', align: 'end', offset: -5, font: { weight: 'bold', size: 10 }
};

const _statusColors = { 'Recebido': '#48bb78', 'Aberto': '#f59e0b', 'Cancelado': '#6b7280', 'A receber': '#f59e0b' };

function _buildStackedDatasets(rawData, labels, statusKey, labelKey) {
    const statuses = [...new Set(rawData.map(i => i[statusKey]))];
    return statuses.map(status => ({
        label: status,
        data: labels.map(label => rawData.find(d => d[labelKey] === label && d[statusKey] === status)?.Total_Value || 0),
        backgroundColor: _statusColors[status] || '#94a3b8'
    }));
}

export function renderContasReceberCharts(data, filterText, monthNames) {
    if (data.status_summary && data.status_summary.length > 0) {
        addAndRenderChartWidget(
            'mainChart1', 'doughnut',
            data.status_summary.map(i => i.Status),
            [{ data: data.status_summary.map(i => i.Count) }],
            `Contas por Status ${filterText}`,
            { formatterType: 'number' },
            [{ value: 'doughnut', label: 'Rosca', checked: true }, { value: 'bar_vertical', label: 'Barra V' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
        addAndRenderChartWidget(
            'mainChart2', 'bar_vertical',
            data.status_summary.map(i => i.Status),
            [{ data: data.status_summary.map(i => i.Total_Value) }],
            `Valor Total por Status ${filterText}`,
            {},
            [{ value: 'bar_vertical', label: 'Barra V', checked: true }, { value: 'doughnut', label: 'Rosca' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    } else console.warn("Dados 'status_summary' ausentes para Contas a Receber.");

    if (data.yoy_summary && data.yoy_summary.length > 0) {
        addAndRenderChartWidget(
            'mainChart3', 'line',
            data.yoy_summary.map(i => i.Year),
            [{ data: data.yoy_summary.map(i => i.Total_Count) }],
            'Evolução Anual de Contas',
            { formatterType: 'number' },
            [{ value: 'line', label: 'Linha', checked: true }, { value: 'bar_vertical', label: 'Barra V' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }

    if (data.mom_summary && data.mom_summary.length > 0) {
        const sorted = [...data.mom_summary].sort((a, b) => parseInt(a.Month) - parseInt(b.Month));
        addAndRenderChartWidget(
            'mainChart4', 'line',
            sorted.map(i => monthNames[parseInt(i.Month) - 1]),
            [{ data: sorted.map(i => i.Total_Count) }],
            `Evolução Mensal ${filterText}`,
            { formatterType: 'number' },
            [{ value: 'line', label: 'Linha', checked: true }, { value: 'bar_vertical', label: 'Barra V' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }

    if (data.last_3_months_stacked && data.last_3_months_stacked.length > 0) {
        const labels = [...new Set(data.last_3_months_stacked.map(i => i.Month))].sort();
        addAndRenderChartWidget(
            'mainChart5', 'bar_vertical', labels,
            _buildStackedDatasets(data.last_3_months_stacked, labels, 'Status', 'Month'),
            'Contas a Receber (Últimos 3 Meses - Todos)',
            { scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { datalabels: _datalabelsStacked } },
            [{ value: 'bar_vertical', label: 'Barra V', checked: true }, { value: 'line', label: 'Linha' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }

    if (data.last_3_months_active_clients && data.last_3_months_active_clients.length > 0) {
        const labels = [...new Set(data.last_3_months_active_clients.map(i => i.Month))].sort();
        addAndRenderChartWidget(
            'mainChart6', 'bar_vertical', labels,
            _buildStackedDatasets(data.last_3_months_active_clients, labels, 'Status', 'Month'),
            'Contas a Receber (Últimos 3 Meses - Ativos)',
            { scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { datalabels: _datalabelsStacked } },
            [{ value: 'bar_vertical', label: 'Barra V', checked: true }, { value: 'line', label: 'Linha' }, { value: 'bar_horizontal', label: 'Barra H' }]
        );
    }

    // Gráfico por dia de vencimento fixo (fetch separado)
    fetch(`${API_BASE_URL}/api/finance_summary/by_due_date`)
        .then(res => { if (!res.ok) throw new Error('Falha ao buscar dados por vencimento.'); return res.json(); })
        .then(dueDateData => {
            if (!dueDateData || dueDateData.length === 0) return;
            const labelsDue = [...new Set(dueDateData.map(i => i.Due_Day))].sort((a, b) => parseInt(a) - parseInt(b)).map(String);
            const monthsDue = [...new Set(dueDateData.map(i => i.Month))].sort();
            const colors = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899'];
            const datasets = monthsDue.map((month, idx) => ({
                label: month,
                data: labelsDue.map(day => dueDateData.find(d => d.Month === month && String(d.Due_Day) === day)?.Total_Value || 0),
                backgroundColor: colors[idx % colors.length]
            }));
            addAndRenderChartWidget(
                'mainChart7', 'bar_vertical', labelsDue, datasets,
                'Comparativo de Faturamento por Dia de Vencimento (Fixo)',
                { scales: { y: { beginAtZero: true } } },
                [{ value: 'bar_vertical', label: 'Barra V', checked: true }, { value: 'bar_horizontal', label: 'Barra H' }]
            );
        })
        .catch(err => console.error("Erro ao buscar gráfico por vencimento:", err));
}
