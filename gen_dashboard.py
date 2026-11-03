import json, os

with open('d2.json', encoding='utf-8') as f:
    data_json = f.read()

SCRATCHPAD = r'C:\Users\User\AppData\Local\Temp\claude\c--Users-User-Desktop-Arquivos-e-Programas--rea-Trabalho-Analise\50c2766d-04de-4301-934c-99625169fd56\scratchpad'

html = '''<title>Inadimplência Filial 2</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
:root {
  --bg:#f1f5f9; --surface:#fff; --border:#e2e8f0;
  --fg:#0f172a; --muted:#64748b;
  --fin:#1d4ed8; --fin-bg:#dbeafe;
  --bloq:#b45309; --bloq-bg:#fef3c7;
  --danger:#dc2626; --bar:#e2e8f0;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0f172a;--surface:#1e293b;--border:#334155;--fg:#f1f5f9;--muted:#94a3b8;
  --fin:#60a5fa;--fin-bg:#1e3a5f;--bloq:#fbbf24;--bloq-bg:#451a03;
  --danger:#f87171;--bar:#334155;color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#0f172a;--surface:#1e293b;--border:#334155;--fg:#f1f5f9;--muted:#94a3b8;
  --fin:#60a5fa;--fin-bg:#1e3a5f;--bloq:#fbbf24;--bloq-bg:#451a03;
  --danger:#f87171;--bar:#334155;color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"Inter",system-ui,sans-serif;
  font-size:13px;line-height:1.4;
  padding:20px max(16px,env(safe-area-inset-right,0px)) 32px max(16px,env(safe-area-inset-left,0px));}
h1{margin:0 0 3px;font-size:1.25rem;font-weight:700}
.sub{color:var(--muted);font-size:.8rem;margin-bottom:18px}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px}
.kpi-lbl{font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:3px}
.kpi-val{font-size:1.5rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.kpi-val.fin{color:var(--fin)}.kpi-val.bloq{color:var(--bloq)}
.kpi-sub{font-size:.72rem;color:var(--muted);margin-top:2px}
.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:var(--surface);
  border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:12px}
.ctrl label{display:block;font-size:.68rem;font-weight:600;color:var(--muted);
  text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
select,input[type=text]{background:var(--bg);color:var(--fg);border:1px solid var(--border);
  border-radius:5px;padding:5px 8px;font-size:.82rem;font-family:inherit}
input[type=text]{width:180px}
.count-badge{margin-left:auto;align-self:flex-end;font-size:.82rem;color:var(--muted);font-weight:500;padding-bottom:2px}
.tbl-wrap{overflow-x:auto;border-radius:8px;border:1px solid var(--border);background:var(--surface)}
table{width:100%;border-collapse:collapse;min-width:860px}
thead th{padding:8px 10px;font-size:.68rem;font-weight:600;text-transform:uppercase;
  letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--border);
  white-space:nowrap;cursor:pointer;user-select:none;background:var(--surface);text-align:left}
thead th:hover{color:var(--fg)}thead th.asc::after{content:" ↑"}thead th.desc::after{content:" ↓"}
td{padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
tr:last-child td{border-bottom:none}tr:hover{background:var(--bg)}
td.r{text-align:right;font-variant-numeric:tabular-nums}
td.nome{max-width:200px;overflow:hidden;text-overflow:ellipsis}
.badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:.68rem;font-weight:600}
.badge.fin{background:var(--fin-bg);color:var(--fin)}
.badge.bloq{background:var(--bloq-bg);color:var(--bloq)}
.valor{font-weight:600;font-variant-numeric:tabular-nums}
.valor.alto{color:var(--danger)}
.pager{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:.82rem;color:var(--muted)}
.pager button{background:var(--surface);border:1px solid var(--border);color:var(--fg);
  border-radius:5px;padding:4px 10px;cursor:pointer;font-size:.8rem}
.pager button:disabled{opacity:.4;cursor:default}
.pager .info{flex:1;text-align:center}
</style>

<h1>Inadimplência — Filial 2</h1>
<p class="sub">Presidente Dutra &nbsp;·&nbsp; São Domingos do MA &nbsp;·&nbsp; Tuntum &nbsp;·&nbsp; Dom Pedro &nbsp;|&nbsp; Financeiro em Atraso + Bloqueio Automático &nbsp;|&nbsp; 03/11/2026</p>

<div class="kpi-row" id="kpis"></div>

<div class="controls">
  <div class="ctrl"><label>Status</label>
    <select id="fSt"><option value="">Todos</option>
      <option value="Financeiro em atraso">Financeiro em Atraso</option>
      <option value="Bloqueio Automatico">Bloqueio Automático</option>
    </select>
  </div>
  <div class="ctrl"><label>Cidade</label>
    <select id="fCi"><option value="">Todas</option>
      <option>Dom Pedro</option><option>Presidente Dutra</option>
      <option value="Sao">São Domingos do MA</option><option>Tuntum</option>
    </select>
  </div>
  <div class="ctrl"><label>Buscar</label>
    <input type="text" id="fNm" placeholder="Nome...">
  </div>
  <div class="ctrl"><label>Min. faturas</label>
    <select id="fFt"><option value="0">Qualquer</option>
      <option value="2">2+</option><option value="3">3+</option>
      <option value="5">5+</option><option value="7">7+</option>
    </select>
  </div>
  <span class="count-badge" id="cnt"></span>
</div>

<div class="tbl-wrap">
<table>
<thead><tr>
  <th data-k="ID">ID</th>
  <th data-k="Cliente">Cliente</th>
  <th data-k="Cidade">Cidade</th>
  <th data-k="Status_acesso">Status</th>
  <th>Telefone</th>
  <th data-k="fat_abertas">Faturas</th>
  <th data-k="valor_devido">Valor</th>
  <th data-k="venc_mais_antigo">1ª Venc.</th>
  <th data-k="Data_ativa_o">Ativação</th>
</tr></thead>
<tbody id="tbody"></tbody>
</table>
</div>
<div class="pager">
  <button id="bPrev" onclick="pg(-1)">&#8592; Anterior</button>
  <span class="info" id="pgInfo"></span>
  <button id="bNext" onclick="pg(1)">Próxima &#8594;</button>
</div>

<script>
const ALL=''' + data_json + ''';
const PG=50;let fil=[...ALL],sk="valor_devido",sd=-1,p=0;

function fd(d){if(!d)return"—";const x=d.split("-");return x.length===3?x[2]+"/"+x[1]+"/"+x[0]:d}
function fv(v){if(!v&&v!==0)return"—";return"R$ "+Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}

function buildKpis(){
  let fin={c:0,f:0,v:0},bloq={c:0,f:0,v:0};
  ALL.forEach(r=>{
    if(r.Status_acesso==="Financeiro em atraso"){fin.c++;fin.f+=r.fat_abertas||0;fin.v+=r.valor_devido||0;}
    else{bloq.c++;bloq.f+=r.fat_abertas||0;bloq.v+=r.valor_devido||0;}
  });
  document.getElementById("kpis").innerHTML=`
    <div class="kpi"><div class="kpi-lbl">Financeiro em Atraso</div><div class="kpi-val fin">${fin.c}</div><div class="kpi-sub">${fin.f} faturas &nbsp;·&nbsp; ${fv(fin.v)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Bloqueio Automático</div><div class="kpi-val bloq">${bloq.c}</div><div class="kpi-sub">${bloq.f} faturas &nbsp;·&nbsp; ${fv(bloq.v)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total Geral</div><div class="kpi-val">${ALL.length}</div><div class="kpi-sub">${fin.f+bloq.f} faturas &nbsp;·&nbsp; ${fv(fin.v+bloq.v)}</div></div>
  `;
}

function applyFil(){
  const st=document.getElementById("fSt").value;
  const ci=document.getElementById("fCi").value;
  const nm=document.getElementById("fNm").value.toLowerCase().trim();
  const ft=parseInt(document.getElementById("fFt").value)||0;
  fil=ALL.filter(r=>{
    if(st && r.Status_acesso!==st) return false;
    if(ci==="Sao" && !r.Cidade.includes("Domingos")) return false;
    if(ci && ci!=="Sao" && r.Cidade!==ci) return false;
    if(nm && !r.Cliente.toLowerCase().includes(nm)) return false;
    if((r.fat_abertas||0)<ft) return false;
    return true;
  });
  sort();
}

function sort(){
  fil.sort((a,b)=>{
    let va=a[sk],vb=b[sk];
    if(va==null)va="";if(vb==null)vb="";
    if(typeof va==="number")return(va-vb)*sd;
    return String(va).localeCompare(String(vb),"pt-BR")*sd;
  });
  p=0;render();
}

function render(){
  const s=p*PG,sl=fil.slice(s,s+PG);
  document.getElementById("tbody").innerHTML=sl.map(r=>{
    const isFin=r.Status_acesso==="Financeiro em atraso";
    const bdg=isFin?`<span class="badge fin">Fin. Atraso</span>`:`<span class="badge bloq">Bloq. Auto</span>`;
    const vc=(r.valor_devido||0)>=300?"valor alto":"valor";
    return`<tr>
      <td class="r">${r.ID}</td>
      <td class="nome" title="${r.Cliente}">${r.Cliente}</td>
      <td>${r.Cidade}</td>
      <td>${bdg}</td>
      <td>${r.telefone||"—"}</td>
      <td class="r">${r.fat_abertas||0}</td>
      <td class="r ${vc}">${fv(r.valor_devido)}</td>
      <td class="r">${fd(r.venc_mais_antigo)}</td>
      <td class="r">${fd(r.Data_ativa_o)}</td>
    </tr>`;
  }).join("");
  const tot=fil.length,pgs=Math.ceil(tot/PG)||1;
  document.getElementById("pgInfo").textContent=`Página ${p+1} de ${pgs} · ${tot} clientes`;
  document.getElementById("cnt").textContent=`${tot} clientes`;
  document.getElementById("bPrev").disabled=p===0;
  document.getElementById("bNext").disabled=p>=pgs-1;
}

function pg(d){p+=d;render();}

document.querySelectorAll("thead th[data-k]").forEach(th=>{
  th.addEventListener("click",()=>{
    const k=th.dataset.k;
    if(sk===k)sd*=-1;else{sk=k;sd=-1;}
    document.querySelectorAll("thead th").forEach(t=>{t.classList.remove("asc","desc");});
    th.classList.add(sd===1?"asc":"desc");
    sort();
  });
});
["fSt","fCi","fFt"].forEach(id=>document.getElementById(id).addEventListener("change",applyFil));
document.getElementById("fNm").addEventListener("input",applyFil);

buildKpis();applyFil();
</script>'''

out = os.path.join(SCRATCHPAD, 'filial2_inad.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'OK: {len(html):,} chars -> {out}')
