# Instagram Unfollow Bot

Extensão local para Chrome e Edge que cruza uma lista importada com seguidores e contas seguidas atuais e executa unfollows dos candidatos elegíveis. Usa a sessão conectada, sem credenciais fixadas no repositório.

## Recursos

- Um botão para carregar listas, validar a conta, executar, pausar e retomar.
- Importação de candidatos locais, com conta esperada explícita.
- Proteção dos seguidores encontrados atualmente e dos seguidores presentes no arquivo importado.
- 20 tentativas por lote e pausa preventiva de 30 segundos.
- Falhas isoladas ficam pendentes; 5 falhas GraphQL consecutivas interrompem. Restrições explícitas e sessão inválida interrompem imediatamente.
- Diagnóstico sem unfollow e exportação local de progresso.

## Preparar e usar a lista

Use sua exportação JSON do Instagram para produzir o formato abaixo. Crie o arquivo fora do repositório, ou na pasta ignorada `private/`. O exemplo contém somente identificadores fictícios e não é uma lista pronta para executar.

```json
{
  "source": "instagram-export",
  "account": "conta_exemplo",
  "following": 3,
  "followers": 1,
  "users": ["perfil_exemplo_a", "perfil_exemplo_b"],
  "protectedFollowers": ["seguidor_exemplo"]
}
```

`users` contém os candidatos que você segue e que não seguem você no export; `followers` é a quantidade de seguidores únicos do export; `following` é o total seguido no export; `protectedFollowers` contém todos os seguidores do export, sem duplicatas. Usernames devem estar em minúsculas e `account` deve coincidir com a conta conectada. Não coloque tokens nesse arquivo.

Importe pelo painel. Clique **Iniciar** apenas quando desejar executar unfollows reais: o fluxo carrega e valida as listas e depois começa as remoções automaticamente. Fechar o painel não interrompe a execução. **Pausar** impede a próxima ação, mas uma requisição já enviada pode concluir.

Contagens atuais podem divergir do export. O executor usa IDs encontrados na leitura atual e mantém a proteção do export; candidatos sem ID ficam pendentes. Isso não garante completude de uma lista parcialmente retornada pelo Instagram. Recarregar a página encerra o executor atual; iniciar novamente faz nova preparação.

## Estrutura e origem

```text
extension/  manifest, painel, coordenador e executor
tests/      validações do importador e configuração genérica
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

Requer Node.js 20 ou superior para os testes; não há dependências npm em tempo de execução.

```sh
npm test
```

Os testes usam mocks, sem login e sem ações reais na rede. Não comprovam compatibilidade com uma versão futura do Instagram.

## Privacidade e contribuições

Não envie HAR, exports reais, cookies, tokens, logs pessoais ou listas de seguidores em commits, issues ou PRs. Use dados sintéticos ao relatar um problema. A `.gitignore` reduz o risco de adicionar arquivos comuns, mas não substitui a revisão antes de publicar. A sessão válida não garante que uma rota esteja disponível; limites, desafios e pedidos de login exigem intervenção do usuário. Não há promessa de execução sem bloqueios.

Projeto independente, sem afiliação com Instagram ou Meta. Licença MIT; consulte `LICENSE`.
