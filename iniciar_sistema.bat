@echo off
:: 1. Inicia o Tailscale Funnel em uma janela separada
start "Tailscale Tunnel" "C:\Program Files\Tailscale\tailscale.exe" funnel 5000

:: 2. Aguarda 5 segundos para garantir que o túnel subiu
timeout /t 5

:: 3. Entra na pasta do seu projeto (MUDE O CAMINHO ABAIXO)
cd /d "C:\Caminho\Para\A\Pasta\Do\Seu\Projeto"

:: 4. Inicia o Servidor Python
start "Servidor Python Flask" python api_server.py

:: Sai do script inicializador (as janelas acima continuarão abertas)
exit