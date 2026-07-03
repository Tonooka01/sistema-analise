/**
 * crescimento.js
 * Crescimento Analítico: projeção + mapa de calor (MapLibre GL).
 */

import * as state from './state.js';

const API = state.API_BASE_URL;

let _charts        = {};   // { mrr, clientes, churn }
let _analiseCharts = {};   // charts da aba Análises
let _activeTab     = 0;    // 0 = Crescimento Analítico, 1 = Análises
let _analiseLoaded = false;
let _map           = null;
let _mapReady      = false;
let _activeLayer   = 'cancelamento';
let _filters       = { start_date: '', end_date: '' };
let _importedSources = [];  // IDs de sources/layers importados
let _searchMarker  = null;
let _vizMode       = 'heatmap';   // 'heatmap' | 'circles' | 'clusters'
let _hmapRadius    = 15;
let _activeLayers  = [];          // IDs de layers do heatmap ativo

// ─── Ponto de entrada ────────────────────────────────────────────────────────

export function renderCrescimento(container) {
    // Destrói gráficos anteriores se existirem
    Object.values(_charts).forEach(c => c?.destroy());
    Object.values(_analiseCharts).forEach(c => c?.destroy());
    _charts        = {};
    _analiseCharts = {};
    _activeTab     = 0;
    _analiseLoaded = false;
    _map           = null;
    _mapReady      = false;
    _vizMode       = 'heatmap';
    _hmapRadius    = 15;
    _activeLayers  = [];
    _searchMarker  = null;

    container.innerHTML = _shell();

    // Pré-preenche datas se ainda não definidas (primeira carga)
    if (!_filters.start_date) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
        const end   = new Date(now.getFullYear(), now.getMonth(), 0);      // último dia do mês anterior
        _filters.start_date = start.toISOString().slice(0, 10);
        _filters.end_date   = end.toISOString().slice(0, 10);
    }
    const _cgS = document.getElementById('cgStart');
    const _cgE = document.getElementById('cgEnd');
    if (_cgS) _cgS.value = _filters.start_date;
    if (_cgE) _cgE.value = _filters.end_date;

    _bindEvents();
    _loadGrowth();
    // Mapa inicia após um tick para garantir que o DOM está pronto
    requestAnimationFrame(() => _initMap());
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _shell() {
    const cats = [
        { id: 'cancelamento', label: '🔴 Cancelamentos',  color: '#ef4444' },
        { id: 'instalacao',   label: '🟢 Instalações',    color: '#10b981' },
        { id: 'negativacao',  label: '🟠 Negativação',    color: '#f97316' },
        { id: 'manutencao',   label: '🟡 Manutenção',     color: '#f59e0b' },
        { id: 'visita',       label: '🟣 Visita Técnica', color: '#8b5cf6' },
    ];

    return `
<div style="padding:1rem;font-family:sans-serif;">

    <!-- Header + filtros de data -->
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:.75rem;margin-bottom:1.25rem;
                padding-bottom:1rem;border-bottom:2px solid #e5e7eb;">
        <h2 style="margin:0;font-size:1.2rem;font-weight:700;color:#1e3a5f;">📈 Crescimento Analítico</h2>
        <div style="margin-left:auto;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
            <label style="font-size:.8rem;color:#6b7280;">De</label>
            <input type="date" id="cgStart"
                   style="border:1px solid #d1d5db;border-radius:.375rem;padding:.25rem .5rem;font-size:.8rem;">
            <label style="font-size:.8rem;color:#6b7280;">Até</label>
            <input type="date" id="cgEnd"
                   style="border:1px solid #d1d5db;border-radius:.375rem;padding:.25rem .5rem;font-size:.8rem;">
            <button id="cgApply"
                    style="background:#1d4ed8;color:#fff;border:none;border-radius:.375rem;
                           padding:.375rem .75rem;font-size:.8rem;cursor:pointer;font-weight:600;">
                Aplicar
            </button>
        </div>
    </div>

    <!-- Tab bar -->
    <div style="display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:1.25rem;">
        <button id="cgTabBtn0"
                style="padding:.5rem 1.25rem;font-size:.85rem;font-weight:700;cursor:pointer;border:none;
                       background:transparent;color:#1d4ed8;border-bottom:3px solid #1d4ed8;
                       margin-bottom:-2px;transition:.15s all;">
            📈 Crescimento Analítico
        </button>
        <button id="cgTabBtn1"
                style="padding:.5rem 1.25rem;font-size:.85rem;font-weight:700;cursor:pointer;border:none;
                       background:transparent;color:#6b7280;border-bottom:3px solid transparent;
                       margin-bottom:-2px;transition:.15s all;">
            🔍 Análises
        </button>
    </div>

    <!-- Tab 0: conteúdo existente -->
    <div id="cgTab0">

    <!-- KPI cards -->
    <div id="cgKpis" style="display:grid;grid-template-columns:repeat(5,1fr);gap:.75rem;margin-bottom:1.25rem;"></div>

    <!-- Gráficos de crescimento -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:2rem;">
        ${[
            {title:'MRR Mensal (R$)',     desc:'Evolução da receita recorrente mensal ao longo do tempo. Fonte: Contas_a_Receber (Status="Recebido"), agrupado por mês de pagamento. Permite identificar sazonalidade, aceleração ou desaceleração da receita. A linha de projeção (pontilhada) usa CAGR dos últimos 6 meses para estimar os próximos 6.'},
            {title:'Clientes Ativos',     desc:'Quantidade de contratos únicos com pagamento confirmado a cada mês (ID_contrato_principal distintos em Contas_a_Receber, Status="Recebido"). Crescimento aqui reflete expansão da base; queda pode indicar aumento de churn mesmo com MRR estável (upsell compensando saídas).'},
            {title:'Cancelamentos/Mês',   desc:'Comparativo mensal entre cancelamentos (Contratos com Data_cancelamento) e negativações (Contratos_Negativacao). A diferença entre as curvas indica o perfil de saída: cancelamento voluntário vs. inadimplência. O valor exibido no card é a média desses últimos meses.'},
        ].map(({title, desc}, i) => `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;">
            <p style="font-size:.7rem;font-weight:700;color:#6b7280;margin:0 0 .2rem;
                      text-transform:uppercase;letter-spacing:.06em;">${title}</p>
            <p style="font-size:.67rem;color:#94a3b8;margin:0 0 .4rem;line-height:1.4;">${desc}</p>
            <div id="cgLegend${i}" style="font-size:.7rem;color:#9ca3af;margin-bottom:.25rem;min-height:1rem;"></div>
            <div style="position:relative;height:200px;">
                <canvas id="cgChart${i}"></canvas>
            </div>
        </div>`).join('')}
    </div>

    <!-- Separador Mapa -->
    <div style="border-top:2px solid #e5e7eb;margin-bottom:1.25rem;padding-top:1.25rem;">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:.75rem;">
            <h3 style="margin:0;font-size:1rem;font-weight:700;color:#1e3a5f;">🗺 Mapa de Calor</h3>

            <!-- Layer buttons -->
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
                ${cats.map(c => `
                <button class="hmap-btn" data-cat="${c.id}"
                        style="padding:.3rem .75rem;border-radius:9999px;border:2px solid ${c.color};
                               background:${c.color};color:#fff;font-size:.78rem;cursor:pointer;
                               font-weight:600;opacity:.55;transition:.15s all;">
                    ${c.label}
                </button>`).join('')}
            </div>

            <div style="margin-left:auto;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
                <span id="hmapInfo" style="font-size:.75rem;color:#6b7280;"></span>
                <button id="hmapFullscreen"
                        title="Tela cheia"
                        style="background:#374151;color:#fff;border:none;border-radius:.375rem;
                               padding:.375rem .625rem;font-size:.85rem;cursor:pointer;">⛶</button>
                <button id="kmzImport"
                        style="background:#7c3aed;color:#fff;border:none;border-radius:.375rem;
                               padding:.375rem .875rem;font-size:.8rem;cursor:pointer;font-weight:600;">
                    📂 Importar KMZ
                </button>
                <input type="file" id="kmzFileInput" accept=".kmz,.kml" style="display:none;">
                <button id="kmzImportClear" style="display:none;background:#6b7280;color:#fff;border:none;
                               border-radius:.375rem;padding:.375rem .625rem;font-size:.8rem;cursor:pointer;">
                    ✕ Limpar
                </button>
                <button id="kmzExport"
                        style="background:#059669;color:#fff;border:none;border-radius:.375rem;
                               padding:.375rem .875rem;font-size:.8rem;cursor:pointer;font-weight:600;">
                    ⬇ Exportar KMZ
                </button>
            </div>
            <!-- Badge do arquivo importado -->
            <div id="kmzImportBadge" style="display:none;width:100%;margin-top:.4rem;">
                <span style="font-size:.75rem;background:#ede9fe;color:#5b21b6;border-radius:9999px;
                             padding:.2rem .65rem;font-weight:600;"></span>
            </div>
        </div>
    </div>

    <!-- Modo de visualização + slider de raio -->
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:.625rem;margin-bottom:.5rem;">
        <span style="font-size:.78rem;font-weight:600;color:#374151;">Visualização:</span>
        <div style="display:flex;gap:.3rem;">
            <button class="viz-btn" data-viz="heatmap"
                    style="padding:.25rem .65rem;border-radius:9999px;border:1.5px solid #1d4ed8;
                           background:#1d4ed8;color:#fff;font-size:.75rem;cursor:pointer;font-weight:600;transition:.15s;">
                🌡 Calor
            </button>
            <button class="viz-btn" data-viz="circles"
                    style="padding:.25rem .65rem;border-radius:9999px;border:1.5px solid #6b7280;
                           background:#fff;color:#6b7280;font-size:.75rem;cursor:pointer;font-weight:600;transition:.15s;">
                ● Pontos
            </button>
            <button class="viz-btn" data-viz="clusters"
                    style="padding:.25rem .65rem;border-radius:9999px;border:1.5px solid #6b7280;
                           background:#fff;color:#6b7280;font-size:.75rem;cursor:pointer;font-weight:600;transition:.15s;">
                ⬤ Clusters
            </button>
        </div>
        <div id="hmapRadiusCtrl" style="display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:#6b7280;">
            <span>Raio:</span>
            <input type="range" id="hmapRadius" min="5" max="50" value="15" step="1"
                   style="width:85px;cursor:pointer;accent-color:#1d4ed8;">
            <span id="hmapRadiusVal" style="min-width:1.5rem;text-align:right;">15</span>px
        </div>
    </div>

    <!-- Painel de cobertura (preenchido pelo JS) -->
    <div id="hmapCoverage" style="display:none;font-size:.78rem;background:#f9fafb;border:1px solid #e5e7eb;
         border-radius:.5rem;padding:.5rem .875rem;margin-bottom:.5rem;
         gap:1.25rem;align-items:center;flex-wrap:wrap;"></div>

    <!-- Busca de endereço -->
    <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem;">
        <input type="text" id="hmapSearchInput"
               placeholder="🔍 Buscar endereço no mapa…"
               style="flex:1;border:1px solid #d1d5db;border-radius:.375rem;padding:.375rem .75rem;
                      font-size:.8rem;outline:none;min-width:0;">
        <button id="hmapSearchBtn"
                style="background:#1d4ed8;color:#fff;border:none;border-radius:.375rem;
                       padding:.375rem .875rem;font-size:.8rem;cursor:pointer;font-weight:600;white-space:nowrap;">
            Buscar
        </button>
    </div>

    <!-- Container do mapa -->
    <div id="hmapContainer"
         style="height:520px;border-radius:.5rem;overflow:hidden;border:1px solid #d1d5db;position:relative;">
        <div id="hmapDiv" style="width:100%;height:100%;"></div>
    </div>

    </div><!-- /cgTab0 -->

    <!-- Tab 1: análises avançadas -->
    <div id="cgTab1" style="display:none;">
        <div id="cgAnalises" style="padding:.25rem 0;">
            <p style="color:#94a3b8;font-size:.85rem;">Carregando análises…</p>
        </div>
    </div>

</div>`;
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function _bindEvents() {
    document.getElementById('cgApply')?.addEventListener('click', () => {
        _filters.start_date = document.getElementById('cgStart')?.value || '';
        _filters.end_date   = document.getElementById('cgEnd')?.value   || '';
        _loadGrowth();
        _loadHeatmap(_activeLayer);
        if (_activeTab === 1) _loadAnalises();
    });

    document.getElementById('cgTabBtn0')?.addEventListener('click', () => _switchTab(0));
    document.getElementById('cgTabBtn1')?.addEventListener('click', () => _switchTab(1));

    document.querySelectorAll('.hmap-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _activeLayer = btn.dataset.cat;
            _highlightBtn(_activeLayer);
            _loadHeatmap(_activeLayer);
        });
    });

    document.getElementById('kmzExport')?.addEventListener('click', () => {
        const p   = new URLSearchParams(_filters);
        const url = `${API}/api/crescimento/kmz?${p}`;
        const a   = Object.assign(document.createElement('a'), { href: url, download: 'netvale_analytics.kmz' });
        a.click();
    });

    // Importar KMZ/KML
    document.getElementById('kmzImport')?.addEventListener('click', () => {
        document.getElementById('kmzFileInput')?.click();
    });
    document.getElementById('kmzFileInput')?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (file) _handleKmzImport(file);
        e.target.value = '';   // reset para permitir reimportar o mesmo arquivo
    });
    document.getElementById('kmzImportClear')?.addEventListener('click', _clearImportedLayers);

    // Fullscreen do mapa
    document.getElementById('hmapFullscreen')?.addEventListener('click', () => {
        const el = document.getElementById('hmapContainer');
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    });

    // Modo de visualização
    document.querySelectorAll('.viz-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _vizMode = btn.dataset.viz;
            _highlightVizBtn(_vizMode);
            const rc = document.getElementById('hmapRadiusCtrl');
            if (rc) rc.style.display = _vizMode === 'heatmap' ? 'flex' : 'none';
            if (_mapReady) _loadHeatmap(_activeLayer);
        });
    });

    // Slider de raio
    document.getElementById('hmapRadius')?.addEventListener('input', e => {
        _hmapRadius = parseInt(e.target.value);
        const lbl = document.getElementById('hmapRadiusVal');
        if (lbl) lbl.textContent = _hmapRadius;
        if (_mapReady && _vizMode === 'heatmap') _loadHeatmap(_activeLayer);
    });

    // Geocoding (Nominatim)
    document.getElementById('hmapSearchBtn')?.addEventListener('click', _geocodeSearch);
    document.getElementById('hmapSearchInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') _geocodeSearch();
    });

    document.addEventListener('fullscreenchange', () => {
        const btn = document.getElementById('hmapFullscreen');
        if (document.fullscreenElement) {
            // Mapa ocupa tela cheia — força altura 100vh
            document.getElementById('hmapContainer').style.height = '100vh';
            if (btn) btn.textContent = '✕';
        } else {
            document.getElementById('hmapContainer').style.height = '520px';
            if (btn) btn.textContent = '⛶';
        }
        // MapLibre precisa ser notificado do resize
        setTimeout(() => _map?.resize(), 100);
    });
}

async function _geocodeSearch() {
    const input = document.getElementById('hmapSearchInput');
    const btn   = document.getElementById('hmapSearchBtn');
    const q = input?.value?.trim();
    if (!q || !_map) return;

    if (btn) { btn.textContent = '…'; btn.disabled = true; }
    try {
        const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`;
        const res  = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
        const data = await res.json();

        if (!data.length) { alert('Endereço não encontrado.'); return; }
        const { lon, lat, display_name } = data[0];
        const lng = parseFloat(lon), la = parseFloat(lat);

        _map.flyTo({ center: [lng, la], zoom: 15, duration: 1500 });

        if (_searchMarker) _searchMarker.remove();
        _searchMarker = new maplibregl.Marker({ color: '#1d4ed8' })
            .setLngLat([lng, la])
            .setPopup(new maplibregl.Popup({ offset: 25 })
                .setHTML(`<p style="font-size:.75rem;max-width:230px;margin:0;line-height:1.4;">${display_name}</p>`))
            .addTo(_map);
        _searchMarker.togglePopup();
    } catch (e) {
        console.error('Geocoding error:', e);
        alert('Erro ao buscar endereço.');
    } finally {
        if (btn) { btn.textContent = 'Buscar'; btn.disabled = false; }
    }
}

function _highlightBtn(cat) {
    document.querySelectorAll('.hmap-btn').forEach(b => {
        b.style.opacity    = b.dataset.cat === cat ? '1'   : '.45';
        b.style.transform  = b.dataset.cat === cat ? 'scale(1.06)' : 'scale(1)';
    });
}

function _highlightVizBtn(viz) {
    document.querySelectorAll('.viz-btn').forEach(b => {
        const on = b.dataset.viz === viz;
        b.style.background   = on ? '#1d4ed8' : '#fff';
        b.style.color        = on ? '#fff'    : '#6b7280';
        b.style.borderColor  = on ? '#1d4ed8' : '#6b7280';
    });
}

// ─── Crescimento: dados + gráficos ───────────────────────────────────────────

function _loadGrowth() {
    const p = new URLSearchParams(_filters);
    fetch(`${API}/api/crescimento/dados?${p}`)
        .then(r => r.json())
        .then(d => {
            _renderKpis(d);
            _renderCharts(d);
        })
        .catch(e => console.error('crescimento/dados:', e));
}

const CHART_CFG = [
    {
        key: 'mrr', color: '#3b82f6',
        fmt: v => `R$ ${(v / 1000).toFixed(1)}k`,
        tickFmt: v => `${(v / 1000).toFixed(0)}k`,
    },
    {
        key: 'clientes', color: '#10b981',
        fmt: v => Math.round(v).toLocaleString('pt-BR'),
        tickFmt: v => Math.round(v).toLocaleString('pt-BR'),
    },
    {
        key: 'churn', color: '#ef4444',
        fmt: v => Math.round(v).toLocaleString('pt-BR'),
        tickFmt: v => Math.round(v).toLocaleString('pt-BR'),
    },
];

function _renderCharts(d) {
    const hist = d.historico || [];
    const proj = d.projecao  || [];

    // Identifica o mês extrapolado (mês atual com dados parciais)
    const extrapIdx = hist.findIndex(h => h.extrapolado);
    const extrapInfo = extrapIdx >= 0
        ? `${hist[extrapIdx].periodo} extrapolado (${hist[extrapIdx].dias_reais}/${hist[extrapIdx].dias_mes} dias)`
        : null;

    const labels = [...hist.map(h => {
        const suffix = h.extrapolado ? ' *' : '';
        return h.periodo + suffix;
    }), ...proj.map(p => p.periodo)];
    const n = hist.length;

    CHART_CFG.forEach((cfg, idx) => {
        const canvas = document.getElementById(`cgChart${idx}`);
        if (!canvas) return;

        if (_charts[idx]) { _charts[idx].destroy(); _charts[idx] = null; }

        const histVals = hist.map(h => h[cfg.key]);
        const projVals = proj.map(p => p[cfg.key]);
        // bridge: último ponto histórico é o primeiro da projeção para linha contínua
        const projLine = [
            ...new Array(n - 1).fill(null),
            histVals[n - 1] ?? null,
            ...projVals,
        ];

        _charts[idx] = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Histórico',
                        data: [...histVals, ...new Array(projVals.length).fill(null)],
                        borderColor: cfg.color,
                        backgroundColor: cfg.color + '22',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                    },
                    {
                        label: 'Projeção',
                        data: projLine,
                        borderColor: cfg.color,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [6, 3],
                        fill: false,
                        tension: 0.3,
                        pointRadius: 2,
                        pointStyle: 'rectRot',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: ctx => ctx.dataset.label + ': ' + cfg.fmt(ctx.parsed.y) },
                    },
                },
                scales: {
                    x: { ticks: { font: { size: 8 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
                    y: {
                        beginAtZero: false,
                        ticks: { font: { size: 9 }, callback: v => cfg.tickFmt(v) },
                    },
                },
            },
        });

        // Legend
        const leg = document.getElementById(`cgLegend${idx}`);
        if (leg) {
            const parts = [];
            if (projVals.length) {
                const method = (cfg.key === 'mrr' || cfg.key === 'clientes') ? 'CAGR 6m' : 'média 3m';
                parts.push(`Projeção 6m: ${cfg.fmt(projVals[projVals.length - 1])} (${method})`);
            }
            if (extrapInfo) {
                parts.push(`* ${extrapInfo}`);
            }
            leg.textContent = parts.join('  ·  ');
        }
    });
}

function _renderKpis(d) {
    const el = document.getElementById('cgKpis');
    if (!el) return;

    const hist  = d.historico     || [];
    const proj  = d.projecao      || [];
    const ps    = d.periodo_stats || null;
    // Usa o último mês completo (não extrapolado) para os KPIs de MRR/Clientes
    const completedHist = hist.filter(h => !h.extrapolado);
    const last  = completedHist[completedHist.length - 1] || hist[hist.length - 1] || {};
    const lproj = proj[proj.length - 1] || {};
    const h12   = hist.slice(-12);

    const mrr_now  = last.mrr      || 0;
    const mrr_6m   = lproj.mrr     || 0;
    const cli_now  = last.clientes  || 0;
    const cli_6m   = lproj.clientes || 0;

    const mrr_delta = mrr_now > 0 ? ((mrr_6m - mrr_now) / mrr_now * 100) : 0;
    const cli_delta = cli_now > 0 ? ((cli_6m - cli_now) / cli_now * 100) : 0;

    const grow_rate = h12.length > 1 && h12[0].mrr > 0
        ? ((h12[h12.length - 1].mrr / h12[0].mrr) ** (1 / (h12.length - 1)) - 1) * 100
        : 0;

    // Quando filtro de data ativo usa periodo_stats; senão usa média dos últimos 12 meses
    const churn_val  = ps ? ps.churn_avg   : (h12.length > 0 ? h12.reduce((s, h) => s + h.churn, 0) / h12.length : 0);
    const neg_val    = ps ? ps.neg_avg     : (h12.length > 0 ? h12.reduce((s, h) => s + (h.neg || 0), 0) / h12.length : 0);
    const churn_sub  = ps
        ? `Total no período: ${ps.churn_total.toLocaleString('pt-BR')} (${ps.meses} ${ps.meses === 1 ? 'mês' : 'meses'})`
        : 'Média últimos 12 meses';
    const neg_sub    = ps
        ? `Total no período: ${ps.neg_total.toLocaleString('pt-BR')} (${ps.meses} ${ps.meses === 1 ? 'mês' : 'meses'})`
        : 'Média últimos 12 meses';

    const KPIS = [
        {
            label: 'MRR Atual',
            value: `R$ ${(mrr_now / 1000).toFixed(1)}k`,
            sub:   `Projeção 6m: R$ ${(mrr_6m / 1000).toFixed(1)}k`,
            delta: mrr_delta,
            icon:  '💰',
            color: null,
            desc:  'Monthly Recurring Revenue — receita recorrente mensal. Fonte: tabela Contas_a_Receber (BD), soma de Valor_recebido onde Status="Recebido" no último mês do histórico. Base para calcular ARPU, LTV e taxa de crescimento. A seta mostra a variação projetada para 6 meses usando CAGR dos últimos 6 meses completos.',
        },
        {
            label: 'Clientes Ativos',
            value: cli_now.toLocaleString('pt-BR'),
            sub:   `Projeção 6m: ${cli_6m.toLocaleString('pt-BR')}`,
            delta: cli_delta,
            icon:  '👥',
            color: null,
            desc:  'Contagem de contratos únicos (ID_contrato_principal) com ao menos um pagamento confirmado no último mês do histórico (Contas_a_Receber, Status="Recebido"). Divergência entre crescimento de MRR e de clientes indica mudança no ticket médio (ARPU). Projeção via CAGR dos últimos 6 meses completos.',
        },
        {
            label: 'Crescimento Mensal',
            value: `${grow_rate.toFixed(2)}%`,
            sub:   'Média últimos 12 meses (MRR)',
            delta: null,
            icon:  '📊',
            color: null,
            desc:  'CAGR (taxa de crescimento mensal composta) do MRR calculada sobre os últimos 12 meses de histórico. Fórmula: (MRR_final ÷ MRR_inicial)^(1÷n) − 1. Positivo = receita crescendo mês a mês; negativo = encolhimento. Diferente da variação simples mês a mês — o CAGR representa a taxa constante equivalente ao crescimento observado no período inteiro.',
        },
        {
            label: ps ? `Cancelamentos/mês (${ps.meses}m)` : 'Cancelamentos/Mês',
            value: Math.round(churn_val).toLocaleString('pt-BR'),
            sub:   churn_sub,
            delta: null,
            icon:  '🚨',
            color: '#ef4444',
            desc:  'Média mensal de contratos que saíram por cancelamento definitivo. Fonte: tabela Contratos (BD), Status_contrato IN ("Cancelado", "Inativo", "Desistente") com Data_cancelamento no período. Sem filtro de data = média dos últimos 12 meses do histórico; com filtro = total do período ÷ número de meses.',
        },
        {
            label: ps ? `Negativações/mês (${ps.meses}m)` : 'Negativações/Mês',
            value: Math.round(neg_val).toLocaleString('pt-BR'),
            sub:   neg_sub,
            delta: null,
            icon:  '⛔',
            color: '#f97316',
            desc:  'Média mensal de negativações: clientes que pararam de pagar e foram marcados como inadimplentes. Fontes: Contratos (Data_negativa_o onde Status_contrato="Negativado") + Contratos_Negativacao (Filial 4, Data_negativa_o). No sistema, negativado = saída permanente — se quiser retornar, abre um novo contrato. Sem filtro = média últimos 12 meses.',
        },
    ];

    el.innerHTML = KPIS.map(k => {
        const dHtml = k.delta !== null
            ? `<span style="font-size:.7rem;margin-left:.3rem;color:${k.delta >= 0 ? '#10b981' : '#ef4444'};">
                ${k.delta >= 0 ? '▲' : '▼'} ${Math.abs(k.delta).toFixed(1)}%
               </span>`
            : '';
        const valColor = k.color ? `color:${k.color}` : 'color:#1e3a5f';
        return `
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:.875rem;
            display:flex;flex-direction:column;gap:.25rem;">
    <p style="font-size:.65rem;color:#6b7280;margin:0;text-transform:uppercase;letter-spacing:.06em;">${k.icon} ${k.label}</p>
    <p style="font-size:1.3rem;font-weight:700;${valColor};margin:0;">${k.value}${dHtml}</p>
    <p style="font-size:.7rem;color:#9ca3af;margin:0;">${k.sub}</p>
    ${k.desc ? `<p style="font-size:.68rem;color:#94a3b8;margin:.15rem 0 0;line-height:1.45;border-top:1px solid #f1f5f9;padding-top:.3rem;">${k.desc}</p>` : ''}
</div>`;
    }).join('');
}

// ─── Mapa de calor (MapLibre GL) ─────────────────────────────────────────────

const HMAP_PALETTES = {
    cancelamento: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'],
    instalacao:   ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'],
    negativacao:  ['#fff7ed', '#fed7aa', '#fb923c', '#ea580c', '#9a3412'],
    manutencao:   ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'],
    visita:       ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'],
};

function _initMap() {
    const div = document.getElementById('hmapDiv');
    if (!div || !window.maplibregl) return;

    _map = new maplibregl.Map({
        container: 'hmapDiv',
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [-44.55, -5.32],
        zoom: 9,
        attributionControl: true,
    });

    _map.on('load', () => {
        _mapReady = true;
        _highlightBtn('cancelamento');
        _highlightVizBtn('heatmap');
        _loadHeatmap('cancelamento');
    });
}

function _loadHeatmap(category) {
    const info = document.getElementById('hmapInfo');
    if (info) info.textContent = 'Carregando…';

    const p = new URLSearchParams({ category, ..._filters });
    fetch(`${API}/api/crescimento/mapa?${p}`)
        .then(r => r.json())
        .then(d => {
            const plotados = d.total          || 0;
            const total    = d.total_in_period || 0;
            const sem      = Math.max(0, total - plotados);
            const pct      = total > 0 ? Math.round(plotados / total * 100) : 100;

            if (info) info.textContent = `${plotados.toLocaleString('pt-BR')} pontos`;

            // Painel de cobertura
            const cov = document.getElementById('hmapCoverage');
            if (cov && total > 0) {
                cov.style.display = 'flex';

                const _LAYER_META = {
                    cancelamento: { icon: '🚫', label: 'Total cancelamentos', color: '#ef4444' },
                    instalacao:   { icon: '📋', label: 'Total instalações',   color: '#10b981' },
                    negativacao:  { icon: '⛔', label: 'Total negativações',  color: '#f97316' },
                    manutencao:   { icon: '🔧', label: 'Total manutenções',   color: '#f59e0b' },
                    visita:       { icon: '👷', label: 'Total visitas',        color: '#8b5cf6' },
                };
                const meta = _LAYER_META[category] || _LAYER_META.instalacao;

                let breakdownHtml = '';
                if (d.breakdown) {
                    const br = d.breakdown;
                    const sep = '<span style="color:#d1d5db;font-size:.9rem;">|</span>';
                    breakdownHtml = `
                        ${sep}
                        <span style="color:#374151;display:flex;align-items:center;gap:.25rem;">
                            <span style="width:.55rem;height:.55rem;border-radius:50%;background:#10b981;display:inline-block;"></span>
                            Ativos: <strong style="color:#10b981;">${(br.ativo||0).toLocaleString('pt-BR')}</strong>
                        </span>
                        <span style="color:#374151;display:flex;align-items:center;gap:.25rem;">
                            <span style="width:.55rem;height:.55rem;border-radius:50%;background:#ef4444;display:inline-block;"></span>
                            Cancelados: <strong style="color:#ef4444;">${(br.cancelado||0).toLocaleString('pt-BR')}</strong>
                        </span>
                        <span style="color:#374151;display:flex;align-items:center;gap:.25rem;">
                            <span style="width:.55rem;height:.55rem;border-radius:50%;background:#f97316;display:inline-block;"></span>
                            Negativados: <strong style="color:#f97316;">${(br.negativado||0).toLocaleString('pt-BR')}</strong>
                        </span>
                    `;
                }

                cov.innerHTML = `
                    <span style="color:#374151;">
                        ${meta.icon} ${meta.label}:
                        <strong style="color:${meta.color};">${total.toLocaleString('pt-BR')}</strong>
                    </span>
                    <span style="color:#374151;">
                        🗺 Plotados:
                        <strong style="color:#10b981;">${plotados.toLocaleString('pt-BR')}</strong>
                        <span style="color:#6b7280;">(${pct}%)</span>
                    </span>
                    <span style="color:#374151;">
                        ⚠️ Sem coordenadas:
                        <strong style="color:${sem > 0 ? '#ef4444' : '#10b981'};">${sem.toLocaleString('pt-BR')}</strong>
                        ${sem > 0 ? '<span style="color:#9ca3af;font-size:.7rem;"> — endereço não cadastrado no IXC</span>' : ''}
                    </span>
                    ${breakdownHtml}
                `;
            }

            if (_mapReady) _applyLayer(d.points || [], category);
        })
        .catch(e => {
            console.error('crescimento/mapa:', e);
            if (info) info.textContent = 'Erro ao carregar mapa';
        });
}

// ─── Importação KMZ/KML ───────────────────────────────────────────────────────

async function _handleKmzImport(file) {
    const info = document.getElementById('hmapInfo');
    if (info) info.textContent = 'Lendo arquivo…';

    try {
        let kmlText;

        if (file.name.toLowerCase().endsWith('.kmz')) {
            if (!window.JSZip) throw new Error('JSZip não carregado');
            const zip  = await JSZip.loadAsync(file);
            // KMZ pode ter o KML com qualquer nome, procura o primeiro .kml
            const kmlEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
            if (!kmlEntry) throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ');
            kmlText = await kmlEntry.async('text');
        } else {
            kmlText = await file.text();
        }

        const geojson = _kmlToGeoJson(kmlText);

        if (!geojson.features.length) {
            if (info) info.textContent = 'Nenhuma geometria encontrada no arquivo';
            return;
        }

        _clearImportedLayers();
        _displayImportedLayer(geojson, file.name);

        if (info) info.textContent = `KMZ: ${geojson.features.length.toLocaleString('pt-BR')} feições`;

        // Badge
        const badge = document.getElementById('kmzImportBadge');
        if (badge) {
            badge.style.display = 'block';
            badge.querySelector('span').textContent =
                `📂 ${file.name}  ·  ${geojson.features.length.toLocaleString('pt-BR')} feições`;
        }
        const clearBtn = document.getElementById('kmzImportClear');
        if (clearBtn) clearBtn.style.display = 'inline-block';

    } catch (err) {
        console.error('KMZ import:', err);
        if (info) info.textContent = `Erro: ${err.message}`;
    }
}

function _kmlToGeoJson(kmlText) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(kmlText, 'text/xml');
    const features = [];

    doc.querySelectorAll('Placemark').forEach(pm => {
        const name = pm.querySelector('name')?.textContent?.trim() || '';
        const desc = pm.querySelector('description')?.textContent?.trim() || '';

        // --- Point ---
        const ptCoords = pm.querySelector('Point coordinates');
        if (ptCoords) {
            const parts = ptCoords.textContent.trim().split(',');
            const lon = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            if (!isNaN(lon) && !isNaN(lat)) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [lon, lat] },
                    properties: { name, description: desc },
                });
            }
        }

        // --- LineString ---
        const lsCoords = pm.querySelector('LineString coordinates');
        if (lsCoords) {
            const coordinates = _parseCoordsBlock(lsCoords.textContent);
            if (coordinates.length >= 2) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates },
                    properties: { name, description: desc },
                });
            }
        }

        // --- Polygon ---
        const polyOuter = pm.querySelector('Polygon outerBoundaryIs LinearRing coordinates')
                       || pm.querySelector('Polygon coordinates');
        if (polyOuter) {
            const ring = _parseCoordsBlock(polyOuter.textContent);
            if (ring.length >= 3) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [ring] },
                    properties: { name, description: desc },
                });
            }
        }
    });

    return { type: 'FeatureCollection', features };
}

function _parseCoordsBlock(text) {
    return text.trim().split(/\s+/).map(token => {
        const parts = token.split(',');
        return [parseFloat(parts[0]), parseFloat(parts[1])];
    }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
}

function _displayImportedLayer(geojson, filename) {
    if (!_mapReady || !_map) return;

    const idx      = Date.now();
    const srcId    = `import-src-${idx}`;

    // Separa feições por tipo de geometria
    const points   = { type: 'FeatureCollection', features: geojson.features.filter(f => f.geometry.type === 'Point') };
    const lines    = { type: 'FeatureCollection', features: geojson.features.filter(f => f.geometry.type === 'LineString') };
    const polys    = { type: 'FeatureCollection', features: geojson.features.filter(f => ['Polygon', 'MultiPolygon'].includes(f.geometry.type)) };

    const added = [];

    if (points.features.length) {
        const sid = `${srcId}-pt`;
        const lid = `${sid}-lyr`;
        _map.addSource(sid, { type: 'geojson', data: points });
        _map.addLayer({
            id: lid, type: 'circle', source: sid,
            paint: {
                'circle-radius':       5,
                'circle-color':        '#7c3aed',
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#fff',
                'circle-opacity':      0.85,
            },
        });
        added.push(sid, lid);
    }

    if (lines.features.length) {
        const sid = `${srcId}-ln`;
        const lid = `${sid}-lyr`;
        _map.addSource(sid, { type: 'geojson', data: lines });
        _map.addLayer({
            id: lid, type: 'line', source: sid,
            paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-opacity': 0.9 },
        });
        added.push(sid, lid);
    }

    if (polys.features.length) {
        const sid = `${srcId}-poly`;
        const lidFill    = `${sid}-fill`;
        const lidOutline = `${sid}-outline`;
        _map.addSource(sid, { type: 'geojson', data: polys });
        _map.addLayer({
            id: lidFill, type: 'fill', source: sid,
            paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.25 },
        });
        _map.addLayer({
            id: lidOutline, type: 'line', source: sid,
            paint: { 'line-color': '#5b21b6', 'line-width': 2 },
        });
        added.push(sid, lidFill, lidOutline);
    }

    _importedSources.push(...added);

    // Tooltip ao clicar em pontos importados
    const ptLayerIds = added.filter(id => id.endsWith('-pt-lyr'));
    ptLayerIds.forEach(lid => {
        _map.on('click', lid, e => {
            const props = e.features[0]?.properties || {};
            if (!props.name && !props.description) return;
            new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`<strong>${props.name || ''}</strong>${props.description ? `<br><span style="font-size:.8rem">${props.description}</span>` : ''}`)
                .addTo(_map);
        });
        _map.on('mouseenter', lid, () => { _map.getCanvas().style.cursor = 'pointer'; });
        _map.on('mouseleave', lid, () => { _map.getCanvas().style.cursor = ''; });
    });

    // Ajusta o mapa para mostrar o conteúdo importado
    const allCoords = geojson.features.flatMap(f => {
        const g = f.geometry;
        if (g.type === 'Point')      return [g.coordinates];
        if (g.type === 'LineString') return g.coordinates;
        if (g.type === 'Polygon')    return g.coordinates[0];
        return [];
    });

    if (allCoords.length) {
        const lons = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        _map.fitBounds(
            [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            { padding: 60, maxZoom: 14 }
        );
    }
}

function _clearImportedLayers() {
    if (!_mapReady || !_map) return;
    _importedSources.forEach(id => {
        if (_map.getLayer(id))  _map.removeLayer(id);
        if (_map.getSource(id)) _map.removeSource(id);
    });
    _importedSources = [];

    const badge = document.getElementById('kmzImportBadge');
    if (badge) badge.style.display = 'none';
    const clearBtn = document.getElementById('kmzImportClear');
    if (clearBtn) clearBtn.style.display = 'none';
    const info = document.getElementById('hmapInfo');
    if (info) info.textContent = '';
}

const CAT_COLOR = {
    cancelamento: '#ef4444',
    instalacao:   '#10b981',
    negativacao:  '#f97316',
    manutencao:   '#f59e0b',
    visita:       '#8b5cf6',
};

function _applyLayer(points, category) {
    const SRC = 'hmap-src';

    // Remove todas as layers ativas anteriores
    _activeLayers.forEach(id => {
        try { if (_map.getLayer(id)) _map.removeLayer(id); } catch(e) {}
    });
    _activeLayers = [];
    if (_map.getSource(SRC)) _map.removeSource(SRC);

    if (!points.length) return;

    const geojson = {
        type: 'FeatureCollection',
        features: points.map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
            properties: {},
        })),
    };

    if (_vizMode === 'circles') {
        _applyCirclesLayer(SRC, geojson, category);
    } else if (_vizMode === 'clusters') {
        _applyClustersLayer(SRC, geojson, category);
    } else {
        _applyHeatmapLayer(SRC, geojson, category);
    }
}

function _applyHeatmapLayer(SRC, geojson, category) {
    const pal = HMAP_PALETTES[category] || HMAP_PALETTES.cancelamento;
    const r   = _hmapRadius;

    _map.addSource(SRC, { type: 'geojson', data: geojson });
    const LYR = 'hmap-lyr';
    _map.addLayer({
        id: LYR,
        type: 'heatmap',
        source: SRC,
        paint: {
            'heatmap-weight':     1,
            'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 0, 0.4, 15, 1.5],
            'heatmap-radius':     ['interpolate', ['linear'], ['zoom'], 5, Math.max(4, Math.round(r * 0.35)), 14, r],
            'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0,   'rgba(0,0,0,0)',
                0.2, pal[0],
                0.4, pal[1],
                0.6, pal[2],
                0.8, pal[3],
                1,   pal[4],
            ],
            'heatmap-opacity': 0.85,
        },
    });
    _activeLayers.push(LYR);
}

function _applyCirclesLayer(SRC, geojson, category) {
    const color = CAT_COLOR[category] || '#3b82f6';
    _map.addSource(SRC, { type: 'geojson', data: geojson });
    const LYR = 'hmap-lyr';
    _map.addLayer({
        id: LYR,
        type: 'circle',
        source: SRC,
        paint: {
            'circle-radius':       ['interpolate', ['linear'], ['zoom'], 7, 3, 14, 7],
            'circle-color':        color,
            'circle-opacity':      0.72,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
        },
    });
    _activeLayers.push(LYR);
}

function _applyClustersLayer(SRC, geojson, category) {
    const color = CAT_COLOR[category] || '#3b82f6';

    _map.addSource(SRC, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 45,
    });

    // Círculos dos clusters (tamanho proporcional à contagem)
    const clLYR = 'hmap-lyr-cl';
    _map.addLayer({
        id: clLYR,
        type: 'circle',
        source: SRC,
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': ['step', ['get', 'point_count'],
                color, 10, color, 50, color, 100, color
            ],
            'circle-opacity': 0.82,
            'circle-radius':  ['step', ['get', 'point_count'], 18, 10, 26, 50, 36, 100, 46],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
        },
    });

    // Rótulos de contagem
    const lblLYR = 'hmap-lyr-lbl';
    _map.addLayer({
        id: lblLYR,
        type: 'symbol',
        source: SRC,
        filter: ['has', 'point_count'],
        layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size':  12,
            'text-font':  ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#fff' },
    });

    // Pontos individuais fora de cluster
    const ptLYR = 'hmap-lyr-pt';
    _map.addLayer({
        id: ptLYR,
        type: 'circle',
        source: SRC,
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-radius':       5,
            'circle-color':        color,
            'circle-opacity':      0.8,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
        },
    });

    _activeLayers.push(clLYR, lblLYR, ptLYR);
}

// ─── Sistema de abas ──────────────────────────────────────────────────────────

function _switchTab(idx) {
    _activeTab = idx;
    [0, 1].forEach(i => {
        const tab = document.getElementById(`cgTab${i}`);
        const btn = document.getElementById(`cgTabBtn${i}`);
        if (tab) tab.style.display = i === idx ? '' : 'none';
        if (btn) {
            btn.style.color       = i === idx ? '#1d4ed8' : '#6b7280';
            btn.style.borderBottom = i === idx ? '3px solid #1d4ed8' : '3px solid transparent';
        }
    });
    if (idx === 1 && !_analiseLoaded) _loadAnalises();
}

// ─── Análises avançadas ───────────────────────────────────────────────────────

function _loadAnalises() {
    const wrap = document.getElementById('cgAnalises');
    if (!wrap) return;
    wrap.innerHTML = '<p style="color:#94a3b8;font-size:.85rem;">Carregando análises…</p>';

    const p = new URLSearchParams(_filters);
    fetch(`${API}/api/crescimento/analises?${p}`)
        .then(r => r.json())
        .then(d => {
            if (d.error) throw new Error(d.error);
            _analiseLoaded = true;
            // Net Adds e ARPU vêm de /dados já carregado; busca novamente com os filtros atuais
            fetch(`${API}/api/crescimento/dados?${p}`)
                .then(r2 => r2.json())
                .then(d2 => _renderAnalises(d, d2))
                .catch(() => _renderAnalises(d, null));
        })
        .catch(e => {
            if (wrap) wrap.innerHTML = `<p style="color:#ef4444;">Erro: ${e.message}</p>`;
        });
}

function _renderAnalises(d, d2) {
    const wrap = document.getElementById('cgAnalises');
    if (!wrap) return;

    // Destroy previous charts
    Object.values(_analiseCharts).forEach(c => c?.destroy());
    _analiseCharts = {};

    wrap.innerHTML = `
        <!-- Net Adds -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;margin-bottom:1rem;">
            <p style="font-size:.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:0 0 .25rem;">
                📊 Net Adds — Crescimento Líquido Mensal
            </p>
            <p style="font-size:.68rem;color:#94a3b8;margin:0 0 .5rem;line-height:1.5;">
                Variação líquida da base de clientes a cada mês: <strong style="color:#6b7280;">Novos</strong> (primeiros pagamentos do mês em Contas_a_Receber) menos <strong style="color:#6b7280;">Churns</strong> (Data_cancelamento no mês) menos <strong style="color:#6b7280;">Negativações</strong> (Data_negativa_o no mês). Barra acima de zero = base crescendo; abaixo = encolhendo. A linha mostra o Net Add acumulado (saldo final). Importante: identifica os meses onde saídas superam entradas, mesmo que o MRR ainda pareça crescer (churn pode ser mascarado por upsell).
            </p>
            <div style="position:relative;height:220px;"><canvas id="anNetAdds"></canvas></div>
        </div>

        <!-- ARPU trend -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;margin-bottom:1rem;">
            <p style="font-size:.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:0 0 .25rem;">
                💵 Evolução do ARPU (Ticket Médio)
            </p>
            <p style="font-size:.68rem;color:#94a3b8;margin:0 0 .5rem;line-height:1.5;">
                ARPU (Average Revenue Per User) = MRR do mês ÷ Clientes ativos naquele mês. Fontes: Contas_a_Receber (Valor_recebido, Status="Recebido") agrupado por mês. Se o ARPU está subindo com base estável = upsell funcionando ou mix migrando para planos maiores. Se cai com base crescendo = novos clientes entram em planos mais baratos, diluindo o ticket médio. Referência: ARPU acima de R$ 80 indica boa monetização para provedores regionais.
            </p>
            <div style="position:relative;height:180px;"><canvas id="anArpu"></canvas></div>
        </div>

        <!-- Mix de planos -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;">
                <p style="font-size:.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:0 0 .25rem;">
                    📡 Mix de Planos — Base Atual
                </p>
                <p style="font-size:.68rem;color:#94a3b8;margin:0 0 .5rem;line-height:1.5;">
                    Distribuição percentual dos contratos <em>atualmente ativos</em> por velocidade contratada. Fonte: Contratos (Descri_o) filtrado por Status_contrato="Ativo" — sem filtro de datas, representa o estado atual da base. O nome do plano é extraído via regex do campo Descri_o: padrão "Xg" (fibra) ou "XMb" (rádio). Planos não identificados aparecem como "Outros". Concentração excessiva em planos baratos indica pressão sobre margens; diversificação para planos de 1G+ melhora ARPU.
                </p>
                <div style="position:relative;height:220px;"><canvas id="anPlanosAtual"></canvas></div>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;">
                <p style="font-size:.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:0 0 .25rem;">
                    📡 Mix de Planos — Ativações por Mês
                </p>
                <p style="font-size:.68rem;color:#94a3b8;margin:0 0 .5rem;line-height:1.5;">
                    Ativações mensais discriminadas por plano contratado no período selecionado. Fonte: Contratos (Data_ativacao + Descri_o). Mostra qual mix de planos está sendo vendido ao longo do tempo — diferente do gráfico de base atual, que é um retrato estático. Permite identificar se a migração para planos maiores está ocorrendo nas novas vendas ou se o modelo de entrada continua em planos inferiores.
                </p>
                <div style="position:relative;height:220px;"><canvas id="anPlanosTrend"></canvas></div>
            </div>
        </div>

        <!-- Coorte -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;margin-bottom:1rem;">
            <p style="font-size:.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:0 0 .25rem;">
                🔄 Coorte de Ativações — Retenção Atual
            </p>
            <p style="font-size:.68rem;color:#94a3b8;margin:0 0 .5rem;line-height:1.5;">
                Análise de coorte: para cada mês dos últimos 18 meses, calcula quantos dos clientes ativados naquele mês ainda permanecem ativos hoje (Status_contrato="Ativo" ou pagamento recente em Contas_a_Receber). Fonte: Contratos (Data_ativacao, Status_contrato). <strong style="color:#10b981;">Verde ≥ 70%</strong> = boa retenção; <strong style="color:#f59e0b;">Amarelo 50–70%</strong> = atenção, pode indicar problemas de qualidade ou onboarding; <strong style="color:#ef4444;">Vermelho &lt; 50%</strong> = alto churn, metade ou mais dos clientes desse mês já saiu. Coortes mais recentes tendem a ter % maior por ainda estarem em contrato — compare coortes com mesma "idade" para ver tendências reais de retenção ao longo do tempo.
            </p>
            <div id="anCohortTable" style="overflow-x:auto;"></div>
        </div>

        <!-- Crescimento por cidade -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;margin-bottom:1rem;">
            <p style="font-size:.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin:0 0 .25rem;">
                🏙 Ativações por Cidade — Evolução Mensal
            </p>
            <p style="font-size:.68rem;color:#94a3b8;margin:0 0 .5rem;line-height:1.5;">
                Novas ativações mensais segmentadas por cidade de instalação. Fonte: Contratos (Cidade + Data_ativacao), filtrado pelo período selecionado. Entradas numéricas na coluna Cidade (problemas de cadastro) são excluídas automaticamente. Cada linha representa uma cidade; picos isolados indicam expansão pontual ou campanha comercial localizada. Cidades com volume crescente sinalizam mercados em consolidação; cidades com queda podem indicar saturação de cobertura ou perda para concorrência.
            </p>
            <div style="position:relative;height:240px;"><canvas id="anCidades"></canvas></div>
        </div>
    `;

    _renderNetAdds(d2);
    _renderArpu(d2);
    _renderPlanosAtual(d.planos_atual || []);
    _renderPlanosTrend(d.planos_trend || []);
    _renderCohort(d.cohort || []);
    _renderCidades(d.cidades || [], d.city_trend || []);
}

// ── Net Adds ──────────────────────────────────────────────────────────────────

function _renderNetAdds(d2) {
    const canvas = document.getElementById('anNetAdds');
    if (!canvas || !d2) return;
    const hist = (d2.historico || []).filter(h => !h.extrapolado);
    const labels    = hist.map(h => h.periodo);
    const netVals   = hist.map(h => (h.novos || 0) - (h.churn || 0) - (h.neg || 0));
    const colors    = netVals.map(v => v >= 0 ? '#10b981cc' : '#ef4444cc');
    const borderC   = netVals.map(v => v >= 0 ? '#10b981'   : '#ef4444');
    _analiseCharts.netAdds = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Novos',  data: hist.map(h => h.novos  || 0), backgroundColor: '#3b82f655', stack: 'a' },
                { label: 'Churn',  data: hist.map(h => -(h.churn || 0)), backgroundColor: '#ef444455', stack: 'b' },
                { label: 'Neg',    data: hist.map(h => -(h.neg   || 0)), backgroundColor: '#f9731655', stack: 'b' },
                { type: 'line', label: 'Net', data: netVals,
                  borderColor: borderC, backgroundColor: 'transparent',
                  borderWidth: 2, pointRadius: 3, tension: 0.3,
                  segment: { borderColor: ctx => netVals[ctx.p1DataIndex] >= 0 ? '#10b981' : '#ef4444' } },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { font: { size: 10 } } } },
            scales: {
                x: { ticks: { font: { size: 8 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } },
                y: { ticks: { font: { size: 9 } } },
            },
        },
    });
}

// ── ARPU ──────────────────────────────────────────────────────────────────────

function _renderArpu(d2) {
    const canvas = document.getElementById('anArpu');
    if (!canvas || !d2) return;
    const hist = (d2.historico || []).filter(h => !h.extrapolado);
    const labels = hist.map(h => h.periodo);
    const arpu   = hist.map(h => h.clientes > 0 ? +(h.mrr / h.clientes).toFixed(2) : null);
    _analiseCharts.arpu = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'ARPU (R$)', data: arpu,
                borderColor: '#8b5cf6', backgroundColor: '#8b5cf622',
                borderWidth: 2, fill: true, tension: 0.3, pointRadius: 3,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: ctx => `ARPU: R$ ${ctx.parsed.y?.toFixed(2)}` } } },
            scales: {
                x: { ticks: { font: { size: 8 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } },
                y: { beginAtZero: false, ticks: { font: { size: 9 }, callback: v => `R$${v}` } },
            },
        },
    });
}

// ── Mix de planos (donut atual) ───────────────────────────────────────────────

const _PLAN_COLORS = [
    '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#f97316','#84cc16','#e11d48','#6366f1',
];

function _renderPlanosAtual(planos) {
    const canvas = document.getElementById('anPlanosAtual');
    if (!canvas || !planos.length) return;
    const labels = planos.map(p => `${p.plano} (${p.pct}%)`);
    const data   = planos.map(p => p.count);
    _analiseCharts.planosAtual = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: _PLAN_COLORS, borderWidth: 1 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 12 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed.toLocaleString('pt-BR')} contratos` } },
            },
        },
    });
}

// ── Mix de planos (trend stacked bar) ────────────────────────────────────────

function _renderPlanosTrend(trend) {
    const canvas = document.getElementById('anPlanosTrend');
    if (!canvas || !trend.length) return;
    const labels = trend.map(t => t.periodo);
    const allPlanos = [...new Set(trend.flatMap(t => Object.keys(t).filter(k => k !== 'periodo')))];
    allPlanos.sort();
    const datasets = allPlanos.map((pl, i) => ({
        label: pl,
        data: trend.map(t => t[pl] || 0),
        backgroundColor: _PLAN_COLORS[i % _PLAN_COLORS.length],
        stack: 'planos',
    }));
    _analiseCharts.planosTrend = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
            scales: {
                x: { stacked: true, ticks: { font: { size: 8 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } },
                y: { stacked: true, ticks: { font: { size: 9 } } },
            },
        },
    });
}

// ── Coorte ────────────────────────────────────────────────────────────────────

function _renderCohort(cohort) {
    const el = document.getElementById('anCohortTable');
    if (!el || !cohort.length) {
        if (el) el.innerHTML = '<p style="color:#9ca3af;font-size:.8rem;">Sem dados de coorte.</p>';
        return;
    }
    const thS = 'padding:.35rem .6rem;text-align:left;font-size:.72rem;white-space:nowrap;' +
                'background:#0f2d5e;color:#fff;position:sticky;top:0;';
    const rows = cohort.map((c, i) => {
        const ret = c.retencao;
        const bg  = ret >= 70 ? '#f0fdf4' : ret >= 50 ? '#fffbeb' : '#fef2f2';
        const fc  = ret >= 70 ? '#16a34a' : ret >= 50 ? '#d97706' : '#dc2626';
        const bar = Math.round(ret);
        return `<tr style="background:${i%2===0?'#fff':bg};">
            <td style="padding:.35rem .6rem;font-size:.75rem;">${c.mes}</td>
            <td style="padding:.35rem .6rem;font-size:.75rem;text-align:right;">${c.total.toLocaleString('pt-BR')}</td>
            <td style="padding:.35rem .6rem;font-size:.75rem;text-align:right;">${c.ativos.toLocaleString('pt-BR')}</td>
            <td style="padding:.35rem .6rem;font-size:.75rem;">
                <div style="display:flex;align-items:center;gap:.4rem;">
                    <div style="flex:1;background:#e5e7eb;border-radius:4px;height:8px;min-width:80px;">
                        <div style="width:${bar}%;background:${fc};border-radius:4px;height:8px;"></div>
                    </div>
                    <span style="font-weight:700;color:${fc};min-width:3rem;">${ret.toFixed(1)}%</span>
                </div>
            </td>
        </tr>`;
    }).join('');
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;">
        <thead><tr>
            <th style="${thS}">Mês Ativação</th>
            <th style="${thS}text-align:right;">Ativados</th>
            <th style="${thS}text-align:right;">Ainda Ativos</th>
            <th style="${thS}">Retenção Atual</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ── Cidades ───────────────────────────────────────────────────────────────────

function _renderCidades(cidades, trend) {
    const canvas = document.getElementById('anCidades');
    if (!canvas || !trend.length) return;
    const labels = trend.map(t => t.periodo);
    const CITY_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
    const datasets = cidades.map((cidade, i) => ({
        label: cidade,
        data: trend.map(t => t[cidade] || 0),
        borderColor: CITY_COLORS[i % CITY_COLORS.length],
        backgroundColor: CITY_COLORS[i % CITY_COLORS.length] + '22',
        borderWidth: 2, fill: false, tension: 0.3, pointRadius: 3,
    }));
    _analiseCharts.cidades = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 12 } } },
            scales: {
                x: { ticks: { font: { size: 8 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } },
                y: { beginAtZero: true, ticks: { font: { size: 9 } } },
            },
        },
    });
}
