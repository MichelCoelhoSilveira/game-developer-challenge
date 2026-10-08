# Perfil de performance

Medição feita em 2026-10-08 no build de produção otimizado (`vite build --mode e2e`). O modo `e2e` mantém telemetria para leitura do estado, mas os inputs, a simulação e o renderer continuam sendo os do jogo. O arquivo [`performance-report/results.json`](performance-report/results.json) contém os dados brutos reproduzíveis.

## Ambiente

- SO: Windows 10.0.26200 x64.
- CPU: AMD Ryzen 7 9800X3D, 16 processadores lógicos; memória reportada pelo sistema: 31,1 GiB.
- Navegador: Chromium 156.0.8078.4, Playwright 1.64.0.
- Janela de teste: 1365 × 900 CSS px, DPR 1; Chromium desktop headless.
- GPU não coletada. Não foi possível caracterizar aceleração gráfica ou execução em GPU.

## Partida de três minutos

Seed fixa `202609`, sessão de 180 s e spawn de inimigo a cada 2 s. O jogador movimentou com W+D e disparou com L aproximadamente a cada segundo. Para completar os três minutos de forma repetível sem depender de colisões aleatórias, o perfil habilitou invulnerabilidade do jogador; os inimigos, projéteis, colisões e efeitos continuaram ativos. Foram coletadas 10.804 amostras de requestAnimationFrame e 179 amostras de entidades, aproximadamente uma por segundo.

| Métrica | Resultado |
| --- | ---: |
| FPS médio calculado pelos intervalos RAF | 60,00 |
| Intervalo de frame p95 | 16,80 ms |
| Frames acima de 16,67 ms | 61,64% |
| Frames acima de 33,33 ms | 0% |
| Pico de inimigos vivos | 11 |
| Pico de destroços | 2 |
| Pico de projéteis | 6 |
| Pico de efeitos de explosão | 3 |
| Pico total de entidades observadas | 18 |

A média atingiu a meta nominal de 60 FPS e não houve intervalos acima de 33,33 ms. O p95 de 16,80 ms e a proporção de intervalos ligeiramente acima de 16,67 ms indicam que a cadência ficou no limite do orçamento de 60 Hz; portanto, o resultado não demonstra folga de performance. RAF em headless é uma aproximação da cadência de apresentação, não uma medição de latência física de tela.

## Cinco ciclos e memória

O Chromium CDP coletou `JSHeapUsedSize`, `JSHeapTotalSize` e `Nodes` após forçar coleta de lixo V8: primeiro no menu, depois de cada desmontagem da arena. Cada ciclo iniciou a partida, jogou por cerca de 1,2 s e saiu pelo fluxo de pausa. Os objetos Pixi presentes imediatamente antes de sair foram no máximo um projétil além do jogador.

| Momento | Heap usado (MiB) | Nós do documento |
| --- | ---: | ---: |
| Menu inicial | 4,32 | 373 |
| Após ciclo 1 | 6,99 | 387 |
| Após ciclo 2 | 7,29 | 387 |
| Após ciclo 3 | 7,56 | 387 |
| Após ciclo 4 | 7,78 | 387 |
| Após ciclo 5 | 7,96 | 387 |

Após o primeiro ciclo, o número de nós DOM estabilizou em 387 e não voltou a crescer nos quatro ciclos seguintes. O heap usado subiu 0,97 MiB entre os ciclos 1 e 5 após GC; isso merece nova observação em sessões mais longas, mas cinco ciclos não bastam para concluir que há um vazamento. O aumento inicial de 2,67 MiB sobre o menu pode refletir inicialização/cache de fontes e assets. A coleta não mede memória de texturas/recursos GPU, memória nativa do browser nem comportamento em mobile.

## Reproduzir

```sh
npm run test:profile
```

O comando compila o build otimizado e executa os dois perfis Playwright em série. A medição desktop usa uma janela 1365 × 900; não substitui teste em aparelho físico. O bundle JavaScript principal também gerou o aviso do Vite por ultrapassar 500 kB minificados, o que é uma oportunidade de reduzir/codificar por divisão de chunks em trabalho posterior.
