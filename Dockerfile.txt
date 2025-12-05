# Usa uma imagem leve do Python
FROM python:3.9-slim

# Define a pasta de trabalho dentro do container
WORKDIR /app

# Instala as dependências do sistema necessárias para compilar certas bibliotecas (se necessário)
RUN apt-get update && apt-get install -y gcc

# Copia o arquivo de requisitos e instala as bibliotecas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o código do projeto para o container
COPY . .

# Cria a pasta para uploads caso não exista (baseado no seu upload_sqlite.py)
RUN mkdir -p Tabelas

# Expõe a porta 5000 (porta definida no seu api_server.py)
EXPOSE 5000

# Comando para iniciar o servidor
CMD ["python", "api_server.py"]