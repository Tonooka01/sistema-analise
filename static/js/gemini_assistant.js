import { getGlobalCurrentAnalysisData } from './state.js';

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('gemini-btn');
    const windowChat = document.getElementById('gemini-window');
    const closeBtn = document.getElementById('gemini-close');
    const sendBtn = document.getElementById('gemini-send-btn');
    const output = document.getElementById('gemini-output');

    // Alternar janela
    btn.onclick = () => {
        const isHidden = windowChat.style.display === 'none' || windowChat.style.display === '';
        windowChat.style.display = isHidden ? 'flex' : 'none';
    };

    closeBtn.onclick = () => windowChat.style.display = 'none';

    // Enviar para o Gemini
    sendBtn.onclick = async () => {
        const pergunta = document.getElementById('gemini-input').value;
        const perfil = document.getElementById('gemini-perfil').value;
        
        // Pega os dados que estão carregados no seu sistema agora
        const dadosSistema = getGlobalCurrentAnalysisData();

        if (!pergunta && !perfil) {
            output.style.display = 'block';
            output.innerHTML = "⚠️ Por favor, escolha um perfil ou escreva uma pergunta.";
            return;
        }

        sendBtn.disabled = true;
        sendBtn.innerHTML = "⏳ Analisando...";
        output.style.display = 'block';
        output.innerHTML = "Processando dados do sistema e gerando insights...";

        try {
            const response = await fetch('/api/gemini/analisar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pergunta: pergunta,
                    perfil: perfil,
                    contexto: JSON.stringify(dadosSistema)
                })
            });

            const data = await response.json();
            
            if (data.erro) {
                output.innerHTML = `<span style="color:red">Erro: ${data.erro}</span>`;
            } else {
                // Formata a resposta com quebras de linha
                output.innerHTML = `<strong>Análise Sugerida:</strong><br>${data.resposta.replace(/\n/g, '<br>')}`;
            }
        } catch (error) {
            output.innerHTML = "❌ Erro ao conectar com o servidor.";
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = "Gerar Insight";
        }
    };
});