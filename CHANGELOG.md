# CHANGELOG — NetVale Analise

## v1.019 — 2026-10-20
### Corrigido
- Painel do cliente buscava dados de contato pelo nome, pegando o cliente errado quando havia nomes duplicados (ex: Leandro José, Antonia Maria). Agora usa o ID do cliente salvo no contrato via sync IXC

## v1.018 — 2026-10-16
### Corrigido
- Coluna "Usuário" na lista de OS do IXC ficava vazia — adicionado `id_usuario` ao payload da criação de ticket

## v1.017 — 2026-10-16
### Corrigido
- Campo "Colaborador responsável" no IXC sempre abria como ID 170 (admin) mesmo que outro usuário estivesse logado — agora usa o ID IXC configurado por usuário

## v1.016 — 2026-10-16
### Corrigido
- Campo "Login" no ticket IXC ficava vazio — agora preenche com o login do contrato via tabela Logins
- Colaborador responsável injetado via Jinja para evitar race condition no JS

## v1.015 — 2026-10-16
### Adicionado
- Campo "Colaborador responsável" no formulário REGISTRAR AÇÃO — preenche automaticamente com o nome e ID IXC do usuário logado
- Campo "Assunto" sempre obrigatório (antes só era obrigatório ao abrir OS)
- Coluna "ID IXC" editável por usuário em Gerenciar Acessos

## v1.014 — 2026-10-16
### Adicionado
- OS e equipamentos exibidos na aba Contrato do painel direito do cliente

### Corrigido
- Linhas duplicadas em Alertas de Ação quando cliente tem 2 entradas
- Tabela não colapsava quando todas as colunas eram desmarcadas
- Painel direito não abria por erro de parêntese no JS

## v1.013 — 2026-10-16
### Adicionado
- Toggle de colunas em todas as tabelas principais do sistema
- Coluna "Equipamento" na tabela Alertas de Ação
- Atividade diária por técnico: conta OS interagidas + filtro colaborador com busca
- Gerenciar colunas na tabela Ordens de Serviço + cliente nos detalhes da OS

### Corrigido
- Modal de interações mostra todas as OS do dia + bairros somente com OS ativas
- Filtro colaborador lista apenas quem tem OS abertas/encaminhadas/agendadas
- Filtros mostram somente cidades operacionais
- Equipamentos mostram somente os emprestados

## v1.012 — 2026-10-14
### Adicionado
- Histórico de envios ChatMix por contrato
- Campo número manual no ChatMix (admin)

## v1.011 — 2026-10-08
### Adicionado
- Filtro por assunto da OS Retirada nos Alertas de Ação
- Abas separadas: Atendimento Diário e Análises (colapsável)

### Corrigido
- Status da OS Retirada exibe labels completos (Aberta/Encaminhada/Finalizada/Sem retirada)
- Badge "Sit. Retirada" com descrição completa e filtro multi-select

## v1.010 — 2026-10-06
### Adicionado
- Análise: Contratos com boletos em aberto + situação de retirada
- Filtros multi-select (cidade, situação, retirada) nos boletos em aberto
- Permissões: grupos de análise no modal + sidebar filtra por permissão do usuário
- Coluna separada OS Retirada com assunto e dias em aberto nos Alertas de Ação

### Corrigido
- Permissões: usuários dashboard veem tudo; restrições só afetam sem-dashboard
- Abertura de OS no IXC: origem_endereco=CC configurado corretamente

## v1.009 — 2026-10-01
### Adicionado
- Sidebar filtra grupos e itens por permissão do usuário
- Atividade técnico: contabiliza finalizações de OS + sincroniza com seletor de mês
- Scheduler: catch-up sync automático ao iniciar se banco desatualizado há mais de 24h

### Corrigido
- DRE: corrige Ano derivando de AnoMes em vez da coluna correta
- Retirada: adicionado assunto EQUIPAMENTO RENEGOCIADO (ID 41)

## v1.008 — 2026-08-17
### Adicionado
- Aba "Plano de Ações" anti-churn com playbook por nível de risco (Crítico / Alto / Médio / Baixo)

### Corrigido
- Sync Atendimentos: resolve nome do cliente via id_cliente (igual ao OS)
- OS tab: filtra por contrato além do nome do cliente

## v1.007 — 2026-08-13
### Adicionado
- Qualidade de Sinal: gráfico de barras empilhadas por OLT
- Churn: nível Altíssimo (score > 160)

### Corrigido
- QoS: labels de sinal "acima/abaixo de" para evitar confusão visual
- Status de fatura: pago após vencimento exibe "Rec. em Atraso", não "Vencido"

## v1.006 — 2026-08-04
### Adicionado
- Análise preditiva de churn e padrão de churn completas

### Corrigido
- Nome único para cookie de sessão (evita conflito com outros apps no domínio)
- Sessão permanente de 12h para evitar perda de autenticação

## v1.005 — 2026-07-31
### Adicionado
- Sync automático de equipamentos via API IXC (cliente_contrato_comodato)
- Endpoint daily_evolution_details para modal de detalhe de evolução diária

### Corrigido
- JOIN com tabela Equipamento: CAST(TRIM()) resolve mismatch de tipo texto/inteiro
- daily_evolution_details: Data_Final e Equipamento_Atual corrigidos

## v1.004 — 2026-07-24
### Adicionado
- Gráfico Inadimplência Mensal dividido em 5 categorias com valores R$

### Corrigido
- Cancelados Vencidos: definição correta (Status=Cancelado e Vencimento < hoje)
- Filtros de data aplicados corretamente no gráfico de Inadimplência

## v1.003 — 2026-07-22
### Corrigido
- DRE Estruturado: legibilidade da coluna TOTAL, contraste de cores no modo escuro
- DRE: usa Receita Real como métrica principal e base dos percentuais
- Import DRE Estruturado não sobrescreve dados com None de notas de rodapé
- Evolução de Clientes Ativos: trata Data_cancelamento='0000-00-00' como NULL

## v1.002 — 2026-07-17
### Adicionado
- Rota inadimplência mensal com agrupamento por categoria

## v1.001 — 2026-10-07
### Adicionado
- Sistema de versionamento automático (scripts/deploy.sh + painel no admin)
- ChatMix Mensagens Prontas: envio de mensagens WhatsApp por template diretamente do painel do cliente
- Seletor de número de telefone no envio ChatMix (todos os números do contrato)
- Log de envios por contrato com cooldown configurável por template
- Botão "📤 Testar" no modal de configuração de templates

### Corrigido
- Permissões de acesso: usuários restritos agora veem apenas os módulos configurados
- Envio ChatMix corrigido para form-encoded (API não aceita JSON)
- Tabelas `chatmix_templates` e `chatmix_send_log` criadas automaticamente no servidor

### Removido
- Coluna WhatsApp da tabela Alertas de Ação
