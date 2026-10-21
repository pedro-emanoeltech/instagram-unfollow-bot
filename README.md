# Instagram Unfollow Bot

Extensão local para Chrome e Edge que identifica a conta conectada, busca as listas atuais de seguidores e contas seguidas e compara as duas para encontrar quem não segue de volta. Não precisa de export do Instagram nem arquivo importado.

## Recursos

- Carregar listas e comparar sem remover ninguém.
- Iniciar com nova leitura, validar a conta, executar, pausar e retomar.
- Comparação por username e ID; seguidores reconhecidos por ID são protegidos mesmo se o nome mudou.
- Listas e resultado da comparação registrados no armazenamento local da extensão.
- 20 tentativas por lote e pausa preventiva de 30 segundos.
- Falhas isoladas ficam pendentes; 5 falhas GraphQL consecutivas interrompem. Restrições explícitas e sessão inválida interrompem imediatamente.
- Diagnóstico sem unfollow e exportação local do progresso, listas e candidatos.

## Como usar

1. Entre no Instagram e abra a extensão.
2. Use **Carregar listas e comparar (sem remover)** para identificar a conta conectada, percorrer seguidores e contas seguidas e ver as quantidades.
3. A fila contém quem está na lista de contas seguidas e não aparece na lista de seguidores, comparando também os IDs. As duas listas e os candidatos são salvos como um snapshot local.
4. Clique **Iniciar** quando desejar executar unfollows reais. O bot faz uma leitura nova antes da remoção; não reutiliza cegamente a lista anterior.
5. Use **Pausar/Retomar** para controlar a execução e **Baixar log** para exportar o progresso e o snapshot local.

Fechar o painel não interrompe a execução. Uma requisição já enviada pode concluir após pausar. Recarregar a página encerra o executor atual; iniciar novamente faz nova preparação.

## Integridade das listas

A preparação invalida o snapshot anterior antes de começar. Se a paginação repetir cursor, não produzir novos perfis, indicar continuação sem cursor, atingir o limite de páginas ou apresentar erro HTTP, a remoção não é liberada. Quando a resposta de identidade informa totais independentes, o bot exige correspondência com as quantidades lidas.

Quando o Instagram não informa totais independentes, o log registra essa limitação: chegar ao fim da paginação não prova completude absoluta. A comparação representa as listas retornadas naquele momento e pode ficar desatualizada com mudanças posteriores. Não há mais a proteção adicional baseada em seguidores de um export antigo. A conta é conferida novamente ao concluir a leitura e antes de remover.

## Estrutura e origem

```text
extension/  manifest, painel, coordenador e executor
tests/      testes de leitura, comparação, falhas e conta divergente
```

O trabalho começou com investigação do projeto MIT `gonzalopezgil/insta-unfollow-cli` e evoluiu para uma extensão separada. O CLI original, seu histórico Git e dados de conta não são distribuídos aqui. Veja `THIRD_PARTY_NOTICES.md` para atribuição.

## Instalação

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions` ou `edge://extensions` e ative o modo de desenvolvedor.
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`.
4. Entre no Instagram normalmente, no mesmo perfil de navegador, e abra a extensão nessa aba.
5. Após atualizar o código, recarregue a extensão e a aba do Instagram.

Não há servidor, senha no código nem serviço de telemetria próprio. A extensão usa a sessão da aba; não solicita que você cole cookies. As operações são enviadas ao Instagram. Progresso, listas e logs ficam no armazenamento local da extensão. Logs exportados podem conter nomes de perfis e devem permanecer privados.

## Arquitetura

O painel envia mensagens ao executor; a extensão mantém progresso em `chrome.storage.local`. Código MAIN, quando necessário, lê contexto transitório da página. HTTP 200 não é garantia de sucesso: as respostas e os estados da operação precisam ser conferidos. Rotas internas do Instagram não são uma API pública estável.

## Desenvolvimento

A versão 1.22 remove a importação obrigatória e monta a fila a partir das duas listas atuais. O fluxo foi validado em uma execução real com remoções confirmadas e sem falhas registradas; dados da conta e logs dessa execução não são publicados. Os testes automatizados continuam usando dados sintéticos e não garantem compatibilidade futura com rotas internas do Instagram.

Requer Node.js 20 ou superior para os testes; não há dependências npm em tempo de execução.

```sh
npm test
```

Os testes usam mocks, sem login e sem ações reais na rede. Não comprovam compatibilidade com uma versão futura do Instagram.

## Privacidade e contribuições

Não envie HAR, exports reais, cookies, tokens, logs pessoais ou listas de seguidores em commits, issues ou PRs. Use dados sintéticos ao relatar um problema. A `.gitignore` reduz o risco de adicionar arquivos comuns, mas não substitui a revisão antes de publicar. A sessão válida não garante que uma rota esteja disponível; limites, desafios e pedidos de login exigem intervenção do usuário. Não há promessa de execução sem bloqueios.

Projeto independente, sem afiliação com Instagram ou Meta. Licença MIT; consulte `LICENSE`.
