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
    _auxFilters  = { ...inheritedFilters };
    _cbsLoaded   = false;          // re-popula checkboxes a cada render
    _stLoaded    = false;
    _cacSelected = new Set();      // limpa seleção; defaults são reaplicados em _populateCacCheckboxes
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

        <!-- Gestão Financeira (Excel) -->
        <div class="aux-section" id="auxSectionGestao" style="display:none;">
            <h3 class="aux-section-title">💼 Gestão Financeira (Excel importado)</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:0.75rem;">
                <div>
                    <div style="font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;
                                letter-spacing:0.04em;margin-bottom:0.4rem;">DRE — último mês do período</div>
                    <div class="aux-metric-grid" id="auxGridGestaoDRE"></div>
                </div>
                <div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                        <span style="font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">CAC — acumulado do período</span>
                    </div>
                    <div class="aux-metric-grid" id="auxGridGestaoCAC"></div>
                </div>
                <div>
                    <div style="font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;
                                letter-spacing:0.04em;margin-bottom:0.4rem;">DFC (Demonstração do Fluxo de Caixa) — médias mensais</div>
                    <div class="aux-metric-grid" id="auxGridGestaoDFC"></div>
                </div>
            </div>
        </div>

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
                    Tendência: MRR · Novos · Cancelamentos · Negativações
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
            // Re-fetch com os subgrupos padrão já marcados
            if (_cacSelected.size > 0) { _loadAux(); return; }
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
    const fPct = v => fN(v, 1) + '%';

    // Badges de fonte de dados (definidos antes para uso em todos os grids)
    const _xls = ' <span style="font-size:0.6rem;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:0 4px;vertical-align:middle;font-weight:600;">Excel</span>';
    const _bd  = ' <span style="font-size:0.6rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;padding:0 4px;vertical-align:middle;font-weight:600;">BD</span>';
    const cacFromExcel = (k.gc_cac_unit || 0) > 0;
    const excelBadge = k.gc_has_data ? _xls : '';

    // Gestão Financeira (Excel)
    const secGestao = document.getElementById('auxSectionGestao');
    if (k.gc_has_data && secGestao) {
        secGestao.style.display = '';
        const dbRecebido  = k.db_recebido   || 0;
        const gcDesp      = k.gc_total_desp || 0;
        const resultado   = dbRecebido - gcDesp;
        const margem      = dbRecebido > 0 ? resultado / dbRecebido * 100 : 0;
        const resSinal    = resultado >= 0 ? '#10b981' : '#ef4444';
        const saldoSinal  = (k.gc_saldo_periodo || 0) >= 0 ? '#10b981' : '#ef4444';
        _fillGrid('auxGridGestaoDRE', [
            { label:'Receita Bruta' + _bd,   value: fmt(k.db_receita_bruta || k.mrr),
              sub: `Recebido: ${fmt(k.db_recebido)} · A receber: ${fmt(k.db_a_receber)}`,
              desc: 'Total faturado no último mês do período. Fonte: Contas a Receber (BD). Composto por Recebido (Status="Recebido", pagamentos confirmados no mês) + A Receber (Status="A receber", faturas com vencimento no mês ainda não pagas). Reflete a receita total gerada — independente de quando será efetivamente recebida.',
              color:'#10b981' },
            { label:'Total Despesas' + _xls,  value: fmt(gcDesp),
              sub: 'CMV + DespOp + Encargos + DespFin + Outros',
              desc: 'Soma de todas as categorias de despesa do mês mais recente do período. Fonte: planilha Gestão Completa (GC_DRE_Completo). Categorias: CMV = Custo da Mercadoria Vendida (infraestrutura/produtos); DespOp = Despesas Operacionais (pessoal, aluguel, etc.); Encargos = tributos e encargos sociais; DespFin = Despesas Financeiras (juros, taxas bancárias); Outros = demais custos.',
              color:'#f97316' },
            { label:'Resultado' + _bd + _xls, value: fmt(resultado),
              sub: 'Recebido (BD) − Despesas (Excel)',
              desc: 'Lucro ou prejuízo do mês. Fórmula: Recebido (BD, Contas a Receber) − Total Despesas (Excel, GC_DRE_Completo). Atenção: usa fontes distintas — receita do banco de dados operacional e despesas da planilha de gestão. Positivo = lucro; negativo = prejuízo.',
              color: resSinal },
            { label:'Margem' + _bd + _xls,    value: fPct(margem),
              sub: 'Resultado / Recebido',
              desc: 'Percentual de lucratividade sobre o que foi efetivamente recebido. Fórmula: Resultado ÷ Recebido × 100. Ex: 15% significa que a cada R$100 recebidos, R$15 sobram após todas as despesas. Calculado sobre o Recebido (não sobre a Receita Bruta total) para refletir a margem real do caixa.',
              color: resSinal },
        ]);
        const n = k.gc_n_meses || 1;
        const cacSource = k.gc_cac_source || 'none';
        const cacSubSel = [..._cacSelected];
        if (cacSource === 'none' || cacSubSel.length === 0) {
            const gCac = document.getElementById('auxGridGestaoCAC');
            if (gCac) gCac.innerHTML = `<div style="grid-column:1/-1;padding:0.75rem;background:#fef9c3;
                border:1px solid #fde047;border-radius:8px;font-size:0.82rem;color:#854d0e;">
                ⚠️ Selecione os subgrupos de custo no <strong>Configurador de CAC</strong> acima
                para calcular o CAC — investimentos em marketing e vendas ÷ OS de instalação.
            </div>`;
        } else {
            const cacSubLbl = cacSubSel.join(' + ');
            _fillGrid('auxGridGestaoCAC', [
                { label:'Total Investido (CAC)' + _xls, value: fmt(k.gc_cac_total),
                  sub: `Σ ${cacSubLbl}`,
                  desc: 'Soma dos valores lançados nos subgrupos selecionados no Configurador de CAC, filtrado pelo período. Fonte: tabela GC_Lancamentos (planilha Gestão Completa). Representa o investimento total em aquisição de clientes no período — selecione os subgrupos de marketing, comissões, materiais e mão de obra para um CAC completo.',
                  color:'#6366f1' },
                { label:'CAC Unitário' + _xls + _bd, value: fmt(k.gc_cac_unit),
                  sub: `${fI(k.gc_instalacoes)} OS instalação finalizadas`,
                  desc: 'Custo de Aquisição por Cliente. Fórmula: Total Investido (Excel, GC_Lancamentos) ÷ OS de Instalação de Fibra finalizadas no período (BD, tabela OS, Assunto="INSTALAÇÃO DE FIBRA", Status="Finalizada"). Indica quanto foi gasto em média para instalar e ativar cada novo cliente.',
                  color:'#6366f1' },
            ]);
        }
        _fillGrid('auxGridGestaoDFC', [
            { label:'Entradas / mês' + _xls,      value: fmt(k.gc_entradas),
              sub: `Total no período: ${fmt(k.gc_entradas * n)}`,
              desc: 'Média mensal das entradas de caixa no período selecionado. Fonte: GC_DFC_Mensal.Entradas (planilha Gestão Completa). Fórmula: soma total das entradas de todos os meses do período ÷ número de meses. Inclui recebimentos de clientes, aportes de sócios e demais receitas de caixa. É uma MÉDIA — o valor real de cada mês pode variar.',
              color:'#10b981' },
            { label:'Saídas / mês' + _xls,        value: fmt(k.gc_saidas),
              sub: `Total no período: ${fmt(k.gc_saidas_total)}`,
              desc: 'Média mensal das saídas de caixa no período selecionado. Fonte: GC_DFC_Mensal.TotalSaidas (planilha Gestão Completa). Fórmula: soma total das saídas ÷ número de meses. Inclui pagamentos a fornecedores, folha de pagamento, impostos, aluguel e todos os demais desembolsos operacionais. É uma MÉDIA — o valor real de cada mês pode variar.',
              color:'#f97316' },
            { label:'Saldo Período / mês' + _xls, value: fmt(k.gc_saldo_periodo),
              sub: 'Média de: Entradas − Saídas por mês',
              desc: 'Média mensal do saldo gerado no período (Entradas − Saídas de cada mês). Fonte: GC_DFC_Mensal.SaldoPeriodo. Positivo = empresa gerou mais caixa do que gastou em média no período. Negativo = consumo de caixa (empresa desembolsou mais do que recebeu). É uma MÉDIA dos saldos mensais.',
              color: saldoSinal },
            { label:'Saldo Acumulado' + _xls,     value: fmt(k.gc_saldo_acum),
              sub: 'Caixa real até o último mês do período',
              desc: 'Saldo de caixa acumulado até o último mês do período selecionado. Fonte: GC_DFC_Mensal.SaldoAcumulado (último registro do período). NÃO é uma média — é o valor real do caixa acumulado desde o início das operações até o final do período filtrado. Representa o total de recursos disponíveis em caixa.',
              color: (k.gc_saldo_acum || 0) >= 0 ? '#10b981' : '#ef4444' },
        ]);
    } else if (secGestao) {
        secGestao.style.display = 'none';
    }

    // Receita & Base
    _fillGrid('auxGridReceita', [
        { label:'MRR' + _bd, value: fmt(k.mrr),
          sub: 'Receita Bruta — recebido + a receber (último mês)',
          desc: 'Monthly Recurring Revenue (Receita Recorrente Mensal). Calculado pelo banco de dados de Contas a Receber: soma dos pagamentos com Status="Recebido" (Data_pagamento no mês) + faturas com Status="A receber" (Vencimento no mês) do último mês do período filtrado. Representa a receita total esperada daquele mês — o que foi pago mais o que ainda será pago.',
          color:'#10b981' },
        { label:'ARPU' + _bd, value: fmt(k.arpu),
          sub: `MRR ÷ ${fI(k.active_clients)} clientes ativos`,
          desc: 'Average Revenue Per User (Receita Média por Cliente). Fórmula: MRR do último mês ÷ total de clientes ativos. Clientes ativos = contratos com Status_contrato e Status_acesso conforme configurado no painel "Definição de Clientes Ativos" (padrão: Ativo/Ativo). Indica o ticket médio mensal de cada cliente.',
          color:'#10b981' },
        { label:'Clientes Ativos' + _bd, value: fI(k.active_clients),
          sub: `de ${fI(k.total_cadastrados)} já cadastrados`,
          desc: 'Total de contratos que atendem simultaneamente aos filtros de Status_contrato E Status_acesso configurados no painel "Definição de Clientes Ativos" (padrão: Ativo/Ativo). Fonte: tabela Contratos. Não é filtrado por período — representa a situação atual dos contratos (ou no momento da data fim, se filtrado). "Cadastrados" = todos que já entraram no sistema, incluindo inativos e cancelados.',
          color:'#6366f1' },
        { label:'Novas Ativações' + _bd, value: fI(k.new_clients),
          sub: `em ${d.period_months} mes(es) analisados`,
          desc: 'Contratos com Data_ativa_o dentro do período filtrado (tabela Contratos, excluindo Status="Pendente"). Conta todas as ativações — novas instalações, reativações e migrações de plano. Se não houver filtro de datas, soma todas as ativações do histórico disponível.',
          color:'#0ea5e9' },
    ]);

    // Churn
    const ac         = k.active_clients || 0;
    // Taxas: total do período ÷ clientes ativos (fallback frontend)
    const negRate    = k.neg_rate      > 0 ? k.neg_rate
                     : (k.neg_total    > 0 && ac > 0 ? +(k.neg_total    / ac * 100).toFixed(2) : 0);
    const cancelRate = k.cancel_rate   > 0 ? k.cancel_rate
                     : (k.churn_total  > 0 && ac > 0 ? +(k.churn_total  / ac * 100).toFixed(2) : 0);
    const combRate   = k.combined_rate > 0 ? k.combined_rate
                     : (k.combined_total > 0 && ac > 0 ? +(k.combined_total / ac * 100).toFixed(2) : 0);
    const nc  = negRate    > 5 ? '#ef4444' : negRate    > 2 ? '#f59e0b' : '#10b981';
    const cc  = cancelRate > 5 ? '#ef4444' : cancelRate > 2 ? '#f59e0b' : '#10b981';
    const cbc = combRate   > 8 ? '#ef4444' : combRate   > 4 ? '#f59e0b' : '#10b981';
    _fillGrid('auxGridChurn', [
        { label:'Churn c/ Negativação' + _bd, value: fN(negRate, 2) + '%',
          sub: `${fI(k.neg_total)} neg no período ÷ ${fI(k.active_clients)} ativos`,
          desc: 'Total de negativações no período selecionado dividido pelos clientes ativos.',
          color: nc },
        { label:'Churn c/ Cancelamento' + _bd, value: fN(cancelRate, 2) + '%',
          sub: `${fI(k.churn_total)} cancel no período ÷ ${fI(k.active_clients)} ativos`,
          desc: 'Total de cancelamentos no período selecionado dividido pelos clientes ativos.',
          color: cc },
        { label:'Churn c/ Neg + Cancel' + _bd, value: fN(combRate, 2) + '%',
          sub: `${fI(k.combined_total)} (neg + cancel) no período ÷ ${fI(k.active_clients)} ativos`,
          desc: 'Total de negativações + cancelamentos no período selecionado dividido pelos clientes ativos.',
          color: cbc },
        { label:'Cancelamentos / mês' + _bd, value: fI(k.churn_count),
          sub: `${fI(k.churn_total)} total no período`,
          desc: 'Quantidade média de contratos encerrados por mês.',
          color: cc },
        { label:'Negativações / mês' + _bd, value: fI(k.neg_count),
          sub: `${fI(k.neg_total)} total no período`,
          desc: 'Quantidade média de contratos negativados por mês.',
          color: '#f59e0b' },
        { label:'Cancel + Neg / mês' + _bd, value: fI(k.combined_count),
          sub: `${fI(k.combined_total)} total no período`,
          desc: 'Soma de cancelamentos e negativações por mês.',
          color: cbc },
    ]);

    // CAC note
    const cacNote = document.getElementById('auxCacNote');
    if (cacNote) {
        if (k.gc_has_data) {
            cacNote.innerHTML = `✅ CAC calculado pela planilha Gestão Completa (Excel). ${excelBadge}`;
        } else if (_cacSelected.size === 0) {
            cacNote.innerHTML = '⚠️ Nenhum subgrupo selecionado — <em>CAC, LTV e Payback não calculados.</em> Configure o painel acima.';
        } else {
            cacNote.textContent = `Subgrupos incluídos no CAC: ${[..._cacSelected].join(' · ')}`;
        }
    }

    // CAC / LTV
    const lc    = k.ltv_cac || 0;
    const lcc   = lc >= 3 ? '#10b981' : lc >= 1 ? '#f59e0b' : '#ef4444';
    const lifeM = k.arpu > 0 && k.ltv > 0 ? Math.round(k.ltv / k.arpu) : 0;
    const cacSub = k.gc_has_data
        ? `${fmt(k.cac_cost)} ÷ ${fI(k.gc_instalacoes || k.new_clients)} instalações (Excel)`
        : `${fmt(k.cac_cost)} ÷ ${fI(k.new_clients)} ativações`;
    const cacBadge     = cacFromExcel ? _xls : _bd;
    const ltvcacBadge  = cacFromExcel ? _xls : _bd;
    _fillGrid('auxGridCac', [
        { label:'CAC' + cacBadge, value: k.cac > 0 ? fmt(k.cac) : '—',
          sub: cacSub,
          desc: cacFromExcel
            ? 'Custo de Aquisição de Cliente (CAC). Fórmula: Total Investido nos subgrupos selecionados (GC_Lancamentos, Excel) ÷ OS de Instalação de Fibra finalizadas no período (BD, tabela OS). Para um CAC completo, selecione no Configurador: comissões de vendas, marketing, materiais de campo e mão de obra de instalação.'
            : 'Custo de Aquisição de Cliente (CAC). Fórmula: soma dos subgrupos selecionados na tabela DRE ÷ novas ativações (Contratos.Data_ativa_o) no período. Configure os subgrupos no painel acima para incluir todos os custos de aquisição.',
          color:'#6366f1' },
        { label:'LTV' + _bd, value: k.ltv > 0 ? fmt(k.ltv) : '—',
          sub: lifeM > 0 ? `ARPU × ${lifeM} meses (cancel+neg 12m: ${fN(k.ltv_churn_rate||0,2)}%)` : 'Requer dados de churn',
          desc: 'Lifetime Value (Valor do Tempo de Vida do Cliente). Fórmula: ARPU × (1 ÷ Taxa_Churn_Mensal). A taxa de churn é sempre calculada nos últimos 12 meses (janela fixa, independente do filtro de período) para evitar distorção. Taxa mensal = (cancelamentos definitivos [Status=Cancelado/Inativo/Desistente] + negativados [Data_negativa_o, Contratos] + negativações Filial 4 [Contratos_Negativacao]) ÷ 12 ÷ clientes ativos. Nesta operação, Negativado = saída permanente (novo contrato se quiser voltar).',
          color:'#6366f1' },
        { label:'LTV / CAC' + ltvcacBadge, value: lc > 0 ? fN(lc, 1) + 'x' : '—',
          sub: 'Referência: ≥ 3x saudável · ≥ 5x excelente',
          desc: 'Razão entre o retorno total gerado por um cliente ao longo da vida (LTV) e o custo para adquiri-lo (CAC). Referência de mercado para ISP: abaixo de 1x = prejuízo por cliente; 1–3x = atenção, revisar custos; 3–5x = saudável; acima de 5x = excelente. LTV calculado via BD; CAC via fonte indicada pelo badge.',
          color: lcc },
        { label:'Payback CAC' + ltvcacBadge, value: k.payback_months > 0 ? fN(k.payback_months, 1) + ' meses' : '—',
          sub: 'Meses de ARPU para recuperar o CAC',
          desc: 'Tempo em meses para recuperar o investimento feito na aquisição de um cliente. Fórmula: CAC ÷ ARPU. Ex: CAC=R$200, ARPU=R$100 → Payback=2 meses. Quanto menor, mais rápido o retorno. Para ISPs em crescimento, Payback abaixo de 12 meses é considerado bom.',
          color:'#94a3b8' },
    ]);

    // PMR / Inadimplência
    _fillGrid('auxGridPmr', [
        { label:'Inadimplência' + _bd, value: fN(k.inadimplencia_pct, 1) + '%',
          sub: `${fmt(k.inadimplencia_valor)} em aberto vencido`,
          desc: 'Percentual de faturas vencidas e não pagas. Fonte: tabela Contas_a_Receber. Critério: Status="A receber" E Vencimento < data de hoje. Percentual = quantidade de faturas vencidas ÷ total de faturas "A receber" × 100. Valor monetário = soma de Valor_aberto dessas faturas. Não inclui cancelados nem parcialmente pagos — apenas o saldo devedor pendente de clientes ainda ativos no sistema.',
          color:'#ef4444' },
        { label:'PMR (geral)' + _bd, value: fN(k.pmr_days, 0) + ' dias',
          sub: 'Média de dias: vencimento → pagamento (todos)',
          desc: 'Prazo Médio de Recebimento geral. Fórmula: média de (Data_pagamento − Vencimento) em dias para todos os pagamentos com Status="Recebido" no período. Valor negativo = clientes estão pagando ANTES do vencimento (bom sinal). Valor positivo = dias médios de atraso entre o vencimento e o pagamento. Inclui tanto os pontuais quanto os atrasados.',
          color:'#f59e0b' },
        { label:'PMR (em atraso)' + _bd, value: fN(k.pmr_late_days, 0) + ' dias',
          sub: 'Média de atraso — somente pagamentos após vencimento',
          desc: 'PMR calculado EXCLUSIVAMENTE para pagamentos realizados após o vencimento (Data_pagamento > Vencimento). Filtra apenas os inadimplentes que eventualmente pagaram, mostrando quantos dias em média eles atrasaram. Não inclui quem pagou em dia nem quem ainda não pagou. Indica o comportamento real dos clientes que atrasam.',
          color:'#f59e0b' },
    ]);

    // Operações
    const up  = k.uptime_pct || 0;
    const upc = up >= 99 ? '#10b981' : up >= 95 ? '#f59e0b' : '#ef4444';
    const rc  = k.resolucao_1c || 0;
    const rcc = rc >= 70 ? '#10b981' : rc >= 50 ? '#f59e0b' : '#ef4444';
    _fillGrid('auxGridOps', [
        { label:'Truck Rolls / cliente' + _bd, value: fN(k.truck_per_client, 2),
          sub: `${fI(k.truck_rolls)} OS no período`,
          desc: 'Conta TODAS as Ordens de Serviço abertas na tabela OS no período, sem filtro de tipo (instalações, manutenções, oscilações, visitas técnicas, etc.). Fórmula: total de OS ÷ clientes ativos atualmente. ISPs eficientes ficam abaixo de 0,5 OS/cliente no período. Valor alto sugere problemas de qualidade de rede ou retrabalho em instalações.',
          color:'#0f2d5e' },
        { label:'MTTR' + _bd, value: fN(k.mttr_hours, 1) + 'h',
          sub: 'Tempo médio de reparo (OS manutenção/falha)',
          desc: 'Mean Time To Repair — tempo médio em horas entre abertura e fechamento de OS de falha/manutenção. Filtro aplicado: Assunto da OS contém "MANUT", "OSCILA", "SEM CONEX", "SEM INTERNET" ou "FALHA". OS sem data de fechamento são excluídas. Meta recomendada para ISP: abaixo de 4h. Valores altos indicam gargalo de equipe ou complexidade técnica.',
          color:'#0f2d5e' },
        { label:'Uptime estimado' + _bd, value: fN(up, 2) + '%',
          sub: 'Proxy via horas de manutenção',
          desc: 'Estimativa de disponibilidade da rede. Fórmula: (1 − MTTR × qtd_OS_manutenção ÷ horas_do_período) × 100. Horas totais = meses × 30 × 24h. NÃO é uptime medido por NOC/SNMP — é uma estimativa indireta baseada nas OS. Para uptime real, use ferramenta de monitoramento de rede. Meta ISP: acima de 99,5%.',
          color: upc },
        { label:'Tempo de Instalação' + _bd, value: fN(k.tempo_instalacao, 1) + 'h',
          sub: 'Média abertura → fechamento OS instalação',
          desc: 'Tempo médio em horas entre abertura e fechamento de OS cujo campo Assunto contém "INSTALA". Inclui instalações residenciais, empresariais e migrações de plano. OS sem data de fechamento são excluídas. Meta recomendada: abaixo de 48h. Impacta diretamente a experiência do novo cliente e a velocidade de geração de receita.',
          color:'#0f2d5e' },
        { label:'Resolução 1º Contato' + _bd,
          value: (k.resolucao_com_dados || 0) > 0 ? fN(rc, 1) + '%' : 'N/D',
          sub: (k.resolucao_com_dados || 0) > 0
            ? `de ${fI(k.resolucao_com_dados)} atendimentos c/ dados`
            : `${fI(k.total_atendimentos)} atendimentos (sem dados de msg)`,
          desc: 'FCR (First Contact Resolution) — percentual de atendimentos resolvidos com 0 ou 1 mensagens enviadas pelo cliente. Fonte: tabela Atendimentos, campo Msgs_cliente. Fórmula: atendimentos com Msgs_cliente ≤ 1 ÷ total com Msgs_cliente preenchido × 100. Exibe "N/D" quando o campo não foi registrado. Meta ideal: acima de 70%. Indica eficiência do suporte — cliente resolveu sem precisar insistir.',
          color: (k.resolucao_com_dados || 0) > 0 ? rcc : '#94a3b8' },
    ]);

    // Custos & Penetração
    const opexBadge = k.gc_has_data ? _xls : _bd;
    // IBGE Censo 2022 — Domicílios Particulares Permanentes Urbanos das cidades atendidas
    const _ibge = {
        'Dom Pedro':                   5262,
        'Presidente Dutra':           10410,
        'São Domingos do Maranhão':    5936,
        'Tuntum':                      5630,
    };
    const _ibge_total = Object.values(_ibge).reduce((a, b) => a + b, 0); // 27.238
    const penetracao_mercado = _ibge_total > 0 ? (k.active_clients / _ibge_total * 100) : 0;

    // Cards por cidade — cruza ativos do BD com DPP urbanos do IBGE
    const cityRows = d.city_penetracao || [];
    const cityByName = {};
    cityRows.forEach(r => { cityByName[r.cidade] = r.ativos; });

    const cityCards = Object.entries(_ibge).map(([cidade, dpp]) => {
        const ativos = cityByName[cidade] || 0;
        const pct    = dpp > 0 ? (ativos / dpp * 100) : 0;
        const cor    = pct >= 30 ? '#f59e0b' : pct >= 15 ? '#6366f1' : '#10b981';
        return {
            label: `Penetração ${cidade}` + _bd,
            value: fN(pct, 1) + '%',
            sub: `${fI(ativos)} ativos / ${dpp.toLocaleString('pt-BR')} dom. urbanos`,
            desc: `Taxa de penetração de mercado em ${cidade}. Fórmula: contratos_ativos ÷ ${dpp.toLocaleString('pt-BR')} domicílios particulares permanentes urbanos (IBGE Censo 2022) × 100. Abaixo de 15% = mercado ainda aberto; 15–30% = crescimento saudável; acima de 30% = saturação — expansão requer novos bairros ou zona rural.`,
            color: cor,
        };
    });

    _fillGrid('auxGridCustos', [
        { label:'OPEX / Cliente / Mês' + opexBadge, value: fmt(k.opex_per_client),
          sub: k.gc_has_data
            ? `${fmt(k.total_opex)} total saídas DFC no período`
            : `${fmt(k.total_opex)} total DRE no período`,
          desc: k.gc_has_data
            ? 'Custo operacional por cliente ao mês. Fonte Excel: soma de TODAS as Saídas da DFC (GC_DFC_Mensal — planilha Gestão Completa), que engloba todos os subgrupos de despesa sem filtro. Fórmula: total_saídas_DFC ÷ (clientes_ativos_atualmente × meses_do_período). Os "clientes ativos" usados no divisor são os contratos ativos NO MOMENTO da consulta (Status_contrato + Status_acesso conforme filtros), não a média do período.'
            : 'Custo operacional por cliente ao mês. Fonte BD: soma de TODOS os lançamentos da tabela DRE no período, sem filtro de grupo ou subgrupo (inclui todas as despesas registradas). Fórmula: total_DRE ÷ (clientes_ativos_atualmente × meses_do_período). Os "clientes ativos" são os contratos ativos NO MOMENTO da consulta.',
          color:'#6366f1' },
        { label:'Custo / Mbps' + opexBadge, value: k.custo_por_mbps > 0
            ? 'R$ ' + Number(k.custo_por_mbps).toFixed(4).replace('.', ',') : '—',
          sub: `${fI(k.total_mbps)} Mbps em contratos ativos`,
          desc: 'Custo por megabit por segundo contratado. Fórmula: OPEX_total ÷ soma_de_Mbps_dos_contratos_ativos. A velocidade de cada plano é extraída do campo Descri_o do contrato (ex: "Fibra 200M" → 200 Mbps). Indica eficiência de custos em relação à capacidade vendida — quanto menor, melhor a escala da operação.',
          color:'#6366f1' },
        { label:'Taxa de Penetração (base)' + _bd, value: fN(k.taxa_penetracao, 1) + '%',
          sub: `${fI(k.active_clients)} ativos / ${fI(k.total_cadastrados)} cadastrados`,
          desc: 'Percentual de contratos ATIVOS sobre o total de clientes já cadastrados na base (independente de status). Fórmula: contratos_ativos ÷ total_cadastrado_Contratos × 100. Indica o aproveitamento do cadastro de leads/prospects — um cliente cadastrado mas não ativo pode ter cancelado, desistido ou nunca ter sido instalado.',
          color:'#6366f1' },
        { label:'Taxa de Penetração (mercado)' + _bd,
          value: fN(penetracao_mercado, 1) + '%',
          sub: `${fI(k.active_clients)} ativos / 27.238 dom. urbanos (IBGE 2022)`,
          desc: 'Penetração consolidada no mercado endereçável de todas as cidades atendidas. Fórmula: contratos_ativos ÷ total_DPP_urbanos × 100. Base IBGE Censo 2022 (DPP urbanos): Dom Pedro 5.262 · Presidente Dutra 10.410 · São Domingos do Maranhão 5.936 · Tuntum 5.630 = 27.238 domicílios urbanos. ISPs regionais ficam tipicamente entre 5% e 30%. Acima de 30% indica saturação — expansão depende de novos bairros ou área rural.',
          color: penetracao_mercado >= 30 ? '#f59e0b' : '#10b981' },
        ...cityCards,
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
                    type: 'line', label: 'MRR',
                    data: trend.map(r => r.mrr),
                    borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.07)',
                    borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: true,
                    yAxisID: 'yMrr', order: 1,
                },
                {
                    type: 'bar', label: 'Novos',
                    data: trend.map(r => r.novos),
                    backgroundColor: 'rgba(16,185,129,0.72)', borderColor: '#10b981',
                    borderWidth: 1, yAxisID: 'yCnt', order: 2,
                },
                {
                    type: 'bar', label: 'Cancelamentos',
                    data: trend.map(r => r.churn),
                    backgroundColor: 'rgba(239,68,68,0.72)', borderColor: '#ef4444',
                    borderWidth: 1, yAxisID: 'yCnt', order: 2,
                    stack: 'saidas',
                },
                {
                    type: 'bar', label: 'Negativações',
                    data: trend.map(r => r.neg || 0),
                    backgroundColor: 'rgba(245,158,11,0.72)', borderColor: '#f59e0b',
                    borderWidth: 1, yAxisID: 'yCnt', order: 2,
                    stack: 'saidas',
                },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 10, boxHeight: 10,
                        font: { size: 11 },
                        color: '#475569',
                        generateLabels: chart => chart.data.datasets.map((ds, i) => ({
                            text: ds.label,
                            fillStyle: ds.backgroundColor,
                            strokeStyle: ds.borderColor,
                            lineWidth: 1,
                            datasetIndex: i,
                            hidden: !chart.isDatasetVisible(i),
                            pointStyle: ds.type === 'line' ? 'circle' : 'rect',
                        })),
                    },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y || 0;
                            if (ctx.dataset.yAxisID === 'yMrr')
                                return ' MRR: ' + v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
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
                    stacked: true,
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
