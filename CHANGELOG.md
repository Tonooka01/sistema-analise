# CHANGELOG — NetVale Analise

## v1.001 — 2026-10-07
### Adicionado
- Sistema de versionamento automático (scripts/deploy.sh + painel no admin)
- ChatMix Mensagens Prontas: envio de mensagens WhatsApp por template diretamente do painel do cliente
- Seletor de número de telefone no envio ChatMix (todos os números do contrato)
- Log de envios por contrato com cooldown configurável por template
- Botão "📤 Testar" no modal de configuração de templates

### Corrigido
- Permissões de acesso: usuários restritos agora veem apenas os módulos configurados (bug de ReferenceError no DOMContentLoaded)
- Envio ChatMix corrigido para form-encoded (API não aceita JSON)
- Tabelas `chatmix_templates` e `chatmix_send_log` criadas automaticamente no servidor

### Removido
- Coluna WhatsApp da tabela Alertas de Ação
