// Reloj para el teleprompter flotante: un Worker no se frena cuando la página queda en segundo plano (la cámara u otra app al frente).
setInterval(() => postMessage(0), 40);
