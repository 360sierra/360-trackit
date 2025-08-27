<template>
  <div class="map-wrapper absolute-top-left absolute-bottom-right" style="transform: translateZ(0);">
    <div id="map" :style="{ height: mapHeight }">
      <q-resize-observer @resize="onResize" />
    </div>
    <queue
      :needShowMessages="params.needShowMessages"
      :needShowPlayer="params.needShowPlayer"
      :player="player"
      :selectedDeviceId="selectedDeviceId"
      @change-need-show-messages="
        (flag) => {
          $emit('change-need-show-messages', flag)
        }
      "
      @player-pause="(data) => playProcess(data, 'pause')"
      @player-play="(data) => playProcess(data, 'play')"
      @player-stop="(data) => playProcess(data, 'stop')"
      @player-mode="playerModeChange"
      @player-speed="playerSpeedChangeHandler"
      @player-value="(data) => playProcess(data, 'value')"
      @view-on-map="viewOnMapHandler"
    />
    <color-modal ref="colorModal" v-model="colorModel" />
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { mapActions, mapState } from 'pinia'
import { getCssVar, debounce } from 'quasar'
import { useDevicesStore } from '../stores/devices'
import { useTelemetryStore } from 'src/stores/telemetry'
import { useAuthStore } from '../stores/auth'
import { useMiscStore } from 'src/stores/misc'
import Queue from './Queue.vue'
import ColorModal from './ColorModal.vue'
import * as L from 'leaflet'
import 'leaflet-geometryutil'
import 'leaflet/dist/leaflet.css'
import 'leaflet.marker.slideto'
import 'leaflet.polylinemeasure/Leaflet.PolylineMeasure.css'
import 'leaflet.polylinemeasure/Leaflet.PolylineMeasure'
import lefleatSnake from '../assets/lefleat-snake'
import getIconHTML from '../assets/getIconHTML.js'

lefleatSnake(L)

export default defineComponent({
  name: 'MapContainer',
  components: {
    ColorModal,
    Queue,
  },
  emits: ['change-need-show-messages', 'update-telemetry-device-id'],
  props: ['activeDevices', 'isSelectedDeviceFollowed', 'params', 'selectedDeviceId'],
  data() {
    return {
      activeDevicesIDs: [], // list of ID of active devices
      colorDeviceId: 0, // ID of the device for which color modal is opened
      colorModel: '#fff', // color of the device for which color modal is opened, model value of the ColorModal component
      devicesStates: {},
      mapFlyToZoom: 15,
      mapIsFlying: null,
      messagesStores: {}, // devices' messages stores
      player: {
        currentMsgTimestamp: null,
        mode: 'time',
        tailInterval: 0,
        speed: 10,
        status: 'stop',
      },
    }
  },
  computed: {
    ...mapState(useAuthStore, {
      socketConnected: (store) => store.socketConnected,
    }),
    ...mapState(useDevicesStore, {
      devicesColors: (store) => store.devicesColors,
    }),
    ...mapState(useMiscStore, {
      date: (store) => store.date,
    }),
    ...mapState(useTelemetryStore, {
      telemetry: (store) => store.telemetry,
      telemetryKeys: (store) => store.telemetryKeys,
    }),
    mapHeight() {
      let value = '100%'
      // if no devices are selected - map fills all screen height
      if (!this.activeDevices.length) {
        return value
      }
      // if nore than one device is selected - there is panel with devices' names tabs
      if (this.params.needShowPlayer) {
        value = 'calc(100% - 48px)'
      }
      return value
    },
    messages() {
      return this.activeDevicesIDs.reduce((result, id) => {
        result[id] = this.messagesStores[id].messages.reduce((result, message, index) => {
          if (!!message['position.latitude'] && !!message['position.longitude']) {
            /* pass message to the map only if it has position.latitude and position.longitude */
            if (!this.params.needShowInvalidPositionMessages) {
              /* don't pass messages with position.valid=false to the map */
              if (
                !message['position.valid'] ||
                (message['position.valid'] && message['position.valid'] === true)
              ) {
                result.push(message)
              }
            } else {
              /* pass messages to the map disregarding pasition.valid parameter */
              result.push(message)
            }
          }
          return result
        }, [])
        return result
      }, {})
    },
  },
  methods: {
    ...mapActions(useDevicesStore, ['getInitDataByDeviceId', 'updateDeviceColor']),
    ...mapActions(useMiscStore, ['getMessagesStore']),
    addBlackRockCityGeofence() {
      // Black Rock City coordinates
      const blackRockCity = [40.7864, -119.2065]
      // 20 miles in meters (1 mile = 1609.34 meters)
      const radiusInMeters = 20 * 1609.34

      // Create the geofence circle
      this.geofenceCircle = L.circle(blackRockCity, {
        color: '#ff6b35',
        fillColor: '#ff6b35',
        fillOpacity: 0.1,
        radius: radiusInMeters,
        weight: 2,
        opacity: 0.8,
        dashArray: '10, 10'
      }).addTo(this.map)

      // Add a popup to show information
      this.geofenceCircle.bindPopup(`
        <div style="text-align: center;">
          <strong>Black Rock City Geofence</strong><br>
          <small>Radius: 20 miles</small><br>
          <small>Coordinates: ${blackRockCity[0]}, ${blackRockCity[1]}</small>
        </div>
      `)

      // Store reference for potential removal later
      this.blackRockCityGeofence = this.geofenceCircle
    },
    addFlags(id) {
      if (!this.markers[id]) {
        return false
      }
      if (!this.markers[id].flags) {
        this.markers[id].flags = {
          start: {},
          stop: {},
        }
      }
      if (this.messages[id].length) {
        const startPosition = [
            this.messages[id][0]['position.latitude'],
            this.messages[id][0]['position.longitude'],
          ],
          stopPosition = [
            this.messages[id][this.messages[id].length - 1]['position.latitude'],
            this.messages[id][this.messages[id].length - 1]['position.longitude'],
          ]
        this.markers[id].flags.start = L.marker(startPosition, {
          icon: this.generateFlag({ id, status: 'start' }),
        })
        // Add tooltip with start time information and get address
        const startTime = new Date(this.messages[id][0].timestamp * 1000).toLocaleString()
        this.markers[id].flags.start.bindTooltip(`<strong>START</strong><br>${startTime}<br><em>Loading address...</em>`, {
          permanent: false,
          direction: 'top',
          offset: [0, -10]
        })
        this.markers[id].flags.start.addTo(this.map)
        
        // Get reverse geocoding for start position
        this.getReverseGeocoding(startPosition[0], startPosition[1]).then(result => {
          let newContent = `<strong>START</strong><br>${startTime}<br><em>${result.address}</em>`
          if (result.state) {
            newContent += `<br><small>${result.state}</small>`
          }
          this.markers[id].flags.start.setTooltipContent(newContent)
          // Force tooltip update if it's currently open
          if (this.markers[id].flags.start.isTooltipOpen()) {
            this.markers[id].flags.start.closeTooltip()
            this.markers[id].flags.start.openTooltip()
          }
        }).catch(() => {
          this.markers[id].flags.start.setTooltipContent(`<strong>START</strong><br>${startTime}`)
        })
        
        this.markers[id].flags.stop = L.marker(stopPosition, {
          icon: this.generateFlag({ id, status: 'stop' }),
        })
        // Add tooltip with end time information and get address
        const endTime = new Date(this.messages[id][this.messages[id].length - 1].timestamp * 1000).toLocaleString()
        this.markers[id].flags.stop.bindTooltip(`<strong>END</strong><br>${endTime}<br><em>Loading address...</em>`, {
          permanent: false,
          direction: 'top',
          offset: [0, -10]
        })
        
        // Get reverse geocoding for end position
        this.getReverseGeocoding(stopPosition[0], stopPosition[1]).then(result => {
          let newContent = `<strong>END</strong><br>${endTime}<br><em>${result.address}</em>`
          if (result.state) {
            newContent += `<br><small>${result.state}</small>`
          }
          this.markers[id].flags.stop.setTooltipContent(newContent)
          // Force tooltip update if it's currently open
          if (this.markers[id].flags.stop.isTooltipOpen()) {
            this.markers[id].flags.stop.closeTooltip()
            this.markers[id].flags.stop.openTooltip()
          }
        }).catch(() => {
          this.markers[id].flags.stop.setTooltipContent(`<strong>END</strong><br>${endTime}`)
        })
        
        // Always show the stop flag for better visibility of the route endpoints
        this.markers[id].flags.stop.addTo(this.map)
      }
    },
    centerOnDevice(id, zoom) {
      let currentPos = useDevicesStore().getDeviceById(id) && []
      if (!currentPos) {
        return
      }
      if (this.messages[id] && this.messages[id].length) {
        currentPos = [
          this.messages[id][this.messages[id].length - 1]['position.latitude'],
          this.messages[id][this.messages[id].length - 1]['position.longitude'],
        ]
      }
      if (currentPos.length) {
        this.map.setView(currentPos, zoom ? zoom : 14, { animation: false })
      } else {
        this.$q.notify({
          message: 'No Position!',
          color: 'warning',
          timeout: this.params.needShowMessages ? 500 : 2000,
        })
      }
    },
    flyToDevice(id) {
      let currentPos = useDevicesStore().getDeviceById(id) && []
      if (!currentPos) {
        return
      }
      if (this.messages[id] && this.messages[id].length) {
        currentPos = [
          this.messages[id][this.messages[id].length - 1]['position.latitude'],
          this.messages[id][this.messages[id].length - 1]['position.longitude'],
        ]
      }
      if (currentPos.length) {
        this.flyToWithHideTracks(currentPos, this.mapFlyToZoom)
      } else {
        this.$q.notify({
          message: 'No Position!',
          color: 'warning',
          timeout: this.params.needShowMessages ? 500 : 2000,
        })
      }
    },
    flyToWithHideTracks(position, zoom) {
      const disabledLayout = []
      let isFlying = false
      this.map.once('zoomstart', (e) => {
        this.mapIsFlying = true
        const fromZoom = e.target._zoom
        if (fromZoom !== zoom) {
          isFlying = true
          Object.keys(this.tracks).forEach((trackId) => {
            const track = this.tracks[trackId]
            if (track instanceof L.Polyline) {
              if (track.tail && track.tail instanceof L.Polyline && this.map.hasLayer(track.tail)) {
                this.map.removeLayer(track.tail)
                disabledLayout.push(track.tail)
              }
              if (
                track.overview &&
                track.overview instanceof L.Polyline &&
                this.map.hasLayer(track.overview)
              ) {
                this.map.removeLayer(track.overview)
                disabledLayout.push(track.overview)
              }
              if (track.overview && this.map.hasLayer(track.overview)) {
                this.map.removeLayer(track)
                disabledLayout.push(track)
              }
            } else if (track instanceof L.LayerGroup) {
              // Handle segmented tracks (layer groups)
              if (track.tail && track.tail instanceof L.Polyline && this.map.hasLayer(track.tail)) {
                this.map.removeLayer(track.tail)
                disabledLayout.push(track.tail)
              }
              if (
                track.overview &&
                track.overview instanceof L.Polyline &&
                this.map.hasLayer(track.overview)
              ) {
                this.map.removeLayer(track.overview)
                disabledLayout.push(track.overview)
              }
              if (this.map.hasLayer(track)) {
                this.map.removeLayer(track)
                disabledLayout.push(track)
              }
            }
          })
        }
      })
      this.map.once('zoomend', (e) => {
        this.mapIsFlying = false
        if (isFlying) {
          disabledLayout.forEach((layer) => {
            this.map.addLayer(layer)
          })
        }
      })

      this.map.flyTo(position, zoom)
    },
    generateFlag(props) {
      let { id, status } = props || {}
      let color = id && this.devicesColors[id] ? this.devicesColors[id] : '#e53935',
        icon = 'mdi-map-marker-star-outline',
        backgroundColor = 'rgba(255, 255, 255, 0.9)',
        borderColor = '#333',
        label = ''
      
      if (status === 'start') {
        color = '#FFFFFF' // White text
        icon = 'S'
        label = 'START'
        backgroundColor = '#4CAF50' // Green background
        borderColor = '#2E7D32'
      } else if (status === 'stop') {
        color = '#FFFFFF' // White text
        icon = 'L'
        label = 'LAST'
        backgroundColor = '#F44336' // Red background
        borderColor = '#D32F2F'
      }
      
      return L.divIcon({
        className: `my-flag-icon flag-${status}-${id}`,
        iconSize: new L.Point(60, 60),
        iconAnchor: new L.Point(30, 55),
        html: `
          <div style="
            position: relative;
            width: 60px;
            height: 60px;
            text-align: center;
          ">
            <!-- Label above the marker -->
            <div style="
              position: absolute;
              top: 0;
              left: 50%;
              transform: translateX(-50%);
              background: rgba(255, 255, 255, 0.95);
              border: 1px solid #ccc;
              border-radius: 4px;
              padding: 2px 6px;
              font-size: 10px;
              font-weight: bold;
              color: #333;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">${label}</div>
            
            <!-- Material UI LocationOn icon as pin -->
            <svg style="
              position: absolute;
              top: 18px;
              left: 50%;
              transform: translateX(-50%);
              width: 40px;
              height: 40px;
              fill: ${backgroundColor};
              stroke: ${borderColor};
              stroke-width: 1;
              filter: drop-shadow(0 3px 8px rgba(0,0,0,0.3));
            " viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            
            <!-- Letter inside the pin -->
            <div style="
              position: absolute;
              top: 26px;
              left: 50%;
              transform: translateX(-50%);
              width: 16px;
              height: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: bold;
              color: ${color};
              z-index: 10;
            ">${icon}</div>
          </div>
        `,
      })
    },
    generateIcon(id, name, color) {
      return L.divIcon({
        className: `my-div-icon icon-${id}`,
        iconSize: new L.Point(20, 35),
        html: getIconHTML(name, color, this.params.needShowNamesOnMap),
      })
    },
    getAccuracyParams(message) {
      const position = [message['position.latitude'], message['position.longitude']],
        accuracy = message['position.hdop'] || message['position.pdop'] || 0,
        circleStyle = {
          stroke: true,
          color: '#444',
          weight: 3,
          opacity: 0.5,
          fillOpacity: 0.15,
          fillColor: '#444',
          clickable: false,
        }
      return { position, accuracy, circleStyle }
    },
    async getDeviceData(id) {
      if (!id) {
        return
      }
      console.log(`🚀 getDeviceData called for device ${id}`)
      const deviceMessagesStore = this.messagesStores[id]
      if (deviceMessagesStore.realtimeEnabled) {
        await deviceMessagesStore.unsubscribePooling()
      }
      deviceMessagesStore.clearMessages()
      const from = this.date[0]
      const to = this.date[1]
      console.log(`📅 Setting date range: ${new Date(from)} to ${new Date(to)}`)
      deviceMessagesStore.setTimestampFrom(from)
      deviceMessagesStore.setTimestampTo(to)
      console.log(`📡 Calling deviceMessagesStore.get()...`)
      await deviceMessagesStore.get()
      console.log(`📊 Messages loaded: ${deviceMessagesStore.messages.length}`)
      if (to > Date.now()) {
        const render = await deviceMessagesStore.pollingGet()
        render()
      }
      this.removeFlags(id)
      this.addFlags(id)
      if (this.params.needShowHarshEvents) {
        this.addHarshEventMarkers(id)
      }
      if (!deviceMessagesStore.messages.length) {
        console.log(`⚠️ No messages found, trying telemetry for device ${id}`)
        try {
          /* try to init device by telemetry */
          this.devicesStates[id].telemetryAccess = true
          await this.getInitDataByDeviceId([id, this.params.needShowInvalidPositionMessages])
        } catch (err) {
          console.log(`❌ Telemetry error for device ${id}:`, err)
          if (err.response && err.response.status && err.response.status === 403) {
            this.devicesStates[id].telemetryAccess = false
          }
        }
      } else {
        console.log(`✅ Messages loaded successfully for device ${id}`)
      }
      /* device initialization is completed - device is initialized either from messages or from telemetry */
      this.devicesStates[id].initStatus = true
      /* if device doesn't have access to messages mark it with corresponding property */
      if (this.devicesStates[id].messagesAccess === false) {
        const device = useDevicesStore().getDeviceById(id)
        Object.defineProperty(
          device,
          this.devicesStates[id].telemetryAccess === false
            ? 'x-flespi-no-access'
            : 'x-flespi-telemetry-access',
          {
            value: true,
            enumerable: false,
          },
        )
      }
    },
    getLatLngArrByDevice(id) {
      if (!this.messages[id]) {
        return []
      }
      return this.messages[id].reduce((acc, message) => {
        acc.push([message['position.latitude'], message['position.longitude']])
        return acc
      }, [])
    },
    getLatLngArrWithTimestampsById(id) {
      if (!this.messages[id]) {
        return []
      }
      return this.messages[id].map(message => ({
        lat: message['position.latitude'],
        lng: message['position.longitude'],
        timestamp: message.timestamp,
        positionTimestamp: message['position.timestamp']
      }))
    },
    getColorById(id) {
      return this.devicesColors[id] || '#e53935'
    },
    shouldUseDashedLine(message, prevMessage) {
      if (!message || !prevMessage) return false

      const timestamp = message.timestamp
      const positionTimestamp = message['position.timestamp']

      const prevTimestamp = prevMessage.timestamp
      const prevPositionTimestamp = prevMessage['position.timestamp']

      let dashed = false

      // Check if current message has a time difference greater than 10 seconds (line going TO this position should be dashed)
      if (positionTimestamp && Math.abs(timestamp - positionTimestamp) > 30) {
        dashed = true
      }

      // Check if previous message has a time difference greater than 10 seconds (line coming FROM that position should be dashed)
      if (prevPositionTimestamp && Math.abs(prevTimestamp - prevPositionTimestamp) > 30) {
        dashed = true
      }

      // Also check if there's a large time gap between consecutive messages
      if (!dashed && Math.abs(timestamp - prevTimestamp) > 300) { // 5 minutes gap
        dashed = true
      }
      if (!dashed && ((Object.prototype.hasOwnProperty.call(message, 'position.valid') && !message['position.valid']) || (Object.prototype.hasOwnProperty.call(prevMessage, 'position.valid') && !prevMessage['position.valid']))) { // 5 minutes gap
        dashed = true
      }

      return dashed
    },
    createSegmentedTrack(id) {
      const messages = this.messages[id]
      if (!messages || messages.length < 2) {
        return null
      }

      const segments = []
      let currentSegment = [messages[0]]
      const firstSpeedData = this.getSpeedFromMessage(messages[0], id)
      const firstSpeed = firstSpeedData.kmh !== 'N/A' ? firstSpeedData.kmh : null
      let currentStyle = this.getSegmentStyle(id, false, firstSpeed) // First segment with speed

      for (let i = 1; i < messages.length; i++) {
        const currentMessage = messages[i]
        const prevMessage = messages[i - 1]
        const shouldBeDashed = this.shouldUseDashedLine(currentMessage, prevMessage)
        const currentSpeedData = this.getSpeedFromMessage(currentMessage, id)
        const currentSpeed = currentSpeedData.kmh !== 'N/A' ? currentSpeedData.kmh : null
        const newStyle = this.getSegmentStyle(id, shouldBeDashed, currentSpeed)
        
        // If style changes, finish current segment and start new one
        if (JSON.stringify(currentStyle) !== JSON.stringify(newStyle)) {
          segments.push({
            messages: currentSegment,
            style: currentStyle
          })
          currentSegment = [prevMessage, currentMessage]
          currentStyle = newStyle
        } else {
          currentSegment.push(currentMessage)
        }
      }

      // Add the last segment
      if (currentSegment.length > 1) {
        segments.push({
          messages: currentSegment,
          style: currentStyle
        })
      }

      // Create polylines for each segment
      const polylines = segments.map(segment => {
        const latlngs = segment.messages.filter(msg =>
          msg['position.latitude'] && msg['position.longitude']
        ).map(msg => [
          msg['position.latitude'],
          msg['position.longitude']
        ])

        if (latlngs.length < 2) {
          return null
        }

        const polyline = L.polyline(latlngs, segment.style)
        polyline._segmentMessages = segment.messages // Store messages for click handling
        return polyline
      }).filter(polyline => polyline !== null)

      return polylines.length > 0 ? polylines : null
    },
    getSegmentStyle(id, isDashed, speed = null) {
      const baseColor = this.getColorById(id)
      let segmentColor = baseColor

      // Apply speed-based coloring if enabled and speed data is available
      if (this.params.needShowSpeedColors && speed !== null && typeof speed === 'number' && speed >= 0) {
        segmentColor = this.getSpeedBasedColor(speed)
      }

      if (isDashed) {
        return {
          weight: 2,
          color: '#000',
          opacity: 0.7,
          dashArray: '5, 10'
        }
      } else {
        return {
          weight: 4,
          color: segmentColor,
          opacity: 1
        }
      }
    },
    determineSpeedSourceForDevice(id) {
      // Determine the speed source priority for the entire date range
      // If ANY message has CAN speed data, use ONLY CAN for all points
      // If NO message has CAN speed data, use ONLY GPS for all points
      
      if (!this.messages[id] || !this.messages[id].length) {
        return 'gps' // Default to GPS if no messages
      }
      
      // Check if ANY message in the range has CAN speed data
      const hasCanSpeed = this.messages[id].some(message => 
        message['can.vehicle.speed'] !== undefined ||
        message['can.engine.speed'] !== undefined ||
        message['can.speed'] !== undefined
      )
      
      const speedSource = hasCanSpeed ? 'can' : 'gps'
      console.log(`🎯 Speed source determined for device ${id}: ${speedSource.toUpperCase()} (${hasCanSpeed ? 'CAN data found' : 'No CAN data found'})`)
      
      return speedSource
    },
    getSpeedFromMessage(message, deviceId = null) {
      // Get the global speed source for this device
      const speedSource = deviceId ? this.determineSpeedSourceForDevice(deviceId) : 'auto'
      
      let speedKmh = 'N/A'
      let speedMph = 'N/A'
      let speedColor = '#666666'
      let source = 'N/A'
      
      if (speedSource === 'can') {
        // Use ONLY CAN speed data (priority: can.vehicle.speed > can.engine.speed > can.speed)
        if (message['can.vehicle.speed'] !== undefined) {
          speedKmh = Math.round(message['can.vehicle.speed'] * 10) / 10
          source = 'CAN Vehicle Speed'
          console.log('Using can.vehicle.speed:', message['can.vehicle.speed'])
        } else if (message['can.engine.speed'] !== undefined) {
          speedKmh = Math.round(message['can.engine.speed'] * 10) / 10
          source = 'CAN Engine Speed'
          console.log('Using can.engine.speed:', message['can.engine.speed'])
        } else if (message['can.speed'] !== undefined) {
          speedKmh = Math.round(message['can.speed'] * 10) / 10
          source = 'CAN Speed'
          console.log('Using can.speed:', message['can.speed'])
        } else {
          // No CAN data in this specific message, but device uses CAN globally
          speedKmh = 'N/A'
          source = 'CAN (No Data)'
          console.log('No CAN speed data in this message')
        }
        
        if (speedKmh !== 'N/A') {
          speedMph = Math.round(speedKmh * 0.621371 * 10) / 10
          speedColor = this.getSpeedBasedColor(speedKmh)
        }
        
      } else if (speedSource === 'gps') {
        // Use ONLY GPS speed data
        if (message['position.speed'] !== undefined) {
          const normalizedSpeed = this.normalizeSpeedToKmh(message['position.speed'], 'position.speed')
          speedKmh = Math.round(normalizedSpeed * 10) / 10
          speedMph = Math.round(speedKmh * 0.621371 * 10) / 10
          speedColor = this.getSpeedBasedColor(speedKmh)
          source = message['position.speed'] > 200 ? 'GPS Speed (km/h)' : 'GPS Speed (m/s→km/h)'
          console.log('Using GPS speed:', message['position.speed'])
        } else {
          speedKmh = 'N/A'
          source = 'GPS (No Data)'
          console.log('No GPS speed data in this message')
        }
        
      } else {
        // Auto mode (fallback for compatibility)
        if (message['can.vehicle.speed'] !== undefined) {
          speedKmh = Math.round(message['can.vehicle.speed'] * 10) / 10
          speedMph = Math.round(speedKmh * 0.621371 * 10) / 10
          speedColor = this.getSpeedBasedColor(speedKmh)
          source = 'CAN Vehicle Speed'
        } else if (message['position.speed'] !== undefined) {
          const normalizedSpeed = this.normalizeSpeedToKmh(message['position.speed'], 'position.speed')
          speedKmh = Math.round(normalizedSpeed * 10) / 10
          speedMph = Math.round(speedKmh * 0.621371 * 10) / 10
          speedColor = this.getSpeedBasedColor(speedKmh)
          source = message['position.speed'] > 200 ? 'GPS Speed (km/h)' : 'GPS Speed (m/s→km/h)'
        }
      }
      
      return {
        kmh: speedKmh,
        mph: speedMph,
        color: speedColor,
        source: source
      }
    },
    normalizeSpeedToKmh(rawSpeed, fieldName = 'unknown') {
      // Auto-detect if speed is in m/s or km/h and normalize to km/h
      if (rawSpeed === null || rawSpeed === undefined) {
        return null
      }
      
      // If speed > 200, it's likely already in km/h (unrealistic m/s for vehicles)
      // If speed < 200, assume it's in m/s and convert
      if (rawSpeed > 200) {
        console.log(`Speed from ${fieldName} detected as km/h:`, rawSpeed)
        return rawSpeed
      } else {
        const convertedSpeed = rawSpeed * 3.6
        console.log(`Speed from ${fieldName} converted from m/s to km/h:`, rawSpeed, '→', convertedSpeed)
        return convertedSpeed
      }
    },
    getSpeedBasedColor(speed) {
      // Speed-based color mapping (mph) - Enhanced visual differentiation for high speeds
      // Focus on highway speeds where monitoring is most critical
      // Note: Input speed is assumed to be in km/h, so we convert to mph first
      const speedMph = speed * 0.621371
      
      if (speedMph <= 5) {
        return '#0066FF' // Blue - stopped/parking
      } else if (speedMph <= 25) {
        return '#00CC66' // Bright Green - city/residential
      } else if (speedMph <= 45) {
        return '#FFCC00' // Bright Yellow - arterial roads
      } else if (speedMph <= 65) {
        return '#FF6600' // Bright Orange - highway speeds
      } else if (speedMph <= 85) {
        return '#CC0066' // Magenta - high highway speeds
      } else {
        return '#990000' // Dark Red - excessive speeds
      }
    },
    async getReverseGeocoding(lat, lon) {
      try {
        // Use Nominatim (OpenStreetMap) free reverse geocoding service
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'TrackIt-App/1.0 (Vehicle Tracking Application)'
            }
          }
        )
        
        if (!response.ok) {
          throw new Error('Geocoding request failed')
        }
        
        const data = await response.json()
        
        if (data && data.display_name) {
          // Try to get a concise address
          const address = data.address
          let shortAddress = ''
          let stateInfo = ''
          
          if (address) {
            // Build a concise address from available components
            const components = []
            
            // Add house number and road
            if (address.house_number && address.road) {
              components.push(`${address.house_number} ${address.road}`)
            } else if (address.road) {
              components.push(address.road)
            }
            
            // Add city/town/village/hamlet/suburb
            if (address.city) {
              components.push(address.city)
            } else if (address.town) {
              components.push(address.town)
            } else if (address.village) {
              components.push(address.village)
            } else if (address.hamlet) {
              components.push(address.hamlet)
            } else if (address.suburb) {
              components.push(address.suburb)
            }
            
            // Extract state information separately
            if (address.state) {
              stateInfo = address.state
            }
            
            // If we still don't have enough components, try county
            if (components.length < 2 && address.county) {
              components.push(address.county)
            }
            
            // If still not enough, try country as last resort
            if (components.length < 2 && address.country) {
              components.push(address.country)
            }
            
            shortAddress = components.slice(0, 2).join(', ')
          }
          
          // Fallback to display_name if we couldn't build a short address
          if (!shortAddress) {
            // Truncate display_name if too long
            shortAddress = data.display_name.length > 50 
              ? data.display_name.substring(0, 47) + '...'
              : data.display_name
          }
          
          // Return object with address and state
          return {
            address: shortAddress,
            state: stateInfo
          }
        }
        
        throw new Error('No address found')
      } catch (error) {
        console.warn('Reverse geocoding failed:', error)
        throw error
      }
    },
    async initDevice(id) {
      if (!id) {
        return
      }
      this.$q.loading.show()
      const deviceMessagesStore = this.messagesStores[id]
      await deviceMessagesStore.getCols({ actions: true, etc: true })
      await this.getDeviceData(id)
      this.$connector.socket.on('offline', () => {
        deviceMessagesStore.setOffline()
      })
      this.$connector.socket.on('connect', () => {
        if (deviceMessagesStore.offline) {
          deviceMessagesStore.setReconnected()
          deviceMessagesStore.getMissedMessages()
        }
      })
      if (id === this.selectedDeviceId && this.devicesStates[id].initStatus === true) {
        this.$emit('update-telemetry-device-id', parseInt(id))
        this.centerOnDevice(id)
      }
      this.$q.loading.hide()
    },
    initMarker(id, name, position) {
      const direction = this.messages[id][this.messages[id].length - 1]['position.direction']
          ? this.messages[id][this.messages[id].length - 1]['position.direction']
          : 0,
        currentColor =
          this.tracks[id] && this.tracks[id].options
            ? this.tracks[id].options.color
            : this.markers[id]
              ? this.markers[id].color
              : this.devicesColors[id]
      this.markers[id] = L.marker(position, {
        icon: this.generateIcon(id, name, currentColor),
        draggable: false,
        title: name,
      })
      this.markers[id].id = id
      this.markers[id].color = currentColor
      const {
        position: pos,
        accuracy,
        circleStyle,
      } = this.getAccuracyParams(this.messages[id][this.messages[id].length - 1])
      this.markers[id].accuracy = L.circle(pos, accuracy, circleStyle)
      this.markers[id].accuracy.addTo(this.map)
      this.markers[id].addEventListener('add', (e) => {
        this.updateMarkerDirection(id, direction)
        if (
          this.messages[id] &&
          this.messages[id].length &&
          this.selectedDeviceId === parseInt(id)
        ) {
          // selected logic
        }
      })
      this.markers[id].addEventListener('click', (e) => {
        this.$emit('update-telemetry-device-id', parseInt(id))
      })
      this.markers[id].addEventListener('move', (e) => {
        if (this.player.status === 'stop') {
          this.updateMarkerDirection(
            id,
            this.messages[id][this.messages[id].length - 1]['position.direction'],
          )
        }
      })
      this.markers[id].addEventListener('contextmenu', (e) => {
        /* right click on the car on map */
        /* store device id for future update of the device color in the store */
        this.colorDeviceId = id
        /* fetch color model of the current device from the store */
        this.colorModel = this.devicesColors[id] || '#909090'
        /* display color modal with colorModel as model value */
        this.$refs.colorModal.show()
      })
      this.markers[id].addTo(this.map)
    },
    initMessagesStoreForDevice(id) {
      if (!this.messagesStores[id]) {
        this.messagesStores[id] = this.getMessagesStore(id, (err, deviceId) => {
          if (err.response && err.response.status && err.response.status === 403) {
            /* this device doesn't have access to messages */
            this.devicesStates[deviceId].messagesAccess = false
          }
        })
        this.messagesStores[id].setSortBy('timestamp')
        this.messagesStores[id].setLimit(0)
        /* init device statuses - device is not yet init and by default we assume that it has access to messages */
        if (!this.devicesStates[id]) {
          this.devicesStates[id] = {
            messagesAccess: true,
            initStatus: false,
          }
          return
        }
        this.devicesStates[id].messagesAccess = true
        this.devicesStates[id].initStatus = false
      }
    },
    initMap() {
      if (!this.map) {
        let osm = L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          minZoom: 2,
          maxZoom: 19,
          noWrap: true,
        })
        this.map = L.map('map', {
          center: [51.50853, -0.12574],
          zoom: 3,
          maxBounds: [
            [90, -180],
            [-90, 180],
          ],
          layers: [osm],
        })

        // Add Black Rock City geofence (20 miles radius)
        this.addBlackRockCityGeofence()

        // Map is ready for track initialization
        this.map.addEventListener('zoom', (e) => {
          if (!e.flyTo) {
            this.mapFlyToZoom = e.target.getZoom()
          }
        })
        this.map.addEventListener('click', this.mapClickHandler)
        let satellite = L.tileLayer(
          '//server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          { minZoom: 2, maxZoom: 19, noWrap: true, attribution: '© ArcGIS' },
        )
        let opentopo = L.tileLayer('//{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          minZoom: 2,
          maxZoom: 16,
          attribution:
            'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
          noWrap: true,
        })
        let osmtransp = L.tileLayer.wms('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          layers: 'semitransparent',
          transparent: 'true',
          format: 'image/png',
          maxZoom: 19,
          opacity: 0.5,
        })
        var baseMaps = {
          OpenStreetMap: osm,
          Satellite: satellite,
          OpenTopoMap: opentopo,
        }
        L.control.layers(baseMaps, { 'OpenStreetMaps (0.5)': osmtransp }).addTo(this.map)
        L.control
          .polylineMeasure({
            position: 'topleft',
            showBearings: false,
            clearMeasurementsOnStop: false,
            showUnitControl: false,
            showClearControl: true,
            measureControlTitleOn: 'Turn on ruler',
            measureControlTitleOff: 'Turn off ruler',
            tooltipTextFinish: 'Click to <b>finish line</b><br>',
            tooltipTextDelete: 'Press SHIFT-key and click to <b>delete point</b>',
            tooltipTextMove: 'Click and drag to <b>move point</b><br>',
            tooltipTextResume: '<br>Press CTRL-key and click to <b>resume line</b>',
            tooltipTextAdd: 'Press CTRL-key and click to <b>add point</b>',
          })
          .addTo(this.map)
      }
    },
    mapClickHandler(e) {
      if (this.map.messagePoint) {
        this.map.messagePoint.remove()
      }
      this.activeDevicesIDs.forEach((id) => {
        this.messagesStores[id].clearSelected()
      })
    },
    onResize() {
      if (this.map) {
        this.map.invalidateSize()
      }
    },
    playerDataPause({ id }) {
      if (this.player.status === 'stop') {
        return
      }
      this.player.status = 'pause'
      this.tracks[id].overview.snakePause()
    },
    playerDataPlay({ id }) {
      if (this.player.status === 'pause') {
        this.tracks[id].overview.snakeUnpause()
        this.player.status = 'play'
        return
      }
      this.player.status = 'play'
      // Remove main track (handles both regular polylines and layer groups)
      if (this.tracks[id]) {
        if (this.tracks[id].remove) {
          this.tracks[id].remove()
        } else {
          this.map.removeLayer(this.tracks[id])
        }
      }
      const latlngs = this.messages[id].map((message, index) => ({
        lat: message['position.latitude'],
        lng: message['position.longitude'],
        dir: message['position.direction'],
        index,
        timestamp: message.timestamp,
      }))
      if (latlngs.length < 2) {
        this.tracks[id].addTo(this.map)
        this.player.status = 'stop'
        this.player.currentMsgTimestamp = null
        return
      }
      this.map.setView([latlngs[0].lat, latlngs[0].lng], this.map.getZoom(), { animation: false })
      const line = L.polyline(latlngs, {
        snakingSpeed: 20 * this.player.speed,
        color: this.getColorById(id),
      })
      this.tracks[id].overview = line
      this.tracks[id].overview.addEventListener('click', (e) =>
        this.showMessageByTrackClick(e, id, this.tracks[id].overview),
      )
      line.addTo(this.map).snakeIn()
      line.on('snake', () => {
        const points = line.getLatLngs()
        const point = points.slice(-1)[0]
        const lastPos = point.slice(-1)[0]
        const message = latlngs[points[0].length - 1]
        this.updateMarker(id, lastPos, message.dir)
        if (this.player.currentMsgTimestamp !== message.timestamp) {
          this.player.currentMsgTimestamp = message.timestamp
        }
      })
      line.on('snakeInEnd', () => {
        this.playerDataStop({ id })
      })
    },
    playerDataStop({ id }) {
      this.player.status = 'stop'
      if (this.tracks[id].overview) {
        this.tracks[id].overview.remove()
        delete this.tracks[id].overview
      }
      if (this.tracks[id]) {
        this.tracks[id].addTo(this.map)
        if (this.tracks[id] instanceof L.Polyline) {
          this.tracks[id].addEventListener('click', (e) =>
            this.showMessageByTrackClick(e, id, this.tracks[id]),
          )
        }
      }
      const message = this.messages[id].slice(-1)[0]
      this.player.currentMsgTimestamp = null
      if (message) {
        const lastPos = [message['position.latitude'], message['position.longitude']]
        this.updateMarker(id, lastPos, message['position.direction'])
      }
    },
    playerDataValue({ id }) {},
    playerModeChange({ id, mode }) {
      if (this.player.status !== 'stop') {
        if (mode === 'data') {
          this.playerTimeStop({ id })
        } else {
          this.playerDataStop({ id })
        }
      }
      this.player.mode = mode
    },
    playerSpeedChangeHandler({ speed, id }) {
      this.player.speed = speed
      if (this.player.mode === 'data' && this.player.status !== 'stop') {
        this.tracks[id].overview.setStyle({ snakingSpeed: 20 * speed })
      }
    },
    playProcess(data, type) {
      const mode = this.player.mode === 'data' ? 0 : 1
      switch (type) {
        case 'value': {
          mode ? this.playerTimeValue(data) : this.playerDataValue(data)
          break
        }
        case 'play': {
          if (this.player.status === 'play') {
            return
          }
          mode ? this.playerTimePlay(data) : this.playerDataPlay(data)
          break
        }
        case 'stop': {
          if (this.player.status === 'stop') {
            return
          }
          mode ? this.playerTimeStop(data) : this.playerDataStop(data)
          break
        }
        case 'pause': {
          if (this.player.status === 'pause') {
            return
          }
          mode ? this.playerTimePause(data) : this.playerDataPause(data)
          break
        }
      }
    },
    playerTimePause({ id }) {
      this.player.status = 'pause'
    },
    playerTimePlay({ id }) {
      if (this.tracks[id]) {
        this.tracks[id].remove()
        this.player.status = 'play'
        this.map.setView(
          [this.messages[id][0]['position.latitude'], this.messages[id][0]['position.longitude']],
          this.map.getZoom(),
          { animation: false },
        )
      }
    },
    playerTimeStop({ id }) {
      if (this.tracks[id]) {
        if (this.tracks[id].tail) {
          this.tracks[id].tail.remove()
          delete this.tracks[id].tail
        }
        const realtimeEnabled = this.messagesStores[id].realtimeEnabled
        const msgIndex = realtimeEnabled ? this.messages[id].length - 1 : 0
        const message = this.messages[id][msgIndex]
        this.$nextTick(() => {
          this.player.currentMsgTimestamp = realtimeEnabled ? null : (this.messages[id] && this.messages[id].length > 0 ? this.messages[id][0].timestamp : null)
        })
        this.player.status = 'stop'
        this.tracks[id].addTo(this.map)
        const lastPos = [message['position.latitude'], message['position.longitude']]
        this.updateMarker(id, lastPos, message['position.direction'])
      }
    },
    playerTimeValue({ id, messagesIndexes }) {
      if (
        !this.messages[id] ||
        !messagesIndexes ||
        (this.player.status !== 'play' && this.player.status !== 'pause')
      ) {
        return false
      }
      let renderDuration = 0,
        lastMessageIndexWithPosition = null
      const endIndex = messagesIndexes[messagesIndexes.length - 1],
        startIndex = 0,
        tailMessages = this.messages[id].slice(startIndex, endIndex + 1),
        tail = tailMessages.reduce((tail, message, index) => {
          if (
            typeof message['position.latitude'] === 'number' &&
            typeof message['position.longitude'] === 'number'
          ) {
            lastMessageIndexWithPosition = index
            tail.push([message['position.latitude'], message['position.longitude']])
          }
          return tail
        }, [])
      messagesIndexes.forEach((messageIndex) => {
        if (this.markers[id] && this.markers[id] instanceof L.Marker) {
          const message = this.messages[id][messageIndex]
          const havePosition =
            message &&
            typeof message['position.latitude'] === 'number' &&
            typeof message['position.longitude'] === 'number'
          this.player.currentMsgTimestamp = message.timestamp
          if (havePosition) {
            const pos = [message['position.latitude'], message['position.longitude']]
            if (this.player.status === 'play' && messagesIndexes[0] !== 0) {
              let duration = 1000 / this.player.speed / messagesIndexes.length
              if (messageIndex !== 0) {
                const prevTimestamp = this.messages[id][messageIndex - 1].timestamp,
                  currentTimestamp = message.timestamp,
                  durationInSeconds = currentTimestamp - prevTimestamp
                duration = (durationInSeconds * 1000) / this.player.speed
                renderDuration = durationInSeconds
              }
              duration = duration - 50
              if (duration) {
                this.markers[id].slideTo(pos, { duration: duration })
              } else {
                this.markers[id].setLatLng(pos).update()
              }
              this.updateMarkerDirection(id, message['position.direction'])
            } else {
              this.markers[id].setLatLng(pos).update()
              this.updateMarker(id, pos, message['position.direction'])
            }
            this.markers[id].accuracy.setRadius(this.getAccuracyParams(message).accuracy)
            this.markers[id].accuracy.setLatLng(pos)
          } else {
            const message = this.messages[id][lastMessageIndexWithPosition]
            const pos = tail[tail.length - 1]
            this.markers[id].setLatLng(pos).update()
            this.updateMarker(id, pos, message['position.direction'])
            this.markers[id].accuracy.setRadius(this.getAccuracyParams(message).accuracy)
            this.markers[id].accuracy.setLatLng(pos)
          }
        }
      })
      /* tail render logic */
      if (this.tracks[id] && tail.length) {
        if (!this.tracks[id].tail || !(this.tracks[id].tail instanceof L.Polyline)) {
          // Create tail polyline with similar styling to main track
          const tailOptions = {
            weight: 4,
            color: this.getColorById(id),
            opacity: 0.8
          }
          this.tracks[id].tail = L.polyline(tail, tailOptions)
          this.tracks[id].tail.addTo(this.map)
          this.tracks[id].tail.addEventListener('click', (e) =>
            this.showMessageByTrackClick(e, id, this.tracks[id].tail),
          )
          return true
        }
        if (this.player.tailInterval) {
          clearTimeout(this.player.tailInterval)
        }
        this.player.tailInterval = setTimeout(
          () => {
            this.tracks[id].tail && this.tracks[id].tail.setLatLngs(tail)
          },
          (renderDuration * 700) / this.player.speed,
        )
      }
    },
    removeFlags(id) {
      if (
        !this.markers[id] ||
        !this.markers[id].flags // ||
        // !(this.markers[id].flags.start instanceof L.Marker) ||
        // !(this.markers[id].flags.stop instanceof L.Marker)
      ) {
        return false
      }
      this.markers[id].flags.start.remove()
      this.markers[id].flags.stop.remove()
      this.markers[id].flags = undefined
    },
    removeMarker(id) {
      if (this.markers[id] && this.markers[id] instanceof L.Marker) {
        // Use the comprehensive cleanup method
        this.clearAllMarkersForDevice(id)
        
        this.map.removeLayer(this.markers[id].accuracy)
        this.markers[id].remove()

        // Remove tail and overview tracks
        if (this.tracks[id].tail && this.tracks[id].tail instanceof L.Polyline) {
          this.tracks[id].tail.remove()
        }
        if (this.tracks[id].overview && this.tracks[id].overview instanceof L.Polyline) {
          this.tracks[id].overview.remove()
        }

        // Remove main track (handles both regular polylines and layer groups)
        if (this.tracks[id]) {
          if (this.tracks[id].remove) {
            this.tracks[id].remove()
          } else {
            this.map.removeLayer(this.tracks[id])
          }
        }
      }
      delete this.markers[id]
      delete this.tracks[id]
    },
    showMessageByTrackClick(e, id, track) {
      e.originalEvent.view.L.DomEvent.stopPropagation(e)

      // Use segment messages if available (for segmented tracks), otherwise use all messages
      const messages = track._segmentMessages || this.messages[id]
      const position = L.GeometryUtil.closest(this.map, track, e.latlng)

      let timestamps = messages.reduce((res, message, index) => {
        const lat = message['position.latitude']
        const lng = message['position.longitude']
        const nextMessage = messages[index + 1]
        if (!nextMessage) {
          return res
        }
        const nextLat = nextMessage['position.latitude']
        const nextLng = nextMessage['position.longitude']
        const isPosBetweenLat =
          (lat >= position.lat && nextLat <= position.lat) ||
          (lat <= position.lat && nextLat >= position.lat)
        const isPosBetweenLng =
          (lng >= position.lng && nextLng <= position.lng) ||
          (lng <= position.lng && nextLng >= position.lng)
        if (isPosBetweenLat && isPosBetweenLng) {
          const distance = L.GeometryUtil.distance(this.map, position, { lat, lng })
          const nextDistance = L.GeometryUtil.distance(this.map, position, {
            lat: nextLat,
            lng: nextLng,
          })
          const closestMessageIndex = distance > nextDistance ? index + 1 : index
          res.push({ timestamp: messages[closestMessageIndex].timestamp, distance })
        }
        return res
      }, [])

      timestamps.sort((a, b) => b.distance - a.distance)
      timestamps = timestamps.map(el => el.timestamp)

      // Find the message from the original messages array, not the segment
      const allMessages = this.messages[id]
      const lastMessage = allMessages[allMessages.findIndex(el => el.timestamp === timestamps.slice(-1)[0])] || {}

      // Show popup with timestamp and speed information
      this.showTrackPointPopup(e.latlng, lastMessage, id)
      
      this.viewOnMapHandler(lastMessage)
      this.messagesStores[id].setSelected(timestamps)
    },
    showTrackPointPopup(latlng, message, deviceId = null) {
      // Close any existing popup
      if (this.map.trackPointPopup) {
        this.map.closePopup(this.map.trackPointPopup)
      }

      // Debug: Log all available fields in the message
      console.log('Message fields available:', Object.keys(message))
      console.log('Full message data:', message)
      
      // Look for CAN speed fields
      const canSpeedFields = Object.keys(message).filter(key => key.includes('speed') || key.includes('can'))
      console.log('CAN/Speed related fields:', canSpeedFields)
      
      // Extract data from message
      const timestamp = message.timestamp ? new Date(message.timestamp * 1000).toLocaleString() : 'N/A'
      
      // Get speed using the correct priority logic
      const speedData = this.getSpeedFromMessage(message, deviceId)
      
      const speedKmh = speedData.kmh
      const speedMph = speedData.mph
      const speedColor = speedData.color
      const speedSource = speedData.source
      
      console.log('Final speed values:', { speedKmh, speedMph, speedSource })

      // Create popup content
      const popupContent = `
        <div style="min-width: 200px; font-family: Arial, sans-serif;">
          <div style="font-weight: bold; margin-bottom: 8px; color: #333;">
            📍 Track Point Info
          </div>
          <div style="margin-bottom: 6px;">
            <strong>🕐 Time:</strong><br>
            <span style="font-size: 12px; color: #666;">${timestamp}</span>
          </div>
          <div style="margin-bottom: 6px;">
            <strong>🚗 Speed:</strong><br>
            <span style="color: ${speedColor}; font-weight: bold; font-size: 14px;">
              ${speedMph} mph
            </span>
            <span style="color: #888; font-size: 12px;">
              (${speedKmh} km/h)
            </span>
            <br>
            <span style="font-size: 10px; color: #999; font-style: italic;">
              Source: ${speedSource}
            </span>
          </div>
          <div style="font-size: 11px; color: #999; margin-top: 8px;">
            Click elsewhere to close
          </div>
        </div>
      `

      // Create and show popup
      this.map.trackPointPopup = L.popup({
        closeButton: true,
        autoClose: true,
        closeOnClick: true,
        className: 'track-point-popup'
      })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(this.map)
    },
    clearAllMarkersForDevice(id) {
      // Clear start/end flags
      this.removeFlags(id)
      
      // Clear harsh event markers
      if (this.markers[id] && this.markers[id].harshEvents) {
        this.markers[id].harshEvents.forEach(marker => {
          if (marker && this.map.hasLayer(marker)) {
            this.map.removeLayer(marker)
          }
        })
        this.markers[id].harshEvents = []
      }
      
      // Close any open popups related to this device
      if (this.map.trackPointPopup) {
        this.map.closePopup(this.map.trackPointPopup)
      }
      if (this.map.harshEventPopup) {
        this.map.closePopup(this.map.harshEventPopup)
      }
      
      console.log(`🧹 Cleared all markers for device ${id}`)
    },
    addHarshEventMarkers(id) {
      if (!this.messages[id] || !this.messages[id].length) {
        return
      }

      // Initialize harsh events array for this device if not exists
      if (!this.markers[id]) {
        return
      }
      if (!this.markers[id].harshEvents) {
        this.markers[id].harshEvents = []
      }

      // Clear existing harsh event markers
      this.markers[id].harshEvents.forEach(marker => {
        if (marker && this.map.hasLayer(marker)) {
          this.map.removeLayer(marker)
        }
      })
      this.markers[id].harshEvents = []

      // Debug: Log available fields and search for harsh events
      if (this.messages[id].length > 0) {
        const sampleMessage = this.messages[id][0]
        const allFields = Object.keys(sampleMessage)
        
        // Look for event.enum = 253 messages
        const harshEventMessages = this.messages[id].filter(msg => msg['event.enum'] === 253)
        
        const potentialHarshFields = allFields.filter(key => 
          key.includes('harsh') || 
          key.includes('event') || 
          key.includes('eco.driving') ||
          key.includes('acceleration') || 
          key.includes('braking') || 
          key.includes('cornering')
        )
        
        console.log(`🔍 Sample message fields for device ${id}:`, allFields.length, 'total fields')
        console.log(`🚨 Potential harsh event fields:`, potentialHarshFields)
        console.log(`🎯 Messages with event.enum = 253:`, harshEventMessages.length)
        
        if (harshEventMessages.length > 0) {
          console.log(`📋 First harsh event message:`, harshEventMessages[0])
        }
      }

      // Search for harsh driving events in messages
      this.messages[id].forEach((message, index) => {
        const harshEvents = this.detectHarshEvents(message)
        
        harshEvents.forEach(event => {
          if (message['position.latitude'] && message['position.longitude']) {
            const marker = L.marker([message['position.latitude'], message['position.longitude']], {
              icon: this.generateHarshEventIcon(event.type),
              zIndexOffset: 1000 // Ensure harsh events appear above other markers
            })

            // Add click handler for harsh event details
            marker.on('click', () => {
              this.showHarshEventPopup([message['position.latitude'], message['position.longitude']], message, event)
            })

            // Add to map and store reference
            marker.addTo(this.map)
            this.markers[id].harshEvents.push(marker)
          }
        })
      })

      console.log(`🚨 Added ${this.markers[id].harshEvents.length} harsh event markers for device ${id}`)
    },
    detectHarshEvents(message) {
      const events = []
      
      // Check if this is a harsh driving event message
      // Must have event.enum = 253 to be a harsh driving event
      if (message['event.enum'] !== 253) {
        return events // Not a harsh driving event
      }
      
      console.log('🚨 Harsh driving event detected (event.enum = 253):', message)
      
      // Get event duration
      const duration = message['eco.driving.event.duration'] || 'N/A'
      
      // Check for specific harsh event types
      if (message['harsh.acceleration.event'] === true) {
        events.push({
          type: 'acceleration',
          field: 'harsh.acceleration.event',
          value: true,
          severity: 'medium',
          duration: duration,
          details: `Harsh acceleration event (Duration: ${duration}s)`
        })
        console.log('📈 Harsh acceleration detected, duration:', duration)
      }
      
      if (message['harsh.braking.event'] === true) {
        events.push({
          type: 'braking',
          field: 'harsh.braking.event', 
          value: true,
          severity: 'medium',
          duration: duration,
          details: `Harsh braking event (Duration: ${duration}s)`
        })
        console.log('🛑 Harsh braking detected, duration:', duration)
      }
      
      if (message['harsh.cornering.event'] === true) {
        events.push({
          type: 'cornering',
          field: 'harsh.cornering.event',
          value: true,
          severity: 'medium', 
          duration: duration,
          details: `Harsh cornering event (Duration: ${duration}s)`
        })
        console.log('🔄 Harsh cornering detected, duration:', duration)
      }
      
      if (events.length === 0) {
        console.log('⚠️ event.enum = 253 but no harsh event flags found')
      }

      return events
    },
    generateHarshEventIcon(eventType) {
      // Material UI icons for different event types
      const eventConfig = {
        acceleration: {
          color: '#FFC107', // Amber
          // Material UI Bolt icon (Filled)
          icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white">
            <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C15.39 14.25 13.51 17.98 11 21z"/>
          </svg>`
        },
        braking: {
          color: '#F44336', // Red
          // Material UI StopCircle icon (Filled)
          icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 14H8V8h8v8z"/>
          </svg>`
        },
        cornering: {
          color: '#9C27B0', // Purple
          // Material UI AutoRenew icon (Filled)
          icon: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white">
            <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
          </svg>`
        }
      }

      const config = eventConfig[eventType] || eventConfig.acceleration

      return L.divIcon({
        className: 'harsh-event-marker',
        html: `
          <div style="
            width: 26px;
            height: 26px;
            background-color: ${config.color};
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            animation: pulse 2s infinite;
          ">
            ${config.icon}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -13]
      })
    },
    showHarshEventPopup(latlng, message, event) {
      // Close any existing popup
      if (this.map.harshEventPopup) {
        this.map.closePopup(this.map.harshEventPopup)
      }

      const timestamp = message.timestamp ? new Date(message.timestamp * 1000).toLocaleString() : 'N/A'
      
      // Get event type display name
      const eventTypeNames = {
        acceleration: 'Harsh Acceleration',
        braking: 'Harsh Braking', 
        cornering: 'Harsh Cornering'
      }
      
      const eventTypeName = eventTypeNames[event.type] || 'Harsh Driving Event'
      
      // Get event icon (Material UI SVGs)
      const eventIcons = {
        acceleration: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#FFC107" style="vertical-align: middle;">
          <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C15.39 14.25 13.51 17.98 11 21z"/>
        </svg>`,
        braking: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#F44336" style="vertical-align: middle;">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 14H8V8h8v8z"/>
        </svg>`,
        cornering: `<svg viewBox="0 0 24 24" width="18" height="18" fill="#9C27B0" style="vertical-align: middle;">
          <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
        </svg>`
      }
      
      const eventIcon = eventIcons[event.type] || '🚨'
      
      // Format duration
      const duration = event.duration !== 'N/A' ? `${event.duration} seconds` : 'Unknown duration'

      const popupContent = `
        <div style="min-width: 220px; font-family: Arial, sans-serif;">
          <div style="font-weight: bold; margin-bottom: 12px; color: #FF4444; font-size: 16px; text-align: center;">
            ${eventIcon} ${eventTypeName}
          </div>
          <div style="margin-bottom: 8px;">
            <strong>🕐 Date & Time:</strong><br>
            <span style="font-size: 13px; color: #333;">${timestamp}</span>
          </div>
          <div style="margin-bottom: 8px;">
            <strong>⏱️ Event Duration:</strong><br>
            <span style="font-size: 13px; color: #666; font-weight: 500;">${duration}</span>
          </div>
          <div style="font-size: 11px; color: #999; margin-top: 12px; text-align: center;">
            Click elsewhere to close
          </div>
        </div>
      `

      // Create and show popup
      this.map.harshEventPopup = L.popup({
        closeButton: true,
        autoClose: true,
        closeOnClick: true,
        className: 'harsh-event-popup'
      })
        .setLatLng(latlng)
        .setContent(popupContent)
        .openOn(this.map)
    },
    autoFitAllTracks() {
      // Auto-center and zoom to fit all visible tracks
      const allCoordinates = []
      
      this.activeDevicesIDs.forEach((id) => {
        if (this.messages[id] && this.messages[id].length > 0) {
          // Collect all coordinates from all devices
          this.messages[id].forEach((message) => {
            if (message['position.latitude'] && message['position.longitude']) {
              allCoordinates.push([
                message['position.latitude'],
                message['position.longitude']
              ])
            }
          })
        }
      })
      
      if (allCoordinates.length > 0) {
        try {
          if (allCoordinates.length === 1) {
            // Single point - center on it with reasonable zoom
            this.map.setView(allCoordinates[0], 14, { animation: true })
          } else {
            // Multiple points - fit bounds with padding
            const bounds = L.latLngBounds(allCoordinates)
            this.map.fitBounds(bounds, {
              padding: [20, 20], // Add padding around the bounds
              maxZoom: 16, // Don't zoom in too much
              animate: true,
              duration: 1.0 // Smooth animation
            })
          }
          console.log(`📍 Auto-fitted map to ${allCoordinates.length} coordinates from ${this.activeDevicesIDs.length} device(s)`)
        } catch (error) {
          console.warn('Error auto-fitting tracks:', error)
          // Fallback: center on first coordinate if bounds fail
          if (allCoordinates.length > 0) {
            this.map.setView(allCoordinates[0], 12, { animation: true })
          }
        }
      } else {
        console.log('📍 No coordinates available for auto-fit')
      }
    },
    updateDeviceColorOnMap(id, color) {
      if (
        !this.tracks[id] ||
        !this.markers[id] ||
        !(this.markers[id] instanceof L.Marker)
      ) {
        return false
      }

      // Update marker color first
      this.markers[id].color = color
      this.markers[id].setIcon(this.generateIcon(id, this.markers[id].options.title, color))

      // Update track color
      if (this.tracks[id] instanceof L.Polyline) {
        // Regular polyline - use setStyle
        this.tracks[id].setStyle({ color })
      } else if (this.tracks[id] instanceof L.LayerGroup) {
        // Segmented track - need to recreate with new color
        this.map.removeLayer(this.tracks[id])
        const segmentedTrack = this.createSegmentedTrack(id)
        if (segmentedTrack && segmentedTrack.length > 0) {
          this.tracks[id] = L.layerGroup()

          segmentedTrack.forEach(polyline => {
            polyline.addEventListener('click', (e) =>
              this.showMessageByTrackClick(e, id, polyline),
            )
            this.tracks[id].addLayer(polyline)
          })

          this.tracks[id].addTo(this.map)
        }
      }

      // Update tail and overview colors
      this.tracks[id].tail && this.tracks[id].tail.setStyle({ color })
      this.tracks[id].overview && this.tracks[id].overview.setStyle({ color })

      if (this.messages[id][this.messages[id].length - 1]['position.direction']) {
        /* restore marker's direction, if known */
        this.updateMarkerDirection(
          id,
          this.messages[id][this.messages[id].length - 1]['position.direction'],
        )
      }
    },
    updateMarker(id, pos, dir) {
      this.updateMarkerDirection(id, dir)
      this.markers[id].setLatLng(pos).update()
    },
    updateMarkerDirection(id, dir) {
      if (dir) {
        const element = document.querySelector(`.icon-${id} .my-div-icon__inner`)
        if (element) {
          element.style.transform = `rotate(${dir || 0}deg)`
        }
      }
    },
    updateOrInitDevice(id) {
      /* this method is triggered by watch messages - "messages" object in the state has changed  */

      if (!this.messages[id] || !this.messages[id].length) {
        /* device has not messages, this my happen because initialization is not yet completed in getDeviceData */
        if (!this.markers[id]) {
          /* however we already need to create marker for the device, if not yet created */
          /* this is needed for Queue component to know the current color of the device for color-view div (color picker button) */
          this.markers[id] = {}
          this.markers[id].id = id
          this.markers[id].color = this.devicesColors[id] || '#e53935'
          this.tracks[id] = {}
        }
        return false
      }

      /* now device has messages, either normal flespi messages, or synthetic 'x-flespi-inited-by-telemetry' message */

      if (!(this.markers[id] instanceof L.Marker) && !(this.tracks[id] instanceof L.Polyline)) {
        /* the marker and track of the device are not yet initialized as leaftet instances */
        /* we've received messages and now it's time to init the marker and attach it to the map */
        const name =
            this.activeDevices.filter((device) => device.id === parseInt(id))[0].name || `#${id}`,
          position = [
            this.messages[id][this.messages[id].length - 1]['position.latitude'],
            this.messages[id][this.messages[id].length - 1]['position.longitude'],
          ]
        this.initMarker(id, name, position)
        /* init track with segmented polylines */
        const segmentedTrack = this.createSegmentedTrack(id)
        if (segmentedTrack && segmentedTrack.length > 0) {
          // Create a layer group to hold all segments
          this.tracks[id] = L.layerGroup()

          segmentedTrack.forEach(polyline => {
            polyline.addEventListener('click', (e) =>
              this.showMessageByTrackClick(e, id, polyline),
            )
            this.tracks[id].addLayer(polyline)
          })

          this.tracks[id].addTo(this.map)
        } else {
          // Fallback to regular polyline if segmented track fails
          this.tracks[id] = L.polyline(this.getLatLngArrByDevice(id), {
            weight: 4,
            color: this.markers[id] ? this.markers[id].color : this.getColorById(id),
          }).addTo(this.map)
          this.tracks[id].addEventListener('click', (e) =>
            this.showMessageByTrackClick(e, id, this.tracks[id]),
          )
        }

        if (Number.parseInt(id) === this.selectedDeviceId) {
          // here typeof id is string
          if (this.messages[id].length > 1) {
            /* device has a bunch of messages - initially show the whole track on map */
            let bounding
            try {
              if (this.tracks[id] instanceof L.Polyline) {
                // Regular polyline
                bounding = this.tracks[id].getBounds()
              } else if (this.tracks[id] instanceof L.LayerGroup) {
                // Layer group (segmented tracks) - manually calculate bounds
                const coords = this.getLatLngArrByDevice(id)
                if (coords.length > 1) {
                  bounding = L.latLngBounds(coords)
                }
              } else {
                // Fallback - use message coordinates
                const coords = this.getLatLngArrByDevice(id)
                if (coords.length > 1) {
                  bounding = L.latLngBounds(coords)
                }
              }
              if (bounding) {
                this.map.fitBounds(bounding)
              }
            } catch (error) {
              console.warn('Error getting track bounds:', error)
              // Fallback to centering on the last position
              this.map.setView(position, 14, { animation: false })
            }
          } else {
            /* device has only one message - initially show only device in comfortable zoom */
            this.map.setView(position, 14, { animation: false })
          }
        }
      }

      /* now update device on map according to the newly received message */
      if (!this.devicesStates[id].messagesAccess) {
        /* this device has no access to messages, nothing more to do here for this device */
        return false
      }

      const currentArrPos = this.getLatLngArrByDevice(id)
      if (this.selectedDeviceId && this.selectedDeviceId == id && this.isSelectedDeviceFollowed) {
        /* selected device is followed - check if we need to move map according to the new position */
        const currentPosFromMarker =
          this.markers[id] && this.markers[id] instanceof L.Marker
            ? this.markers[id].getLatLng()
            : {}
        const newPosFromMessage = {
          lat: this.messages[id][this.messages[id].length - 1]['position.latitude'],
          lng: this.messages[id][this.messages[id].length - 1]['position.longitude'],
        }
        if (
          currentPosFromMarker &&
          currentPosFromMarker.lat &&
          currentPosFromMarker.lng &&
          newPosFromMessage &&
          newPosFromMessage.lat &&
          newPosFromMessage.lng &&
          (currentPosFromMarker.lat !== newPosFromMessage.lat ||
            currentPosFromMarker.lng !== newPosFromMessage.lng)
        ) {
          /* position has changed - center on device */
          const position = currentArrPos[currentArrPos.length - 1]
          position && this.centerOnDevice(this.selectedDeviceId, this.map.getZoom())
        }
      }
      /* if positions are empty clear marker and line */
      if (!currentArrPos.length) {
        this.removeFlags(id)
        if (this.tracks[id].tail && this.tracks[id].tail instanceof L.Polyline) {
          this.tracks[id].tail.remove()
        }
        if (this.tracks[id].overview && this.tracks[id].overview instanceof L.Polyline) {
          this.tracks[id].overview.remove()
        }
        if (this.markers[id].accuracy) {
          this.map.removeLayer(this.markers[id].accuracy)
        }

        // Remove main track (handles both regular polylines and layer groups)
        if (this.tracks[id]) {
          if (this.tracks[id].remove) {
            this.tracks[id].remove()
          } else {
            this.map.removeLayer(this.tracks[id])
          }
        }

        this.map.removeLayer(this.markers[id])
        this.tracks[id] = {}
        this.markers[id] = {
          color: this.markers[id].color || undefined,
          id: id,
        }
      } else {
        /* update marker and track with newly recevied position */
        this.markers[id].setLatLng(currentArrPos[currentArrPos.length - 1]).update()
        this.markers[id].accuracy.setRadius(
          this.getAccuracyParams(this.messages[id][this.messages[id].length - 1]).accuracy,
        )
        this.markers[id].accuracy.setLatLng(currentArrPos[currentArrPos.length - 1])
        this.markers[id].setOpacity(1)

        // Update track with segmented polylines or fallback to regular polyline
        if (this.tracks[id] && typeof this.tracks[id].setLatLngs === 'function') {
          // Regular polyline update
          this.tracks[id].setLatLngs(currentArrPos)
        } else {
          // Segmented track update - need to recreate
          this.map.removeLayer(this.tracks[id])
          const segmentedTrack = this.createSegmentedTrack(id)
          if (segmentedTrack && segmentedTrack.length > 0) {
            this.tracks[id] = L.layerGroup()

            segmentedTrack.forEach(polyline => {
              polyline.addEventListener('click', (e) =>
                this.showMessageByTrackClick(e, id, polyline),
              )
              this.tracks[id].addLayer(polyline)
            })

            this.tracks[id].addTo(this.map)
          }
        }
      }
    },
    updateStateByMessages(messages) {
      if (this.player.status === 'play' || this.player.status === 'pause') {
        return false
      }
      const deviceIDs = Object.keys(messages),
        deviceIDsOnMap = Object.keys(this.markers)
      if (!deviceIDs.length) {
        deviceIDsOnMap.forEach((id) => {
          this.removeMarker(id)
        })
        return false
      }
      if (deviceIDs.length < deviceIDsOnMap.length) {
        const removeDeviceId = deviceIDsOnMap.filter((key) => !deviceIDs.includes(key))[0]
        this.removeMarker(removeDeviceId)
        return false
      }
      deviceIDs.forEach((id) => this.updateOrInitDevice(id))
    },
    updateStateByTelemetry(id) {
      /* this method is triggered by watch telemetry: telemetry has updated */
      /* update device on map, if this device has no messages and therefore should be drawn on map by telemetry */
      if (!this.telemetryKeys.length) {
        /* nothing to do if we have no telemetry parameters yet */
        return false
      }
      if (!this.devicesStates[id].telemetryAccess) {
        /* this device either has access to messages or has no access to telemetry, it will be drawn on map by messages (if any), nothing to do with it here */
        return false
      }
      if (!this.messages || !this.messages[id] || !this.messages[id][0]) {
        /* messages are not here, either initialization is not yet completed or this device has never sent a message to flespi */
        /* each device must have at least one message, either normal or syntethic 'x-flespi-inited-by-telemetry' one */
        return false
      }
      if (this.messages[id].lenth > 1 || !this.messages[id][0]['x-flespi-inited-by-telemetry']) {
        /* this device has normal messages, it will be drawn on map by messages, nothing to do here */
        /* actually, this should never happen */
        return false
      }

      /* retrieve position from telemetry and validate it */
      const lat = Number.parseFloat(this.telemetry['position.latitude'].value)
      const latTs = Number.parseFloat(this.telemetry['position.latitude'].ts)
      const lon = Number.parseFloat(this.telemetry['position.longitude'].value)
      const lonTs = Number.parseFloat(this.telemetry['position.longitude'].ts)
      if (Math.round(latTs * 1000) !== Math.round(lonTs * 1000)) {
        /* check that lan and lon come correspond to the same point of time */
        /* server should update them cosistently, but still */
        console.error('Wrong telemetry')
        return false
      }
      if (!this.params.needShowInvalidPositionMessages) {
        /* check if position.valid=false parameter has the same timestamp as the latest position, and skip it */
        if (
          this.telemetry['position.valid'] &&
          this.telemetry['position.valid'].value === false &&
          Math.abs(Number.parseFloat(this.telemetry['position.valid'].ts - latTs) < 0.1)
        ) {
          return false
        }
      }
      /* we recevied new position from telemetry */
      /* update syntethic 'x-flespi-inited-by-telemetry' message with position from the new telemetry */
      const newSyntethicMessage = {
        ident: this.messages[id][0].ident,
        'position.latitude': lat,
        'position.longitude': lon,
        timestamp: latTs,
      }
      /* add other position parameters if they have the same simestamp as lat&lon, otherwise - clean them up */
      const positionParams = [
        'direction',
        'speed',
        'altitude',
        'valid',
        'satellites',
        'hdop',
        'pdop',
      ]
      const positionParamsType = [
        'number',
        'number',
        'number',
        'boolean',
        'number',
        'number',
        'number',
      ]
      for (let i = 0; i < positionParams.length; i++) {
        const paramName = 'position.' + positionParams[i]
        const paramType = positionParamsType[i]
        if (
          this.telemetry[paramName] &&
          Math.abs(Number.parseFloat(this.telemetry[paramName].ts) - latTs) < 0.1
        ) {
          switch (paramType) {
            case 'number': // why numbers are received as strings ?? : {"position.direction":{"value":"168","ts":"1724842304"}
              newSyntethicMessage[paramName] = Number.parseFloat(this.telemetry[paramName].value)
              break
            default:
              newSyntethicMessage[paramName] = this.telemetry[paramName].value
              break
          }
        }
      }
      Object.defineProperty(newSyntethicMessage, 'x-flespi-inited-by-telemetry', {
        value: true,
        enumerable: false,
      })
      /* set new syntethic message to the store */
      this.messagesStores[id].setHistoryMessages([newSyntethicMessage])

      /* store the last telemetry position to draw the tail on the map, up to 50 points */
      if (!this.devicesStates[id].telemetryTail) {
        this.devicesStates[id].telemetryTail = []
      } else if (this.devicesStates[id].telemetryTail.length > 50) {
        this.devicesStates[id].telemetryTail.shift()
      }
      this.devicesStates[id].telemetryTail.push([lat, lon])

      /* update marker and track on the map */
      if (this.markers[id] instanceof L.Marker) {
        const direction =
          this.telemetry['position.direction'] &&
          Math.abs(Number.parseFloat(this.telemetry['position.direction'].ts)) - latTs < 0.1
            ? Number.parseInt(this.telemetry['position.direction'].value)
            : 0
        this.updateMarkerDirection(id, direction)
        this.markers[id].setLatLng([lat, lon]).update()
      }
      if (this.tracks[id] instanceof L.Polyline) {
        this.tracks[id].setLatLngs(this.devicesStates[id].telemetryTail)
      }
      if (this.isSelectedDeviceFollowed) {
        this.centerOnDevice(this.selectedDeviceId, this.map.getZoom())
      }
    },
    viewOnMapHandler(content) {
      if (content['position.latitude'] && content['position.longitude']) {
        const position = [content['position.latitude'], content['position.longitude']],
          currentZoom = this.map.getZoom()
        if (this.map.messagePoint) {
          this.map.messagePoint.remove()
        }
        this.map.messagePoint = L.marker(position, {
          icon: L.divIcon({
            className: `my-round-marker-wrapper`,
            iconSize: new L.Point(10, 10),
            html: `<div class="my-round-marker"></div>`,
          }),
        })
        this.map.messagePoint.addTo(this.map)
        this.map.setView(position, currentZoom > 12 ? currentZoom : 12, { animation: false })
      } else {
        this.$q.notify({
          message: 'No position',
          color: 'warning',
          position: 'bottom-left',
          icon: 'mdi-alert-outline',
        })
      }
    },
  },
  watch: {
    activeDevices(newVal) {
      const activeDevicesIDs = newVal.map((device) => device.id)
      const currentDevicesIDs = Object.keys(this.messagesStores).map((id) => parseInt(id))

      const modifyType = currentDevicesIDs.length > activeDevicesIDs.length ? 'remove' : 'add'
      /* ensure all active devices have messages stores */
      activeDevicesIDs.forEach((id) => this.initMessagesStoreForDevice(id))
      /* sync IDs of active devices */
      this.activeDevicesIDs = activeDevicesIDs
      switch (modifyType) {
        case 'remove': {
          const removedDevicesIDs = currentDevicesIDs.filter((id) => !activeDevicesIDs.includes(id))
          removedDevicesIDs.forEach(async (id) => {
            await this.messagesStores[id].clear()
            delete this.messagesStores[id]
            this.devicesStates[id].initStatus = null
          })
          break
        }
        case 'add': {
          const addedDeviceIDs = activeDevicesIDs.filter((id) => !currentDevicesIDs.includes(id))
          if (addedDeviceIDs) {
            addedDeviceIDs.forEach((id) => {
              this.devicesStates[id].initStatus = false
              this.initDevice(id)
            })
          }
          break
        }
      }
      if (this.map && L.DomUtil.hasClass(this.map._container, 'crosshair-cursor-enabled')) {
        L.DomUtil.removeClass(this.map._container, 'crosshair-cursor-enabled')
      }
    },
    async date() {
      this.player.status = 'stop'
      this.player.currentMsgTimestamp = null
      
      // Clear all existing markers (flags, harsh events, etc.) before loading new data
      this.activeDevicesIDs.forEach((id) => {
        this.clearAllMarkersForDevice(id)
      })
      
      // Load data for all devices
      const dataLoadPromises = this.activeDevicesIDs.map(async (id) => {
        if (this.devicesStates[id].initStatus === true) {
          await this.getDeviceData(id)
        } else {
          // Wait for device to be initialized
          return new Promise((resolve) => {
            const checkInit = () => {
              if (this.devicesStates[id]?.initStatus === true) {
                this.getDeviceData(id).then(resolve)
              } else {
                setTimeout(checkInit, 100)
              }
            }
            setTimeout(checkInit, 100)
          })
        }
      })
      
      // Wait for all data to load, then auto-center
      await Promise.all(dataLoadPromises)
      
      // Auto-center and zoom to fit all tracks after data is loaded
      setTimeout(() => {
        this.autoFitAllTracks()
      }, 500) // Small delay to ensure tracks are rendered
    },
    colorModel(color) {
      /* color modal dialog returned new selected color for the device - save it to the store */
      this.updateDeviceColor(this.colorDeviceId, color)
    },
    devicesColors: {
      /* devices colors are changed in the store - redraw tracks and markers on the map with new colors */
      deep: true,
      handler(newVal) {
        this.activeDevicesIDs.forEach((id) => {
          if (this.markers[id] && this.markers[id].color && newVal[id] !== this.markers[id].color) {
            this.updateDeviceColorOnMap(id, newVal[id])
          }
        })
      },
    },
    isSelectedDeviceFollowed(state) {
      if (
        state === true &&
        this.devicesStates[this.selectedDeviceId] &&
        this.devicesStates[this.selectedDeviceId].initStatus === true
      ) {
        /* user enabled following the selected device on map */
        /* center on device, if device is already initialized */
        this.centerOnDevice(this.selectedDeviceId, this.map.getZoom())
      }
    },
    messages: {
      deep: true,
      handler(messages) {
        this.debouncedUpdateStateByMessages(messages)
      },
    },
    'params.needShowNamesOnMap': function () {
      Object.keys(this.markers).forEach((id) => {
        const currentDevice = this.activeDevices.filter((device) => device.id === parseInt(id))[0],
          position =
            this.messages[id] && this.messages[id].length
              ? [
                  this.messages[id][this.messages[id].length - 1]['position.latitude'],
                  this.messages[id][this.messages[id].length - 1]['position.longitude'],
                ]
              : [],
          name = currentDevice.name || `#${id}`
        if (this.markers[id] instanceof L.Marker) {
          this.markers[id].remove()
          this.map.removeLayer(this.markers[id].accuracy)
          this.initMarker(id, name, position)
        }
      })
    },
    'params.needShowInvalidPositionMessages': function () {
      this.activeDevicesIDs.forEach(async (id) => {
        // reinit device data, as now device may have last position from telemetry
        if (this.devicesStates[id].initStatus === true) {
          await this.getDeviceData(id)
          if (id === this.selectedDeviceId) {
            this.centerOnDevice(id)
          }
        }
      })
    },
    selectedDeviceId(id) {
      if (!this.mapIsFlying && this.tracks[id] && this.tracks[id] instanceof L.Polyline) {
        const bounding = this.tracks[id].getBounds()
        this.map.fitBounds(bounding)
      }
      if (
        id &&
        this.devicesStates[id] &&
        this.devicesStates[id].telemetryTail &&
        this.devicesStates[id].telemetryTail.length > 0
      ) {
        /* wwhen selected device has changed, discard previous telemetry tail, if any so that to start drawing tail from the scratch */
        this.devicesStates[id].telemetryTail = []
      }
      if (id && this.devicesStates[id] && this.devicesStates[id].initStatus === true) {
        this.flyToDevice(id)
      }
    },
    telemetry: {
      deep: true,
      handler() {
        if (this.telemetryKeys.length === 0) {
          /* telemetry drawer is closed and telemetry is not tracked any more */
          return
        }
        const deviceId = parseInt(this.telemetry['device.id'].value)
        if (this.devicesStates[deviceId] && this.devicesStates[deviceId].messagesAccess) {
          /* this device is positioned by messages, no need to draw its position by telemetry */
          return false
        }
        this.debouncedUpdateStateByTelemetry(deviceId)
      },
    },
    'params.needShowSpeedColors': function () {
      // Redraw all tracks when speed colors setting changes
      this.activeDevicesIDs.forEach(async (id) => {
        if (this.devicesStates[id].initStatus === true && this.tracks[id]) {
          // Remove existing track
          if (this.tracks[id].remove) {
            this.tracks[id].remove()
          } else {
            this.map.removeLayer(this.tracks[id])
          }
          
          // Recreate track with new styling
          const segmentedTrack = this.createSegmentedTrack(id)
          if (segmentedTrack && segmentedTrack.length > 0) {
            this.tracks[id] = L.layerGroup()
            
            segmentedTrack.forEach(polyline => {
              polyline.addEventListener('click', (e) =>
                this.showMessageByTrackClick(e, id, polyline),
              )
              this.tracks[id].addLayer(polyline)
            })
            
            this.tracks[id].addTo(this.map)
          }
        }
      })
    },
    'params.needShowHarshEvents': function (newValue) {
      // Show or hide harsh event markers when setting changes
      this.activeDevicesIDs.forEach((id) => {
        if (newValue) {
          // Show harsh events
          if (this.messages[id] && this.messages[id].length > 0) {
            this.addHarshEventMarkers(id)
          }
        } else {
          // Hide harsh events
          if (this.markers[id] && this.markers[id].harshEvents) {
            this.markers[id].harshEvents.forEach(marker => {
              if (marker && this.map.hasLayer(marker)) {
                this.map.removeLayer(marker)
              }
            })
            this.markers[id].harshEvents = []
          }
        }
      })
    },
  },
  created() {
    /* init map staff here, so that it wasn't reactive */
    ;(this.map = null), // map instance
      (this.markers = {}), // markers on map
      (this.tracks = {}), // tracks on map
      (this.geofenceCircle = null), // geofence circle
      (this.blackRockCityGeofence = null), // Black Rock City geofence reference
      /* create debounced function for processing messages and telemetry */
      (this.debouncedUpdateStateByMessages = debounce(this.updateStateByMessages, 100))
    this.debouncedUpdateStateByTelemetry = debounce(this.updateStateByTelemetry, 5)
    /* create messages stores for active devices */
    this.activeDevicesIDs = this.activeDevices.map((device) => device.id)
    this.activeDevicesIDs.forEach((id) => this.initMessagesStoreForDevice(id))
  },
  mounted() {
    this.initMap()
  },
  unmounted() {
    this.$connector.socket.off('offline')
    this.$connector.socket.off('connect')
    this.activeDevicesIDs.forEach(async (id) => {
      if (this.socketConnected === true) {
        await this.messagesStores[id].clear()
      } else {
        this.messagesStores[id].resetState()
      }
      delete this.messagesStores[id]
      this.devicesStates[id].initStatus = null
    })
  },
})
</script>

<style>
/* Track point popup styling */
.track-point-popup .leaflet-popup-content-wrapper {
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.track-point-popup .leaflet-popup-content {
  margin: 12px 16px;
  line-height: 1.4;
}

.track-point-popup .leaflet-popup-tip {
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Harsh event popup styling */
.harsh-event-popup .leaflet-popup-content-wrapper {
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(255, 0, 0, 0.2);
  border: 2px solid #FF6600;
}

.harsh-event-popup .leaflet-popup-content {
  margin: 12px 16px;
  line-height: 1.4;
}

.harsh-event-popup .leaflet-popup-tip {
  background: white;
  box-shadow: 0 2px 4px rgba(255, 0, 0, 0.1);
}

/* Harsh event marker styling */
.harsh-event-marker {
  cursor: pointer;
}

/* Pulse animation for harsh event markers */
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>

<style lang="sass">
.leaflet-control-layers
  top: 110px
  .leaflet-control-layers-toggle
    width: 24px
    height: 24px
    background-size: 20px
.leaflet-container.crosshair-cursor-enabled
  cursor: crosshair
.leaflet-control.leaflet-bar
  top: 50px
  left: 6px
  border: none
  .leaflet-control-zoom-in, .leaflet-control-zoom-out
    background-color: #fff
    color: #333
    border-color: #666
    box-shadow: 0 0 15px rgba(0,0,0,0.5)
  .leaflet-control-zoom-in
    border-top-left-radius: 3px
    border-top-right-radius: 3px
  .leaflet-control-zoom-out
    border-bottom-left-radius: 3px
    border-bottom-right-radius: 3px
.my-flag-icon__inner
  font-size: 35px
  position: relative
  top: -20px
  left: 2px
.my-div-icon
  z-index: 2000!important
  .my-div-icon__name
    line-height: 20px
    font-size: .9rem
    font-weight: bolder
    position: absolute
    top: 0
    left: 30px
    max-width: 200px
    text-overflow: ellipsis
    overflow: hidden
    background-color: rgba(0,0,0,0.5)
    color: #fff
    border-radius: 5px
    padding: 0 5px
    border: 1px solid white
    box-shadow: 3px 3px 10px #999
.direction
  border: 2px solid black
  border-radius: 50% 0 50% 50%
  background-color: white
  opacity: .5
  height: 20px
  width: 20px
.my-round-marker
  height: 10px
  border-radius: 50%
  background-color: $red-7
  transform: scale(1)
  box-shadow: 0 0 0 0 rgba(255, 82, 82, 1)
  animation: pulse 2s infinite

@keyframes pulse
  0%
    transform: scale(0.95)
    box-shadow: 0 0 0 0 rgba(255, 82, 82, 0.7)
  70%
    transform: scale(1)
    box-shadow: 0 0 0 10px rgba(255, 82, 82, 0)
  100%
    transform: scale(0.95)
    box-shadow: 0 0 0 0 rgba(255, 82, 82, 0)
</style>
