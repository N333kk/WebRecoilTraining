# Entrenador Recoil (wireframe)



Proyecto para practicar patrones de recoil tipo CS2 usando React + Vite y Three.js.

Configuracion de armas:

- Los datos de armas estan en `src/weapons.json`.
- Puedes ajustar `mag`, `rpm`, `recoilPitch`, `recoilYaw` y escalas de patron sin tocar el codigo de logica.
- Puedes definir `pattern` con coordenadas explicitas (`[{"x":0,"y":0}, ...]`).
- Si `pattern` tiene menos puntos que `mag`, se remuestrea automaticamente al tamaño del cargador.

Arquitectura:

- `src/scene/wireframeScene.js`: setup/render de Three.js (escena, camara, diana y resize).
- `src/game/useTrainingGame.js`: estado y reglas de juego (run, precision, recarga, disparo y recoil).
- `src/game/trainingMath.js`: utilidades de patron y metrica (resample, distancia media).
- `src/ThreeScene.jsx`: orquestador de UI + input que conecta escena y logica de juego.

Cómo ejecutar localmente:

- Instala dependencias:

```bash
npm install
```

- Ejecuta el servidor de desarrollo:

```bash
npm run dev
```

- Abre `http://localhost:5173` en el navegador.

Controles básicos:

- Haz click en el área de render para activar el pointer lock.
- Usa el ratón para girar la cámara en primera persona.
- Selecciona un arma (cada una tiene su propio cargador y ROF).
- Ajusta la sensibilidad con el selector (formula estilo CS2: `sensibilidad * m_yaw`, con `m_yaw = 0.022`).
- Mantén click izquierdo para disparar automáticamente al ROF del arma seleccionada.
- El limite de disparos por rafaga es el tamaño de cargador del arma.
- Al soltar click se termina la run, se calcula precision y el cargador se recarga automaticamente.
- La precision de la run anterior se mantiene visible hasta empezar una run nueva.
- El patron semitransparente esta anclado a la diana para facilitar el seguimiento.
- El patron se muestra como una linea fina con puntos por bala.
- Cada disparo deja una marca `x`: mas intensa si cae dentro de diana, tenue si cae fuera.

Notas:

- Este es un prototipo: usa una aproximación de patrón/recoil para entrenamiento.

