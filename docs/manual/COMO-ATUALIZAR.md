# Central de ajuda Tawper

O arquivo principal é **central-de-ajuda.html**. A cópia **manual-tawper.html** contém a mesma central e mantém o endereço usado anteriormente.

## Conteúdo

44 artigos em dez categorias. Cada artigo explica a finalidade, os passos e como conferir o resultado. Quando necessário, inclui pré-requisitos, exemplos anônimos, fluxos, comparações, checklist e dúvidas frequentes.

A apresentação é feita com texto, elementos e diagramas em HTML. Não há capturas de tela, painéis simulados ou dados de clientes e membros da equipe. O único arquivo de imagem incorporado é o logotipo. A fonte Poppins e as cores seguem o projeto.

## Atualizar

O conteúdo editorial fica em **conteudo-ajuda.json**. Cada artigo reúne título, resumo, passos, resultado e assuntos relacionados. Edite a informação no artigo correspondente e mantenha o identificador para preservar os links.

Para um novo artigo, use um identificador único, escolha uma categoria existente e complete a explicação e o resultado esperado. Confira se os assuntos relacionados existem.

A montagem é feita por **montar-manual-equipe.py**, com os estilos de **central-ajuda.css** e a navegação de **central-ajuda.js**. O HTML final inclui todos os recursos necessários para abrir sozinho. Edições diretas no HTML são possíveis, mas precisam ser mantidas na fonte editorial antes de uma reconstrução.

## Integração com o projeto

A central também está na rota **/ajuda**, acessível pelo item **Ajuda** acima de **Configurações** no menu lateral e no menu do celular, para todos os perfis.

O mesmo gerador atualiza o conteúdo e a navegação usados na aplicação. Os estilos integrados são isolados das outras telas. A aplicação usa os arquivos gerados e não depende de Python para funcionar em produção.

Ao terminar uma alteração editorial, execute o gerador e confira tanto o HTML independente quanto a rota integrada. A verificação da integração local fica em **web/scripts/verify-help-integration.py**.

## Antes de distribuir

- Confira o comportamento atual e os nomes das ações.
- Use situações genéricas, sem nomes, números, e-mails, valores operacionais ou conversas reais.
- Não acrescente prints, credenciais, caminhos internos ou nomes técnicos das ferramentas.
- Confira busca, navegação, links, celular e impressão do artigo.
- Inclua apenas os arquivos da edição atual na distribuição. Os materiais antigos foram separados da pasta de entrega.

A central é material de orientação. Os exemplos e checklists não executam ações no sistema. A central faz parte do projeto em /ajuda. Sua disponibilidade em produção depende da publicação da versão correspondente.
