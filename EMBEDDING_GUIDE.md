# Guía de Embedido de TrackIt

## Tabla de Contenidos
- [Descripción General](#descripción-general)
- [Sistema de URLs](#sistema-de-urls)
- [Requisitos para Embeber](#requisitos-para-embeber)
- [Configuración HTML](#configuración-html)
- [Configuración CSS](#configuración-css)
- [Mejoras Recomendadas](#mejoras-recomendadas)
- [Seguridad y Performance](#seguridad-y-performance)
- [Comunicación entre Aplicaciones](#comunicación-entre-aplicaciones)
- [Requisitos de Backend](#requisitos-de-backend)

---

## Descripción General

**TrackIt** es una aplicación GPS de rastreo de flotas en tiempo real que puede ser embebida en otras aplicaciones mediante iframes. La aplicación está construida con:

- **Vue 3** + **Quasar Framework** (UI)
- **Leaflet.js** (mapas interactivos)
- **Flespi.io** (backend GPS/IoT)
- **MQTT** para comunicación en tiempo real
- **Pinia** para gestión de estado

### Características Embebibles
- Rastreo GPS en tiempo real
- Visualización de rutas históricas
- Eventos de conducción (velocidad, frenado brusco, aceleración, giros)
- Eventos de choque
- Telemetría de vehículos
- Reproductor de trayectos

---

## Sistema de URLs

TrackIt utiliza un sistema de URLs con parámetros para generar links embebibles personalizables.

### Formato de URL Base

```
https://tu-dominio.com/#/token/{FLESPI_TOKEN}/devices/{DEVICE_IDS}
```

### Parámetros de URL

#### Parámetros de Ruta
- **`token`** (requerido): Token de autenticación de Flespi
- **`devices`** (requerido): IDs de dispositivos separados por comas
  - Ejemplo: `123` o `123,456,789`

#### Query Parameters (opcionales)

| Parámetro | Tipo | Valores | Descripción |
|-----------|------|---------|-------------|
| `from` | timestamp | Unix timestamp en segundos | Fecha/hora de inicio del rango |
| `to` | timestamp | Unix timestamp en segundos | Fecha/hora de fin del rango |
| `hidelist` | boolean | `true` / `false` | Ocultar lista de dispositivos |
| `names` | boolean | `true` / `false` | Mostrar/ocultar nombres en el mapa |
| `messages` | boolean | `true` / `false` | Mostrar/ocultar grid de mensajes |
| `player` | boolean | `true` / `false` | Mostrar/ocultar reproductor de trayectos |
| `speed` | boolean | `true` / `false` | Mostrar/ocultar colores de velocidad |
| `harsh` | boolean | `true` / `false` | Mostrar/ocultar eventos de conducción brusca |
| `crash` | boolean | `true` / `false` | Mostrar/ocultar eventos de choque |
| `telemetry` | boolean | `true` / `false` | Mostrar/ocultar panel de telemetría |
| `daterange` | boolean | `true` / `false` | Mostrar/ocultar selector de fechas |

### Ejemplos de URLs

#### URL Mínima
```
https://trackit.tudominio.com/#/token/ABC123XYZ/devices/456
```

#### URL con Vista Limpia (solo mapa)
```
https://trackit.tudominio.com/#/token/ABC123XYZ/devices/456?hidelist=true&telemetry=false&daterange=false
```

#### URL con Rango de Fechas y Eventos
```
https://trackit.tudominio.com/#/token/ABC123XYZ/devices/456,789?from=1700000000&to=1700086400&speed=true&harsh=true&crash=true
```

#### URL para Múltiples Dispositivos con Configuración Personalizada
```
https://trackit.tudominio.com/#/token/ABC123XYZ/devices/100,200,300?hidelist=false&names=true&messages=false&speed=true
```

---

## Requisitos para Embeber

### 1. Token de Flespi
Necesitas un token válido de Flespi con los siguientes permisos:
- Lectura de dispositivos
- Lectura de mensajes
- Acceso a telemetría (opcional)

Puedes obtener un token en: https://flespi.io

### 2. IDs de Dispositivos
Necesitas conocer los IDs de los dispositivos GPS que deseas rastrear en Flespi.

### 3. Conectividad
La aplicación padre debe permitir:
- Conexiones WebSocket (WSS) a `mqtt.flespi.io:443`
- Conexiones HTTPS a `flespi.io`

---

## Configuración HTML

### Iframe Básico

```html
<iframe
  src="https://trackit.tudominio.com/#/token/ABC123XYZ/devices/456"
  width="100%"
  height="600px"
  frameborder="0"
></iframe>
```

### Iframe con Configuración Completa

```html
<iframe
  id="trackit-frame"
  src="https://trackit.tudominio.com/#/token/ABC123XYZ/devices/456?hidelist=true&telemetry=false"
  width="100%"
  height="600px"
  frameborder="0"
  allow="geolocation"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  loading="lazy"
  title="TrackIt GPS Tracker"
></iframe>
```

### Atributos Importantes del Iframe

| Atributo | Valor | Descripción |
|----------|-------|-------------|
| `allow` | `geolocation` | Permite acceso a geolocalización (opcional) |
| `sandbox` | `allow-scripts allow-same-origin allow-forms allow-popups` | Seguridad del iframe |
| `loading` | `lazy` | Carga diferida para mejor performance |
| `frameborder` | `0` | Sin borde visible |

### Contenedor Responsivo

```html
<div class="trackit-container">
  <iframe
    src="https://trackit.tudominio.com/#/token/ABC123XYZ/devices/456"
    class="trackit-iframe"
    frameborder="0"
    allow="geolocation"
    sandbox="allow-scripts allow-same-origin allow-forms"
    loading="lazy"
    title="TrackIt GPS Tracker"
  ></iframe>
</div>
```

---

## Configuración CSS

### CSS para Contenedor Responsivo

```css
/* Contenedor del iframe */
.trackit-container {
  position: relative;
  width: 100%;
  height: 600px;
  min-height: 400px;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Iframe */
.trackit-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

/* Loader mientras carga el iframe */
.trackit-container::before {
  content: 'Cargando mapa...';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #666;
  font-size: 16px;
  z-index: -1;
}

/* Responsive para tablets */
@media (max-width: 1024px) {
  .trackit-container {
    height: 500px;
  }
}

/* Responsive para móviles */
@media (max-width: 768px) {
  .trackit-container {
    height: 400px;
    min-height: 350px;
  }
}

/* Para pantallas muy pequeñas */
@media (max-width: 480px) {
  .trackit-container {
    height: 300px;
    min-height: 300px;
  }
}
```

### CSS para Iframe a Pantalla Completa

```css
/* Contenedor full-height */
.trackit-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
}

.trackit-fullscreen .trackit-iframe {
  width: 100%;
  height: 100%;
}
```

### CSS para Múltiples Instancias

```css
/* Grid de múltiples mapas */
.trackit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  padding: 20px;
}

.trackit-grid .trackit-container {
  height: 400px;
}

@media (max-width: 768px) {
  .trackit-grid {
    grid-template-columns: 1fr;
  }
}
```

---

## Mejoras Recomendadas

### 1. Detección de Iframe en TrackIt

Agregar en `src/App.vue` o crear un nuevo plugin:

```javascript
// src/boot/iframe-detection.js
export default ({ app }) => {
  function isInIframe() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  // Agregar clase al body si está en iframe
  if (isInIframe()) {
    document.body.classList.add('in-iframe');
  }

  // Hacer disponible globalmente
  app.config.globalProperties.$isInIframe = isInIframe();
}
```

### 2. CSS Específico para Modo Iframe

Agregar en `src/css/app.sass`:

```sass
// Estilos cuando la app está embebida en iframe
body.in-iframe
  // Ocultar elementos no necesarios en modo embed
  .within-iframe-hide
    display: none !important
  
  // Ocultar menú hamburguesa si se desea
  .floated.menu
    display: none !important
  
  // Ocultar logo/marca si se desea
  .floated.label
    display: none !important
  
  // Ajustar espaciado
  .floated.date
    top: 10px !important
  
  // Asegurar que el mapa ocupe todo el espacio
  #map
    height: 100vh !important
```

### 3. Ocultar Botón Exit en Iframe

Ya existe la clase `within-iframe-hide` en el botón Exit, pero puedes mejorarla:

```vue
<!-- En src/layouts/MainLayout.vue -->
<q-item 
  v-if="!$isInIframe"
  @click="exitHandler" 
  clickable
>
  <q-item-section avatar class="q-pl-md">
    <q-icon name="mdi-exit-to-app" />
  </q-item-section>
  <q-item-section>
    <q-item-label>Exit</q-item-label>
  </q-item-section>
</q-item>
```

---

## Seguridad y Performance

### Headers HTTP Necesarios

Configurar en el servidor que aloja TrackIt:

```
# Permitir iframe solo desde dominios específicos
Content-Security-Policy: frame-ancestors 'self' https://tu-dominio.com https://otro-dominio.com

# O permitir desde cualquier dominio (menos seguro)
X-Frame-Options: ALLOWALL

# CORS headers si es necesario
Access-Control-Allow-Origin: https://tu-dominio.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

### Configuración de Vercel

Si usas Vercel, agrega en `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'self' https://tu-dominio.com"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist/spa"
}
```

### Performance

#### Lazy Loading
```html
<iframe loading="lazy" ...></iframe>
```

#### Prefetch de DNS
```html
<link rel="dns-prefetch" href="//flespi.io">
<link rel="dns-prefetch" href="//mqtt.flespi.io">
<link rel="preconnect" href="https://flespi.io" crossorigin>
```

#### Intersection Observer para Carga Condicional

```javascript
// En la aplicación padre
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const iframe = entry.target;
      iframe.src = iframe.dataset.src; // Cargar el iframe
      observer.unobserve(iframe);
    }
  });
});

const iframe = document.querySelector('.trackit-iframe');
iframe.dataset.src = iframe.getAttribute('src');
iframe.removeAttribute('src');
observer.observe(iframe);
```

---

## Comunicación entre Aplicaciones

### PostMessage API

#### Enviar Eventos desde TrackIt a la Aplicación Padre

Agregar en `src/layouts/MainLayout.vue` o en el componente apropiado:

```javascript
// Método para notificar a la app padre
notifyParent(eventType, data) {
  if (this.$isInIframe) {
    window.parent.postMessage({
      source: 'trackit',
      type: eventType,
      timestamp: Date.now(),
      data: data
    }, '*'); // En producción, especificar el origen exacto
  }
}

// Ejemplo: notificar cuando se selecciona un dispositivo
selectDeviceInListHandler(id) {
  this.notifyParent('deviceSelected', {
    deviceId: id,
    deviceName: this.getDeviceById(id).name
  });
  // ... resto del código
}

// Ejemplo: notificar posición actual
updatePosition(position) {
  this.notifyParent('positionUpdate', {
    lat: position.latitude,
    lng: position.longitude,
    speed: position.speed
  });
}
```

#### Escuchar Eventos en la Aplicación Padre

```javascript
// En la aplicación que embebe TrackIt
window.addEventListener('message', (event) => {
  // Verificar origen (importante para seguridad)
  if (event.origin !== 'https://trackit.tudominio.com') {
    return;
  }

  // Verificar que el mensaje viene de TrackIt
  if (event.data.source !== 'trackit') {
    return;
  }

  // Manejar diferentes tipos de eventos
  switch (event.data.type) {
    case 'deviceSelected':
      console.log('Device selected:', event.data.data.deviceId);
      // Actualizar UI, mostrar información, etc.
      break;
    
    case 'positionUpdate':
      console.log('Position update:', event.data.data);
      // Actualizar coordenadas en tu aplicación
      break;
    
    case 'ready':
      console.log('TrackIt is ready');
      // TrackIt ha terminado de cargar
      break;
    
    default:
      console.log('Unknown event type:', event.data.type);
  }
});
```

#### Enviar Comandos desde la Aplicación Padre a TrackIt

```javascript
// En la aplicación padre
const trackitFrame = document.getElementById('trackit-frame');

// Enviar comando para seleccionar un dispositivo
trackitFrame.contentWindow.postMessage({
  source: 'parent-app',
  command: 'selectDevice',
  deviceId: 123
}, 'https://trackit.tudominio.com');

// Enviar comando para cambiar rango de fechas
trackitFrame.contentWindow.postMessage({
  source: 'parent-app',
  command: 'setDateRange',
  from: 1700000000,
  to: 1700086400
}, 'https://trackit.tudominio.com');
```

#### Recibir Comandos en TrackIt

Agregar en `src/App.vue` o `src/layouts/MainLayout.vue`:

```javascript
mounted() {
  if (this.$isInIframe) {
    window.addEventListener('message', this.handleParentMessage);
  }
},

methods: {
  handleParentMessage(event) {
    // Verificar origen
    const allowedOrigins = ['https://tu-dominio.com'];
    if (!allowedOrigins.includes(event.origin)) {
      return;
    }

    // Verificar que el mensaje viene de la app padre
    if (event.data.source !== 'parent-app') {
      return;
    }

    // Manejar comandos
    switch (event.data.command) {
      case 'selectDevice':
        this.selectDeviceInListHandler(event.data.deviceId);
        break;
      
      case 'setDateRange':
        this.setDate([event.data.from * 1000, event.data.to * 1000]);
        break;
      
      default:
        console.warn('Unknown command:', event.data.command);
    }
  }
},

beforeUnmount() {
  window.removeEventListener('message', this.handleParentMessage);
}
```

---

## Requisitos de Backend

### Flespi.io

#### Token Requirements
- **Token Type**: Standard Token o API Token
- **Permissions Required**:
  - `devices:read` - Leer información de dispositivos
  - `messages:read` - Leer mensajes GPS
  - `telemetry:read` - Leer telemetría (opcional)

#### Endpoints Utilizados

**REST API:**
```
GET https://flespi.io/gw/devices/{selector}
GET https://flespi.io/gw/devices/{selector}/telemetry
GET https://flespi.io/gw/devices/{selector}/messages
```

**MQTT Topics:**
```
flespi/log/gw/devices/{selector}/created
flespi/log/gw/devices/{selector}/updated
flespi/log/gw/devices/{selector}/deleted
flespi/message/gw/devices/{selector}/#
flespi/state/gw/devices/{selector}/telemetry/+
```

### Conectividad Requerida

| Servicio | Protocolo | Endpoint | Puerto |
|----------|-----------|----------|--------|
| REST API | HTTPS | flespi.io | 443 |
| MQTT WebSocket | WSS | mqtt.flespi.io | 443 |
| MQTT | MQTT | mqtt.flespi.io | 8883 |

### Firewall Rules

Si tu red tiene firewall, asegúrate de permitir:

```
# HTTPS para REST API
ALLOW https://flespi.io:443

# WebSocket Secure para MQTT
ALLOW wss://mqtt.flespi.io:443

# MQTT over TLS (opcional, si no usas WebSocket)
ALLOW mqtt.flespi.io:8883
```

---

## Ejemplos de Implementación

### React

```jsx
import React from 'react';

function TrackItEmbed({ token, deviceIds, options = {} }) {
  const baseUrl = 'https://trackit.tudominio.com';
  
  const buildUrl = () => {
    const devices = Array.isArray(deviceIds) ? deviceIds.join(',') : deviceIds;
    const queryParams = new URLSearchParams(options).toString();
    return `${baseUrl}/#/token/${token}/devices/${devices}${queryParams ? '?' + queryParams : ''}`;
  };

  return (
    <div className="trackit-container">
      <iframe
        src={buildUrl()}
        className="trackit-iframe"
        frameBorder="0"
        allow="geolocation"
        sandbox="allow-scripts allow-same-origin allow-forms"
        loading="lazy"
        title="TrackIt GPS Tracker"
      />
    </div>
  );
}

// Uso
<TrackItEmbed 
  token="ABC123XYZ" 
  deviceIds={[456, 789]}
  options={{
    hidelist: true,
    speed: true,
    harsh: true
  }}
/>
```

### Vue 3

```vue
<template>
  <div class="trackit-container">
    <iframe
      :src="trackitUrl"
      class="trackit-iframe"
      frameborder="0"
      allow="geolocation"
      sandbox="allow-scripts allow-same-origin allow-forms"
      loading="lazy"
      title="TrackIt GPS Tracker"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  token: {
    type: String,
    required: true
  },
  deviceIds: {
    type: [Array, String, Number],
    required: true
  },
  options: {
    type: Object,
    default: () => ({})
  }
});

const trackitUrl = computed(() => {
  const baseUrl = 'https://trackit.tudominio.com';
  const devices = Array.isArray(props.deviceIds) 
    ? props.deviceIds.join(',') 
    : props.deviceIds;
  
  const queryParams = new URLSearchParams(props.options).toString();
  return `${baseUrl}/#/token/${props.token}/devices/${devices}${queryParams ? '?' + queryParams : ''}`;
});
</script>

<style scoped>
.trackit-container {
  width: 100%;
  height: 600px;
  border-radius: 8px;
  overflow: hidden;
}

.trackit-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>

<!-- Uso -->
<TrackItEmbed 
  token="ABC123XYZ" 
  :device-ids="[456, 789]"
  :options="{
    hidelist: true,
    speed: true,
    harsh: true
  }"
/>
```

### Angular

```typescript
// trackit-embed.component.ts
import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-trackit-embed',
  templateUrl: './trackit-embed.component.html',
  styleUrls: ['./trackit-embed.component.css']
})
export class TrackitEmbedComponent implements OnInit {
  @Input() token!: string;
  @Input() deviceIds!: number[] | string | number;
  @Input() options: any = {};

  trackitUrl!: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.trackitUrl = this.buildUrl();
  }

  private buildUrl(): SafeResourceUrl {
    const baseUrl = 'https://trackit.tudominio.com';
    const devices = Array.isArray(this.deviceIds) 
      ? this.deviceIds.join(',') 
      : this.deviceIds;
    
    const queryParams = new URLSearchParams(this.options).toString();
    const url = `${baseUrl}/#/token/${this.token}/devices/${devices}${queryParams ? '?' + queryParams : ''}`;
    
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
```

```html
<!-- trackit-embed.component.html -->
<div class="trackit-container">
  <iframe
    [src]="trackitUrl"
    class="trackit-iframe"
    frameborder="0"
    allow="geolocation"
    sandbox="allow-scripts allow-same-origin allow-forms"
    loading="lazy"
    title="TrackIt GPS Tracker"
  ></iframe>
</div>

<!-- Uso -->
<app-trackit-embed 
  token="ABC123XYZ" 
  [deviceIds]="[456, 789]"
  [options]="{
    hidelist: true,
    speed: true,
    harsh: true
  }"
></app-trackit-embed>
```

### JavaScript Vanilla

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrackIt Embed</title>
  <style>
    .trackit-container {
      width: 100%;
      height: 600px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    
    .trackit-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  </style>
</head>
<body>
  <div class="trackit-container">
    <iframe
      id="trackit-frame"
      class="trackit-iframe"
      frameborder="0"
      allow="geolocation"
      sandbox="allow-scripts allow-same-origin allow-forms"
      loading="lazy"
      title="TrackIt GPS Tracker"
    ></iframe>
  </div>

  <script>
    function loadTrackIt(config) {
      const { token, deviceIds, options = {} } = config;
      const baseUrl = 'https://trackit.tudominio.com';
      
      // Construir devices
      const devices = Array.isArray(deviceIds) ? deviceIds.join(',') : deviceIds;
      
      // Construir query params
      const queryParams = new URLSearchParams(options).toString();
      
      // Construir URL completa
      const url = `${baseUrl}/#/token/${token}/devices/${devices}${queryParams ? '?' + queryParams : ''}`;
      
      // Asignar al iframe
      document.getElementById('trackit-frame').src = url;
    }

    // Cargar TrackIt
    loadTrackIt({
      token: 'ABC123XYZ',
      deviceIds: [456, 789],
      options: {
        hidelist: true,
        speed: true,
        harsh: true,
        crash: true
      }
    });

    // Escuchar eventos de TrackIt
    window.addEventListener('message', (event) => {
      if (event.origin !== 'https://trackit.tudominio.com') return;
      if (event.data.source !== 'trackit') return;

      console.log('Evento de TrackIt:', event.data.type, event.data.data);
    });
  </script>
</body>
</html>
```

---

## Solución de Problemas

### El iframe no carga

1. **Verificar CORS/CSP headers** - Asegúrate de que el servidor permite iframes
2. **Verificar token** - Confirma que el token de Flespi es válido
3. **Verificar IDs de dispositivos** - Confirma que los IDs existen en Flespi
4. **Revisar consola del navegador** - Buscar errores de JavaScript

### El mapa no se muestra

1. **Verificar conectividad a flespi.io** - Debe poder acceder a la API REST
2. **Verificar WebSocket** - Debe poder conectar a `wss://mqtt.flespi.io:443`
3. **Revisar permisos del token** - El token debe tener permisos de lectura

### Los dispositivos no aparecen

1. **Verificar que los dispositivos tengan mensajes** - Los dispositivos deben tener al menos un mensaje GPS
2. **Verificar rango de fechas** - Si usas `from` y `to`, asegúrate de que hay mensajes en ese rango
3. **Verificar permisos** - El token debe tener acceso a esos dispositivos específicos

### Performance Issues

1. **Limitar número de dispositivos** - No embeber más de 10-20 dispositivos simultáneamente
2. **Usar lazy loading** - Agregar `loading="lazy"` al iframe
3. **Optimizar query params** - Ocultar componentes no necesarios (`hidelist=true`, `telemetry=false`)

---

## Contacto y Soporte

Para más información sobre TrackIt:
- **Repositorio**: https://github.com/flespi-software/TrackIt
- **Flespi Documentation**: https://flespi.com/kb
- **Flespi Support**: https://flespi.io

---

**Última actualización**: Noviembre 2025
**Versión de TrackIt**: 3.1.0

