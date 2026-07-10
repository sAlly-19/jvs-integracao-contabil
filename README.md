# JVS Integração Contábil

<div align="center">
  <img src="https://img.shields.io/badge/Status-Ativo-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Tecnologia-TS%20React%20Tailwind-purple?style=for-the-badge" alt="Tech Stack">
</div>

Uma **ferramenta web moderna** para automatizar a integração contábil de empresas, importando extratos bancários e gerando arquivos contábeis padronizados.

---

## 📊 Funcionalidades

| Feature | Descrição |
|---------|-----------|
| 📁 **Importação de Arquivos** | Suporta CSV, OFX e PDF com reconhecimento inteligente de layouts |
| 🧾 **Geração Contábil** | Cria arquivos TXT prontos para contabilidade (De/Paras, receitas, pagamentos) |
| 🏢 **Gestão de Empresas** | Cadastro, edição e exclusão com validações completas |
| 🔍 **Busca Automática de CNPJ** | Preenche nome e apelido automaticamente ao digitar CNPJ/CPF |
| 🚫 **Validação de Duplicidade** | Impede cadastro de empresas com CNPJ já existente |
| 📈 **Dashboard Interativo** | Métricas em tempo real, gráficos de lançamentos e estatísticas |
| 📜 **Histórico Operacional** | Registro completo de todos os processamentos realizados |
| 🎨 **Customização** | Modos Simples e Customizado, configuração de planilhas |

---

## 🛠️ Tecnologias

```
Frontend:  React 19 + TypeScript + TailwindCSS
State:     TanStack Query (React Query)
UI:        Radix UI + Tailwind Components
Routing:   React Router DOM 7
PDF:       pdfjs-dist
Form:      React Hook Form
API:       Receita Federal (cnpj.ws)
```

---

## 🚀 Como Executar

### Pré-requisitos
- **Node.js** (versão 18+)
- **pnpm** ou **npm**

### Passo a passo

```bash
# 1. Clone o repositório
git clone <url-do-repositorio>
cd jvs-integracao-contabil

# 2. Instale as dependências
npm install

# 3. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse em: <http://localhost:3000>

---

## 📁 Estrutura do Projeto

```
src/
├── components/           # Componentes UI reutilizáveis
│   ├── Dashboard.tsx     # Tela principal com métricas
│   ├── Topbar.tsx        # Cabeçalho com navegação
│   └── ImportFilesScreen.tsx
├── lib/
│   ├── api/              # Serviços de API (empresas, histórico, layouts)
│   ├── import/           # Lógica de importação (parsers, leitores)
│   └── types.ts          # Definições de tipos TypeScript
├── empresas/             # Rotas por empresa
│   └── [companyId]/
│       ├── page.tsx
│       ├── importar-arquivos/
│       └── plano-de-contas/
└── historico-operacional/
```

---

## 🎯 Módulos Principais

### 1. Importação de Arquivos
- Upload de extratos bancários (CSV, OFX, PDF)
- Identificação automática de layouts
- Reconhecimento de bancos suportados

### 2. Geração Contábil
- Conversão de transações em lançamentos contábeis
- Suporte a débitos e créditos
- Exportação em formato TXT

### 3. Plano de Contas
- Configuração de contas para débito/crédito
- Integração com regras de negócio

### 4. Busca de CNPJ (API pública)
- Busca automática de razão social e nome fantasia via CNPJ
- Preenchimento automático do nome e apelido
- Validação de CNPJ válido
- Indicador de carregamento enquanto busca

### 5. Validação de Duplicidade
- Verificação automática de CNPJ existente
- Mensagem clara de empresa já cadastrada
- Bloqueio de salvar com CNPJ duplicado

---

## 🔧 Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Compila a aplicação para produção |
| `npm run lint` | Verifica problemas de código |
| `npm run typecheck` | Verifica tipos TypeScript |

---

## 📊 Métricas no Dashboard

- **Empresas Integradas**: Total de empresas cadastradas
- **Lançamentos**: Quantidade de transações processadas
- **Planilhas Simples**: Empresas com configuração padrão
- **Planilhas Customizadas**: Empresas com layouts personalizados

---

## 🎨 Personalização

O sistema suporta diferentes tipos de tributação:
- **Lucro Real**
- **Lucro Presumido**
- **Simples Nacional**
- **Imunes/Isentas**

---

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/amenagem`)
3. Commit suas mudanças (`git commit -m 'Adiciona funcionalidade X'`)
4. Push para a branch (`git push origin feature/amenagem`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">
  <p>Desenvolvido com ❤️ para facilitar a contabilidade</p>
</div>"# jvs-integracao-contabil"  
