# NEON STRIKE 3D — Versión multijugador (Nostr)

Juego original + multijugador en vivo entre móviles, sin servidor
propio, sin registro y sin costo, usando relays públicos de Nostr
(los mismos que ya funcionan en Cuba en ChatApp y CubMatch).

## Web en vivo (Nostr / nsite)

https://npub1af0tmk879u6djf098vashsnqqygq7tqu4p7cvssdegzdkctygtrqas9xx4.nsite.lol/

Puertas alternas (misma dirección, otro gateway): nsite.run, nwb.tf,
nosto.re, nsite.cloud, shakespeare.to — cambia solo el dominio final.

## Pantalla completa en el móvil

- **Android:** pulsa ⛶ PANTALLA COMPLETA en el menú o al empezar la
  partida (la API Fullscreen funciona con un toque). También puedes
  ir a Chrome ⋮ → Añadir a pantalla de inicio y abrirlo desde su
  icono.
- **iPhone:** Safari no permite pantalla completa con un botón (Apple
  la reserva para vídeo). La única pantalla completa real, sin
  pestañas ni barra de Safari, es abrir el juego instalado: Compartir
  → Añadir a pantalla de inicio → abrir desde su icono. El juego ya
  lleva manifest, icono y los meta de Apple para que se abra como app
  independiente, en horizontal y sin navegador alrededor.

## Qué hay de nuevo

- **Multijugador real:** cada teléfono es un jugador con su propio
  nombre. La clave Nostr se genera en el teléfono y se guarda solo
  ahí (localStorage); no hay cuentas ni contraseñas que recordar.
- **Salas en vivo:** el creador genera un código (ej. `NEON-7K2P`)
  y lo comparte por WhatsApp. Los demás entran con ese código.
- **Elegir modo al crear la sala:** Free For All o Escuadra, mapa
  (Almacén / Desierto / Neón), dificultad de los bots, cantidad de
  bots enemigos, bots aliados y límite de bajas (Escuadra),
  límite de tiempo y jugadores máximos.
- **Pantalla de sala antes de iniciar:** muestra modo, mapa,
  dificultad, tiempo, límite de bajas, bots aliados, bots enemigos,
  jugadores máximos, anfitrión, relays conectados, ping, y la lista
  de jugadores reales en línea. Solo el anfitrión puede iniciar (y
  puede cambiar los ajustes antes de arrancar).
- **Elegir bando:** en Escuadra, cada jugador elige 🔵 AZUL o
  🔴 ROJO en la sala (también al unirse). En Free For All todos
  juegan solos.
- **Ping en tiempo real:** en la parte superior, durante la partida,
  se muestra el tiempo de ida y vuelta a través de los relays
  (verde <150 ms, amarillo <300 ms, rojo más). En solo pone LOCAL.
- **Límite de tiempo y ranking en Free For All:** al agotarse el
  tiempo termina la partida y se muestra el ranking por bajas
  (desempate: menos muertes), con jugadores reales y bots. En red
  siempre hay reaparición (también en FFA); en solo, morir en FFA
  sigue terminando la partida, salvo que antes se acabe el tiempo.
- **Temporizador en pantalla** cuando hay límite de tiempo.

## Cómo funciona por dentro (resumen honesto)

- El anfitrión es el árbitro: valida los impactos, simula los bots
  y lleva el marcador. Los demás envían su posición (máx. 10/s, solo
  si se mueven) y sus impactos; el árbitro confirma el daño. Esto
  evita que un jugador se invente bajas.
- Los bots solo los simula el anfitrión; los demás reciben su
  posición 5 veces por segundo. Por eso los bots pueden verse con un
  pequeño retardo en los teléfonos que no son anfitrión.
- Mensajes efímeros de Nostr (kind 20001): no se guardan en el relay,
  solo sirven para el directo. Relays: relay.damus.io, nos.lol,
  relay.primal.net, nostr.mom. relay.nostr.band se excluyó a
  propósito (en CubMatch ni completaba el TLS).
- Archivos nuevos: `js/net.js` (relays, salas, ping), `js/remote.js`
  (jugadores reales), `js/arbiter.js` (árbitro), `js/lobby.js`
  (pantallas de sala). `js/nostr-bundle.js` es nostr-tools
  empaquetado en local (sin CDN).

## Cómo probarlo entre móviles

1. Descomprime el ZIP en una computadora.
2. En esa carpeta, ejecuta: `python3 -m http.server 8899`
3. En cada teléfono (misma WiFi que la computadora, o con datos
   móviles si la computadora está accesible), abre en el navegador:
   `http://IP-DE-LA-COMPUTADORA:8899/` — NO abrir con doble clic
   (file:// no permite los módulos del juego).
4. En cada teléfono: MULTIJUGADOR → escribe tu nombre.
   - Uno crea la sala, elige modo y ajustes, y comparte el código.
   - Los demás ponen el código y eligen bando (Escuadra).
   - Revisan la pantalla de la sala y el anfitrión pulsa INICIAR.
5. Gira el teléfono en horizontal. Joystick para moverse, deslizar
   para apuntar, DISPARAR / RECARGAR / SALTAR.

Nota: el juego carga Three.js desde unpkg (como el original). Si
unpkg no cargara en tu conexión, el resto tampoco arrancaría; en ese
caso dime y lo empaqueto en local como hice con Nostr.

## Límites que debes conocer antes de la prueba real

- Nostr no es un servidor de juegos dedicado: habrá más retardo que
  en un shooter comercial. Salas recomendadas: 2 a 6 jugadores reales.
- Si el anfitrión se va a mitad de partida, la partida termina por
  tiempo en los demás (el temporizador local sigue corriendo).
- No se probó todavía una partida real entre dos teléfonos desde
  Cuba: la verificación hecha aquí fue sintaxis de los 21 archivos,
  compilación del paquete de módulos y servidor local respondiendo
  200. La prueba entre móviles es el paso que falta y te dirá el
  ping real en tu red.
- El modo solo sigue intacto, salvo el nuevo deslizador de límite
  de tiempo en FFA en el menú principal.
