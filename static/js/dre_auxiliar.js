/**
 * dre_auxiliar.js
 * Aba Auxiliar do DRE — métricas de negócio:
 * Churn, CAC, LTV, ARPU, MRR, PMR, Inadimplência, Operações, Penetração
 */

import * as state from './state.js';
import { formatCurrency } from './utils.js';

const API          = state.API_BASE_URL;
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

let _auxChart     = null;
let _motivoChart  = null;
let _cacSelected  = new Set();
let _stContrato   = new Set(['Ativo']);
let _stAcesso     = new Set(['Ativo']);
let _auxFilters   = { start_date: '', end_date: '' };
let _cbsLoaded    = false;
let _stLoaded     = false;

// Cores para motivos de cancelamento (categorias)
const _MOTIVO_COLOR = {
    4:  '#ef4444', // Pendência financeira → vermelho
    12: '#f97316', // Dificuldades financeiras → laranja
    10: '#f59e0b', // Insatisfação → âmbar
    3:  '#84cc16', // A pedido do cliente → verde-limão
    9:  '#10b981', // Cancelamento → esmeralda
    11: '#06b6d4', // Mudança de endereço → ciano
    13: '#3b82f6', // Viagem → azul
    5:  '#8b5cf6', // Migração de plano → violeta
    8:  '#a78bfa', // Migração de vencimento → roxo claro
    1:  '#94a3b8', // Alteração de contrato → cinza
    2:  '#64748b', // Cancel. renegociação → cinza escuro
    14: '#475569', // Término de contrato → slate
    15: '#334155', // Suspensão temporária → slate escuro
};

// ============================================================
// Entry point
// ============================================================
export async function renderAuxiliar(container, inheritedFilters) {
    _auxFilters = { ...inheritedFilters };
    container.innerHTML = _auxShell();
    _initAuxDates();
    _bindAuxEvents();
    await _loadAux();
}

// ============================================================
// Shell
// ============================================================
function _auxShell() {
    return `
<div id="dre-aux-root">
<style>
  #dre-aux-root .aux-section       { margin-bottom:1.5rem; }
  #dre-aux-root .aux-section-title { font-size:0.88rem;font-weight:700;color:#0f2d5e;
                                      margin:0 0 0.75rem;padding-bottom:0.4rem;
                                      border-bottom:2px solid #e2e8f0; }
  #dre-aux-root .aux-metric-grid   { display:grid;
                                      grid-template-columns:repeat(auto-fill,minmax(195px,1fr));
                                      gap:0.75rem; }
  #dre-aux-root .aux-card          { background:#fff;border-radius:10px;padding:1rem 1.1rem;
                                      box-shadow:0 2px 8px rgba(15,45,94,0.07);
                                      border:1px solid #dde3ec;
                                      display:flex;flex-direction:column;gap:0.25rem; }
  #dre-aux-root .aux-label         { font-size:0.7rem;font-weight:600;color:#64748b;
                                      text-transform:uppercase;letter-spacing:0.05em; }
  #dre-aux-root .aux-value         { font-size:1.35rem;font-weight:800;color:#0f2d5e; }
  #dre-aux-root .aux-sub           { font-size:0.72rem;color:#94a3b8;margin-top:0.1rem; }
  #dre-aux-root .aux-desc          { font-size:0.67rem;color:#b0bec5;margin-top:0.3rem;
                                      line-height:1.35;font-style:italic;
                                      border-top:1px solid #f1f5f9;padding-top:0.3rem; }
</style>

    <!-- Filtros de data -->
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-bottom:1.25rem;">
        <input type="date" id="auxStartDate"
            style="background:#f8fafc;border:1.5px solid #dde3ec;border-radius:7px;
                   padding:0.42rem 0.7rem;font-size:0.82rem;color:#1e293b;height:34px;">
        <span style="color:#94a3b8;font-size:0.85rem;">até</span>
        <input type="date" id="auxEndDate"
            style="background:#f8fafc;border:1.5px solid #dde3ec;border-radius:7px;
                   padding:0.42rem 0.7rem;font-size:0.82rem;color:#1e293b;height:34px;">
        <button id="auxFilterBtn"
            style="background:#6366f1;color:#fff;border:none;border-radius:7px;
                   padding:0.42rem 1.1rem;font-size:0.82rem;font-weight:600;
                   cursor:pointer;height:34px;">
            Filtrar
        </button>
    </div>

    <!-- Painel CAC -->
    <div style="background:#f8fafc;border:1.5px solid #dde3ec;border-radius:10px;
                padding:0.85rem 1.1rem;margin-bottom:1.25rem;">
        <div id="auxCacToggle"
             style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
            <span style="font-weight:700;font-size:0.88rem;color:#0f2d5e;">
                ⚙️ Configurar componentes do CAC
            </span>
            <span id="auxCacArrow" style="color:#6366f1;font-size:1rem;">▼</span>
        </div>
        <div id="auxCacContent" style="display:none;margin-top:0.75rem;">
            <p style="font-size:0.77rem;color:#64748b;margin:0 0 0.5rem;">
                Marque os subgrupos do DRE que compõem o custo de aquisição de clientes:
            </p>
            <div id="auxCacCheckboxes" style="display:flex;flex-wrap:wrap;gap:0.4rem;max-height:160px;overflow-y:auto;"></div>
            <div style="display:flex;gap:0.4rem;margin-top:0.6rem;">
                <button id="auxCacSelAll"
                    style="background:#f1f5f9;color:#0f2d5e;border:1.5px solid #dde3ec;
                           border-radius:7px;padding:0.3rem 0.6rem;font-size:0.75rem;
                           font-weight:600;cursor:pointer;">
                    Selecionar tudo
                </button>
                <button id="auxCacClearAll"
                    style="background:#f1f5f9;color:#0f2d5e;border:1.5px solid #dde3ec;
                           border-radius:7px;padding:0.3rem 0.6rem;font-size:0.75rem;
                           font-weight:600;cursor:pointer;">
                    Limpar
                </button>
                <button id="auxCacApply"
                    style="background:#6366f1;color:#fff;border:none;border-radius:7px;
                           padding:0.3rem 0.75rem;font-size:0.75rem;font-weight:600;cursor:pointer;">
                    Aplicar
                </button>
            </div>
        </div>
    </div>

    <!-- Painel: Definição de Clientes Ativos -->
    <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;
                padding:0.85rem 1.1rem;margin-bottom:1.25rem;">
        <div id="auxStatusToggle"
             style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
            <span style="font-weight:700;font-size:0.88rem;color:#0369a1;">
                👥 Definição de Clientes Ativos
            </span>
            <span id="auxStatusArrow" style="color:#0369a1;font-size:1rem;">▼</span>
        </div>
        <div id="auxStatusContent" style="display:none;margin-top:0.75rem;">
            <div style="display:flex;gap:2rem;flex-wrap:wrap;">
                <div>
                    <p style="font-size:0.77rem;font-weight:600;color:#0f2d5e;margin:0 0 0.4rem;">
                        Status do Contrato
                    </p>
                    <div id="auxStContratoBoxes" style="display:flex;flex-wrap:wrap;gap:0.35rem;"></div>
                </div>
                <div>
                    <p style="font-size:0.77rem;font-weight:600;color:#0f2d5e;margin:0 0 0.4rem;">
                        Status de Acesso
                    </p>
                    <div id="auxStAcessoBoxes" style="display:flex;flex-wrap:wrap;gap:0.35rem;"></div>
                </div>
            </div>
            <div style="display:flex;gap:0.4rem;margin-top:0.6rem;align-items:center;">
                <button id="auxStatusApply"
                    style="background:#0369a1;color:#fff;border:none;border-radius:7px;
                           padding:0.3rem 0.75rem;font-size:0.75rem;font-weight:600;cursor:pointer;">
                    Aplicar
                </button>
                <span style="font-size:0.72rem;color:#64748b;" id="auxActiveLabel"></span>
            </div>
        </div>
    </div>

    <!-- Loading -->
    <div id="auxLoading" style="color:#888;padding:1rem;font-size:0.9rem;">Carregando métricas…</div>

    <!-- Conteúdo -->
    <div id="auxContent" style="display:none;">

        <!-- Receita & Base -->
        <div class="aux-section">
            <h3 class="aux-section-title">📈 Receita & Base de Clientes</h3>
            <div class="aux-metric-grid" id="auxGridReceita"></div>
        </div>

        <!-- Churn -->
        <div class="aux-section">
            <h3 class="aux-section-title">📉 Churn (Cancelamentos)</h3>
            <div class="aux-metric-grid" id="auxGridChurn"></div>
        </div>

        <!-- Churn por Motivo -->
        <div style="background:#fff;border-radius:12px;padding:1.25rem;
                    box-shadow:0 2px 8px rgba(15,45,94,0.08);border:1px solid #dde3ec;
                    margin-bottom:1.5rem;">
            <div style="font-size:0.875rem;font-weight:700;color:#0f2d5e;
                        margin-bottom:0.875rem;padding-bottom:0.6rem;border-bottom:2px solid #ef4444;">
                🚪 Cancelamentos por Motivo
            </div>
            <div id="auxMotivoWrap" style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-start;">
                <div style="flex:1 1 340px;position:relative;min-height:220px;">
                    <canvas id="auxMotivoChart"></canvas>
                </div>
                <div id="auxMotivoTable" style="flex:1 1 260px;overflow-y:auto;max-height:320px;"></div>
            </div>
        </div>

        <!-- Gráfico de tendência -->
        <div style="background:#fff;border-radius:12px;padding:1.25rem;
                    box-shadow:0 2px 8px rgba(15,45,94,0.08);border:1px solid #dde3ec;
                    margin-bottom:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;
                        margin-bottom:0.875rem;padding-bottom:0.6rem;border-bottom:2px solid #6366f1;">
                <span style="font-size:0.875rem;font-weight:700;color:#0f2d5e;">
                    Tendência: MRR · Novos Clientes · Cancelamentos
                </span>
                <div style="display:flex;gap:0.6rem;font-size:0.75rem;color:#64748b;align-items:center;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                                 background:#6366f1;margin-right:2px;"></span>MRR
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                                 background:#10b981;margin-right:2px;"></span>Novos
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                                 background:#ef4444;margin-right:2px;"></span>Churn
                </div>
            </div>
            <div style="position:relative;height:220px;">
                <canvas id="auxTrendChart"></canvas>
            </div>
        </div>

        <!-- CAC / LTV -->
        <div class="aux-section">
            <h3 class="aux-section-title">💰 Aquisição: CAC · LTV · Payback</h3>
            <div id="auxCacNote" style="font-size:0.77rem;color:#94a3b8;margin-bottom:0.6rem;"></div>
            <div class="aux-metric-grid" id="auxGridCac"></div>
        </div>

        <!-- Inadimplência / PMR -->
        <div class="aux-section">
            <h3 class="aux-section-title">🧾 Inadimplência & PMR</h3>
            <div class="aux-metric-grid" id="auxGridPmr"></div>
        </div>

        <!-- Operações de campo -->
        <div class="aux-section">
            <h3 class="aux-section-title">🔧 Operações de Campo</h3>
            <div class="aux-metric-grid" id="auxGridOps"></div>
        </div>

        <!-- Custos & Penetração -->
        <div class="aux-section">
            <h3 class="aux-section-title">🏢 Custos & Penetração</h3>
            <div class="aux-metric-grid" id="auxGridCustos"></div>
        </div>

        <!-- Tabela de penetração por cidade -->
        <div style="background:#fff;border-radius:12px;padding:1.25rem;
                    box-shadow:0 2px 8px rgba(15,45,94,0.08);border:1px solid #dde3ec;
                    margin-bottom:1rem;">
            <div style="font-size:0.875rem;font-weight:700;color:#0f2d5e;
                        margin-bottom:0.75rem;padding-bottom:0.4rem;border-bottom:2px solid #6366f1;">
                Taxa de Penetração por Cidade
            </div>
            <div id="auxCityTable" style="overflow-x:auto;max-height:320px;overflow-y:auto;"></div>
        </div>

    </div>
</div>`;
}

// ============================================================
// Load
// ============================================================
async function _loadAux() {
    const loading = document.getElementById('auxLoading');
    const content = document.getElementById('auxContent');
    if (loading) { loading.style.display = ''; loading.textContent = 'Carregando métricas…'; }
    if (content) content.style.display = 'none';

    const params = new URLSearchParams({
        ..._auxFilters,
        cac_subgrupos: [..._cacSelected].join('||'),
        st_contrato:   [..._stContrato].join(','),
        st_acesso:     [..._stAcesso].join(','),
    });

    try {
        const r = await fetch(`${API}/api/dre/auxiliar?${params}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.error) throw new Error(d.error);

        if (!_cbsLoaded && d.avail_subgrupos?.length) {
            _populateCacCheckboxes(d.avail_subgrupos);
            _cbsLoaded = true;
        }
        if (!_stLoaded && (d.avail_st_contrato?.length || d.avail_st_acesso?.length)) {
            _populateStatusCheckboxes(d.avail_st_contrato || [], d.avail_st_acesso || []);
            _stLoaded = true;
        }
        _updateActiveLabel(d.kpis);

        _renderKpis(d);
        _renderMotivoChart(d.churn_by_motivo || []);
        _renderChart(d.trend);
        _renderCityTable(d.city_penetracao);

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = '';
    } catch (e) {
        if (loading) {
            loading.style.display = '';
            loading.innerHTML = `<span style="color:#e11d48;">Erro ao carregar: ${e.message}</span>`;
        }
    }
}

// ============================================================
// KPI render
// ============================================================
function _renderKpis(d) {
    const k   = d.kpis;
    const fmt = v => formatCurrency(v || 0);
    const fN  = (v, dec = 1) => (v != null ? Number(v).toFixed(dec).replace('.', ',') : '—');
    const fI  = v => (v || 0).toLocaleString('pt-BR');

    // Receita & Base
    _fillGrid('auxGridReceita', [
        { label:'MRR', value: fmt(k.mrr),
          sub: 'Receita recorrente (último mês)',
          desc: 'Monthly Recurring Revenue — soma de toda a receita recebida no último mês do período selecionado.',
          color:'#10b981' },
        { label:'ARPU', value: fmt(k.arpu),
          sub: 'Receita média por cliente ativo',
          desc: 'Average Revenue Per User — MRR dividido pelo total de clientes ativos. Indica o ticket médio mensal.',
          color:'#10b981' },
        { label:'Clientes Ativos', value: fI(k.active_clients),
          sub: `de ${fI(k.total_cadastrados)} cadastrados`,
          desc: 'Contratos com Status "Ativo" e acesso ativo. Total cadastrados inclui todos os clientes já registrados.',
          color:'#6366f1' },
        { label:'Novas Ativações', value: fI(k.new_clients),
          sub: `em ${d.period_months} mes(es) analisados`,
          desc: 'Contratos ativados (Data de ativação) dentro do período filtrado.',
          color:'#0ea5e9' },
    ]);

    // Churn
    const cr    = k.churn_rate || 0;
    const cc    = cr > 5 ? '#ef4444' : cr > 2 ? '#f59e0b' : '#10b981';
    _fillGrid('auxGridChurn', [
        { label:'Taxa de Churn / mês', value: fN(cr, 2) + '%',
          sub: `média do período (${fI(k.churn_total)} cancelamentos)`,
          desc: 'Percentual de clientes que cancelaram por mês. Referência: abaixo de 2% = saudável; acima de 5% = crítico.',
          color: cc },
        { label:'Cancelamentos / mês', value: fI(k.churn_count),
          sub: `${fI(k.churn_total)} total no período`,
          desc: 'Quantidade média de contratos encerrados por mês. Considere sazonalidade e motivos para análise.',
          color: cc },
        { label:'Negativações / mês', value: fI(k.neg_count),
          sub: `${fI(k.neg_total)} total no período`,
          desc: 'Quantidade média de contratos negativados por mês (baseado em Data_negativa_o). Clientes com acesso suspenso por inadimplência.',
          color: '#f59e0b' },
        { label:'Cancelados + Negativados / mês', value: fI(k.combined_count),
          sub: `${fI(k.combined_total)} total no período`,
          desc: 'Soma de cancelamentos e negativações por mês. Representa o total de contratos saídos ou suspensos no período.',
          color: '#ef4444' },
    ]);

    // CAC note
    const cacNote = document.getElementById('auxCacNote');
    if (cacNote) {
        if (_cacSelected.size === 0) {
            cacNote.innerHTML = '⚠️ Nenhum subgrupo selecionado — <em>CAC, LTV e Payback não calculados.</em> Configure o painel acima.';
        } else {
            cacNote.textContent = `Subgrupos incluídos no CAC: ${[..._cacSelected].join(' · ')}`;
        }
    }

    // CAC / LTV
    const lc    = k.ltv_cac || 0;
    const lcc   = lc >= 3 ? '#10b981' : lc >= 1 ? '#f59e0b' : '#ef4444';
    const lifeM = k.arpu > 0 && k.ltv > 0 ? Math.round(k.ltv / k.arpu) : 0;
    _fillGrid('auxGridCac', [
        { label:'CAC', value: k.cac > 0 ? fmt(k.cac) : '—',
          sub: `${fmt(k.cac_cost)} ÷ ${fI(k.new_clients)} ativações`,
          desc: 'Custo de Aquisição de Cliente — total gasto com os subgrupos selecionados dividido pelas novas ativações no período.',
          color:'#6366f1' },
        { label:'LTV', value: k.ltv > 0 ? fmt(k.ltv) : '—',
          sub: lifeM > 0 ? `ARPU × ${lifeM} meses de vida útil média` : 'Requer dados de churn',
          desc: 'Lifetime Value — receita total esperada de um cliente ao longo de sua vida útil média. Calculado como ARPU ÷ Taxa de Churn mensal.',
          color:'#6366f1' },
        { label:'LTV / CAC', value: lc > 0 ? fN(lc, 1) + 'x' : '—',
          sub: 'Ideal ≥ 3x para negócio saudável',
          desc: 'Razão entre o retorno gerado pelo cliente e o custo para adquiri-lo. Abaixo de 1x = prejuízo; entre 1–3x = atenção; acima de 3x = saudável.',
          color: lcc },
        { label:'Payback CAC', value: k.payback_months > 0 ? fN(k.payback_months, 1) + ' meses' : '—',
          sub: 'Tempo para recuperar o CAC via ARPU',
          desc: 'Quantos meses de ARPU são necessários para cobrir o CAC. Quanto menor, mais rápido o retorno sobre o investimento em aquisição.',
          color:'#94a3b8' },
    ]);

    // PMR / Inadimplência
    _fillGrid('auxGridPmr', [
        { label:'Inadimplência', value: fN(k.inadimplencia_pct, 1) + '%',
          sub: `${fmt(k.inadimplencia_valor)} em aberto vencido`,
          desc: 'Percentual de faturas vencidas e não pagas sobre o total em aberto. Inclui todas as contas com vencimento já ultrapassado.',
          color:'#ef4444' },
        { label:'PMR (geral)', value: fN(k.pmr_days, 0) + ' dias',
          sub: 'Prazo médio de recebimento (todos)',
          desc: 'Prazo Médio de Recebimento — média de dias entre o vencimento e o pagamento. Valor negativo indica pagamento antecipado ao vencimento.',
          color:'#f59e0b' },
        { label:'PMR (em atraso)', value: fN(k.pmr_late_days, 0) + ' dias',
          sub: 'Média apenas dos pagamentos atrasados',
          desc: 'PMR calculado somente para os pagamentos realizados após o vencimento. Indica o atraso médio dos inadimplentes que eventualmente pagam.',
          color:'#f59e0b' },
    ]);

    // Operações
    const up  = k.uptime_pct || 0;
    const upc = up >= 99 ? '#10b981' : up >= 95 ? '#f59e0b' : '#ef4444';
    const rc  = k.resolucao_1c || 0;
    const rcc = rc >= 70 ? '#10b981' : rc >= 50 ? '#f59e0b' : '#ef4444';
    _fillGrid('auxGridOps', [
        { label:'Truck Rolls / cliente', value: fN(k.truck_per_client, 2),
          sub: `${fI(k.truck_rolls)} OS no período`,
          desc: 'Quantidade de visitas técnicas (Ordens de Serviço) por cliente ativo no período. Alto índice pode indicar problemas de qualidade na rede.',
          color:'#0f2d5e' },
        { label:'MTTR', value: fN(k.mttr_hours, 1) + 'h',
          sub: 'Tempo médio de reparo (OS manutenção)',
          desc: 'Mean Time To Repair — horas em média para resolver uma OS de manutenção, oscilação ou falha. Meta comum: abaixo de 4h.',
          color:'#0f2d5e' },
        { label:'Uptime estimado', value: fN(up, 2) + '%',
          sub: 'Proxy via horas de manutenção',
          desc: 'Disponibilidade estimada da rede. Calculado como: 1 - (MTTR × nº de manutenções) / total de horas no período. Proxy, não uptime real medido.',
          color: upc },
        { label:'Tempo de Instalação', value: fN(k.tempo_instalacao, 1) + 'h',
          sub: 'Média abertura → fechamento OS instalação',
          desc: 'Horas médias entre abertura e fechamento de Ordens de Serviço de instalação de fibra. Impacta diretamente na experiência do novo cliente.',
          color:'#0f2d5e' },
        { label:'Resolução 1º Contato',
          value: (k.resolucao_com_dados || 0) > 0 ? fN(rc, 1) + '%' : 'N/D',
          sub: (k.resolucao_com_dados || 0) > 0
            ? `de ${fI(k.resolucao_com_dados)} atendimentos c/ dados`
            : `${fI(k.total_atendimentos)} atendimentos (sem dados de msg)`,
          desc: 'First Contact Resolution — percentual de atendimentos encerrados com 1 ou menos mensagens enviadas pelo cliente. N/D quando o campo Msgs_cliente não foi preenchido.',
          color: (k.resolucao_com_dados || 0) > 0 ? rcc : '#94a3b8' },
    ]);

    // Custos & Penetração
    _fillGrid('auxGridCustos', [
        { label:'OPEX / Cliente / Mês', value: fmt(k.opex_per_client),
          sub: `${fmt(k.total_opex)} total no período`,
          desc: 'Custo operacional total (OPEX da DRE) dividido por clientes ativos e meses do período. Indica o custo médio para manter cada cliente.',
          color:'#6366f1' },
        { label:'Custo / Mbps', value: k.custo_por_mbps > 0
            ? 'R$ ' + Number(k.custo_por_mbps).toFixed(4).replace('.', ',') : '—',
          sub: `${fI(k.total_mbps)} Mbps em contratos ativos`,
          desc: 'OPEX total dividido pela soma de Mbps de todos os contratos ativos. A velocidade é extraída do campo de descrição do plano (ex: "200M").',
          color:'#6366f1' },
        { label:'Taxa de Penetração', value: fN(k.taxa_penetracao, 1) + '%',
          sub: `${fI(k.active_clients)} ativos / ${fI(k.total_cadastrados)} cadastrados`,
          desc: 'Percentual de clientes com contrato ativo sobre o total de clientes já cadastrados na base. Indica o aproveitamento da base de prospects.',
          color:'#6366f1' },
    ]);
}

function _fillGrid(id, cards) {
    const g = document.getElementById(id);
    if (!g) return;
    const valColor = c =>
        c.color === '#ef4444' ? '#dc2626'
        : c.color === '#f97316' ? '#ea580c'
        : c.color === '#f59e0b' ? '#d97706'
        : c.color === '#10b981' ? '#16a34a'
        : '#0f2d5e';
    g.innerHTML = cards.map(c => `
        <div class="aux-card" style="border-left:4px solid ${c.color};">
            <span class="aux-label">${c.label}</span>
            <span class="aux-value" style="color:${valColor(c)}">${c.value}</span>
            <span class="aux-sub">${c.sub}</span>
            ${c.desc ? `<span class="aux-desc">${c.desc}</span>` : ''}
        </div>
    `).join('');
}

// ============================================================
// Churn por motivo — gráfico horizontal + tabela
// ============================================================
function _renderMotivoChart(data) {
    // Tabela lateral
    const tbl = document.getElementById('auxMotivoTable');
    if (tbl) {
        if (!data.length) {
            tbl.innerHTML = '<p style="color:#94a3b8;font-size:0.82rem;">Sem dados de motivo no período.</p>';
        } else {
            const rows = data.map((r, i) => {
                const bg  = i % 2 === 0 ? '#fff' : '#f8fafc';
                const col = _MOTIVO_COLOR[r.motivo_id] || '#94a3b8';
                return `<tr style="background:${bg};">
                    <td style="padding:0.35rem 0.6rem;font-size:0.78rem;">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                                     background:${col};margin-right:0.3rem;"></span>
                        ${r.motivo}
                    </td>
                    <td style="padding:0.35rem 0.6rem;font-size:0.78rem;text-align:right;font-weight:600;">
                        ${r.count.toLocaleString('pt-BR')}
                    </td>
                    <td style="padding:0.35rem 0.6rem;font-size:0.78rem;text-align:right;color:#64748b;">
                        ${r.pct}%
                    </td>
                </tr>`;
            }).join('');
            const thS = 'padding:0.4rem 0.6rem;text-align:left;font-size:0.75rem;' +
                        'background:#0f2d5e;color:#fff;white-space:nowrap;position:sticky;top:0;';
            tbl.innerHTML = `<table style="width:100%;border-collapse:collapse;">
                <thead><tr>
                    <th style="${thS}">Motivo</th>
                    <th style="${thS}text-align:right;">Qtd</th>
                    <th style="${thS}text-align:right;">%</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        }
    }

    // Gráfico horizontal
    const canvas = document.getElementById('auxMotivoChart');
    if (!canvas) return;
    if (_motivoChart) { _motivoChart.destroy(); _motivoChart = null; }
    if (!data.length) return;

    // Ordenar por contagem desc, limitar top 10
    const top = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = top.map(r => r.motivo);
    const counts = top.map(r => r.count);
    const colors = top.map(r => _MOTIVO_COLOR[r.motivo_id] || '#94a3b8');

    // Ajustar altura do canvas dinamicamente
    const height = Math.max(200, top.length * 30 + 40);
    canvas.parentElement.style.minHeight = height + 'px';

    _motivoChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: colors.map(c => c + 'cc'),
                borderColor:     colors,
                borderWidth: 1.5,
                borderRadius: 4,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const item = top[ctx.dataIndex];
                            return ` ${ctx.parsed.x.toLocaleString('pt-BR')} cancelamentos (${item.pct}%)`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 10 } },
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10 },
                        callback: function(val) {
                            const lbl = this.getLabelForValue(val);
                            return lbl.length > 22 ? lbl.slice(0, 20) + '…' : lbl;
                        },
                    },
                },
            },
        },
    });
}

// ============================================================
// Trend chart
// ============================================================
function _renderChart(trend) {
    const canvas = document.getElementById('auxTrendChart');
    if (!canvas) return;
    if (_auxChart) { _auxChart.destroy(); _auxChart = null; }
    if (!trend?.length) return;

    const labels = trend.map(r => {
        const [y, m] = r.periodo.split('-');
        return MONTHS_SHORT[parseInt(m) - 1] + '/' + y.slice(2);
    });

    _auxChart = new Chart(canvas.getContext('2d'), {
        data: {
            labels,
            datasets: [
                {
                    type: 'line', label: 'MRR (R$)',
                    data: trend.map(r => r.mrr),
                    borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.07)',
                    borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: true,
                    yAxisID: 'yMrr', order: 1,
                },
                {
                    type: 'bar', label: 'Novos clientes',
                    data: trend.map(r => r.novos),
                    backgroundColor: 'rgba(16,185,129,0.72)', borderColor: '#10b981',
                    borderWidth: 1, yAxisID: 'yCnt', order: 2,
                },
                {
                    type: 'bar', label: 'Cancelamentos',
                    data: trend.map(r => r.churn),
                    backgroundColor: 'rgba(239,68,68,0.72)', borderColor: '#ef4444',
                    borderWidth: 1, yAxisID: 'yCnt', order: 2,
                },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y || 0;
                            if (ctx.dataset.yAxisID === 'yMrr') {
                                return ' MRR: ' + v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
                            }
                            return ` ${ctx.dataset.label}: ${v.toLocaleString('pt-BR')}`;
                        },
                    },
                },
            },
            scales: {
                x:    { grid:{ display:false }, ticks:{ font:{ size:10 } } },
                yMrr: {
                    position: 'left',
                    grid: { color:'rgba(0,0,0,0.05)' },
                    ticks: {
                        font: { size:10 },
                        callback: v => {
                            if (v >= 1e6) return 'R$' + (v/1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return 'R$' + (v/1e3).toFixed(0) + 'k';
                            return 'R$' + v;
                        },
                    },
                },
                yCnt: {
                    position: 'right',
                    grid: { display:false },
                    ticks: { font:{ size:10 }, stepSize:1 },
                },
            },
        },
    });
}

// ============================================================
// City penetration table
// ============================================================
function _renderCityTable(rows) {
    const el = document.getElementById('auxCityTable');
    if (!el) return;
    if (!rows?.length) {
        el.innerHTML = '<p style="color:#94a3b8;padding:0.5rem;font-size:0.82rem;">Sem dados por cidade.</p>';
        return;
    }
    const thS = 'padding:0.45rem 0.75rem;text-align:left;white-space:nowrap;' +
                'background:#0f2d5e;color:#fff;font-size:0.78rem;position:sticky;top:0;';
    const th  = ['Cidade','Ativos','Cadastrados','Penetração'].map(h =>
        `<th style="${thS}">${h}</th>`
    ).join('');

    const trs = rows.map((r, i) => {
        const bg  = i % 2 === 0 ? '#fff' : '#f8fafc';
        const bar = Math.min(100, Math.round(r.pct));
        return `<tr style="background:${bg};">
            <td style="padding:0.4rem 0.75rem;font-size:0.8rem;">${r.cidade}</td>
            <td style="padding:0.4rem 0.75rem;font-size:0.8rem;text-align:right;">${r.ativos.toLocaleString('pt-BR')}</td>
            <td style="padding:0.4rem 0.75rem;font-size:0.8rem;text-align:right;">${r.cadastrados.toLocaleString('pt-BR')}</td>
            <td style="padding:0.4rem 0.75rem;font-size:0.8rem;">
                <div style="display:flex;align-items:center;gap:0.4rem;">
                    <div style="width:80px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                        <div style="width:${bar}%;height:100%;background:#6366f1;border-radius:4px;"></div>
                    </div>
                    <span style="font-weight:600;color:#4f46e5;min-width:38px;">${r.pct}%</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `<table style="width:100%;border-collapse:collapse;">
        <thead><tr>${th}</tr></thead>
        <tbody>${trs}</tbody>
    </table>`;
}

// ============================================================
// CAC checkboxes
// ============================================================
function _populateCacCheckboxes(subgrupos) {
    const container = document.getElementById('auxCacCheckboxes');
    if (!container) return;

    // Pré-selecionar subgrupos típicos de aquisição
    const defaultKeywords = ['3.7','4.7','4.1','comissão','comissoes','marketing','prestação','prestacao'];
    subgrupos.forEach(s => {
        const sl = s.toLowerCase();
        if (defaultKeywords.some(k => sl.includes(k))) _cacSelected.add(s);
    });

    container.innerHTML = subgrupos.map(s => {
        const sel = _cacSelected.has(s);
        return `<label class="cac-cb-label" style="display:inline-flex;align-items:center;
                    gap:0.3rem;cursor:pointer;white-space:nowrap;user-select:none;
                    background:${sel ? '#ede9fe' : '#f1f5f9'};
                    border:1px solid ${sel ? '#a78bfa' : '#dde3ec'};
                    border-radius:5px;padding:0.25rem 0.55rem;font-size:0.75rem;">
                <input type="checkbox" class="cac-cb" value="${s}" ${sel ? 'checked' : ''}
                    style="accent-color:#6366f1;">
                ${s}
            </label>`;
    }).join('');
}

function _setCbStyle(cb) {
    const lbl = cb.closest('.cac-cb-label');
    if (!lbl) return;
    lbl.style.background   = cb.checked ? '#ede9fe' : '#f1f5f9';
    lbl.style.borderColor  = cb.checked ? '#a78bfa' : '#dde3ec';
}

// ============================================================
// Status checkboxes (definição de clientes ativos)
// ============================================================
function _populateStatusCheckboxes(stC, stA) {
    _buildStatusGroup('auxStContratoBoxes', stC, _stContrato, '#0369a1');
    _buildStatusGroup('auxStAcessoBoxes',   stA, _stAcesso,   '#0369a1');
}

function _buildStatusGroup(containerId, items, selectedSet, accent) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = items.map(s => {
        const sel = selectedSet.has(s);
        return `<label class="st-cb-label" data-group="${containerId}"
                    style="display:inline-flex;align-items:center;gap:0.3rem;cursor:pointer;
                           user-select:none;white-space:nowrap;font-size:0.75rem;
                           background:${sel ? '#e0f2fe' : '#f1f5f9'};
                           border:1px solid ${sel ? accent : '#dde3ec'};
                           border-radius:5px;padding:0.25rem 0.55rem;">
                <input type="checkbox" class="st-cb" data-set="${containerId}" value="${s}"
                    ${sel ? 'checked' : ''} style="accent-color:${accent};">
                ${s}
            </label>`;
    }).join('');
}

function _updateStCbStyle(cb) {
    const lbl = cb.closest('.st-cb-label');
    if (!lbl) return;
    lbl.style.background   = cb.checked ? '#e0f2fe' : '#f1f5f9';
    lbl.style.borderColor  = cb.checked ? '#0369a1' : '#dde3ec';
}

function _updateActiveLabel(kpis) {
    const el = document.getElementById('auxActiveLabel');
    if (!el) return;
    const sc = [..._stContrato].join(', ');
    const sa = [..._stAcesso].join(', ');
    el.textContent = `${(kpis?.active_clients || 0).toLocaleString('pt-BR')} contratos — Contrato [${sc}] · Acesso [${sa}]`;
}

// ============================================================
// Date init
// ============================================================
function _initAuxDates() {
    if (_auxFilters.start_date) {
        const el = document.getElementById('auxStartDate');
        if (el) el.value = _auxFilters.start_date;
    }
    if (_auxFilters.end_date) {
        const el = document.getElementById('auxEndDate');
        if (el) el.value = _auxFilters.end_date;
    }
}

// ============================================================
// Events
// ============================================================
function _bindAuxEvents() {
    document.getElementById('auxFilterBtn')?.addEventListener('click', () => {
        _auxFilters.start_date = document.getElementById('auxStartDate')?.value || '';
        _auxFilters.end_date   = document.getElementById('auxEndDate')?.value   || '';
        _loadAux();
    });

    document.getElementById('auxCacToggle')?.addEventListener('click', () => {
        const c = document.getElementById('auxCacContent');
        const a = document.getElementById('auxCacArrow');
        if (!c) return;
        const open = c.style.display !== 'none';
        c.style.display = open ? 'none' : '';
        if (a) a.textContent = open ? '▼' : '▲';
    });

    document.getElementById('auxCacSelAll')?.addEventListener('click', () => {
        document.querySelectorAll('#auxCacCheckboxes .cac-cb').forEach(cb => {
            cb.checked = true;
            _cacSelected.add(cb.value);
            _setCbStyle(cb);
        });
    });

    document.getElementById('auxCacClearAll')?.addEventListener('click', () => {
        document.querySelectorAll('#auxCacCheckboxes .cac-cb').forEach(cb => {
            cb.checked = false;
            _cacSelected.delete(cb.value);
            _setCbStyle(cb);
        });
    });

    document.getElementById('auxCacApply')?.addEventListener('click', () => {
        _cacSelected.clear();
        document.querySelectorAll('#auxCacCheckboxes .cac-cb:checked').forEach(cb =>
            _cacSelected.add(cb.value)
        );
        // Fechar painel
        const c = document.getElementById('auxCacContent');
        const a = document.getElementById('auxCacArrow');
        if (c) c.style.display = 'none';
        if (a) a.textContent = '▼';
        _loadAux();
    });

    document.getElementById('auxCacCheckboxes')?.addEventListener('change', e => {
        if (e.target.classList.contains('cac-cb')) {
            if (e.target.checked) _cacSelected.add(e.target.value);
            else _cacSelected.delete(e.target.value);
            _setCbStyle(e.target);
        }
    });

    // Painel de status (Clientes Ativos)
    document.getElementById('auxStatusToggle')?.addEventListener('click', () => {
        const c = document.getElementById('auxStatusContent');
        const a = document.getElementById('auxStatusArrow');
        if (!c) return;
        const open = c.style.display !== 'none';
        c.style.display = open ? 'none' : '';
        if (a) a.textContent = open ? '▼' : '▲';
    });

    document.getElementById('auxStatusApply')?.addEventListener('click', () => {
        _stContrato.clear();
        _stAcesso.clear();
        document.querySelectorAll('#auxStContratoBoxes .st-cb:checked').forEach(cb => _stContrato.add(cb.value));
        document.querySelectorAll('#auxStAcessoBoxes .st-cb:checked').forEach(cb => _stAcesso.add(cb.value));
        // Ambos precisam de pelo menos um valor selecionado
        if (_stContrato.size === 0) _stContrato.add('Ativo');
        if (_stAcesso.size   === 0) _stAcesso.add('Ativo');
        const c = document.getElementById('auxStatusContent');
        const a = document.getElementById('auxStatusArrow');
        if (c) c.style.display = 'none';
        if (a) a.textContent = '▼';
        _loadAux();
    });

    document.getElementById('dre-aux-root')?.addEventListener('change', e => {
        if (e.target.classList.contains('st-cb')) {
            _updateStCbStyle(e.target);
        }
    });
}
