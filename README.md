# Aura — loja demonstrativa

Aplicação de e-commerce demonstrativa em pt-BR, construída com HTML, CSS, JavaScript, Node.js/Express e PostgreSQL. Reúne catálogo ilustrativo com nomes conhecidos de perfumes, cosméticos e smartphones, busca, filtros, favoritos, carrinho persistente, checkout demonstrativo, consulta básica de pedidos e painel administrativo protegido.

> **Demonstração apenas:** catálogo, imagens, estoque, frete, pagamentos e pedidos são simulados. Não existe integração com gateway, cobrança, boleto, Pix, cartão ou transportadora. Não informe dados de pagamento reais. O projeto não solicita nem armazena cartões.

## Requisitos

- Node.js 20 ou superior e npm.
- Uma connection string de um banco PostgreSQL acessível pela aplicação.

## Instalação e inicialização

```powershell
npm install
Copy-Item .env.example .env
```

Crie um banco PostgreSQL gratuito no Neon e copie a connection string com SSL. Edite `.env` para configurar `DATABASE_URL`, um `SESSION_SECRET` aleatório de pelo menos 32 caracteres, `ADMIN_EMAIL` e uma `ADMIN_PASSWORD` forte (12 a 72 bytes). Na primeira inicialização, o servidor cria as tabelas e armazena a senha administrativa com hash bcrypt. Inicie a aplicação:

```powershell
npm start
```

Abra `http://localhost:3000`; o painel está em `http://localhost:3000/admin.html`. Se não houver `ADMIN_PASSWORD` no primeiro início de um banco vazio, o servidor gera uma senha temporária aleatória e a mostra no console uma única vez. Guarde-a e defina credenciais próprias no `.env` antes de expor o ambiente. Em produção, `SESSION_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` são obrigatórios; configure também HTTPS e `NODE_ENV=production`.

Os dados de sessão, catálogo e pedidos são mantidos no PostgreSQL configurado em `DATABASE_URL`; não coloque essa URL no repositório. O catálogo demo é inserido somente quando ainda não há produtos demo; reiniciar o servidor não sobrescreve edições feitas no painel. Registros feitos pela administração permanecem identificados como não-demo. A implantação começa com um banco vazio e não importa os dados do banco SQLite local.

## Hospedagem gratuita

1. Crie um projeto PostgreSQL gratuito no [Neon](https://neon.com/) e copie a connection string com SSL. Guarde-a como segredo; não a envie ao GitHub.
2. Envie o código para um repositório GitHub público. O `.gitignore` exclui `.env`, `node_modules` e os arquivos SQLite locais.
3. No [Render](https://render.com/), crie um **Blueprint** a partir do repositório. O `render.yaml` configura um serviço web no plano gratuito.
4. Durante a configuração, informe `DATABASE_URL`, `ADMIN_EMAIL` e uma senha administrativa nova e forte. O Render gera `SESSION_SECRET`.
5. Use o endereço `onrender.com` criado pelo Render para acessar a loja; o painel fica em `/admin.html`.

Os serviços gratuitos podem suspender a aplicação quando ociosa, demorando para responder ao primeiro acesso após a suspensão. O Neon Free tem limites de uso e pode suspender o banco por inatividade. Consulte os limites atuais dos provedores; esses planos são destinados a projetos pequenos/demonstrações, não a uma operação comercial.

## Recursos

- Catálogo pesquisável e filtrável, ordenação por preço/nome, detalhes e imagens ilustrativas.
- Sacola e favoritos persistidos no navegador com `localStorage`; dados locais com estrutura inválida são descartados ao carregar a loja.
- Acesso **Favoritos** no cabeçalho, com contador e janela própria que mostra imagem, nome, preço e ações de cada item; a lista permanece salva no navegador usado.
- Checkout em duas etapas; regra local de frete mock, pagamento fictício e recibo demonstrativo. A API recebe somente método de pagamento mock e **não** aceita campos de cartão.
- Consulta de pedidos demonstrativos pelo e-mail do checkout.
- Painel administrativo com sessões PostgreSQL, senha bcrypt, login limitado por taxa, cadastro/edição/arquivamento de produtos e atualização do status dos pedidos.
- Cupons administráveis com desconto percentual ou fixo, valor mínimo, validade, limite de usos, ativação/edição/exclusão e validação no servidor antes de registrar o pedido.
- Helmet/CSP, cookies HTTP-only e SameSite, limites de tamanho das requisições, validação no servidor e limites de taxa em operações sensíveis.
- PostgreSQL com connection string configurável por ambiente, compatível com Neon e deploy de app Node.js.
- Páginas de privacidade, termos e trocas/devoluções com avisos de que são conteúdo-modelo, não políticas comerciais finais.
- Metadados de compartilhamento, navegação por teclado, rótulos acessíveis, suporte a movimento reduzido e layout responsivo.

## Avisos e limites

- O catálogo, valores, marcas e disponibilidade são conteúdo de demonstração; fotos são servidas pelo Unsplash e fontes pelo Google Fonts.
- Para cadastrar um cupom, abra `/admin.html`, entre no painel, selecione **Cupons** e clique em **Novo cupom**. O código é informado no checkout demonstrativo; o servidor recalcula o desconto no momento de validar e registrar o pedido.
- No cadastro de produtos, imagens podem usar uma URL HTTPS sem credenciais ou um caminho local iniciado por `/` (por exemplo, `/images/produto.jpg`).
- A regra de frete é arbitrária e apenas visual. Nenhum envio é cotado ou contratado.
- A área “Minha conta” faz uma busca demonstrativa pelo endereço de e-mail, sem autenticação de cliente. Não a use com dados reais nem a disponibilize publicamente sem implementar autorização apropriada.
- A lista de favoritos e a sacola ficam no navegador. Newsletter e WhatsApp são atalhos demonstrativos sem backend de marketing/atendimento.
- Antes de qualquer uso comercial, reavalie privacidade, autenticação/autorização, proteção contra CSRF, retenção e descarte, monitoração, operação HTTPS, atendimento, conteúdo legal, estoque e os requisitos aplicáveis à atividade.

## Verificações

```powershell
npm run check
```

O comando verifica a sintaxe dos três arquivos JavaScript principais. Depois de configurar `DATABASE_URL` e as demais variáveis no `.env`, `npm start` cria as tabelas no PostgreSQL e inicia o servidor.
