## Perfis da hierarquia de acesso

**Usuário** (nível 1, `cliente`) — Usuário do site: agenda o corte, usa o simulador de visagismo, avalia os barbeiros e acompanha os próprios agendamentos.

**Supervisor** (nível 2, `supervisor`) — Equipe da barbearia: abre o painel, acompanha os números e cuida do estoque, da manutenção e das despesas do dia a dia. Não exclui cadastros, não mexe na nuvem e não define permissões.

**Administrador** (nível 3, `admin`) — Acesso total: tudo que o supervisor faz, mais exclusões, configuração do banco na nuvem e a definição de quem é supervisor ou administrador.

## Matriz de permissões

| Ação no sistema | Usuário (cliente) | Supervisor | Administrador |
| --- | :---: | :---: | :---: |
| Abrir o painel da barbearia | — | ✔ | ✔ |
| Ver a lista de clientes e o histórico de acessos | — | ✔ | ✔ |
| Exportar a lista de clientes em CSV | — | ✔ | ✔ |
| Cadastrar um cliente pelo painel | — | ✔ | ✔ |
| Excluir o cadastro de um cliente | — | — | ✔ |
| Criar contas da equipe e mudar o perfil de um usuário | — | — | ✔ |
| Ver o estoque | — | ✔ | ✔ |
| Lançar entrada, saída e preço no estoque | — | ✔ | ✔ |
| Excluir um produto do estoque | — | — | ✔ |
| Ver a manutenção | — | ✔ | ✔ |
| Abrir, atualizar e concluir ordens de manutenção | — | ✔ | ✔ |
| Excluir uma ordem de manutenção | — | — | ✔ |
| Ver as despesas | — | ✔ | ✔ |
| Lançar e quitar despesas | — | ✔ | ✔ |
| Excluir uma despesa | — | — | ✔ |
| Ver o status do banco de dados e da nuvem (Supabase) | — | ✔ | ✔ |
| Configurar a nuvem (URL, tabela e chave) | — | — | ✔ |
| Reenviar a fila de cadastros para a nuvem | — | — | ✔ |
