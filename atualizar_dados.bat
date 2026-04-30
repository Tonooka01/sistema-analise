@echo off
echo Atualizando dados no banco do Docker...
echo.

:: Executa o script python DENTRO do container que ja esta rodando
docker-compose exec sistema-financeiro python upload_sqlite.py

echo.
echo Atualizacao concluida!
pause